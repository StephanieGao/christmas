import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const canvas = document.getElementById('scene');
const startButton = document.getElementById('start-session');
const joinButton = document.getElementById('join-session');
const joinInput = document.getElementById('join-code');
const hudPanel = document.getElementById('hud-panel');
const sessionPanel = document.getElementById('session-panel');
const sessionCodeLabel = document.getElementById('session-code');
const outfitColorInput = document.getElementById('outfit-color');
const accentColorInput = document.getElementById('accent-color');
const outfitSelect = document.getElementById('outfit-select');
const hairSelect = document.getElementById('hair-select');
const decorColorInput = document.getElementById('decor-color');
const decorSelect = document.getElementById('decor-select');
const snowToggle = document.getElementById('snow-toggle');
const photoModeBtn = document.getElementById('photo-mode');
const toastEl = document.getElementById('toast');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050b17);
scene.fog = new THREE.FogExp2(0x040915, 0.02);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 6, 14);

const cameraTarget = new THREE.Vector3(0, 1, 0);
const cameraOrbit = {
  yaw: 0,
  pitch: 0.4,
  distance: 13,
};
const cursorState = {
  x: 0.5,
  y: 0.5,
};
const dragState = {
  active: false,
  moved: false,
  lastX: 0,
  lastY: 0,
  pointerId: null,
};
let autoFollowPaused = false;
const AUTO_RESUME_DELAY_MS = 1000;
let autoResumeTimeout = null;
const autoResumeCursor = { x: cursorState.x, y: cursorState.y };

const clock = new THREE.Clock();
const placementSurfaces = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const localState = {
  playerId: null,
  sessionCode: null,
  avatarColors: {
    outfit: outfitColorInput.value,
    accent: accentColorInput.value,
  },
  decorType: decorSelect.value,
  decorColor: decorColorInput.value,
  snowMultiplier: 1,
  partnerPresent: false,
  outfit: outfitSelect.value,
  hair: hairSelect.value,
};

const inputState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
};

const remotePlayers = new Map();
const decorationMeshes = new Map();

const village = buildVillage();
placementSurfaces.push(village.ground, ...village.cabins);

const localPlayer = createAvatar({
  colors: localState.avatarColors,
  outfit: localState.outfit,
  hair: localState.hair,
});
localPlayer.group.position.set(0, 1, 0);
scene.add(localPlayer.group);

const snowSystem = createSnowSystem(600);
scene.add(snowSystem.points);

setupUI();
setupInput();
setInterval(() => {
  if (localState.sessionCode) {
    sendAvatarUpdate();
  }
}, 2500);
animate();

const network = createNetwork();

function normalizeAvatarAppearance(avatar = {}) {
  return {
    colors: {
      outfit: avatar.colors?.outfit || '#ffb7c5',
      accent: avatar.colors?.accent || '#ffd966',
    },
    outfit: avatar.outfit || 'parka',
    hair: avatar.hair || 'soft-wave',
  };
}

