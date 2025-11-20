import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

let decorationGlowTexture = null;
function getDecorationGlowTexture() {
  if (decorationGlowTexture) return decorationGlowTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.5);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.4)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  decorationGlowTexture = new THREE.CanvasTexture(canvas);
  decorationGlowTexture.needsUpdate = true;
  return decorationGlowTexture;
}

let anchorIdCounter = 0;

export function initWorld(context) {
  const village = buildVillage(context);
  context.placementSurfaces.push(village.ground, ...village.cabins);

  const snowSystem = createSnowSystem(180);
  context.scene.add(snowSystem.points);
  context.snowSystem = snowSystem;
}

function buildVillage(context) {
  const {
    scene,
    decorZones,
    collectibles,
    bulbPickups,
    houseGlowState,
    terrainMeshes,
    placementSurfaces,
    bulbSpawnBounds,
    cabinAnchors,
    anchorColliders,
  } = context;

  decorZones.length = 0;
  collectibles.length = 0;
  bulbPickups.length = 0;
  houseGlowState.clear();
  terrainMeshes.length = 0;
  cabinAnchors.length = 0;
  anchorColliders.length = 0;

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
        body: { width: 16.4, height: 5.5, depth: 10.2, color: 0xc9a27e },
        upperBody: { width: 14.5, height: 3.2, depth: 9.2, offsetY: 0.5, color: 0xe1bfa0 },
        modules: [
          { width: 7.4, height: 3.6, depth: 5, offsetZ: -4.8, color: 0xf0c29a },
          { width: 6.4, height: 3.4, depth: 4.4, offsetX: 8.2, color: 0xd9af88 },
        ],
        roof: { color: 0x5a2d24, height: 2.8, type: 'gable' },
        trimColor: 0xfff0da,
        doorColor: 0x3b1f16,
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
    generateCabinAnchors(context, cabin.group, config);
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
  context.pickupSpawnContext = { pathAreas, cabinBounds, bulbSpawnBounds: { ...bulbSpawnBounds } };

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
    const rightDir = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), frontDir)
      .normalize();
    const segments = 3;
    const depthOffset = config.style.body.depth / 2 + 0.6;
    const baseHeight = config.style.body.height * 0.8;

    const lateralOffset = config.style.body.width / 2 + 0.4;
    const faceConfigs = [
      {
        normal: frontDir,
        perp: rightDir,
        offset: depthOffset,
        length: config.style.body.width,
        name: 'front',
      },
      {
        normal: frontDir.clone().negate(),
        perp: rightDir,
        offset: -depthOffset,
        length: config.style.body.width,
        name: 'back',
      },
      {
        normal: rightDir,
        perp: frontDir.clone().negate(),
        offset: lateralOffset,
        length: config.style.body.depth,
        name: 'right',
      },
      {
        normal: rightDir.clone().negate(),
        perp: frontDir,
        offset: -lateralOffset,
        length: config.style.body.depth,
        name: 'left',
      },
    ];

    const squareSize = 0.4;
    const rows = 3;
    const columns = Math.max(segments, 3);

    faceConfigs.forEach((face) => {
      for (let row = 0; row < rows; row += 1) {
        const heightOffset = (row / (rows - 1)) * config.style.body.height * 0.5;
        for (let col = 0; col < columns; col += 1) {
          const span = columns === 1 ? 0 : (col / (columns - 1)) * 2 - 1;
          const spanDir = face.perp.clone().multiplyScalar(span * face.length * 0.35);
          const anchor = new THREE.Vector3(config.position.x, baseHeight + heightOffset, config.position.z)
            .add(face.normal.clone().multiplyScalar(face.offset))
            .add(spanDir);
          const highlightPosition = anchor.clone().add(face.normal.clone().multiplyScalar(0.08));
          const highlight = new THREE.Mesh(
            new THREE.PlaneGeometry(squareSize, squareSize),
            new THREE.MeshBasicMaterial({
              color: 0xfff4d0,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
          highlight.position.copy(highlightPosition);
          highlight.lookAt(highlightPosition.clone().add(face.normal));
          highlight.userData.zoneId = `${config.id}-zone-${face.name}-${row}-${col}`;
          scene.add(highlight);
          const zoneData = {
            id: highlight.userData.zoneId,
            houseId: config.id,
            mesh: highlight,
            anchor,
          normal: face.normal.clone(),
          glow: 0,
          activationRadius: 9,
        };
          highlight.userData.zone = zoneData;
          decorZones.push(zoneData);
          placementSurfaces.push(highlight);
        }
      }
    });
  }

  function generateCabinAnchors(context, cabinGroup, config) {
    const { cabinAnchors, anchorColliders, scene } = context;
    const { style } = config;
    const width = style.body.width + 0.6;
    const depth = style.body.depth + 0.6;
    const height = style.body.height + 0.2;
    const roofPeak = height + (style.roof?.height || 2);
    const spacing = 0.32;
    const verticalSpacing = 0.35;
    const roofInset = Math.min(width * 0.2, 1.2);
    const worldQuat = new THREE.Quaternion();
    cabinGroup.getWorldQuaternion(worldQuat);

    const edges = [
      {
        start: new THREE.Vector3(-width / 2, height, depth / 2),
        end: new THREE.Vector3(width / 2, height, depth / 2),
        normal: new THREE.Vector3(0, 0, 1),
        spacing,
      },
      {
        start: new THREE.Vector3(-width / 2, height, -depth / 2),
        end: new THREE.Vector3(width / 2, height, -depth / 2),
        normal: new THREE.Vector3(0, 0, -1),
        spacing,
      },
      {
        start: new THREE.Vector3(-width / 2, height, depth / 2),
        end: new THREE.Vector3(-width / 2, height, -depth / 2),
        normal: new THREE.Vector3(-1, 0, 0),
        spacing,
      },
      {
        start: new THREE.Vector3(width / 2, height, depth / 2),
        end: new THREE.Vector3(width / 2, height, -depth / 2),
        normal: new THREE.Vector3(1, 0, 0),
        spacing,
      },
      {
        start: new THREE.Vector3(-width / 2 + roofInset, roofPeak, 0),
        end: new THREE.Vector3(width / 2 - roofInset, roofPeak, 0),
        normal: new THREE.Vector3(0, 1, 0),
        spacing: 0.28,
      },
      {
        start: new THREE.Vector3(-width / 2, height, depth / 2),
        end: new THREE.Vector3(-width / 2, height + 1.5, depth / 2),
        normal: new THREE.Vector3(-1, 0, 0),
        spacing: verticalSpacing,
      },
      {
        start: new THREE.Vector3(width / 2, height, depth / 2),
        end: new THREE.Vector3(width / 2, height + 1.5, depth / 2),
        normal: new THREE.Vector3(1, 0, 0),
        spacing: verticalSpacing,
      },
    ];

    edges.forEach((edge) => {
      pushAnchorsAlongEdge(
        context,
        cabinGroup,
        worldQuat,
        config.id,
        edge.start,
        edge.end,
        edge.normal,
        edge.spacing,
      );
    });
  }

  function pushAnchorsAlongEdge(
    context,
    cabinGroup,
    worldQuat,
    cabinId,
    startLocal,
    endLocal,
    normalLocal,
    spacing = 0.32,
  ) {
    const { cabinAnchors, anchorColliders, scene } = context;
    const direction = endLocal.clone().sub(startLocal);
    const length = Math.max(direction.length(), 0.0001);
    const steps = Math.max(1, Math.floor(length / spacing));
    for (let i = 0; i <= steps; i += 1) {
      const factor = steps === 0 ? 0 : i / steps;
      const localPos = startLocal.clone().lerp(endLocal, factor);
      const worldPos = cabinGroup.localToWorld(localPos.clone());
      const anchorNormal = normalLocal.clone().applyQuaternion(worldQuat).normalize();
      const id = `${cabinId}-anchor-${anchorIdCounter++}`;
      const collider = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      collider.position.copy(worldPos);
      collider.userData.anchorId = id;
      scene.add(collider);
      anchorColliders.push(collider);
      cabinAnchors.push({ id, position: worldPos.clone(), normal: anchorNormal, collider, cabinId });
    }
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
      dormerRoof.position.set(
        dormerMesh.position.x,
        dormerMesh.position.y + dormer.height / 2,
        dormerMesh.position.z - dormer.width / 2,
      );
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
    shutterLeft.position.set(
      -style.body.width * 0.5 + 0.3,
      style.body.height * 0.6,
      style.body.depth / 2 + 0.06,
    );
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
    const radius = 3.5 - i * 0.4;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(radius, 2.8, 12),
      new THREE.MeshStandardMaterial({ color: 0x285a47, roughness: 0.55 }),
    );
    cone.position.y = 3.6 + i * 1.25;
    cone.castShadow = true;
    cone.receiveShadow = true;
    group.add(cone);
    const snowCap = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(0.6, radius * 0.5), 0.3, 12),
      new THREE.MeshStandardMaterial({ color: 0xf8fcff, roughness: 0.4 }),
    );
    snowCap.position.y = cone.position.y + 0.9;
    group.add(snowCap);
  }

  const star = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.6),
    new THREE.MeshStandardMaterial({
      color: 0xfff2c1,
      emissive: 0xfff2c1,
      emissiveIntensity: 0.9,
      roughness: 0.3,
      metalness: 0.3,
    }),
  );
  star.position.y = 8.2;
  group.add(star);

  const glow = new THREE.PointLight(0xfff2c1, 1.4, 26);
  glow.position.y = 8;
  group.add(glow);

  return group;
}

