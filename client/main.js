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
const radialMenu = document.getElementById('decor-radial');
const radialButtons = radialMenu ? Array.from(radialMenu.querySelectorAll('button[data-type]')) : [];
const storyIntroPanel = document.getElementById('story-intro');
const introContinueBtn = document.getElementById('intro-continue');
const customizeToggleBtn = document.getElementById('customize-toggle');
const customizeModal = document.getElementById('customize-modal');
const customizeCloseBtn = document.getElementById('customize-close');
const bulbCountLabel = document.getElementById('bulb-count');
const strandBar = document.getElementById('strand-bar');
const throwMeterEl = document.getElementById('throw-meter');
const throwMeterFill = throwMeterEl ? throwMeterEl.querySelector('.fill') : null;
const throwMeterLabel = document.getElementById('throw-meter-label');
const storyCharacterButtons = document.querySelectorAll('#story-character-select .character-card');
const modalCharacterButtons = document.querySelectorAll('#modal-character-select .character-card');
const joinToggleBtn = document.getElementById('join-toggle');
const joinCard = document.getElementById('join-card');
const hudCollapseBtn = document.getElementById('hud-collapse');
const strandSocketsEl = document.getElementById('strand-sockets');

if (strandBar) {
  strandBar.classList.add('hidden');
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1d2e);
scene.fog = new THREE.FogExp2(0x0a1624, 0.018);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 6, 14);

const cameraTarget = new THREE.Vector3(0, 1, 0);
const cameraOrbit = {
  yaw: 0,
  pitch: 0.4,
  distance: 13,
};
const pointerState = { x: 0.5, y: 0.5 };
const cameraBase = { yaw: cameraOrbit.yaw, pitch: cameraOrbit.pitch };
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
const EDGE_THRESHOLD = 0.08;
const EDGE_PAN_SPEED = 0.6;
const EDGE_TILT_SPEED = 0.4;
const STRAND_SOCKET_COUNT = 8;
const STRAND_SEGMENTS = 12;
const BULB_COLORS = ['#ff9aa0', '#ffe48f', '#a2f2cb', '#93d0ff', '#f7b6ff', '#fff4c8'];
const BULB_PICKUP_COUNT = 20;
const THROW_FULL_DURATION = 900;
const THROW_MIN_DURATION = 400;
const HIGHLIGHT_UPDATE_INTERVAL = 1 / 45;
const PICKUP_UPDATE_INTERVAL = 1 / 40;
const COLLECTIBLE_UPDATE_INTERVAL = 1 / 35;
const HOUSE_GLOW_INTERVAL = 1 / 30;
const DROP_GRAVITY = 12;

const clock = new THREE.Clock();
let elapsedTime = 0;
const placementSurfaces = [];
const terrainMeshes = [];
const terrainRaycaster = new THREE.Raycaster();
const terrainSampleOrigin = new THREE.Vector3();
const terrainDown = new THREE.Vector3(0, -1, 0);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const decorZones = [];
const collectibles = [];
const bulbPickups = [];
const bulbSpawnBounds = { x: 110, z: 110 };
let pickupSpawnContext = null;
let manualBulbSpawner = null;
const throwEffects = [];
const dropProjectiles = [];
const sparkEffects = [];
let lastStrandFullWarning = 0;
const houseGlowState = new Map();
const footstepGroup = new THREE.Group();
const footprints = [];
const MAX_FOOTPRINTS = 32;
let footstepCooldown = 0;
let playerIsMoving = false;
let highlightAccumulator = 0;
let pickupAccumulator = 0;
let collectibleAccumulator = 0;
let houseGlowAccumulator = 0;
const radialState = { zone: null };
const defaultDecorColors = {
  string_lights: '#ffe9b8',
  star_bulbs: '#ffd2e1',
  icicle_lights: '#c7f1ff',
};
const CHARACTER_PRESETS = {
  steph: {
    colors: { outfit: '#d07c30', accent: '#be4f2f' },
    hair: 'soft-wave',
    label: 'Steph',
  },
  forrest: {
    colors: { outfit: '#4c99a8', accent: '#3b3b46' },
    hair: 'pom-hat',
    label: 'Forrest',
  },
};
const collectibleUnlocks = [
  { type: 'star_bulbs', label: 'Star Bulbs' },
  { type: 'icicle_lights', label: 'Icicle Lights' },
];
let audioCtx;
const uiState = {
  awaitingStoryIntro: false,
  storyComplete: false,
  customizationOpen: false,
};

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
  character: 'steph',
  unlockedDecor: new Set(['string_lights']),
};

const inputState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
};
const strandState = {
  sockets: Array(STRAND_SOCKET_COUNT).fill(null),
  group: null,
  line: null,
  bulbMeshes: [],
  socketMaterials: [],
  uiDots: [],
  swingPhase: 0,
  cachedPoints: [],
};
const throwState = {
  charging: false,
  zone: null,
  pointerId: null,
  startTime: 0,
  progress: 0,
};
const movementState = {
  baseSpeed: 5,
  boostTimer: 0,
  boostDuration: 3,
  boostMultiplier: 2.1,
};
const zoomState = { offset: 0, target: 0 };
const jumpState = { velocity: 0, offset: 0, grounded: true };
const tempVecA = new THREE.Vector3();
const tempVecB = new THREE.Vector3();
const tempVecC = new THREE.Vector3();

const remotePlayers = new Map();
const decorationMeshes = new Map();

const village = buildVillage();
placementSurfaces.push(village.ground, ...village.cabins);

const localPlayer = createAvatar({
  colors: localState.avatarColors,
  outfit: localState.outfit,
  hair: localState.hair,
});
localPlayer.group.position.set(0, 0, 0);
scene.add(localPlayer.group);
scene.add(footstepGroup);
initLightStrand();
initStrandUI();

const snowSystem = createSnowSystem(180);
scene.add(snowSystem.points);

setupUI();
selectCharacter(localState.character, { applyPreset: true, updateInputs: true, silent: true });
setupInput();
setInterval(() => {
  if (localState.sessionCode) {
    sendAvatarUpdate();
  }
}, 2500);
animate();

const network = createNetwork();

function selectCharacter(name, options = {}) {
  const variant = CHARACTER_PRESETS[name] ? name : 'steph';
  const preset = CHARACTER_PRESETS[variant];
  localState.character = variant;
  if (options.applyPreset) {
    localState.avatarColors.outfit = preset.colors.outfit;
    localState.avatarColors.accent = preset.colors.accent;
    localState.hair = preset.hair;
    outfitColorInput.value = preset.colors.outfit;
    accentColorInput.value = preset.colors.accent;
    hairSelect.value = preset.hair;
    localPlayer.setColors(localState.avatarColors);
    localPlayer.setHair(localState.hair);
  }
  localPlayer.setCharacter(variant, { applyPreset: false });
  updateCharacterButtons(variant);
  if (!options.silent) {
    sendAvatarUpdate();
  }
}

function updateCharacterButtons(active) {
  const updateGroup = (buttons) => {
    buttons?.forEach((button) => {
      if (!button) return;
      button.classList.toggle('active', button.dataset.character === active);
    });
  };
  updateGroup(storyCharacterButtons);
  updateGroup(modalCharacterButtons);
}