function createNetwork() {
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
          handleSessionJoined(payload.data);
          break;
        case 'session_state':
          hydrateWorld(payload.data);
          break;
        case 'error':
          showToast(payload.message || 'Server error.');
          break;
        default:
          break;
      }
    });

    ws.addEventListener('close', () => {
      showToast('Connection lost. Attempting to reconnect…');
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

  return { send, ensureConnection, get socket() { return ws; } };
}

function buildVillage() {
  const groundGeo = new THREE.PlaneGeometry(160, 160, 120, 120);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const noise = (Math.sin(x * 0.1) + Math.cos(z * 0.1)) * 0.35;
    pos.setY(i, Math.random() * 0.4 + noise * 0.3);
  }
  pos.needsUpdate = true;

  const groundMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.02,
    clearcoat: 0.55,
    clearcoatRoughness: 0.35,
    side: THREE.DoubleSide,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const sparkleGeometry = new THREE.BufferGeometry();
  const sparklePositions = new Float32Array(600 * 3);
  for (let i = 0; i < 600; i += 1) {
    sparklePositions[i * 3] = (Math.random() - 0.5) * 140;
    sparklePositions[i * 3 + 1] = Math.random() * 0.3 + 0.1;
    sparklePositions[i * 3 + 2] = (Math.random() - 0.5) * 140;
  }
  sparkleGeometry.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
  const snowSparkle = new THREE.Points(
    sparkleGeometry,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.45, transparent: true, opacity: 0.35 }),
  );
  snowSparkle.position.y = 0.05;
  scene.add(snowSparkle);

  const ambient = new THREE.HemisphereLight(0xfff9e8, 0x0a1824, 0.9);
  scene.add(ambient);

  const moon = new THREE.DirectionalLight(0xc7d5ff, 0.65);
  moon.position.set(-10, 20, 10);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  scene.add(moon);

  const hearth = new THREE.PointLight(0xffb7c5, 1.4, 45);
  hearth.position.set(0, 6, 0);
  scene.add(hearth);

  const cabins = [];
  const cabinPositions = [
    { x: -12, z: -8 },
    { x: 12, z: -6 },
    { x: -8, z: 10 },
    { x: 10, z: 12 },
  ];

  cabinPositions.forEach((posData, idx) => {
    const cabin = createCabin(`cabin-${idx}`, posData);
    cabins.push(cabin.mesh);
    scene.add(cabin.group);
    placementSurfaces.push(...cabin.surfaces);
  });

  const snowMounds = new THREE.Group();
  for (let i = 0; i < 40; i += 1) {
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(Math.random() * 2.4 + 1.4, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0xfdfefe, roughness: 0.6 }),
    );
    mound.scale.y = 0.45;
    mound.position.set((Math.random() - 0.5) * 120, 0.05, (Math.random() - 0.5) * 120);
    mound.receiveShadow = true;
    snowMounds.add(mound);
  }
  scene.add(snowMounds);

  const cabinPiles = new THREE.Group();
  cabinPositions.forEach((posData) => {
    for (let i = 0; i < 3; i += 1) {
      const drift = new THREE.Mesh(
        new THREE.SphereGeometry(Math.random() * 1.2 + 0.8, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xfafcff, roughness: 0.55 }),
      );
      drift.scale.y = 0.5;
      drift.position.set(
        posData.x + (Math.random() - 0.5) * 4,
        0.05,
        posData.z + (Math.random() - 0.5) * 4,
      );
      cabinPiles.add(drift);
    }
  });
  scene.add(cabinPiles);

  for (let i = 0; i < 26; i += 1) {
    const radius = 38 + Math.random() * 18;
    const angle = (Math.PI * 2 * i) / 26;
    const tree = createTree();
    tree.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    scene.add(tree);
  }

  return { ground, cabins };
}

function createCabin(id, position) {
  const group = new THREE.Group();
  group.position.set(position.x, 0, position.z);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3, 6),
    new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.9 }),
  );
  body.position.y = 1.5;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(5.5, 2.5, 4),
    new THREE.MeshStandardMaterial({ color: 0x7f4b2c }),
  );
  roof.position.y = 4;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  const windows = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 0.2),
    new THREE.MeshStandardMaterial({ emissive: 0xfff0c4, emissiveIntensity: 1 }),
  );
  windows.position.set(0, 2, 3.1);
  group.add(windows);

  const lantern = new THREE.PointLight(0xffd59e, 1.2, 12);
  lantern.position.set(0, 3, 3.5);
  group.add(lantern);

  const surfaces = [body, roof];

  return { id, group, mesh: body, surfaces };
}

function createTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.4, 2, 6),
    new THREE.MeshStandardMaterial({ color: 0x4d331f }),
  );
  trunk.position.y = 1;
  group.add(trunk);

  const levels = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < levels; i += 1) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.8 - i * 0.2, 2, 8),
      new THREE.MeshStandardMaterial({ color: 0x1c5b32, roughness: 0.9 }),
    );
    cone.position.y = 2 + i * 1.1;
    cone.castShadow = true;
    group.add(cone);

    const snowCap = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(0.4, 1.2 - i * 0.18), 0.3, 8),
      new THREE.MeshStandardMaterial({ color: 0xf4fbff, roughness: 0.4 }),
    );
    snowCap.position.y = cone.position.y + 0.8;
    group.add(snowCap);
  }
  return group;
}

