export function createNetwork({ onSessionJoined, onSessionState, onError } = {}) {
  let ws;
  const queue = [];

  function ensureConnection() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${window.location.host}`);

    ws.addEventListener('open', () => {
      queue.splice(0, queue.length).forEach((msg) => ws.send(msg));
    });

    ws.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data);
      switch (payload.type) {
        case 'session_created':
        case 'session_joined':
          if (onSessionJoined) {
            onSessionJoined(payload.data);
          }
          break;
        case 'session_state':
          if (onSessionState) {
            onSessionState(payload.data);
          }
          break;
        case 'error':
          if (onError) {
            onError(payload.message || 'Server error.');
          }
          break;
        default:
          break;
      }
    });

    ws.addEventListener('close', () => {
      if (onError) {
        onError('Connection lost. Attempting to reconnect…');
      }
      setTimeout(ensureConnection, 1000);
    });
  }

  function send(type, data = {}) {
    const stringified = JSON.stringify({ type, data });
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      queue.push(stringified);
      ensureConnection();
      return;
    }
    ws.send(stringified);
  }

  return {
    send,
    ensureConnection,
    get socket() {
      return ws;
    },
  };
}