function normalizeAvatarAppearance(avatar = {}) {
  const character = CHARACTER_PRESETS[avatar.character] ? avatar.character : 'steph';
  const preset = CHARACTER_PRESETS[character];
  return {
    character,
    colors: {
      outfit: avatar.colors?.outfit || preset.colors.outfit,
      accent: avatar.colors?.accent || preset.colors.accent,
    },
    outfit: avatar.outfit || 'parka',
    hair: avatar.hair || preset.hair,
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
  decorZones.length = 0;
  collectibles.length = 0;
  bulbPickups.length = 0;
  houseGlowState.clear();
  terrainMeshes.length = 0;
  const groundGeo = new THREE.PlaneGeometry(160, 160, 120, 120);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const noise = (Math.sin(x * 0.08) + Math.cos(z * 0.08)) * 0.2;
    pos.setY(i, noise * 0.2);
  }
  pos.needsUpdate = true;

  const groundMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0,
    clearcoat: 0.2,
    clearcoatRoughness: 0.15,
    side: THREE.DoubleSide,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  terrainMeshes.push(ground);
  const groundBase = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 320),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  groundBase.position.y = -0.05;
  groundBase.rotation.x = -Math.PI / 2;
  groundBase.renderOrder = -1;
  scene.add(groundBase);

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

  const cabinSurfaces = [];
  const cabinConfigs = [
    {
      id: 'maple-hollow',
      position: { x: -36, z: -36 },
      style: {
        facing: Math.PI / 2,
        body: { width: 15, height: 5.3, depth: 9.6, color: 0xc58c69 },
        upperBody: { width: 12.6, height: 3.1, depth: 8.7, offsetY: 0.6, color: 0xe0a983 },
        modules: [
          { width: 6.5, height: 3.4, depth: 4.8, offsetZ: 4.7, color: 0xecc39f },
          { width: 5.5, height: 3.2, depth: 4, offsetX: -7.5, color: 0xd9a173 },
        ],
        roof: { color: 0x834735, height: 2.6, type: 'gable' },
        trimColor: 0xffead1,
        doorColor: 0x4f2d1e,
        porch: { depth: 3.2, widthFactor: 1.1, steps: true, rails: true },
        wreathColor: 0x2e7c5b,
        stringLightsColor: 0xfff2c0,
        dormers: [
          { width: 3, height: 2.2, depth: 2.4, offsetX: -2.4, offsetZ: 0.4 },
          { width: 3, height: 2.2, depth: 2.4, offsetX: 2.4, offsetZ: -0.4 },
        ],
        chimney: true,
      },
    },
    {
      id: 'mint-breeze',
      position: { x: -34, z: -12 },
      style: {
        facing: Math.PI / 2,
        body: { width: 12.2, height: 4.9, depth: 8.3, color: 0xbfded5 },
        upperBody: { width: 10.5, height: 2.7, depth: 7.2, offsetY: 0.8, color: 0xd8f0e9 },
        modules: [{ width: 5.6, height: 3, depth: 4, offsetX: 6.5, color: 0xc6ece0 }],
        roof: { color: 0x3c6b5b, height: 2.3, type: 'gable' },
        trimColor: 0xf5fff7,
        doorColor: 0x2c4c41,
        porch: { depth: 2.6, widthFactor: 1, steps: true, wrap: true },
        wreathColor: 0x369476,
        stringLightsColor: 0xfff7df,
      },
    },
    {
      id: 'apricot-nook',
      position: { x: -34, z: 12 },
      style: {
        facing: Math.PI / 2,
        body: { width: 13.4, height: 5.1, depth: 9, color: 0xe4b59e },
        upperBody: { width: 12, height: 3.2, depth: 8, offsetY: 0.45, color: 0xf7d2c1 },
        modules: [
          { width: 6.2, height: 3.6, depth: 4.2, offsetZ: -4.4, color: 0xfddaca },
          { width: 5.4, height: 3.2, depth: 4.6, offsetX: -6.2, color: 0xf2c0ad },
        ],
        roof: { color: 0x9c4551, height: 2.7, type: 'gable' },
        trimColor: 0xfff0ea,
        doorColor: 0x6d2f2f,
        porch: { depth: 2.9, widthFactor: 1.06, steps: true, rails: true },
        balcony: { width: 5.2, depth: 2.2, height: 4.5, railingColor: 0xfff0ea },
        wreathColor: 0x408067,
        stringLightsColor: 0xffe3d4,
      },
    },
    {
      id: 'cocoa-corner',
      position: { x: -36, z: 36 },
      style: {
        facing: Math.PI / 2,
        body: { width: 16.5, height: 5.6, depth: 10.4, color: 0xb07c5a },
        upperBody: { width: 14.2, height: 3.3, depth: 9.4, offsetY: 0.5, color: 0xcb9973 },
        modules: [
          { width: 7.8, height: 3.6, depth: 5.2, offsetZ: 5.2, color: 0xdbab84 },
          { width: 6.8, height: 3.8, depth: 4.6, offsetX: 8.4, color: 0xc08c66 },
        ],
        roof: { color: 0x4a281b, height: 2.9, type: 'gable' },
        trimColor: 0xffefd9,
        doorColor: 0x2c1c16,
        porch: { depth: 3.3, widthFactor: 1.2, steps: true, rails: true, wrap: true, columns: 4 },
        wreathColor: 0x4e8a63,
        stringLightsColor: 0xfff7d0,
        chimney: true,
      },
    },
    {
      id: 'jasper-lantern',
      position: { x: 36, z: -36 },
      style: {
        facing: -Math.PI / 2,
        body: { width: 15.2, height: 5.4, depth: 9.7, color: 0xcdb2a0 },
        upperBody: { width: 13.4, height: 3.3, depth: 8.9, offsetY: 0.45, color: 0xe1c4b4 },
        modules: [
          { width: 6.5, height: 3.6, depth: 4.5, offsetZ: -4.6, color: 0xd8bbab },
          { width: 5.5, height: 3.4, depth: 4, offsetX: 7.4, color: 0xf0d6c8 },
        ],
        roof: { color: 0x365377, height: 2.8, type: 'gable' },
        trimColor: 0xfdf7f0,
        doorColor: 0x3a2d24,
        porch: { depth: 2.7, widthFactor: 1.05, steps: true, rails: true },
        balcony: { width: 6.8, depth: 2.6, height: 4.7 },
        wreathColor: 0x387875,
        stringLightsColor: 0xc5f1ff,
        dormers: [{ width: 3.2, height: 2.3, depth: 2.6, offsetX: 0, offsetZ: 0.4 }],
      },
    },
    {
      id: 'pine-whisper',
      position: { x: 34, z: -12 },
      style: {
        facing: -Math.PI / 2,
        body: { width: 12.4, height: 4.9, depth: 8.6, color: 0xa7ccc8 },
        upperBody: { width: 10.8, height: 2.7, depth: 7.6, offsetY: 0.7, color: 0xbfe0dd },
        modules: [
          { width: 5.2, height: 3.1, depth: 4.1, offsetX: -6, color: 0xd9f8f2 },
        ],
        roof: { color: 0x2e5156, height: 2.4, type: 'gable' },
        trimColor: 0xf2fffc,
        doorColor: 0x203c40,
        porch: { depth: 2.5, widthFactor: 0.98, steps: true, wrap: true },
        wreathColor: 0x1f7765,
        stringLightsColor: 0xd6fff8,
      },
    },
    {
      id: 'cranberry-cabin',
      position: { x: 34, z: 12 },
      style: {
        facing: -Math.PI / 2,
        body: { width: 13.8, height: 5.2, depth: 9.4, color: 0xcf8b85 },
        upperBody: { width: 12, height: 3.1, depth: 8.3, offsetY: 0.5, color: 0xe0a39f },
        modules: [
          { width: 6.7, height: 3.3, depth: 4.3, offsetZ: 4.6, color: 0xf1bab3 },
          { width: 5.6, height: 3.5, depth: 4.4, offsetX: 7, color: 0xd9837c },
        ],
        roof: { color: 0x752a32, height: 2.6, type: 'gable' },
        trimColor: 0xffedea,
        doorColor: 0x3d191c,
        porch: { depth: 3.1, widthFactor: 1.08, steps: true, rails: true },
        wreathColor: 0x32765a,
        stringLightsColor: 0xffd4ce,
        dormers: [{ width: 2.8, height: 2, depth: 2.4, offsetX: -2.3, offsetZ: 0 }],
      },
    },
    {
      id: 'aurora-glow',
      position: { x: 36, z: 36 },
      style: {
        facing: -Math.PI / 2,
        body: { width: 16.6, height: 5.6, depth: 10.2, color: 0xb8b0d0 },
        upperBody: { width: 14.2, height: 3.2, depth: 9.2, offsetY: 0.65, color: 0xd6cdea },
        modules: [
          { width: 8.2, height: 4, depth: 4.8, offsetZ: -4.7, color: 0xcac1e6 },
          { width: 6.2, height: 3.5, depth: 4.2, offsetX: -9, color: 0xe8dbff },
        ],
        roof: { color: 0x4d4a80, height: 2.8, type: 'gable' },
        trimColor: 0xfdf4ff,
        doorColor: 0x2a213e,
        porch: { depth: 3.5, widthFactor: 1.08, steps: true, rails: true, columns: 4 },
        balcony: { width: 7.4, depth: 2.6, height: 4.9 },
        wreathColor: 0x3a7b73,
        stringLightsColor: 0xe4d5ff,
        chimney: true,
      },
    },
  ];
  const laneCenterX =
    (Math.min(...cabinConfigs.map((cfg) => cfg.position.x)) +
      Math.max(...cabinConfigs.map((cfg) => cfg.position.x))) /
    2;

  const walkwayAnchors = [];

  cabinConfigs.forEach((config) => {
    const cabin = createCabin(config);
    cabinSurfaces.push(...cabin.surfaces);
    scene.add(cabin.group);
    placementSurfaces.push(...cabin.surfaces);
    const frontAnchor = computeFrontAnchor(config);
    walkwayAnchors.push({
      id: config.id,
      position: config.position,
      front: frontAnchor,
    });
    registerDecorZones(config);
    if (cabin.doorLight) {
      houseGlowState.set(config.id, {
        light: cabin.doorLight,
        intensity: 0.9,
        target: 0.9,
      });
    }
  });

  const pathSegments = createVillagePaths(walkwayAnchors);

  const plazaTree = createGrandTree();
  plazaTree.position.set(laneCenterX, 0, -18);
  scene.add(plazaTree);

  const pond = createFrozenPond(11);
  pond.position.set(laneCenterX - 12, -0.02, 18);
  scene.add(pond);
  terrainMeshes.push(pond);
  const bridge = createWoodenBridge(16);
  bridge.position.copy(pond.position);
  bridge.position.y = 0.6;
  bridge.rotation.y = Math.PI / 2;
  scene.add(bridge);
  terrainMeshes.push(bridge);

  const pathAreas = computePathBounds(pathSegments);
  const snowMounds = new THREE.Group();
  for (let i = 0; i < 40; i += 1) {
    const radius = Math.random() * 2.2 + 1.6;
    const height = radius * (0.5 + Math.random() * 0.3);
    const mound = createSnowMound(radius, height, 0xffffff);
    let attempts = 0;
    do {
      mound.position.set((Math.random() - 0.5) * 120, 0.02, (Math.random() - 0.5) * 120);
      attempts += 1;
    } while (isOnPath(mound.position, pathAreas) && attempts < 10);
    snowMounds.add(mound);
    terrainMeshes.push(mound);
  }
  scene.add(snowMounds);

  const cabinPiles = new THREE.Group();
  cabinConfigs.forEach((config) => {
    for (let i = 0; i < 3; i += 1) {
      const radius = Math.random() * 0.9 + 0.6;
      const height = radius * (0.7 + Math.random() * 0.4);
      const drift = createSnowMound(radius, height, 0xffffff);
      drift.position.set(
        config.position.x + (Math.random() - 0.5) * 5,
        0.02,
        config.position.z + (Math.random() - 0.5) * 5,
      );
      cabinPiles.add(drift);
      terrainMeshes.push(drift);
    }
  });
  scene.add(cabinPiles);

  const cabinBounds = cabinConfigs.map((config) => calculateCabinBounds(config));
  pickupSpawnContext = { pathAreas, cabinBounds };
  spawnLightPickups();

    for (let i = 0; i < 20; i += 1) {
      const angle = (Math.PI * 2 * i) / 20;
      const radius = 42 + Math.random() * 18;
      const position = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      if (isNearCabin(position, cabinBounds)) continue;
      const tree = createTree();
      tree.position.copy(position);
      scene.add(tree);
    }

  return { ground, cabins: cabinSurfaces };

  function computeFrontAnchor(config) {
    const facing = config.style.facing || 0;
    const frontDir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    const doorOffset = config.style.body.depth / 2 + 0.25;
    return new THREE.Vector3(config.position.x, 0.04, config.position.z).add(
      frontDir.multiplyScalar(doorOffset),
    );
  }

  function registerDecorZones(config) {
    const facing = config.style.facing || 0;
    const frontDir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)).normalize();
    const rightDir = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), frontDir).normalize();
    const segments = 3;
    const depthOffset = config.style.body.depth / 2 + 0.6;
    const baseHeight = config.style.body.height * 0.8;

    for (let i = 0; i < segments; i += 1) {
      const span = segments === 1 ? 0 : (i / (segments - 1)) * 2 - 1;
      const anchor = new THREE.Vector3(config.position.x, baseHeight, config.position.z)
        .add(frontDir.clone().multiplyScalar(depthOffset))
        .add(rightDir.clone().multiplyScalar(span * config.style.body.width * 0.35));
      const highlight = new THREE.Mesh(
        new THREE.PlaneGeometry(config.style.body.width * 0.35, 0.6),
        new THREE.MeshBasicMaterial({
          color: 0xfff4d0,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      highlight.position.copy(anchor);
      highlight.lookAt(anchor.clone().add(frontDir));
      highlight.userData.zoneId = `${config.id}-zone-${i}`;
      scene.add(highlight);
      const zoneData = {
        id: highlight.userData.zoneId,
        houseId: config.id,
        mesh: highlight,
        anchor,
        normal: frontDir.clone(),
        glow: 0,
        activationRadius: 9,
      };
      highlight.userData.zone = zoneData;
      decorZones.push(zoneData);
      placementSurfaces.push(highlight);
    }
  }

  function spawnLightPickups() {
    if (!pickupSpawnContext) return;
    while (bulbPickups.length > 0) {
      const entry = bulbPickups.pop();
      if (entry?.mesh) {
        scene.remove(entry.mesh);
      }
    }
    for (let i = 0; i < BULB_PICKUP_COUNT; i += 1) {
      spawnSingleBulb();
    }
  }

  function spawnSingleBulb(options = {}) {
    if (!pickupSpawnContext && !options.position) return null;
    const color = options.color || BULB_COLORS[Math.floor(Math.random() * BULB_COLORS.length)];
    const pickup = createBulbPickup(color);
    let position;
    if (options.position) {
      const pos = options.position;
      position = pos.clone ? pos.clone() : new THREE.Vector3(pos.x || 0, pos.y || 0, pos.z || 0);
    } else {
      const { pathAreas, cabinBounds } = pickupSpawnContext;
      position = findSpawnPosition(pathAreas, cabinBounds);
    }
    const terrainY = sampleTerrainHeight(position);
    position.y = terrainY + 0.02;
    const baseY = options.baseY ?? position.y;
    const restHeight = options.restHeight ?? baseY + 0.12;
    const dropHeight =
      options.dropHeight && options.dropHeight > restHeight ? options.dropHeight : restHeight;
    pickup.position.copy(position);
    pickup.position.y = dropHeight;
    const entry = {
      mesh: pickup,
      color,
      baseY,
      restHeight,
      wobbleOffset: Math.random() * Math.PI * 2,
      collected: false,
      isDropping: dropHeight > restHeight + 0.01,
      dropSpeed: options.dropSpeed || 3,
      dropVelocity: options.dropVelocity ? options.dropVelocity.clone() : null,
      immuneUntil: options.immuneUntil || 0,
      requireExitBeforeCollect: Boolean(options.requireExitBeforeCollect),
    };
    scene.add(pickup);
    bulbPickups.push(entry);
    return entry;
  }
  manualBulbSpawner = (options = {}) => {
    const entry = spawnSingleBulb(options);
    if (entry) {
      entry.wobbleOffset = options.wobbleOffset ?? entry.wobbleOffset;
      entry.isDropping = options.isDropping ?? entry.isDropping;
      entry.dropSpeed = options.dropSpeed || entry.dropSpeed;
      entry.requireExitBeforeCollect =
        options.requireExitBeforeCollect ?? entry.requireExitBeforeCollect;
      entry.immuneUntil = options.immuneUntil ?? entry.immuneUntil;
      entry.baseY = options.baseY ?? entry.baseY;
      entry.restHeight = options.restHeight ?? entry.restHeight;
    }
    return entry;
  };

  function findSpawnPosition(pathAreas, cabinBounds) {
    const position = new THREE.Vector3();
    let attempts = 0;
    do {
      position.set(
        (Math.random() - 0.5) * bulbSpawnBounds.x,
        0.08,
        (Math.random() - 0.5) * bulbSpawnBounds.z,
      );
      attempts += 1;
    } while (
      (isOnPath(position, pathAreas) || isNearCabin(position, cabinBounds)) &&
      attempts < 30
    );
    return position.clone();
  }

  function createVillagePaths(anchors) {
    if (!anchors.length) return [];
    const segments = [];
    const zValues = cabinConfigs.map((cfg) => cfg.position.z);
    const frontXValues = anchors.map(({ front }) => front.x);
    const mainX = (Math.min(...frontXValues) + Math.max(...frontXValues)) / 2;

    const mainStart = new THREE.Vector3(mainX, 0.035, Math.min(...zValues) - 20);
    const mainEnd = new THREE.Vector3(mainX, 0.035, Math.max(...zValues) + 20);
    const mainSegment = createPathSegment(mainStart, mainEnd, 5);
    if (mainSegment) segments.push(mainSegment);

    const mainLine = {
      x: mainX,
      startZ: Math.min(mainStart.z, mainEnd.z),
      endZ: Math.max(mainStart.z, mainEnd.z),
    };

    anchors.forEach(({ front }) => {
      const walkwayEnd = computeWalkwayTarget(front, mainLine);
      if (!walkwayEnd) return;
      const direction = walkwayEnd.clone().sub(front).setY(0);
      if (direction.lengthSq() < 0.001) return;
      const mid = front.clone().addScaledVector(direction, 0.5);
      const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
      const curveStrength = Math.min(1.5, direction.length() * 0.25);
      mid.add(perpendicular.multiplyScalar(curveStrength || 0.4));
      const walkwayBounds = createCurvedWalkway(
        [front.clone(), mid, walkwayEnd.clone()],
        2.2,
      );
      if (walkwayBounds) {
        segments.push(walkwayBounds);
      }
    });

    return segments;
  }

  function createPathSegment(start, end, width = 3) {
    const dir = end.clone().sub(start);
    const length = dir.length();
    if (length < 0.01) return null;
    const center = start.clone().addScaledVector(dir, 0.5);
    const segmentsX = Math.max(8, Math.floor(length / 1.5));
    const geometry = new THREE.PlaneGeometry(length, width, segmentsX, 6);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const edgeFactor = Math.abs(y) / (width * 0.5);
      const jitter = (Math.random() - 0.5) * 0.8 * Math.pow(edgeFactor, 0.8);
      positions.setY(i, y + jitter);
      if (Math.random() < 0.25) {
        positions.setX(i, x + (Math.random() - 0.5) * 0.6);
      }
    }
    positions.needsUpdate = true;
    geometry.rotateX(-Math.PI / 2);

    const stoneTexture = new THREE.CanvasTexture(generateStoneTexture());
    stoneTexture.wrapS = stoneTexture.wrapT = THREE.RepeatWrapping;
    stoneTexture.repeat.set(Math.max(1, length / 5), Math.max(1, width / 1.5));
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        map: stoneTexture,
        color: 0xffffff,
        roughness: 0.95,
        metalness: 0.05,
      }),
    );
    mesh.position.copy(center);
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return {
      x1: Math.min(start.x, end.x) - width,
      x2: Math.max(start.x, end.x) + width,
      z1: Math.min(start.z, end.z) - width,
      z2: Math.max(start.z, end.z) + width,
    };
  }

  function createCurvedWalkway(points, width) {
    const curve = new THREE.CatmullRomCurve3(points);
    const divisions = Math.max(20, Math.floor(curve.getLength() / 1.2));
    const samples = curve.getPoints(divisions);
    const left = [];
    const right = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < samples.length; i += 1) {
      const current = samples[i];
      const prev = samples[i - 1] || current;
      const next = samples[i + 1] || current;
      const tangent = next.clone().sub(prev).setY(0).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const offset = normal.clone().multiplyScalar(width / 2);
      left.push(current.clone().add(offset));
      right.push(current.clone().sub(offset));
      minX = Math.min(minX, current.x - width);
      maxX = Math.max(maxX, current.x + width);
      minZ = Math.min(minZ, current.z - width);
      maxZ = Math.max(maxZ, current.z + width);
    }

    const positions = [];
    const indices = [];
    const uvs = [];
    for (let i = 0; i < samples.length; i += 1) {
      const l = left[i];
      const r = right[i];
      positions.push(l.x, 0.04, l.z, r.x, 0.04, r.z);
      uvs.push(0, i, 1, i);
    }
    for (let i = 0; i < samples.length - 1; i += 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const stoneTexture = new THREE.CanvasTexture(generateStoneTexture());
    stoneTexture.wrapS = stoneTexture.wrapT = THREE.RepeatWrapping;
    stoneTexture.repeat.set(samples.length / 5, 1);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        map: stoneTexture,
        color: 0xffffff,
        roughness: 0.95,
        metalness: 0.05,
      }),
    );
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    scene.add(mesh);

    return {
      x1: minX,
      x2: maxX,
      z1: minZ,
      z2: maxZ,
    };
  }

  function computePathBounds(bounds) {
    return bounds;
  }

  function computeWalkwayTarget(front, mainLine) {
    const clampedZ = Math.min(Math.max(front.z, mainLine.startZ + 2), mainLine.endZ - 2);
    if (!Number.isFinite(clampedZ)) return null;
    return new THREE.Vector3(mainLine.x, front.y, clampedZ);
  }

  function isOnPath(position, pathBounds) {
    return pathBounds.some(
      (bound) =>
        position.x >= bound.x1 &&
        position.x <= bound.x2 &&
        position.z >= bound.z1 &&
        position.z <= bound.z2,
    );
  }

  function calculateCabinBounds(config) {
    const style = config.style;
    let halfWidth = style.body.width / 2;
    let halfDepth = style.body.depth / 2;

    if (style.upperBody) {
      halfWidth = Math.max(halfWidth, style.upperBody.width / 2);
      halfDepth = Math.max(halfDepth, style.upperBody.depth / 2);
    }

    if (style.modules) {
      style.modules.forEach((module) => {
        halfWidth = Math.max(
          halfWidth,
          Math.abs(module.offsetX || 0) + module.width / 2,
        );
        halfDepth = Math.max(
          halfDepth,
          Math.abs(module.offsetZ || 0) + module.depth / 2,
        );
      });
    }

    if (style.porch) {
      halfWidth = Math.max(
        halfWidth,
        (style.porch.widthFactor || 1) * style.body.width * 0.5 + 1.5,
      );
      halfDepth = Math.max(
        halfDepth,
        style.body.depth / 2 + (style.porch.depth || 2.5) + 2,
      );
    }

    const padding = 6;
    halfWidth += padding;
    halfDepth += padding;

    return {
      x: config.position.x,
      z: config.position.z,
      width: halfWidth * 2,
      depth: halfDepth * 2,
    };
  }

  function isNearCabin(position, bounds) {
    return bounds.some((cabin) => {
      return (
        Math.abs(position.x - cabin.x) < cabin.width / 2 &&
        Math.abs(position.z - cabin.z) < cabin.depth / 2
      );
    });
  }
}