function createFrozenPond(radius = 10) {
  const geometry = new THREE.CircleGeometry(radius, 48);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xa4d7ff,
    roughness: 0.15,
    metalness: 0.1,
    clearcoat: 0.5,
    clearcoatRoughness: 0.1,
    transparent: true,
    opacity: 0.9,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

function createWoodenBridge(length = 12) {
  const group = new THREE.Group();
  const plankCount = Math.floor(length / 0.6);
  const plankWidth = 1.6;
  const plankDepth = 0.3;
  const railHeight = 1.2;

  const plankMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.8,
  });

  for (let i = 0; i < plankCount; i += 1) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(plankWidth, plankDepth, 0.55),
      plankMaterial,
    );
    plank.position.set(0, 0, -length / 2 + (i + 0.5) * 0.55);
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
  }

  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0x5b3a1e,
    roughness: 0.85,
  });
  const postGeom = new THREE.BoxGeometry(0.18, railHeight, 0.18);
  const railGeom = new THREE.BoxGeometry(plankWidth, 0.1, 0.18);

  const railZStart = -length / 2;
  const railZEnd = length / 2;
  const spacing = 1.8;

  for (let z = railZStart; z <= railZEnd; z += spacing) {
    const leftPost = new THREE.Mesh(postGeom, postMaterial);
    leftPost.position.set(-plankWidth / 2 - 0.2, railHeight / 2 + plankDepth / 2, z);
    group.add(leftPost);

    const rightPost = new THREE.Mesh(postGeom, postMaterial);
    rightPost.position.set(plankWidth / 2 + 0.2, railHeight / 2 + plankDepth / 2, z);
    group.add(rightPost);
  }

  const leftRail = new THREE.Mesh(railGeom, postMaterial);
  leftRail.position.set(
    -plankWidth / 2 - 0.2,
    railHeight + plankDepth / 2 - 0.05,
    (railZStart + railZEnd) / 2,
  );
  group.add(leftRail);

  const rightRail = new THREE.Mesh(railGeom, postMaterial);
  rightRail.position.set(
    plankWidth / 2 + 0.2,
    railHeight + plankDepth / 2 - 0.05,
    (railZStart + railZEnd) / 2,
  );
  group.add(rightRail);

  return group;
}

function generateStoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = '#d8d6d0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#b5b2aa';
  for (let i = 0; i < 180; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const w = 6 + Math.random() * 8;
    const h = 4 + Math.random() * 6;
    ctx.globalAlpha = 0.3 + Math.random() * 0.3;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 0.32;
  ctx.fillStyle = '#e8e6e0';
  for (let i = 0; i < 50; i += 1) {
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
      if (p === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
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
  const cornerGeom = new THREE.CylinderGeometry(
    logRadius * 1.25,
    logRadius * 1.25,
    height + 0.5,
    16,
  );
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
  const flatness = 0.6 + Math.random() * 0.4;
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

export function sampleTerrainHeight(context, position) {
  const { terrainMeshes, terrainSampleOrigin, terrainRaycaster, terrainDown } = context;
  if (!terrainMeshes.length) return position.y || 0;
  terrainSampleOrigin.set(position.x, 50, position.z);
  terrainRaycaster.set(terrainSampleOrigin, terrainDown);
  const intersections = terrainRaycaster.intersectObjects(terrainMeshes, true);
  if (intersections.length > 0) {
    return intersections[0].point.y;
  }
  return position.y || 0;
}

export function boostHouseGlow(context, cabinId) {
  const entry = context.houseGlowState.get(cabinId);
  if (!entry) return;
  entry.target = Math.min(entry.target + 0.2, 2.5);
}

export function updateHouseGlow(context, delta) {
  const { houseGlowState, THREE: three } = context;
  houseGlowState.forEach((entry) => {
    entry.intensity = three.MathUtils.lerp(entry.intensity ?? 1, entry.target, delta * 2);
    if (entry.light) {
      entry.light.intensity = entry.intensity;
    }
    entry.target = three.MathUtils.lerp(entry.target, 1.2, delta * 0.4);
  });
}

export function upsertDecoration(context, data) {
  const { decorationMeshes, scene } = context;
  let mesh = decorationMeshes.get(data.id);
  if (!mesh) {
    mesh = createDecorationMesh(data);
    decorationMeshes.set(data.id, mesh);
    scene.add(mesh);
  }
  mesh.position.set(data.transform.position.x, data.transform.position.y, data.transform.position.z);
  mesh.rotation.y = data.transform.rotation.y || 0;
  boostHouseGlow(context, data.cabinId);
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
      const icicleMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.7,
      });
      for (let i = 0; i < 6; i += 1) {
        const icicle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.2, 1.2, 8),
          icicleMat,
        );
        icicle.position.set(-1.2 + i * 0.5, 1.2 - Math.random() * 0.2, 0);
        group.add(icicle);
      }
      mesh = group;
      break;
    }
    case 'star_bulbs': {
      const group = new THREE.Group();
      const starMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.9,
      });
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
      const bulbCount = Math.max(2, colors ? colors.length : 6);
      const glowMap = getDecorationGlowTexture();
      const center = new THREE.Vector3(
        data.transform.position.x,
        data.transform.position.y || 2.35,
        data.transform.position.z,
      );
      const fallbackSpan = 4.4;
      const fallbackHalf = fallbackSpan / 2;
      const fallbackSag = 0.35;
      const anchors =
        Array.isArray(data.anchorPoints) && data.anchorPoints.length === 2
          ? data.anchorPoints.map((pt) => new THREE.Vector3(pt.x, pt.y, pt.z))
          : null;
      const startAnchor = anchors
        ? anchors[0].clone()
        : center.clone().add(new THREE.Vector3(-fallbackHalf, 0, 0));
      const endAnchor = anchors
        ? anchors[1].clone()
        : center.clone().add(new THREE.Vector3(fallbackHalf, 0, 0));
      const midpoint = startAnchor.clone().lerp(endAnchor, 0.5);
      const distance = startAnchor.distanceTo(endAnchor);
      const sagAmount = anchors
        ? Math.min(0.75, Math.max(0.15, distance * 0.12))
        : fallbackSag;
      const lowestY = Math.min(startAnchor.y, endAnchor.y);
      midpoint.y = lowestY - sagAmount;
      const curve = new THREE.CatmullRomCurve3([
        startAnchor.clone(),
        midpoint,
        endAnchor.clone(),
      ]);
      const strandGeometry = new THREE.TubeGeometry(curve, 64, 0.06, 10, false);
      const strandMaterial = new THREE.MeshStandardMaterial({
        color: 0x1f8b44,
        roughness: 0.8,
        metalness: 0.1,
      });
      const strandMesh = new THREE.Mesh(strandGeometry, strandMaterial);
      group.add(strandMesh);
      for (let i = 0; i < bulbCount; i += 1) {
        const bulbColor = colors
          ? new THREE.Color(colors[i])
          : color.clone
          ? color.clone()
          : new THREE.Color(color);
        const material = new THREE.MeshStandardMaterial({
          color: bulbColor,
          emissive: bulbColor,
          emissiveIntensity: 1.1,
        });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), material);
        const spanT = bulbCount > 1 ? i / (bulbCount - 1) : 0.5;
        const point = curve.getPoint(spanT);
        bulb.position.copy(point);
        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowMap,
            color: bulbColor,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        halo.scale.set(0.9, 0.9, 0.9);
        bulb.add(halo);
        const light = new THREE.PointLight(bulbColor, 0.9, 4, 2.5);
        light.position.copy(bulb.position);
        group.add(light);
        group.add(bulb);
      }
      mesh = group;
      break;
    }
  }
  return mesh;
}