function createSnowSystem(count) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 120;
    positions[i * 3 + 1] = Math.random() * 40 + 5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
    speeds[i] = Math.random() * 0.3 + 0.1;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.15,
    transparent: true,
    opacity: 0.8,
  });

  const points = new THREE.Points(geometry, material);

  return { points, positions, speeds };
}

function createAvatar(appearance = {}) {
  const config = normalizeAvatarAppearance(appearance);
  const group = new THREE.Group();
  const dynamicMaterials = [];

  function registerMaterial(material, key, { emissive } = {}) {
    dynamicMaterials.push({ material, key, emissive: Boolean(emissive) });
    return material;
  }

  function applyColors(colors) {
    if (!colors) return;
    dynamicMaterials.forEach(({ material, key, emissive }) => {
      const color = colors[key];
      if (!color) return;
      material.color.set(color);
      if (emissive && material.emissive) {
        material.emissive.set(color);
      }
    });
  }

  const bodyMat = registerMaterial(
    new THREE.MeshStandardMaterial({ color: config.colors.outfit, roughness: 0.45, metalness: 0.05 }),
    'outfit',
  );
  const accentMat = registerMaterial(
    new THREE.MeshStandardMaterial({
      color: config.colors.accent,
      emissive: config.colors.accent,
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.1,
    }),
    'accent',
    { emissive: true },
  );

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.6, 6, 12), bodyMat);
  body.castShadow = true;
  body.position.y = 1.5;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xfff3eb }),
  );
  head.position.y = 2.6;
  head.castShadow = true;
  group.add(head);

  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.15, 8, 18), accentMat);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 2.2;
  group.add(scarf);

  const outfitGroup = new THREE.Group();
  group.add(outfitGroup);

  const outfitVariants = {
    parka: (() => {
      const hood = new THREE.Mesh(
        new THREE.SphereGeometry(0.95, 24, 18, 0, Math.PI * 2, 0, Math.PI / 1.5),
        registerMaterial(
          new THREE.MeshStandardMaterial({
            color: config.colors.accent,
            roughness: 0.25,
            metalness: 0.05,
            emissive: config.colors.accent,
            emissiveIntensity: 0.2,
          }),
          'accent',
          { emissive: true },
        ),
      );
      hood.position.y = 2.35;
      hood.scale.set(1, 0.8, 1);
      return hood;
    })(),
    cape: (() => {
      const cape = new THREE.Mesh(
        new THREE.PlaneGeometry(3, 3.2, 1, 1),
        registerMaterial(
          new THREE.MeshStandardMaterial({
            color: config.colors.outfit,
            roughness: 0.5,
            transparent: true,
            opacity: 0.82,
            side: THREE.DoubleSide,
          }),
          'outfit',
        ),
      );
      cape.position.set(0, 1.8, 1);
      cape.rotation.x = Math.PI / 8;
      cape.rotation.z = Math.PI / 36;
      return cape;
    })(),
    sweater: (() => {
      const sweaterGroup = new THREE.Group();
      const torso = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.2, 0.8),
        registerMaterial(
          new THREE.MeshStandardMaterial({ color: config.colors.outfit, roughness: 0.85 }),
          'outfit',
        ),
      );
      torso.position.y = 1.7;
      sweaterGroup.add(torso);

      const cuffs = new THREE.Mesh(
        new THREE.TorusGeometry(0.75, 0.12, 10, 24),
        registerMaterial(
          new THREE.MeshStandardMaterial({
            color: config.colors.accent,
            roughness: 0.4,
            emissive: config.colors.accent,
            emissiveIntensity: 0.2,
          }),
          'accent',
          { emissive: true },
        ),
      );
      cuffs.position.y = 1.1;
      cuffs.rotation.x = Math.PI / 2;
      sweaterGroup.add(cuffs);
      return sweaterGroup;
    })(),
  };

  Object.values(outfitVariants).forEach((variant) => {
    variant.visible = false;
    outfitGroup.add(variant);
  });

  const hairGroup = new THREE.Group();
  group.add(hairGroup);

  const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x2f1b13, roughness: 0.7 });
  const hairVariants = {
    'soft-wave': (() => {
      const waves = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.18, 12, 24), hairMaterial.clone());
      waves.rotation.x = Math.PI / 2;
      waves.position.y = 2.4;
      return waves;
    })(),
    'braided-crown': (() => {
      const braid = new THREE.Group();
      for (let i = 0; i < 6; i += 1) {
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), hairMaterial.clone());
        const angle = (Math.PI * 2 * i) / 6;
        bead.position.set(Math.cos(angle) * 0.65, 2.35, Math.sin(angle) * 0.65);
        braid.add(bead);
      }
      return braid;
    })(),
    'pom-hat': (() => {
      const groupHat = new THREE.Group();
      const hatBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.8, 0.7, 16),
        registerMaterial(
          new THREE.MeshStandardMaterial({ color: config.colors.outfit, roughness: 0.35 }),
          'outfit',
        ),
      );
      hatBody.position.y = 2.8;
      groupHat.add(hatBody);

      const pom = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 12, 12),
        registerMaterial(
          new THREE.MeshStandardMaterial({
            color: config.colors.accent,
            emissive: config.colors.accent,
            emissiveIntensity: 0.25,
          }),
          'accent',
          { emissive: true },
        ),
      );
      pom.position.y = 3.3;
      groupHat.add(pom);
      return groupHat;
    })(),
  };

  Object.values(hairVariants).forEach((variant) => {
    variant.visible = false;
    hairGroup.add(variant);
  });

  const appearanceState = {
    colors: { ...config.colors },
    outfit: config.outfit,
    hair: config.hair,
  };

  function setOutfit(name) {
    appearanceState.outfit = outfitVariants[name] ? name : 'parka';
    Object.entries(outfitVariants).forEach(([key, variant]) => {
      variant.visible = key === appearanceState.outfit;
    });
  }

  function setHair(name) {
    appearanceState.hair = hairVariants[name] ? name : 'soft-wave';
    Object.entries(hairVariants).forEach(([key, variant]) => {
      variant.visible = key === appearanceState.hair;
    });
  }

  function setColors(colors) {
    appearanceState.colors = { ...appearanceState.colors, ...colors };
    applyColors(appearanceState.colors);
  }

  setOutfit(appearanceState.outfit);
  setHair(appearanceState.hair);
  applyColors(appearanceState.colors);

  return {
    group,
    materials: { body: bodyMat, accent: accentMat },
    setColors,
    setOutfit,
    setHair,
    setAppearance: (next) => {
      if (!next) return;
      if (next.colors) setColors(next.colors);
      if (next.outfit) setOutfit(next.outfit);
      if (next.hair) setHair(next.hair);
    },
  };
}