function createCabin(config) {
  const { id, position, style } = config;
  const group = new THREE.Group();
  group.position.set(position.x, 0, position.z);
  group.rotation.y = style.facing || 0;
  const surfaces = [];

  const bodyVolume = createLogVolume(
    style.body.width,
    style.body.height,
    style.body.depth,
    style.body.color,
  );
  bodyVolume.group.position.y = style.body.height / 2;
  group.add(bodyVolume.group);
  surfaces.push(bodyVolume.surface);

  let roofBaseHeight = style.body.height;

  if (style.upperBody) {
    const upper = style.upperBody;
    const upperVolume = createLogVolume(
      upper.width,
      upper.height,
      upper.depth,
      upper.color || style.body.color,
    );
    upperVolume.group.position.y = style.body.height + upper.height / 2 + (upper.offsetY || 0);
    group.add(upperVolume.group);
    surfaces.push(upperVolume.surface);
    roofBaseHeight = upperVolume.group.position.y + upper.height / 2;
  }

  if (style.modules) {
    style.modules.forEach((module) => {
      const moduleVolume = createLogVolume(
        module.width,
        module.height,
        module.depth,
        module.color || style.body.color,
      );
      moduleVolume.group.position.set(
        module.offsetX || 0,
        (module.offsetY || 0) + module.height / 2,
        module.offsetZ || 0,
      );
      group.add(moduleVolume.group);
      surfaces.push(moduleVolume.surface);
    });
  }

  const roofMat = new THREE.MeshStandardMaterial({
    color: style.roof.color,
    roughness: 0.6,
    metalness: 0.05,
  });

  const halfDepth = style.body.depth / 2 + 0.2;
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-halfDepth, 0);
  gableShape.lineTo(halfDepth, 0);
  gableShape.lineTo(0, style.roof.height);
  gableShape.closePath();

  const roofDepth = style.body.width + 0.2;
  const extrudeSettings = { depth: roofDepth, bevelEnabled: false };
  const gableGeometry = new THREE.ExtrudeGeometry(gableShape, extrudeSettings);
  gableGeometry.translate(0, roofBaseHeight, -roofDepth / 2);
  gableGeometry.rotateY(Math.PI / 2);

  const roof = new THREE.Mesh(gableGeometry, roofMat);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);
  surfaces.push(roof);

  if (style.dormers) {
    style.dormers.forEach((dormer) => {
      const dormerGeo = new THREE.BoxGeometry(dormer.width, dormer.height, dormer.depth);
      const dormerMat = new THREE.MeshStandardMaterial({
        color: dormer.color || style.trimColor || 0xf5e4cf,
        roughness: 0.75,
      });
      const dormerMesh = new THREE.Mesh(dormerGeo, dormerMat);
      dormerMesh.position.set(
        dormer.offsetX || 0,
        roofBaseHeight + dormer.height / 2,
        dormer.offsetZ || 0,
      );
      dormerMesh.castShadow = true;
      dormerMesh.receiveShadow = true;
      group.add(dormerMesh);
      surfaces.push(dormerMesh);

      const dormerRoofShape = new THREE.Shape();
      const halfDormDepth = dormer.depth / 2 + 0.3;
      dormerRoofShape.moveTo(-halfDormDepth, 0);
      dormerRoofShape.lineTo(halfDormDepth, 0);
      dormerRoofShape.lineTo(0, dormer.height * 0.7);
      dormerRoofShape.closePath();
      const dormerRoof = new THREE.Mesh(
        new THREE.ExtrudeGeometry(dormerRoofShape, { depth: dormer.width, bevelEnabled: false }),
        new THREE.MeshStandardMaterial({
          color: dormer.roofColor || style.roof.color,
          roughness: 0.6,
          metalness: 0.05,
        }),
      );
      dormerRoof.position.set(dormerMesh.position.x, dormerMesh.position.y + dormer.height / 2, dormerMesh.position.z - dormer.width / 2);
      dormerRoof.rotation.y = Math.PI / 2;
      dormerRoof.castShadow = true;
      group.add(dormerRoof);
    });
  }


  if (style.chimney) {
    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 3, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x4b2a1a, roughness: 0.7 }),
    );
    chimney.position.set(style.body.width * 0.25, style.body.height + 2, -style.body.depth * 0.1);
    chimney.castShadow = true;
    group.add(chimney);
    surfaces.push(chimney);
  }

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 2.6, 0.25),
    new THREE.MeshStandardMaterial({
      color: style.doorColor || 0x4d2718,
      roughness: 0.8,
    }),
  );
  door.position.set(0, 1.3, style.body.depth / 2 + 0.12);
  group.add(door);

  const doorLight = new THREE.PointLight(style.trimColor || 0xfff4d4, 0.6, 10);
  doorLight.position.set(0, 3.8, style.body.depth / 2 + 0.5);
  group.add(doorLight);

  const windowMaterial = new THREE.MeshStandardMaterial({
    emissive: style.trimColor || 0xfff0c4,
    emissiveIntensity: 0.6,
    color: 0x111111,
  });
  const createWindow = (x, y, z) => {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.1), windowMaterial);
    win.position.set(x, y, z);
    group.add(win);
  };
  createWindow(-style.body.width * 0.35, style.body.height * 0.6, style.body.depth / 2 + 0.05);
  createWindow(style.body.width * 0.35, style.body.height * 0.6, style.body.depth / 2 + 0.05);

  if (style.shuttersColor) {
    const shutterMaterial = new THREE.MeshStandardMaterial({
      color: style.shuttersColor,
      roughness: 0.7,
    });
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.08), shutterMaterial);
    const shutterLeft = shutter.clone();
    shutterLeft.position.set(-style.body.width * 0.5 + 0.3, style.body.height * 0.6, style.body.depth / 2 + 0.06);
    group.add(shutterLeft);
    const shutterRight = shutter.clone();
    shutterRight.position.x = -shutterLeft.position.x;
    group.add(shutterRight);
  }

  if (style.wreathColor) {
    const wreath = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.2, 12, 24),
      new THREE.MeshStandardMaterial({
        color: style.wreathColor,
        emissive: style.wreathColor,
        emissiveIntensity: 0.3,
      }),
    );
    wreath.position.set(0, style.body.height * 0.85, style.body.depth / 2 + 0.2);
    group.add(wreath);
  }

  if (style.porch) {
    const porchWidth = style.body.width * (style.porch.widthFactor || 0.9);
    const porchDepth = style.porch.depth || 2.6;
    const porch = new THREE.Mesh(
      new THREE.BoxGeometry(porchWidth, 0.35, porchDepth),
      new THREE.MeshStandardMaterial({ color: 0xfefefe, roughness: 0.95 }),
    );
    porch.position.set(0, 0.2, style.body.depth / 2 + porchDepth / 2);
    porch.receiveShadow = true;
    group.add(porch);
    surfaces.push(porch);

    const columnCount = Math.max(2, style.porch.columns || 2);
    const doorClear = 3;
    const postMaterial = new THREE.MeshStandardMaterial({
      color: style.trimColor || 0xffeed0,
      roughness: 0.7,
    });
    const postPositions = [];
    for (let i = 0; i < columnCount; i += 1) {
      const t = columnCount === 1 ? 0 : i / (columnCount - 1);
      const x = -porchWidth / 2 + t * porchWidth;
      if (Math.abs(x) < doorClear / 2) continue;
      postPositions.push(x);
    }
    if (postPositions.length === 0) {
      postPositions.push(-porchWidth / 2 + 0.35, porchWidth / 2 - 0.35);
    }
    postPositions.forEach((x) => {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 2.8, 0.3),
        postMaterial,
      );
      post.position.set(x, 1.4, porch.position.z + porchDepth / 2 - 0.35);
      post.castShadow = true;
      group.add(post);
    });

    if (style.porch.rails) {
      const railColor = style.trimColor || 0xffeed0;
      const available = porchWidth - doorClear - 0.6;
      if (available > 0.5) {
        const railLength = available / 2;
        const railGeom = new THREE.BoxGeometry(railLength, 0.15, 0.15);
        const railMat = new THREE.MeshStandardMaterial({ color: railColor, roughness: 0.6 });
        const leftRail = new THREE.Mesh(railGeom, railMat);
        leftRail.position.set(
          -doorClear / 2 - railLength / 2,
          1.4,
          porch.position.z + porchDepth / 2 - 0.35,
        );
        group.add(leftRail);
        const rightRail = new THREE.Mesh(railGeom, railMat);
        rightRail.position.set(
          doorClear / 2 + railLength / 2,
          1.4,
          porch.position.z + porchDepth / 2 - 0.35,
        );
        group.add(rightRail);
      }
    }

    if (style.porch.steps) {
      const stepCount = 3;
      for (let i = 0; i < stepCount; i += 1) {
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(porchWidth * 0.8, 0.25, 0.6),
          new THREE.MeshStandardMaterial({ color: 0xfdfdfd, roughness: 0.95 }),
        );
        step.position.set(
          0,
          0.12 + i * 0.25,
          porch.position.z - porchDepth / 2 + 0.4 + i * 0.5,
        );
        group.add(step);
      }
    }

    if (style.porch.wrap) {
      const wrapWidth = style.body.depth + porchDepth;
      const sidePorch = new THREE.Mesh(
        new THREE.BoxGeometry(wrapWidth, 0.3, 0.9),
        new THREE.MeshStandardMaterial({ color: 0xfefefe, roughness: 0.95 }),
      );
      sidePorch.position.set(-porchWidth / 2 + 0.45, 0.18, 0);
      group.add(sidePorch);
      surfaces.push(sidePorch);
    }
  }

  if (style.balcony) {
    const balconyWidth = style.balcony.width || style.body.width * 0.6;
    const balconyDepth = style.balcony.depth || 3;
    const balconyHeight = style.balcony.height || style.body.height * 0.75;
    const balcony = new THREE.Mesh(
      new THREE.BoxGeometry(balconyWidth, 0.3, balconyDepth),
      new THREE.MeshStandardMaterial({
        color: style.balcony.railColor || style.trimColor || 0xffeed0,
        roughness: 0.8,
      }),
    );
    const balconyZ = -style.body.depth / 2 - balconyDepth / 2;
    balcony.position.set(0, balconyHeight, balconyZ);
    group.add(balcony);
    surfaces.push(balcony);

    const railing = new THREE.Mesh(
      new THREE.BoxGeometry(balconyWidth, 0.15, 0.15),
      new THREE.MeshStandardMaterial({
        color: style.balcony.railColor || style.trimColor || 0xffeed0,
        roughness: 0.6,
      }),
    );
    railing.position.set(0, balconyHeight + 0.6, balconyZ + balconyDepth / 2 - 0.1);
    group.add(railing);
  }

  return { id, group, surfaces, doorLight };
}

function createTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 2.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x5f3b27, roughness: 0.85 }),
  );
  trunk.position.y = 1.1;
  group.add(trunk);

  const levels = 3;
  for (let i = 0; i < levels; i += 1) {
    const radius = 1.9 - i * 0.25;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(radius, 2.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x2e725b, roughness: 0.55 }),
    );
    cone.position.y = 2.2 + i * 1;
    cone.castShadow = true;
    cone.receiveShadow = true;
    group.add(cone);
    const snowCap = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(0.4, radius * 0.55), 0.26, 10),
      new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.4 }),
    );
    snowCap.position.y = cone.position.y + 0.7;
    group.add(snowCap);
  }
  return group;
}

function createGrandTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1, 4.6, 10),
    new THREE.MeshStandardMaterial({ color: 0x6d4a33, roughness: 0.8 }),
  );
  trunk.position.y = 2.3;
  group.add(trunk);

  for (let i = 0; i < 4; i += 1) {
    const layer = new THREE.Mesh(
      new THREE.ConeGeometry(4.5 - i * 0.7, 2.4, 14),
      new THREE.MeshStandardMaterial({ color: 0x2e7b63, roughness: 0.5 }),
    );
    layer.position.y = 4 + i * 1.2;
    layer.castShadow = true;
    group.add(layer);
  }

  const topper = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.6, 0),
    new THREE.MeshStandardMaterial({
      color: 0xffdf8c,
      emissive: 0xffd46f,
      emissiveIntensity: 0.8,
    }),
  );
  topper.position.y = 8.2;
  group.add(topper);

  for (let i = 0; i < 16; i += 1) {
    const hue = (i / 16) * 0.2;
    const color = new THREE.Color().setHSL(0.04 + hue * 0.5, 0.65, 0.7);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 10),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9 }),
    );
    const angle = (Math.PI * 2 * i) / 16;
    const radius = 3 + (i % 4) * 0.3;
    bulb.position.set(Math.cos(angle) * radius, 4.5 + (i % 4) * 0.9, Math.sin(angle) * radius);
    group.add(bulb);
  }
  return group;
}

