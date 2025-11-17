import express from 'express';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const SESSION_CODE_LENGTH = 6;

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

app.use(express.static(path.join(__dirname, '..', '..', 'public')));
app.use(express.static(path.join(__dirname, '..', 'client')));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const sessions = new Map();

function normalizeAvatarData(avatar = {}) {
  return {
    colors: {
      outfit: avatar.colors?.outfit || '#86cdf9',
      accent: avatar.colors?.accent || '#fff6b7',
    },
    outfit: avatar.outfit || 'parka',
    hair: avatar.hair || 'soft-wave',
  };
}

function createSession() {
  const code = generateCode();
  const session = {
    code,
    createdAt: Date.now(),
    decorations: [],
    weatherSeed: Math.random(),
    clients: new Map(),
  };

  sessions.set(code, session);
  return session;
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < SESSION_CODE_LENGTH; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  if (sessions.has(code)) {
    return generateCode();
  }
  return code;
}

function broadcastSessionState(session, exceptPlayerId) {
  const payload = JSON.stringify({
    type: 'session_state',
    data: serializeSession(session),
  });

  session.clients.forEach((client) => {
    if (client.id === exceptPlayerId || client.ws.readyState !== 1) return;
    client.ws.send(payload);
  });
}

function serializeSession(session) {
  return {
    code: session.code,
    createdAt: session.createdAt,
    weatherSeed: session.weatherSeed,
    decorations: session.decorations,
    players: Array.from(session.clients.values()).map((client) => ({
      id: client.id,
      displayName: client.displayName,
      avatar: client.avatar,
      transform: client.transform,
      lastActive: client.lastActive,
    })),
  };
}

function attachPlayerToSession(ws, session, playerData) {
  const player = {
    ...playerData,
    ws,
    lastActive: Date.now(),
    transform: playerData.transform || {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    },
    avatar: normalizeAvatarData(playerData.avatar),
  };

  session.clients.set(player.id, player);
  ws.sessionCode = session.code;
  ws.playerId = player.id;
  return player;
}

function removePlayerFromSession(session, playerId) {
  if (!session) return;
  session.clients.delete(playerId);
  if (session.clients.size === 0) {
    sessions.delete(session.code);
  }
}

function handleDecorationMutation(session, mutation) {
  const { type, decoration } = mutation;
  if (type === 'place') {
    session.decorations.push(decoration);
  } else if (type === 'update') {
    const index = session.decorations.findIndex((d) => d.id === decoration.id);
    if (index >= 0) {
      session.decorations[index] = { ...session.decorations[index], ...decoration };
    }
  } else if (type === 'remove') {
    session.decorations = session.decorations.filter((d) => d.id !== decoration.id);
  }
}

wss.on('connection', (ws) => {
  ws.id = uuidv4();
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message) => {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON payload.' }));
      return;
    }

    const { type, data } = payload;
    switch (type) {
      case 'create_session':
        handleCreateSession(ws, data);
        break;
      case 'join_session':
        handleJoinSession(ws, data);
        break;
      case 'update_avatar':
        handleAvatarUpdate(ws, data);
        break;
      case 'place_decoration':
      case 'update_decoration':
      case 'remove_decoration':
        handleDecorationUpdate(ws, type, data);
        break;
      case 'request_state':
        pushState(ws);
        break;
      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown event: ${type}` }));
    }
  });

  ws.on('close', () => {
    const session = sessions.get(ws.sessionCode);
    if (session && ws.playerId) {
      removePlayerFromSession(session, ws.playerId);
      broadcastSessionState(session);
    }
  });
});

function pushState(ws) {
  const session = sessions.get(ws.sessionCode);
  if (!session) return;
  ws.send(
    JSON.stringify({
      type: 'session_state',
      data: serializeSession(session),
    }),
  );
}

function handleCreateSession(ws, data) {
  const playerId = uuidv4();
  const session = createSession();
  const player = attachPlayerToSession(ws, session, {
    id: playerId,
    displayName: data?.displayName || 'Snowfall',
    avatar: data?.avatar,
    transform: data?.transform,
  });

  ws.send(
    JSON.stringify({
      type: 'session_created',
      data: {
        playerId: player.id,
        code: session.code,
        state: serializeSession(session),
      },
    }),
  );
}

function handleJoinSession(ws, data) {
  const code = String(data?.code || '').toUpperCase();
  const session = sessions.get(code);
  if (!session) {
    ws.send(JSON.stringify({ type: 'error', message: 'Session not found.' }));
    return;
  }

  const playerId = uuidv4();
  const player = attachPlayerToSession(ws, session, {
    id: playerId,
    displayName: data?.displayName || 'Starlit',
    avatar: data?.avatar,
    transform: data?.transform,
  });

  ws.send(
    JSON.stringify({
      type: 'session_joined',
      data: {
        playerId,
        code,
        state: serializeSession(session),
      },
    }),
  );

  broadcastSessionState(session, playerId);
}

function handleAvatarUpdate(ws, data) {
  const session = sessions.get(ws.sessionCode);
  if (!session) return;
  const player = session.clients.get(ws.playerId);
  if (!player) return;

  player.lastActive = Date.now();
  if (data?.transform) {
    player.transform = data.transform;
  }
  if (data?.avatar) {
    player.avatar = {
      ...player.avatar,
      ...data.avatar,
      colors: {
        ...player.avatar.colors,
        ...(data.avatar.colors || {}),
      },
    };
  }

  broadcastSessionState(session, player.id);
}

function handleDecorationUpdate(ws, mutationType, data) {
  const session = sessions.get(ws.sessionCode);
  if (!session) return;

  const decorationPayload = {
    id: data?.id || uuidv4(),
    ownerId: ws.playerId,
    type: data?.typeId || data?.type || 'ornament',
    transform: data?.transform || {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: data?.scale || 1,
    },
    color: data?.color || '#fff8e7',
    glow: data?.glow ?? 0.5,
    cabinId: data?.cabinId || 'cabin-a',
    colors: Array.isArray(data?.colors) ? [...data.colors] : undefined,
  };

  if (mutationType === 'place_decoration') {
    decorationPayload.id = decorationPayload.id || uuidv4();
    handleDecorationMutation(session, { type: 'place', decoration: decorationPayload });
  } else if (mutationType === 'update_decoration') {
    handleDecorationMutation(session, { type: 'update', decoration: decorationPayload });
  } else if (mutationType === 'remove_decoration') {
    handleDecorationMutation(session, { type: 'remove', decoration: decorationPayload });
  }

  broadcastSessionState(session);
}

setInterval(() => {
  wss.clients.forEach((socket) => {
    if (!socket.isAlive) {
      socket.terminate();
      return;
    }
    socket.isAlive = false;
    socket.ping();
  });
}, 30000);

httpServer.listen(PORT, () => {
  console.log(`Frostfall Haven server listening on http://localhost:${PORT}`);
});