function setupUI() {
  joinInput.addEventListener('input', () => {
    joinInput.value = joinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  startButton.addEventListener('click', () => {
    network.ensureConnection();
    network.send('create_session', {
      displayName: randomSnowyName(),
      avatar: {
        colors: localState.avatarColors,
        outfit: localState.outfit,
        hair: localState.hair,
      },
    });
  });

  joinButton.addEventListener('click', () => {
    const code = joinInput.value.trim().toUpperCase();
    if (code.length < 6) {
      showToast('Enter a 6-character invite code.');
      return;
    }
    network.ensureConnection();
    network.send('join_session', {
      code,
      displayName: randomSnowyName(),
      avatar: {
        colors: localState.avatarColors,
        outfit: localState.outfit,
        hair: localState.hair,
      },
    });
  });

  outfitColorInput.addEventListener('input', (event) => {
    localState.avatarColors.outfit = event.target.value;
    localPlayer.setColors({ outfit: event.target.value });
    sendAvatarUpdate();
  });

  accentColorInput.addEventListener('input', (event) => {
    localState.avatarColors.accent = event.target.value;
    localPlayer.setColors({ accent: event.target.value });
    sendAvatarUpdate();
  });

  outfitSelect.addEventListener('change', (event) => {
    localState.outfit = event.target.value;
    localPlayer.setOutfit(event.target.value);
    sendAvatarUpdate();
  });

  hairSelect.addEventListener('change', (event) => {
    localState.hair = event.target.value;
    localPlayer.setHair(event.target.value);
    sendAvatarUpdate();
  });

  decorColorInput.addEventListener('input', (event) => {
    localState.decorColor = event.target.value;
  });

  decorSelect.addEventListener('change', (event) => {
    localState.decorType = event.target.value;
  });

  snowToggle.addEventListener('click', () => {
    localState.snowMultiplier = localState.snowMultiplier === 1 ? 1.8 : 1;
    showToast(localState.snowMultiplier > 1 ? 'Snowfall intensified ❄️' : 'Snowfall relaxed ☁️');
  });

  photoModeBtn.addEventListener('click', () => {
    document.body.classList.toggle('photo-mode');
    const label = document.body.classList.contains('photo-mode') ? 'Exit Photo Mode' : 'Photo Mode';
    photoModeBtn.textContent = label;
  });
}

function setupInput() {
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    switch (event.key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        inputState.forward = true;
        break;
      case 's':
      case 'arrowdown':
        inputState.backward = true;
        break;
      case 'a':
      case 'arrowleft':
        inputState.left = true;
        break;
      case 'd':
      case 'arrowright':
        inputState.right = true;
        break;
      case 'p':
        photoModeBtn.click();
        break;
      default:
        break;
    }
  });

  window.addEventListener('keyup', (event) => {
    switch (event.key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        inputState.forward = false;
        break;
      case 's':
      case 'arrowdown':
        inputState.backward = false;
        break;
      case 'a':
      case 'arrowleft':
        inputState.left = false;
        break;
      case 'd':
      case 'arrowright':
        inputState.right = false;
        break;
      default:
        break;
    }
  });

  renderer.domElement.addEventListener('pointerdown', (event) => {
    dragState.active = true;
    dragState.moved = false;
    dragState.pointerId = event.pointerId;
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
  });

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!dragState.active || event.pointerId !== dragState.pointerId) return;
    const deltaX = event.clientX - dragState.lastX;
    const deltaY = event.clientY - dragState.lastY;
    if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
      dragState.moved = true;
    }
    cameraOrbit.yaw -= deltaX * 0.0045;
    cameraOrbit.pitch = THREE.MathUtils.clamp(cameraOrbit.pitch + deltaY * 0.0045, 0.1, 1.3);
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
  });

  renderer.domElement.addEventListener('pointerup', (event) => {
    if (event.pointerId !== dragState.pointerId) return;
    renderer.domElement.releasePointerCapture(event.pointerId);
    dragState.active = false;
    const cameraCursorX = THREE.MathUtils.clamp(0.5 - cameraOrbit.yaw / 1.6, 0, 1);
    const cameraCursorY = THREE.MathUtils.clamp((cameraOrbit.pitch - 0.35) / 0.7 + 0.5, 0, 1);
    cursorState.x = cameraCursorX;
    cursorState.y = cameraCursorY;
    if (!dragState.moved) {
      attemptDecorationPlacement(event);
    } else {
      autoFollowPaused = true;
      autoResumeCursor.x = cameraCursorX;
      autoResumeCursor.y = cameraCursorY;
      if (autoResumeTimeout) {
        clearTimeout(autoResumeTimeout);
      }
      autoResumeTimeout = setTimeout(() => {
        autoFollowPaused = false;
        cursorState.x = autoResumeCursor.x;
        cursorState.y = autoResumeCursor.y;
      }, AUTO_RESUME_DELAY_MS);
    }
    dragState.moved = false;
  });

  renderer.domElement.addEventListener('pointerleave', () => {
    dragState.active = false;
  });

  renderer.domElement.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      cameraOrbit.distance = THREE.MathUtils.clamp(
        cameraOrbit.distance + event.deltaY * 0.01,
        6,
        26,
      );
    },
    { passive: false },
  );

  window.addEventListener('resize', onResize);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('touchmove', handleTouchMove, { passive: false });
}