function createFrozenPond(radius = 10) {
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 48),
    new THREE.MeshPhysicalMaterial({
      color: 0x94dff6,
      roughness: 0.22,
      metalness: 0.05,
      transparent: true,
      opacity: 0.85,
      clearcoat: 1,
      clearcoatRoughness: 0.25,
    }),
  );
  pond.rotation.x = -Math.PI / 2;
  pond.receiveShadow = true;
  return pond;
}

function createWoodenBridge(length = 12) {
  const group = new THREE.Group();
  const plankMaterial = new THREE.MeshStandardMaterial({ color: 0xc39168, roughness: 0.75 });
  for (let i = 0; i < 6; i += 1) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(length, 0.15, 0.7), plankMaterial);
    plank.position.set(0, 0.1 + i * 0.05, -1.6 + i * 0.6);
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
  }
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0xe0b48f, roughness: 0.7 });
  const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.2, 0.12), railMaterial);
  rail.position.set(0, 1, 2);
  group.add(rail);
  const rail2 = rail.clone();
  rail2.position.z = -2;
  group.add(rail2);
  return group;
}

function createCollectible(type, label) {
  const palette = {
    star_bulbs: 0xfff9b5,
    icicle_lights: 0xbbe7ff,
  };
  const color = palette[type] || 0xffffff;
  const group = new THREE.Group();
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 16, 16),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7 }),
  );
  group.add(orb);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.08, 12, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 0.4 }),
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  group.add(new THREE.PointLight(color, 1.4, 6));
  group.userData.label = label;
  return group;
}

function createBulbPickup(color) {
  const group = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 14, 14),
    new THREE.MeshPhysicalMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.7,
      roughness: 0.25,
      transmission: 0.45,
      thickness: 0.2,
    }),
  );
  glass.position.y = 0.2;
  group.add(glass);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.13, 0.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x2d2f42, roughness: 0.8 }),
  );
  cap.position.y = 0.45;
  group.add(cap);
  group.add(new THREE.PointLight(new THREE.Color(color).getHex(), 0.8, 4));
  return group;
}

function generateLogTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c66726';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const logHeight = 32;
  for (let y = -logHeight; y < canvas.height + logHeight; y += logHeight) {
    const gradient = ctx.createLinearGradient(0, y, 0, y + logHeight);
    gradient.addColorStop(0, '#7a2f07');
    gradient.addColorStop(0.25, '#b35b1b');
    gradient.addColorStop(0.5, '#e38b3d');
    gradient.addColorStop(0.75, '#b35317');
    gradient.addColorStop(1, '#6a2704');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y, canvas.width, logHeight);

    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, y + logHeight - 3, canvas.width, 3);

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, y + 4, canvas.width, 2);

    ctx.strokeStyle = 'rgba(96, 60, 30, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.1, y + logHeight * 0.35);
    ctx.quadraticCurveTo(canvas.width * 0.4, y + logHeight * 0.15, canvas.width * 0.65, y + logHeight * 0.3);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.2, y + logHeight * 0.55);
    ctx.quadraticCurveTo(canvas.width * 0.45, y + logHeight * 0.35, canvas.width * 0.85, y + logHeight * 0.5);
    ctx.stroke();
  }

  return canvas;
}

function generateStoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7e808a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 140; i += 1) {
    const cx = Math.random() * canvas.width;
    const cy = Math.random() * canvas.height;
    const radius = 25 + Math.random() * 35;
    const points = 6 + Math.floor(Math.random() * 5);
    ctx.beginPath();
    for (let p = 0; p < points; p += 1) {
      const angle = (Math.PI * 2 * p) / points;
      const offset = radius + Math.random() * 12;
      const x = cx + Math.cos(angle) * offset;
      const y = cy + Math.sin(angle) * offset;
      p === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    const gradient = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
    gradient.addColorStop(0.6, 'rgba(170, 175, 186, 0.95)');
    gradient.addColorStop(1, 'rgba(70, 72, 80, 0.95)');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 42, 48, 0.6)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 80; i += 1) {
    ctx.beginPath();
    ctx.ellipse(
      Math.random() * canvas.width,
      Math.random() * canvas.height,
      10,
      4,
      Math.random() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function createLogVolume(width, height, depth, color = 0x8a3b10) {
  const group = new THREE.Group();
  const logRadius = 0.45;
  const logDiameter = logRadius * 2;
  const rows = Math.ceil(height / logDiameter);
  const logMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0.03,
  });

  const createHorizontalLayer = (length, axis) => {
    const geometry = new THREE.CylinderGeometry(logRadius, logRadius, length + 0.4, 18);
    for (let row = 0; row < rows; row += 1) {
      const y = -height / 2 + (row + 0.5) * logDiameter;
      const log = new THREE.Mesh(geometry, logMaterial);
      if (axis === 'z') {
        log.rotation.z = Math.PI / 2;
        log.position.set(0, y, -depth / 2 + logRadius);
        group.add(log);
        const backLog = log.clone();
        backLog.position.z = depth / 2 - logRadius;
        group.add(backLog);
      } else {
        log.rotation.x = Math.PI / 2;
        log.position.set(-width / 2 + logRadius, y, 0);
        group.add(log);
        const opp = log.clone();
        opp.position.x = width / 2 - logRadius;
        group.add(opp);
      }
    }
  };

  createHorizontalLayer(width, 'z');
  createHorizontalLayer(depth, 'x');

  const cornerMaterial = logMaterial;
  const cornerGeom = new THREE.CylinderGeometry(logRadius * 1.25, logRadius * 1.25, height + 0.5, 16);
  const cornerPositions = [
    [-width / 2 - logRadius * 0.2, 0, -depth / 2 - logRadius * 0.2],
    [width / 2 + logRadius * 0.2, 0, -depth / 2 - logRadius * 0.2],
    [-width / 2 - logRadius * 0.2, 0, depth / 2 + logRadius * 0.2],
    [width / 2 + logRadius * 0.2, 0, depth / 2 + logRadius * 0.2],
  ];
  cornerPositions.forEach(([x, y, z]) => {
    const cornerLog = new THREE.Mesh(cornerGeom, cornerMaterial);
    cornerLog.position.set(x, y, z);
    cornerLog.castShadow = true;
    cornerLog.receiveShadow = true;
    group.add(cornerLog);
  });

  const collider = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  group.add(collider);

  return { group, surface: collider };
}

function createSnowMound(radius, height, color = 0xffffff) {
  const steps = 18;
  const flatness = 0.6 + Math.random() * 0.4; // some heaps flatter
  const widthNoise = 0.8 + Math.random() * 0.4;
  const profile = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const y = t * height;
    const falloff = Math.pow(1 - t * flatness, 1.4);
    const baseRadius = radius * widthNoise * (0.2 + 0.8 * falloff);
    const jitter = (Math.random() - 0.5) * radius * 0.1 * (1 - t);
    const tipFlatten = radius * (0.25 + Math.random() * 0.1) * Math.pow(t, 2);
    const r = Math.max(0.08, baseRadius + jitter - tipFlatten);
    profile.push(new THREE.Vector2(r, y));
  }
  const geometry = new THREE.LatheGeometry(profile, 18);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const y = positions.getY(i);
    const normalized = height > 0 ? y / height : 0;
    const lateralNoise = (Math.random() - 0.5) * radius * 0.06 * (1 - normalized);
    positions.setX(i, positions.getX(i) + lateralNoise);
    positions.setZ(i, positions.getZ(i) + lateralNoise * 0.7);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({ color });
  const mound = new THREE.Mesh(geometry, material);
  mound.castShadow = false;
  mound.receiveShadow = true;
  return mound;
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

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.2, 12, 16), bodyMat);
  body.castShadow = true;
  body.position.y = 1.35;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 26, 18),
    new THREE.MeshStandardMaterial({ color: 0xfff3eb, roughness: 0.55 }),
  );
  head.position.y = 2.6;
  head.castShadow = true;
  group.add(head);

  const facePlate = new THREE.Mesh(
    new THREE.CircleGeometry(0.65, 24),
    new THREE.MeshBasicMaterial({ color: 0xfffaf6 }),
  );
  facePlate.position.set(0, 2.65, 0.75);
  group.add(facePlate);

  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x2a1a18 });
  const blushMaterial = new THREE.MeshBasicMaterial({ color: 0xffb9c6, transparent: true, opacity: 0.6 });
  const leftEye = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), eyeMaterial);
  const rightEye = leftEye.clone();
  leftEye.position.set(-0.18, 2.7, 0.82);
  rightEye.position.set(0.18, 2.7, 0.82);
  group.add(leftEye, rightEye);
  const blushLeft = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), blushMaterial);
  blushLeft.position.set(-0.28, 2.5, 0.8);
  const blushRight = blushLeft.clone();
  blushRight.position.x = 0.28;
  group.add(blushLeft, blushRight);

  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.15, 8, 18), accentMat);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 2.2;
  group.add(scarf);

  const bootGroup = new THREE.Group();
  for (let i = 0; i < 2; i += 1) {
    const boot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 0.5, 14),
      registerMaterial(
        new THREE.MeshStandardMaterial({ color: config.colors.accent, roughness: 0.45 }),
        'accent',
      ),
    );
    boot.position.set(i === 0 ? -0.25 : 0.25, 0.35, 0);
    boot.castShadow = true;
    bootGroup.add(boot);
  }
  group.add(bootGroup);

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
    character: config.character || 'steph',
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

  function setCharacter(name, options = {}) {
    const variantName = CHARACTER_PRESETS[name] ? name : 'steph';
    const preset = CHARACTER_PRESETS[variantName];
    appearanceState.character = variantName;
    if (options.applyPreset) {
      setColors(preset.colors);
      setHair(preset.hair);
    }
  }

  setOutfit(appearanceState.outfit);
  setHair(appearanceState.hair);
  applyColors(appearanceState.colors);
  setCharacter(appearanceState.character);

  return {
    group,
    materials: { body: bodyMat, accent: accentMat },
    setColors,
    setOutfit,
    setHair,
    setCharacter,
    setAppearance: (next) => {
      if (!next) return;
      if (next.colors) setColors(next.colors);
      if (next.outfit) setOutfit(next.outfit);
      if (next.hair) setHair(next.hair);
      if (next.character) setCharacter(next.character);
    },
  };
}

