import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { STRAND_SOCKET_COUNT } from '../constants/game.js';
import {
  canvas,
  outfitColorInput,
  accentColorInput,
  outfitSelect,
  hairSelect,
  decorColorInput,
  decorSelect,
} from '../components/domElements.js';

export function createGameContext() {
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

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
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
  const AUTO_RESUME_DELAY_MS = 1000;
  const clock = new THREE.Clock();
  const placementSurfaces = [];
  const terrainMeshes = [];
  const terrainRaycaster = new THREE.Raycaster();
  const terrainSampleOrigin = new THREE.Vector3();
  const terrainDown = new THREE.Vector3(0, -1, 0);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const decorZones = [];
  const cabinAnchors = [];
  const anchorColliders = [];
  const collectibles = [];
  const bulbPickups = [];
  const bulbSpawnBounds = { x: 110, z: 110 };
  const throwEffects = [];
  const dropProjectiles = [];
  const sparkEffects = [];
  const houseGlowState = new Map();
  const footstepGroup = new THREE.Group();
  const footprints = [];
  const MAX_FOOTPRINTS = 32;
  const radialState = { zone: null };
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
    tubeMesh: null,
    bulbMeshes: [],
    socketMaterials: [],
    socketAuras: [],
    socketLights: [],
    uiDots: [],
    swingPhase: 0,
    cachedPoints: [],
  };
  const stringPlacementState = {
    stage: 'IDLE',
    awaitingSecondAnchor: false,
    firstAnchor: null,
    secondAnchor: null,
    pattern: [],
    preview: null,
    tempSegments: [],
  };
  const throwState = {
    charging: false,
    zone: null,
    pointerId: null,
    startTime: 0,
    progress: 0,
  };
  const coilState = {
    lightsTotal: 0,
    lightsRemaining: 0,
    bulbSpacing: 0.24,
    mesh: null,
    lightNodes: [],
    tipPosition: new THREE.Vector3(0.65, 1.1, 0.3),
    isEmpty: false,
    tipWorld: new THREE.Vector3(),
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

  return {
    // THREE / renderer
    THREE,
    renderer,
    scene,
    camera,
    clock,

    // Camera state
    cameraTarget,
    cameraOrbit,
    pointerState,
    cameraBase,
    dragState,
    AUTO_RESUME_DELAY_MS,

    // Raycasting
    raycaster,
    pointer,
    terrainRaycaster,
    terrainSampleOrigin,
    terrainDown,

    // Collections
    placementSurfaces,
    terrainMeshes,
    decorZones,
    cabinAnchors,
    anchorColliders,
    collectibles,
    bulbPickups,
    bulbSpawnBounds,
    throwEffects,
    dropProjectiles,
    sparkEffects,
    footstepGroup,
    footprints,
    MAX_FOOTPRINTS,

    // Maps
    houseGlowState,
    remotePlayers,
    decorationMeshes,

    // State objects
    radialState,
    uiState,
    localState,
    inputState,
    strandState,
    throwState,
    stringPlacementState,
    coilState,
    movementState,
    zoomState,
    jumpState,

    // Temp vectors
    tempVecA,
    tempVecB,
    tempVecC,

    // Mutable runtime state
    autoFollowPaused: false,
    autoResumeTimeout: null,
    elapsedTime: 0,
    pickupSpawnContext: null,
    lastStrandFullWarning: 0,
    footstepCooldown: 0,
    playerIsMoving: false,
    lastAvatarSync: 0,
    highlightAccumulator: 0,
    pickupAccumulator: 0,
    collectibleAccumulator: 0,
    houseGlowAccumulator: 0,

    // Will be populated during initialization
    localPlayer: null,
    snowSystem: null,
    network: null,

    // DOM elements that are part of the core scene setup
    dom: {
      canvas,
      outfitColorInput,
      accentColorInput,
      outfitSelect,
      hairSelect,
      decorColorInput,
      decorSelect,
    },
  };
}