function onResize() {
  const { innerWidth, innerHeight } = window;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

function handlePointerMove(event) {
  cursorState.x = event.clientX / window.innerWidth;
  cursorState.y = event.clientY / window.innerHeight;
}

function handleTouchMove(event) {
  if (dragState.active || event.touches.length !== 1) return;
  const touch = event.touches[0];
  cursorState.x = touch.clientX / window.innerWidth;
  cursorState.y = touch.clientY / window.innerHeight;
}

function randomSnowyName() {
  const prefixes = ['Frosty', 'Twinkle', 'Cozy', 'Aurora', 'Starry', 'Maple', 'Pine', 'Velvet'];
  const suffixes = ['Heart', 'Haven', 'Glow', 'Wish', 'Spark', 'Cocoa', 'Holly', 'Wreath'];
  return `${prefixes[Math.floor(Math.random() * prefixes.length)]}${
    suffixes[Math.floor(Math.random() * suffixes.length)]
  }`;
}

function handleSessionJoined(data) {
  localState.playerId = data.playerId;
  localState.sessionCode = data.code;
  sessionPanel.classList.add('hidden');
  hudPanel.classList.remove('hidden');
  sessionCodeLabel.textContent = data.code;
  showToast('Connected! Invite your partner with the code above.');
  hydrateWorld(data.state);
  sendAvatarUpdate();
}

function hydrateWorld(state) {
  if (!state) return;
  const seenPlayers = new Set();
  state.players.forEach((player) => {
    seenPlayers.add(player.id);
    if (player.id === localState.playerId) {
      return;
    }
    const existing = remotePlayers.get(player.id);
    const normalized = normalizeAvatarAppearance(player.avatar);
    if (!existing) {
      const avatar = createAvatar(normalized);
      avatar.group.position.set(
        player.transform?.position?.x || 0,
        player.transform?.position?.y || 1,
        player.transform?.position?.z || 0,
      );
      scene.add(avatar.group);
      remotePlayers.set(player.id, { ...avatar, targetTransform: player.transform });
    } else {
      updateTransform(existing.group, player.transform);
      existing.setAppearance(normalized);
    }
  });

  remotePlayers.forEach((avatar, id) => {
    if (!seenPlayers.has(id)) {
      scene.remove(avatar.group);
      remotePlayers.delete(id);
    }
  });

  state.decorations?.forEach((decor) => upsertDecoration(decor));
  decorationMeshes.forEach((mesh, id) => {
    if (!state.decorations.find((d) => d.id === id)) {
      scene.remove(mesh);
      decorationMeshes.delete(id);
    }
  });
}

function updateTransform(group, transform) {
  if (!transform) return;
  group.position.set(transform.position.x, transform.position.y, transform.position.z);
  group.rotation.y = transform.rotation.y || 0;
}

function attemptDecorationPlacement(event) {
  if (!localState.sessionCode) return;
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(placementSurfaces, true);
  if (!intersects.length) return;
  const hit = intersects[0];
  placeDecoration(hit.point, hit.face?.normal || new THREE.Vector3(0, 1, 0));
}

function placeDecoration(point, normal) {
  const decoration = {
    typeId: localState.decorType,
    color: localState.decorColor,
    glow: 0.6,
    transform: {
      position: { x: point.x, y: point.y, z: point.z },
      rotation: { x: 0, y: Math.atan2(normal.x, normal.z) || 0, z: 0 },
      scale: 1,
    },
  };

  network.send('place_decoration', decoration);
  showToast(`Placed ${localState.decorType.replace('_', ' ')} ✨`);
}

function upsertDecoration(data) {
  let mesh = decorationMeshes.get(data.id);
  if (!mesh) {
    mesh = createDecorationMesh(data);
    decorationMeshes.set(data.id, mesh);
    scene.add(mesh);
  }
  mesh.position.set(data.transform.position.x, data.transform.position.y, data.transform.position.z);
  mesh.rotation.y = data.transform.rotation.y || 0;
}

function createDecorationMesh(data) {
  let mesh;
  const color = new THREE.Color(data.color || '#fff8e7');
  switch (data.type) {
    case 'wreath':
      mesh = new THREE.Mesh(
        new THREE.TorusGeometry(1.1, 0.2, 16, 32),
        new THREE.MeshStandardMaterial({ color }),
      );
      mesh.position.y += 2;
      break;
    case 'snowglobe':
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 20, 16),
        new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 0,
          roughness: 0,
          transmission: 0.6,
          thickness: 0.6,
        }),
      );
      break;
    case 'lantern':
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 1.5, 12),
        new THREE.MeshStandardMaterial({ color }),
      );
      mesh.add(new THREE.PointLight(color.getHex(), 0.8, 8));
      break;
    case 'string_lights':
    default: {
      const group = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
      for (let i = 0; i < 6; i += 1) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), material);
        bulb.position.set(-1.5 + i * 0.6, 2.2 + Math.sin(i) * 0.2, 0);
        group.add(bulb);
      }
      mesh = group;
      break;
    }
  }
  return mesh;
}