function setupUI() {
  joinInput.addEventListener('input', () => {
    joinInput.value = joinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  if (joinToggleBtn && joinCard) {
    joinToggleBtn.addEventListener('click', () => {
      joinCard.classList.toggle('hidden');
      if (!joinCard.classList.contains('hidden')) {
        setTimeout(() => joinInput.focus(), 80);
      }
    });
  }

  startButton.addEventListener('click', () => {
    uiState.awaitingStoryIntro = true;
    uiState.storyComplete = false;
    startButton.disabled = true;
    startButton.textContent = 'Starting…';
    network.ensureConnection();
    network.send('create_session', {
      displayName: randomSnowyName(),
      avatar: {
        character: localState.character,
        colors: localState.avatarColors,
        outfit: localState.outfit,
        hair: localState.hair,
      },
    });
  });

  joinButton.addEventListener('click', () => {
    const code = joinInput.value.trim().toUpperCase();
    if (code.length < 6) {
      showToast('Enter a 6-letter invite code.');
      return;
    }
    uiState.awaitingStoryIntro = false;
    uiState.storyComplete = true;
    network.ensureConnection();
    network.send('join_session', {
      code,
      displayName: randomSnowyName(),
      avatar: {
        character: localState.character,
        colors: localState.avatarColors,
        outfit: localState.outfit,
        hair: localState.hair,
      },
    });
  });

  if (introContinueBtn) {
    introContinueBtn.addEventListener('click', () => {
      completeStoryIntro();
    });
  }

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

  if (customizeToggleBtn) {
    customizeToggleBtn.addEventListener('click', openCustomizeModal);
  }
  if (customizeCloseBtn) {
    customizeCloseBtn.addEventListener('click', closeCustomizeModal);
  }
  if (customizeModal) {
    customizeModal.addEventListener('click', (event) => {
      if (event.target === customizeModal) {
        closeCustomizeModal();
      }
    });
  }

  if (hudCollapseBtn) {
    hudCollapseBtn.addEventListener('click', () => {
      hudPanel.classList.toggle('collapsed');
    });
  }

  storyCharacterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectCharacter(button.dataset.character, { applyPreset: true });
    });
  });

  modalCharacterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectCharacter(button.dataset.character, { applyPreset: true });
    });
  });

  radialButtons.forEach((button) => {
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', () => {
      if (button.disabled || !radialState.zone) return;
      applyDecorationToZone(radialState.zone, button.dataset.type);
    });
  });
  refreshRadialMenuLocks();
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
      case 'z':
        triggerSpeedBoost();
        break;
      case ' ':
        event.preventDefault();
        attemptJump();
        break;
      case 'x':
        dropStrandBulb();
        break;
      case 'p':
        photoModeBtn.click();
        break;
      case 'escape':
        if (uiState.customizationOpen) {
          closeCustomizeModal();
        } else {
          closeRadialMenu();
        }
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
    closeRadialMenu();
    ensureAudioContext();
    const zone = intersectDecorZone(event);
    if (zone && beginThrowCharge(zone)) {
      throwState.pointerId = event.pointerId;
      renderer.domElement.setPointerCapture(event.pointerId);
      return;
    }
    dragState.active = true;
    dragState.moved = false;
    dragState.pointerId = event.pointerId;
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
  });

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (throwState.charging && event.pointerId === throwState.pointerId) {
      return;
    }
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
    if (throwState.charging && event.pointerId === throwState.pointerId) {
      renderer.domElement.releasePointerCapture(event.pointerId);
      finishThrowCharge();
      return;
    }
    if (event.pointerId !== dragState.pointerId) return;
    renderer.domElement.releasePointerCapture(event.pointerId);
    dragState.active = false;
    const pointerYawOffset = (0.5 - pointerState.x) * 1.6;
    const pointerPitchOffset = (pointerState.y - 0.5) * 0.7;
    cameraBase.yaw = cameraOrbit.yaw - pointerYawOffset;
    cameraBase.pitch = THREE.MathUtils.clamp(
      cameraOrbit.pitch - pointerPitchOffset,
      0.15,
      1.1,
    );
    if (dragState.moved) {
      autoFollowPaused = true;
      if (autoResumeTimeout) {
        clearTimeout(autoResumeTimeout);
      }
      autoResumeTimeout = setTimeout(() => {
        autoFollowPaused = false;
      }, AUTO_RESUME_DELAY_MS);
    }

    dragState.moved = false;
  });

  renderer.domElement.addEventListener('pointerleave', () => {
    if (throwState.charging) {
      finishThrowCharge(true);
    }
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

function triggerSpeedBoost() {
  movementState.boostTimer = movementState.boostDuration;
  playChime([540, 760]);
}

function attemptJump() {
  if (!jumpState.grounded) return;
  jumpState.grounded = false;
  jumpState.velocity = 4.6;
  jumpState.offset = 0.01;
  playChime([520]);
}

function dropStrandBulb() {
  let dropIndex = -1;
  for (let i = strandState.sockets.length - 1; i >= 0; i -= 1) {
    if (strandState.sockets[i]) {
      dropIndex = i;
      break;
    }
  }
  if (dropIndex === -1) {
    showToast('No bulbs to drop yet!');
    return;
  }
  const color = strandState.sockets[dropIndex];
  strandState.sockets[dropIndex] = null;
  updateStrandVisual(dropIndex);
  updateStrandUI();
  const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    localPlayer.group.rotation.y || 0,
  );
  forward.multiplyScalar(2.4);
  const landing = localPlayer.group.position.clone().add(forward);
  const terrainY = sampleTerrainHeight(landing);
  landing.y = terrainY + 0.02;
  const origin = new THREE.Vector3(0.15, 1.18, 0.4);
  localPlayer.group.localToWorld(origin);
  const control = origin.clone().lerp(landing, 0.5);
  control.y = Math.max(origin.y, landing.y) + 1.2;
  const projectile = createBulbPickup(color);
  projectile.scale.setScalar(0.7);
  scene.add(projectile);
  dropProjectiles.push({
    mesh: projectile,
    start: origin.clone(),
    control,
    end: landing.clone(),
    color,
    startTime: performance.now(),
    duration: 520,
  });
  spawnDropSpark(origin, color);
}

function spawnDropSpark(position, color) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    }),
  );
  sprite.scale.set(0.65, 0.65, 0.65);
  sprite.position.copy(position);
  scene.add(sprite);
  sparkEffects.push({ sprite, start: performance.now(), duration: 320 });
}

function onResize() {
  const { innerWidth, innerHeight } = window;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

function handlePointerMove(event) {
  pointerState.x = event.clientX / window.innerWidth;
  pointerState.y = event.clientY / window.innerHeight;
}

function handleTouchMove(event) {
  if (dragState.active || event.touches.length !== 1) return;
  const touch = event.touches[0];
  pointerState.x = touch.clientX / window.innerWidth;
  pointerState.y = touch.clientY / window.innerHeight;
}

function randomSnowyName() {
  const prefixes = ['Frosty', 'Twinkle', 'Cozy', 'Aurora', 'Starry', 'Maple', 'Pine', 'Velvet'];
  const suffixes = ['Heart', 'Haven', 'Glow', 'Wish', 'Spark', 'Cocoa', 'Holly', 'Wreath'];
  return `${prefixes[Math.floor(Math.random() * prefixes.length)]}${
    suffixes[Math.floor(Math.random() * suffixes.length)]
  }`;
}

function openJoinPopup() {
  if (!joinPopup) return;
  joinPopup.classList.remove('hidden');
  joinInput.value = '';
  setTimeout(() => joinInput && joinInput.focus(), 50);
}

function showStoryIntro() {
  if (!storyIntroPanel) return;
  storyIntroPanel.classList.remove('hidden');
  if (strandBar) {
    strandBar.classList.add('hidden');
  }
}

function completeStoryIntro() {
  if (!storyIntroPanel) return;
  storyIntroPanel.classList.add('hidden');
  uiState.awaitingStoryIntro = false;
  uiState.storyComplete = true;
  showHudPanel();
}

function showHudPanel() {
  if (storyIntroPanel) {
    storyIntroPanel.classList.add('hidden');
  }
  hudPanel.classList.remove('hidden');
  uiState.storyComplete = true;
  showToast('Connected! Invite your partner with the code above.');
  if (customizeToggleBtn) {
    customizeToggleBtn.classList.remove('hidden');
  }
  if (strandBar) {
    strandBar.classList.remove('hidden');
  }
}

function openCustomizeModal() {
  if (!customizeModal) return;
  customizeModal.classList.remove('hidden');
  uiState.customizationOpen = true;
}

function closeCustomizeModal() {
  if (!customizeModal) return;
  customizeModal.classList.add('hidden');
  uiState.customizationOpen = false;
}

function handleSessionJoined(data) {
  localState.playerId = data.playerId;
  localState.sessionCode = data.code;
  sessionPanel.classList.add('hidden');
  sessionCodeLabel.textContent = data.code;
  hydrateWorld(data.state);
  sendAvatarUpdate();
  if (uiState.awaitingStoryIntro && !uiState.storyComplete) {
    showStoryIntro();
  } else {
    showHudPanel();
  }
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
  const zone = intersectDecorZone(event);
  if (zone) {
    if (!isStrandFull()) {
      showToast('Collect a full strand before decorating!');
      return;
    }
    openRadialMenu(zone, { x: event.clientX, y: event.clientY });
  }
}

function intersectDecorZone(event) {
  if (!decorZones.length) return null;
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const zoneMeshes = decorZones.map((zone) => zone.mesh);
  const intersects = raycaster.intersectObjects(zoneMeshes, true);
  if (!intersects.length) return null;
  const hit = intersects[0];
  const zone = hit.object.userData.zone;
  if (zone && zone.glow > 0.2) {
    return zone;
  }
  return null;
}

function placeDecoration(point, normal, options = {}) {
  const typeId = options.typeId || localState.decorType;
  const chosenColor = options.color || defaultDecorColors[typeId] || localState.decorColor;
  const cabinId = options.cabinId || 'storybook-home';
  const facingNormal = normal ? normal.clone() : new THREE.Vector3(0, 1, 0);
  const decoration = {
    typeId,
    color: chosenColor,
    glow: options.glow ?? 0.65,
    cabinId,
    transform: {
      position: { x: point.x, y: point.y, z: point.z },
      rotation: { x: 0, y: Math.atan2(facingNormal.x, facingNormal.z) || 0, z: 0 },
      scale: 1,
    },
    colors: Array.isArray(options.colors) ? options.colors : undefined,
  };

  network.send('place_decoration', decoration);
  localState.decorType = typeId;
  showToast(`Placed ${typeId.replace(/_/g, ' ')} ✨`);
  playChime();
  boostHouseGlow(cabinId);
}

function openRadialMenu(zone, screenPosition) {
  if (!radialMenu) return;
  radialState.zone = zone;
  radialMenu.style.left = `${screenPosition.x}px`;
  radialMenu.style.top = `${screenPosition.y}px`;
  radialMenu.classList.remove('hidden');
  radialMenu.classList.add('visible');
  refreshRadialMenuLocks();
}

function closeRadialMenu() {
  if (!radialMenu) return;
  radialState.zone = null;
  radialMenu.classList.remove('visible');
  radialMenu.classList.add('hidden');
}

function applyDecorationToZone(zone, typeId) {
  closeRadialMenu();
  const color = defaultDecorColors[typeId] || defaultDecorColors.string_lights;
  placeDecoration(zone.anchor, zone.normal, { typeId, color, cabinId: zone.houseId, glow: 0.8 });
}

function refreshRadialMenuLocks() {
  radialButtons.forEach((button) => {
    const type = button.dataset.type;
    button.disabled = !localState.unlockedDecor.has(type);
  });
}

function unlockDecorType(type, label) {
  if (localState.unlockedDecor.has(type)) return;
  localState.unlockedDecor.add(type);
  refreshRadialMenuLocks();
  playChime([820, 980]);
  showToast(`${label} unlocked!`);
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
  boostHouseGlow(data.cabinId);
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
    case 'icicle_lights': {
      const group = new THREE.Group();
      const icicleMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7 });
      for (let i = 0; i < 6; i += 1) {
        const icicle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.2, 1.2, 8), icicleMat);
        icicle.position.set(-1.2 + i * 0.5, 1.2 - Math.random() * 0.2, 0);
        group.add(icicle);
      }
      mesh = group;
      break;
    }
    case 'star_bulbs': {
      const group = new THREE.Group();
      const starMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9 });
      for (let i = 0; i < 5; i += 1) {
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), starMat);
        star.position.set(-1 + i * 0.5, 2 + Math.sin(i) * 0.2, 0);
        group.add(star);
      }
      mesh = group;
      break;
    }
    case 'string_lights':
    default: {
      const group = new THREE.Group();
      const colors = Array.isArray(data.colors) && data.colors.length ? data.colors : null;
      const bulbCount = colors ? colors.length : 6;
      for (let i = 0; i < bulbCount; i += 1) {
        const bulbColor = colors ? new THREE.Color(colors[i]) : color;
        const material = new THREE.MeshStandardMaterial({
          color: bulbColor,
          emissive: bulbColor,
          emissiveIntensity: 0.65,
        });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), material);
        const span = bulbCount > 1 ? i / (bulbCount - 1) : 0;
        bulb.position.set(-1.5 + span * 3, 2.2 + Math.sin(i) * 0.2, 0);
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
    avatar: {
      colors: localState.avatarColors,
      outfit: localState.outfit,
      hair: localState.hair,
      character: localState.character,
    },
  });
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  elapsedTime += delta;
  updateSnow(delta);
  const worldActive = uiState.storyComplete && Boolean(localState.sessionCode);
  if (!worldActive) {
    renderer.render(scene, camera);
    return;
  }
  updatePlayer(delta, elapsedTime);
  updateLightStrand(delta, elapsedTime);
  updateThrowCharge();
  updateThrowEffects(delta);
  updateDropProjectiles();
  updateSparkEffects(delta);
  highlightAccumulator += delta;
  if (highlightAccumulator >= HIGHLIGHT_UPDATE_INTERVAL) {
    updateDecorZoneHighlights(highlightAccumulator);
    highlightAccumulator = 0;
  }
  collectibleAccumulator += delta;
  if (collectibleAccumulator >= COLLECTIBLE_UPDATE_INTERVAL) {
    updateCollectibles(collectibleAccumulator, elapsedTime);
    collectibleAccumulator = 0;
  }
  pickupAccumulator += delta;
  if (pickupAccumulator >= PICKUP_UPDATE_INTERVAL) {
    updateBulbPickups(pickupAccumulator, elapsedTime);
    pickupAccumulator = 0;
  }
  houseGlowAccumulator += delta;
  if (houseGlowAccumulator >= HOUSE_GLOW_INTERVAL) {
    updateHouseGlow(houseGlowAccumulator);
    houseGlowAccumulator = 0;
  }
  updateFootprints(delta);
  renderer.render(scene, camera);
}

function updatePlayer(delta, elapsed) {
  if (!dragState.active && !autoFollowPaused) {
    const yawEdgeDirection =
      pointerState.x < EDGE_THRESHOLD ? 1 : pointerState.x > 1 - EDGE_THRESHOLD ? -1 : 0;
    const pitchEdgeDirection =
      pointerState.y < EDGE_THRESHOLD ? -1 : pointerState.y > 1 - EDGE_THRESHOLD ? 1 : 0;
    if (yawEdgeDirection !== 0) {
      cameraBase.yaw += yawEdgeDirection * EDGE_PAN_SPEED * delta;
    }
    if (pitchEdgeDirection !== 0) {
      cameraBase.pitch = THREE.MathUtils.clamp(
        cameraBase.pitch + pitchEdgeDirection * EDGE_TILT_SPEED * delta,
        0.15,
        1.1,
      );
    }
    const pointerYawOffset = (0.5 - pointerState.x) * 1.6;
    const pointerPitchOffset = (pointerState.y - 0.5) * 0.7;
    const yawTarget = cameraBase.yaw + pointerYawOffset;
    const pitchTarget = THREE.MathUtils.clamp(
      cameraBase.pitch + pointerPitchOffset,
      0.15,
      1.1,
    );
    cameraOrbit.yaw = THREE.MathUtils.lerp(cameraOrbit.yaw, yawTarget, 0.08);
    cameraOrbit.pitch = THREE.MathUtils.lerp(cameraOrbit.pitch, pitchTarget, 0.08);
  }

  if (movementState.boostTimer > 0) {
    movementState.boostTimer = Math.max(0, movementState.boostTimer - delta);
    if (movementState.boostTimer <= 0) {
      zoomState.target = 0;
    }
  }
  zoomState.offset = THREE.MathUtils.lerp(zoomState.offset, zoomState.target, 0.12);

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

  const speedMultiplier = movementState.boostTimer > 0 ? movementState.boostMultiplier : 1;
  const moveSpeed = movementState.baseSpeed * speedMultiplier;
  const isMoving = moveVector.lengthSq() > 0;
  playerIsMoving = isMoving;
  if (isMoving) {
    const facing = moveVector.clone().normalize();
    localPlayer.group.position.add(facing.multiplyScalar(delta * moveSpeed));
    const angle = Math.atan2(moveVector.x, moveVector.z);
    localPlayer.group.rotation.y = angle;
    sendAvatarUpdate();
    footstepCooldown -= delta;
    if (jumpState.grounded && footstepCooldown <= 0) {
      footstepCooldown = 0.35;
      spawnFootprint(localPlayer.group.position, angle);
      playFootstepSound();
    }
  } else {
    footstepCooldown = Math.max(0, footstepCooldown - delta * 0.5);
  }

  if (!jumpState.grounded) {
    jumpState.velocity -= 9.5 * delta;
    jumpState.offset += jumpState.velocity * delta;
    if (jumpState.offset <= 0) {
      jumpState.offset = 0;
      jumpState.velocity = 0;
      jumpState.grounded = true;
    }
  }

  const baseHeight = 0;
  const bob = isMoving ? Math.max(0, Math.sin(elapsed * 6) * 0.08) : 0;
  const targetBob = baseHeight + bob + jumpState.offset;
  const lerpFactor = jumpState.grounded ? (isMoving ? 0.35 : 0.2) : 1;
  localPlayer.group.position.y = THREE.MathUtils.lerp(
    localPlayer.group.position.y,
    targetBob,
    lerpFactor,
  );

  cameraTarget.lerp(localPlayer.group.position, 0.08);
  const offset = new THREE.Vector3(
    Math.sin(cameraOrbit.yaw) * Math.cos(cameraOrbit.pitch),
    Math.sin(cameraOrbit.pitch),
    Math.cos(cameraOrbit.yaw) * Math.cos(cameraOrbit.pitch),
  ).multiplyScalar(Math.max(6, cameraOrbit.distance + zoomState.offset));

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

function updateDecorZoneHighlights(delta) {
  const playerPos = localPlayer.group.position;
  decorZones.forEach((zone) => {
    const distance = zone.anchor.distanceTo(playerPos);
    const targetGlow = distance < zone.activationRadius ? 0.85 : 0;
    zone.glow = THREE.MathUtils.lerp(zone.glow, targetGlow, delta * 4);
    zone.mesh.material.opacity = zone.glow;
    zone.mesh.scale.setScalar(1 + zone.glow * 0.1);
  });
}

function updateCollectibles(delta, elapsed) {
  collectibles.forEach((collectible) => {
    if (collectible.collected) return;
    collectible.mesh.rotation.y += delta * 0.8;
    collectible.mesh.position.y = collectible.baseY + Math.sin(elapsed * 2 + collectible.wobbleOffset) * 0.15;
    const distance = collectible.mesh.position.distanceTo(localPlayer.group.position);
    if (distance < 2.2) {
      collectible.collected = true;
      scene.remove(collectible.mesh);
      unlockDecorType(collectible.type, collectible.label);
    }
  });
}

function spawnFootprint(position, rotation) {
  const footprint = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.9),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
  );
  footprint.rotation.x = -Math.PI / 2;
  footprint.rotation.z = rotation;
  footprint.position.set(position.x, 0.04, position.z);
  footstepGroup.add(footprint);
  footprints.push({ mesh: footprint, life: 4 });
  if (footprints.length > MAX_FOOTPRINTS) {
    const removed = footprints.shift();
    if (removed) {
      footstepGroup.remove(removed.mesh);
    }
  }
}

function updateFootprints(delta) {
  for (let i = footprints.length - 1; i >= 0; i -= 1) {
    const entry = footprints[i];
    entry.life -= delta;
    entry.mesh.material.opacity = Math.max(0, entry.life / 4);
    if (entry.life <= 0) {
      footstepGroup.remove(entry.mesh);
      footprints.splice(i, 1);
    }
  }
}

function updateLightStrand(delta, elapsed) {
  if (!strandState.line) return;
  strandState.swingPhase += delta * (playerIsMoving ? 3 : 1.4);
  const sway = Math.sin(strandState.swingPhase * 2) * (playerIsMoving ? 0.2 : 0.08);
  const sag = playerIsMoving ? 0.22 : 0.32;
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(-0.45, 1.25, 0.35),
    new THREE.Vector3(-0.15, 1 - sag, 0.75 + sway),
    new THREE.Vector3(0.15, 1 - sag, 0.75 - sway),
    new THREE.Vector3(0.45, 1.25, 0.35),
  );
  const samples = curve.getPoints(STRAND_SEGMENTS);
  strandState.cachedPoints = samples;
  const positions = strandState.line.geometry.attributes.position;
  samples.forEach((point, index) => {
    positions.setXYZ(index, point.x, point.y, point.z);
  });
  positions.needsUpdate = true;
  strandState.line.geometry.computeBoundingSphere();

  if (strandState.bulbMeshes.length) {
    const socketCount = strandState.bulbMeshes.length;
    for (let i = 0; i < socketCount; i += 1) {
      const t = socketCount === 1 ? 0 : i / (socketCount - 1);
      const point = curve.getPoint(t);
      strandState.bulbMeshes[i].position.copy(point);
    }
  }
}

function initLightStrand() {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array((STRAND_SEGMENTS + 1) * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color: 0x1d1624, linewidth: 2, transparent: true, opacity: 0.85 }),
  );
  group.add(line);
  const bulbMeshes = [];
  const socketMaterials = [];
  for (let i = 0; i < STRAND_SOCKET_COUNT; i += 1) {
    const material = new THREE.MeshStandardMaterial({
      color: 0x1d1c2d,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.4,
      metalness: 0.05,
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), material);
    bulb.position.set(0, 1.1, 0.5);
    group.add(bulb);
    bulbMeshes.push(bulb);
    socketMaterials.push(material);
  }
  localPlayer.group.add(group);
  strandState.group = group;
  strandState.line = line;
  strandState.bulbMeshes = bulbMeshes;
  strandState.socketMaterials = socketMaterials;
}