function sendAvatarUpdate() {
  if (!localState.sessionCode || !network.socket) return;
  const transform = {
    position: {
      x: localPlayer.group.position.x,
      y: localPlayer.group.position.y,
      z: localPlayer.group.position.z,
    },
    rotation: { x: 0, y: localPlayer.group.rotation.y, z: 0 },
  };
  network.send('update_avatar', {
    transform,
    avatar: { colors: localState.avatarColors, outfit: localState.outfit, hair: localState.hair },
  });
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  updatePlayer(delta);
  updateSnow(delta);
  renderer.render(scene, camera);
}

function updatePlayer(delta) {
  if (!dragState.active && !autoFollowPaused) {
    const yawTarget = (0.5 - cursorState.x) * 1.6;
    const pitchTarget = THREE.MathUtils.clamp(0.35 + (cursorState.y - 0.5) * 0.7, 0.15, 1.1);
    cameraOrbit.yaw = THREE.MathUtils.lerp(cameraOrbit.yaw, yawTarget, 0.08);
    cameraOrbit.pitch = THREE.MathUtils.lerp(cameraOrbit.pitch, pitchTarget, 0.08);
  }

  const forwardInput = (inputState.forward ? 1 : 0) - (inputState.backward ? 1 : 0);
  const strafeInput = (inputState.right ? 1 : 0) - (inputState.left ? 1 : 0);
  const forwardDir = new THREE.Vector3(
    -Math.sin(cameraOrbit.yaw),
    0,
    -Math.cos(cameraOrbit.yaw),
  ).normalize();
  const rightDir = new THREE.Vector3().crossVectors(forwardDir, new THREE.Vector3(0, 1, 0)).normalize();

  const moveVector = new THREE.Vector3();
  if (forwardInput !== 0) moveVector.add(forwardDir.clone().multiplyScalar(forwardInput));
  if (strafeInput !== 0) moveVector.add(rightDir.clone().multiplyScalar(strafeInput));

  if (moveVector.lengthSq() > 0) {
    const facing = moveVector.clone().normalize();
    localPlayer.group.position.add(facing.multiplyScalar(delta * 4));
    const angle = Math.atan2(moveVector.x, moveVector.z);
    localPlayer.group.rotation.y = angle;
    sendAvatarUpdate();
  }

  cameraTarget.lerp(localPlayer.group.position, 0.08);
  const offset = new THREE.Vector3(
    Math.sin(cameraOrbit.yaw) * Math.cos(cameraOrbit.pitch),
    Math.sin(cameraOrbit.pitch),
    Math.cos(cameraOrbit.yaw) * Math.cos(cameraOrbit.pitch),
  ).multiplyScalar(cameraOrbit.distance);

  const desiredPosition = localPlayer.group.position.clone().add(offset);
  camera.position.lerp(desiredPosition, 0.08);
  camera.lookAt(cameraTarget);
}

function updateSnow(delta) {
  const { points } = snowSystem;
  const positions = points.geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    let y = positions.getY(i);
    y -= snowSystem.speeds[i] * delta * 25 * localState.snowMultiplier;
    if (y < 0) {
      y = Math.random() * 40 + 10;
    }
    positions.setY(i, y);
  }
  positions.needsUpdate = true;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toastEl.classList.remove('visible'), 2400);
}