function initStrandUI() {
  if (!strandSocketsEl) return;
  strandSocketsEl.innerHTML = '';
  strandState.uiDots = [];
  for (let i = 0; i < STRAND_SOCKET_COUNT; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'socket empty';
    strandSocketsEl.appendChild(dot);
    strandState.uiDots.push(dot);
  }
  updateStrandUI();
}

function isStrandFull() {
  return strandState.sockets.every((slot) => slot);
}

function addBulbToStrand(color) {
  if (!color) return false;
  const index = strandState.sockets.findIndex((slot) => slot === null);
  if (index === -1) {
    return false;
  }
  strandState.sockets[index] = color;
  updateStrandVisual(index);
  updateStrandUI();
  const sparkOrigin = tempVecA.set(0, 1.2, 0.55);
  localPlayer.group.localToWorld(sparkOrigin);
  spawnStrandSpark(sparkOrigin, color);
  return true;
}

function consumeStrandBulbs() {
  for (let i = 0; i < strandState.sockets.length; i += 1) {
    strandState.sockets[i] = null;
    updateStrandVisual(i);
  }
  updateStrandUI();
}

function updateStrandVisual(index) {
  const material = strandState.socketMaterials[index];
  if (!material) return;
  const color = strandState.sockets[index];
  if (color) {
    material.color.set(color);
    material.emissive.set(color);
    material.emissiveIntensity = 0.8;
  } else {
    material.color.set(0x1d1c2d);
    material.emissive.set(0x000000);
    material.emissiveIntensity = 0;
  }
}

function updateStrandUI() {
  if (!bulbCountLabel) return;
  const filled = strandState.sockets.filter(Boolean).length;
  bulbCountLabel.textContent = `${filled}/${STRAND_SOCKET_COUNT}`;
  strandState.uiDots.forEach((dot, index) => {
    if (!dot) return;
    const color = strandState.sockets[index];
    if (color) {
      dot.style.setProperty('--socket-color', color);
      dot.classList.remove('empty');
    } else {
      dot.classList.add('empty');
      dot.style.removeProperty('--socket-color');
    }
  });
}

function updateBulbPickups(delta, elapsed) {
  for (let i = bulbPickups.length - 1; i >= 0; i -= 1) {
    const pickup = bulbPickups[i];
    if (pickup.collected) continue;
    if (pickup.isDropping) {
      if (!pickup.dropVelocity) {
        const speed = pickup.dropSpeed || 3;
        pickup.dropVelocity = new THREE.Vector3(0, -Math.abs(speed), 0);
      }
      pickup.dropVelocity.y -= DROP_GRAVITY * delta;
      pickup.mesh.position.addScaledVector(pickup.dropVelocity, delta);
      if (pickup.mesh.position.y <= pickup.baseY) {
        pickup.mesh.position.y = pickup.restHeight;
        pickup.isDropping = false;
        pickup.dropVelocity.set(0, 0, 0);
        pickup.immuneUntil = performance.now() + 250;
      }
      continue;
    } else {
      pickup.mesh.rotation.y += delta * 0.8;
      const wobble = Math.sin(elapsed * 3 + pickup.wobbleOffset) * 0.08;
      pickup.mesh.position.y = pickup.restHeight + wobble;
    }
    const now = performance.now();
    if (pickup.immuneUntil && now < pickup.immuneUntil) {
      continue;
    }
    const distance = pickup.mesh.position.distanceTo(localPlayer.group.position);
    if (pickup.requireExitBeforeCollect) {
      if (distance > 2.6) {
        pickup.requireExitBeforeCollect = false;
      } else {
        continue;
      }
    }
    if (distance < 1.6) {
      if (!addBulbToStrand(pickup.color)) {
        const now = performance.now();
        if (now - lastStrandFullWarning > 1200) {
          showToast('Your strand is full! Drop a bulb with X or decorate a house.');
          lastStrandFullWarning = now;
        }
        continue;
      }
      pickup.collected = true;
      scene.remove(pickup.mesh);
      bulbPickups.splice(i, 1);
      playChime([900, 1120]);
      spawnSingleBulb();
    }
  }
}

function spawnStrandSpark(position, color) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ color, transparent: true, opacity: 0.9 }),
  );
  sprite.scale.set(0.5, 0.5, 0.5);
  sprite.position.copy(position);
  scene.add(sprite);
  sparkEffects.push({ sprite, start: performance.now(), duration: 600 });
}

function updateSparkEffects(delta) {
  const now = performance.now();
  for (let i = sparkEffects.length - 1; i >= 0; i -= 1) {
    const effect = sparkEffects[i];
    const t = Math.min(1, (now - effect.start) / effect.duration);
    effect.sprite.material.opacity = 1 - t;
    const scale = THREE.MathUtils.lerp(0.5, 1.2, t);
    effect.sprite.scale.set(scale, scale, scale);
    effect.sprite.position.y += delta * 0.6;
    if (t >= 1) {
      scene.remove(effect.sprite);
      sparkEffects.splice(i, 1);
    }
  }
}

function beginThrowCharge(zone) {
  if (!localState.sessionCode) return false;
  if (!isStrandFull()) {
    showToast('Fill your strand with bulbs to decorate!');
    return false;
  }
  throwState.charging = true;
  throwState.zone = zone;
  throwState.startTime = performance.now();
  throwState.progress = 0;
  if (throwMeterEl) {
    throwMeterEl.classList.remove('hidden');
  }
  if (throwMeterFill) {
    throwMeterFill.style.transform = 'scaleX(0)';
  }
  if (throwMeterLabel) {
    throwMeterLabel.textContent = 'Charging lights…';
  }
  return true;
}

function updateThrowCharge() {
  if (!throwState.charging) return;
  const elapsed = performance.now() - throwState.startTime;
  const progress = Math.min(1, elapsed / THROW_FULL_DURATION);
  throwState.progress = progress;
  if (throwMeterFill) {
    throwMeterFill.style.transform = `scaleX(${progress})`;
  }
  if (throwMeterLabel) {
    if (progress >= 1) {
      throwMeterLabel.textContent = 'Release to launch!';
    } else if (progress >= THROW_MIN_DURATION / THROW_FULL_DURATION) {
      throwMeterLabel.textContent = 'Almost ready…';
    } else {
      throwMeterLabel.textContent = 'Charging lights…';
    }
  }
}

function finishThrowCharge(forceCancel = false) {
  if (!throwState.charging) return;
  const zone = throwState.zone;
  const progress = throwState.progress;
  throwState.charging = false;
  throwState.zone = null;
  throwState.pointerId = null;
  if (throwMeterEl) {
    throwMeterEl.classList.add('hidden');
  }
  if (forceCancel) {
    return;
  }
  if (progress < THROW_MIN_DURATION / THROW_FULL_DURATION) {
    showToast('Hold a bit longer to throw the lights!');
    return;
  }
  performLightThrow(zone);
}

function performLightThrow(zone) {
  const pattern = strandState.sockets.map((color) => color || '#ffecc3');
  const origin = tempVecA.set(0, 1.15, 0.7);
  localPlayer.group.localToWorld(origin);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 1 }),
  );
  mesh.position.copy(origin);
  scene.add(mesh);
  throwEffects.push({
    mesh,
    from: origin.clone(),
    to: zone.anchor.clone(),
    start: performance.now(),
    duration: 650,
    zone,
    placed: false,
    pattern,
  });
  consumeStrandBulbs();
}

function updateThrowEffects(delta) {
  const now = performance.now();
  for (let i = throwEffects.length - 1; i >= 0; i -= 1) {
    const effect = throwEffects[i];
    const t = Math.min(1, (now - effect.start) / effect.duration);
    tempVecB.copy(effect.from).lerp(effect.to, t);
    effect.mesh.position.copy(tempVecB);
    effect.mesh.material.opacity = 1 - t;
    effect.mesh.scale.setScalar(THREE.MathUtils.lerp(1, 0.1, t));
    if (!effect.placed && t >= 0.95) {
      placeDecoration(effect.zone.anchor, effect.zone.normal, {
        typeId: 'string_lights',
        color: '#ffecc3',
        colors: effect.pattern,
        cabinId: effect.zone.houseId,
        glow: 0.95,
      });
      effect.placed = true;
    }
    if (t >= 1) {
      scene.remove(effect.mesh);
      throwEffects.splice(i, 1);
    }
  }
}

function updateDropProjectiles() {
  const now = performance.now();
  for (let i = dropProjectiles.length - 1; i >= 0; i -= 1) {
    const effect = dropProjectiles[i];
    const t = Math.min(1, (now - effect.startTime) / effect.duration);
    const position = evaluateQuadratic(effect.start, effect.control, effect.end, t);
    effect.mesh.position.copy(position);
    if (t >= 1) {
      dropProjectiles.splice(i, 1);
      const spawnPoint = effect.end.clone();
      const groundY = sampleTerrainHeight(spawnPoint);
      const baseY = groundY + 0.04;
      const restHeight = baseY + 0.16;
      spawnPoint.y = restHeight;
      effect.mesh.position.copy(spawnPoint);
      bulbPickups.push({
        mesh: effect.mesh,
        color: effect.color,
        baseY,
        restHeight,
        wobbleOffset: Math.random() * Math.PI * 2,
        collected: false,
        isDropping: false,
        dropSpeed: 3,
        dropVelocity: null,
        immuneUntil: performance.now() + 350,
        requireExitBeforeCollect: false,
      });
    }
  }
}

function evaluateQuadratic(a, b, c, t) {
  const ab = new THREE.Vector3().lerpVectors(a, b, t);
  const bc = new THREE.Vector3().lerpVectors(b, c, t);
  return new THREE.Vector3().lerpVectors(ab, bc, t);
}

function sampleTerrainHeight(position) {
  if (!terrainMeshes.length) return position.y || 0;
  terrainSampleOrigin.set(position.x, 50, position.z);
  terrainRaycaster.set(terrainSampleOrigin, terrainDown);
  const intersections = terrainRaycaster.intersectObjects(terrainMeshes, true);
  if (intersections.length > 0) {
    return intersections[0].point.y;
  }
  return position.y || 0;
}

function boostHouseGlow(cabinId) {
  const entry = houseGlowState.get(cabinId);
  if (!entry) return;
  entry.target = Math.min(entry.target + 0.2, 2.5);
}

function updateHouseGlow(delta) {
  houseGlowState.forEach((entry) => {
    entry.intensity = THREE.MathUtils.lerp(entry.intensity ?? 1, entry.target, delta * 2);
    if (entry.light) {
      entry.light.intensity = entry.intensity;
    }
    entry.target = THREE.MathUtils.lerp(entry.target, 1.2, delta * 0.4);
  });
}

function ensureAudioContext() {
  if (audioCtx) return audioCtx;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  audioCtx = new AudioCtor();
  return audioCtx;
}

function playChime(pitches = [640, 880]) {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  pitches.forEach((pitch, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = pitch;
    gain.gain.setValueAtTime(0.2, ctx.currentTime + index * 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35 + index * 0.02);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + index * 0.02);
    osc.stop(ctx.currentTime + 0.4 + index * 0.02);
  });
}

function playFootstepSound() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 160;
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.21);
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toastEl.classList.remove('visible'), 2400);
}
