import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import {
  STRAND_SOCKET_COUNT,
  STRAND_SEGMENTS,
  BULB_COLORS,
  BULB_PICKUP_COUNT,
  THROW_FULL_DURATION,
  THROW_MIN_DURATION,
  DROP_GRAVITY,
  defaultDecorColors,
} from '../constants/game.js';
import { playChime } from '../audio/audio.js';
import {
  strandBar,
  bulbCountLabel,
  strandSocketsEl,
  throwMeterEl,
  throwMeterFill,
  throwMeterLabel,
} from '../components/domElements.js';
import { sampleTerrainHeight, boostHouseGlow } from './world.js';

export function initStrand(context) {
  if (strandBar) {
    strandBar.classList.add('hidden');
  }
  initLightStrand(context);
  initStrandUI(context);
  spawnLightPickups(context);
}

export function updateLightStrand(context, delta, elapsed) {
  const { strandState, THREE: three, playerIsMoving } = context;
  if (!strandState.line) return;
  strandState.swingPhase += delta * (playerIsMoving ? 3 : 1.4);
  const sway = Math.sin(strandState.swingPhase * 2) * (playerIsMoving ? 0.2 : 0.08);
  const sag = playerIsMoving ? 0.22 : 0.32;
  const curve = new three.CubicBezierCurve3(
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

function initLightStrand(context) {
  const { strandState, localPlayer } = context;
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array((STRAND_SEGMENTS + 1) * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0x1d1624,
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
    }),
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

function initStrandUI(context) {
  const { strandState } = context;
  if (!strandSocketsEl) return;
  strandSocketsEl.innerHTML = '';
  strandState.uiDots = [];
  for (let i = 0; i < STRAND_SOCKET_COUNT; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'socket empty';
    strandSocketsEl.appendChild(dot);
    strandState.uiDots.push(dot);
  }
  updateStrandUI(context);
}

export function isStrandFull(context) {
  return context.strandState.sockets.every((slot) => slot);
}

export function addBulbToStrand(context, color) {
  const { strandState, tempVecA, localPlayer } = context;
  if (!color) return false;
  const index = strandState.sockets.findIndex((slot) => slot === null);
  if (index === -1) {
    return false;
  }
  strandState.sockets[index] = color;
  updateStrandVisual(context, index);
  updateStrandUI(context);
  const sparkOrigin = tempVecA.set(0, 1.2, 0.55);
  localPlayer.group.localToWorld(sparkOrigin);
  spawnStrandSpark(context, sparkOrigin, color);
  return true;
}

export function consumeStrandBulbs(context) {
  const { strandState } = context;
  for (let i = 0; i < strandState.sockets.length; i += 1) {
    strandState.sockets[i] = null;
    updateStrandVisual(context, i);
  }
  updateStrandUI(context);
}

function updateStrandVisual(context, index) {
  const { strandState } = context;
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

export function updateStrandUI(context) {
  const { strandState } = context;
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
      dot.style.removeProperty('--socket-color');
      dot.classList.add('empty');
    }
  });
  if (strandBar) {
    strandBar.classList.toggle('hidden', filled === 0);
  }
}

export function updateBulbPickups(context, delta, elapsed) {
  const {
    bulbPickups,
    localPlayer,
    tempVecC,
    strandState,
    THREE: three,
    playerIsMoving,
  } = context;
  for (let i = bulbPickups.length - 1; i >= 0; i -= 1) {
    const pickup = bulbPickups[i];
    if (!pickup.mesh) {
      bulbPickups.splice(i, 1);
      continue;
    }
    if (pickup.isDropping) {
      pickup.dropVelocity = pickup.dropVelocity || new THREE.Vector3(0, 0, 0);
      pickup.dropVelocity.y -= DROP_GRAVITY * delta;
      pickup.mesh.position.addScaledVector(pickup.dropVelocity, delta);
      if (pickup.mesh.position.y <= pickup.restHeight) {
        pickup.mesh.position.y = pickup.restHeight;
        pickup.isDropping = false;
      }
    } else {
      pickup.mesh.position.y =
        pickup.baseY + Math.sin(elapsed * 2 + pickup.wobbleOffset) * 0.08;
    }
    tempVecC.copy(pickup.mesh.position);
    const distance = tempVecC.distanceTo(localPlayer.group.position);
    const now = performance.now();
    if (
      distance < 1.6 &&
      !pickup.collected &&
      (!pickup.immuneUntil || now >= pickup.immuneUntil)
    ) {
      if (!pickup.requireExitBeforeCollect || distance > 1.2) {
        pickup.collected = true;
        if (!isStrandFull(context)) {
          addBulbToStrand(context, pickup.color);
          playChime([660, 880]);
        } else if (!context.lastStrandFullWarning || now - context.lastStrandFullWarning > 1600) {
          context.lastStrandFullWarning = now;
          if (context.showToast) {
            context.showToast('Your strand is full! Time to decorate ✨');
          }
        }
        context.scene.remove(pickup.mesh);
        bulbPickups.splice(i, 1);
      }
    }
  }

  if (playerIsMoving && strandState.group) {
    const sway = Math.sin(elapsed * 4) * 0.01;
    strandState.group.rotation.z = three.MathUtils.lerp(
      strandState.group.rotation.z,
      sway,
      0.08,
    );
  }
}

function spawnStrandSpark(context, position, color) {
  const { sparkEffects, scene } = context;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    }),
  );
  sprite.scale.set(0.4, 0.4, 0.4);
  sprite.position.copy(position);
  scene.add(sprite);
  sparkEffects.push({ sprite, start: performance.now(), duration: 280 });
}

export function updateSparkEffects(context, delta) {
  const { sparkEffects, scene, THREE: three } = context;
  const now = performance.now();
  for (let i = sparkEffects.length - 1; i >= 0; i -= 1) {
    const effect = sparkEffects[i];
    const t = Math.min(1, (now - effect.start) / effect.duration);
    const eased = three.MathUtils.smoothstep(t, 0, 1);
    effect.sprite.material.opacity = 1 - eased;
    effect.sprite.scale.setScalar(three.MathUtils.lerp(0.4, 0.9, eased));
    if (t >= 1) {
      scene.remove(effect.sprite);
      sparkEffects.splice(i, 1);
    }
  }
}

export function beginThrowCharge(context, zone) {
  const { throwState, strandState } = context;
  if (!strandState.sockets.some((slot) => slot)) {
    if (context.showToast) {
      context.showToast('Collect some bulbs first!');
    }
    return false;
  }
  if (!isStrandFull(context)) {
    if (context.showToast) {
      context.showToast('Collect a full strand before decorating!');
    }
    return false;
  }
  throwState.charging = true;
  throwState.zone = zone;
  throwState.startTime = performance.now();
  throwState.progress = 0;
  if (throwMeterEl) {
    throwMeterEl.classList.remove('hidden');
  }
  if (throwMeterLabel) {
    throwMeterLabel.textContent = 'Charging lights…';
  }
  return true;
}

export function updateThrowCharge(context) {
  const { throwState } = context;
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

export function finishThrowCharge(context, forceCancel = false) {
  const { throwState } = context;
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
    if (context.showToast) {
      context.showToast('Hold a bit longer to throw the lights!');
    }
    return;
  }
  performLightThrow(context, zone);
}

function performLightThrow(context, zone) {
  const { strandState, tempVecA, localPlayer, scene, throwEffects, THREE: three } = context;
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
  consumeStrandBulbs(context);
}

export function updateThrowEffects(context, delta) {
  const { throwEffects, tempVecB, scene, THREE: three } = context;
  const now = performance.now();
  for (let i = throwEffects.length - 1; i >= 0; i -= 1) {
    const effect = throwEffects[i];
    const t = Math.min(1, (now - effect.start) / effect.duration);
    tempVecB.copy(effect.from).lerp(effect.to, t);
    effect.mesh.position.copy(tempVecB);
    effect.mesh.material.opacity = 1 - t;
    effect.mesh.scale.setScalar(three.MathUtils.lerp(1, 0.1, t));
    if (!effect.placed && t >= 0.95) {
      placeDecoration(context, effect.zone.anchor, effect.zone.normal, {
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

export function updateDropProjectiles(context) {
  const { dropProjectiles, bulbPickups } = context;
  const now = performance.now();
  for (let i = dropProjectiles.length - 1; i >= 0; i -= 1) {
    const effect = dropProjectiles[i];
    const t = Math.min(1, (now - effect.startTime) / effect.duration);
    const position = evaluateQuadratic(effect.start, effect.control, effect.end, t);
    effect.mesh.position.copy(position);
    if (t >= 1) {
      dropProjectiles.splice(i, 1);
      const spawnPoint = effect.end.clone();
      const groundY = sampleTerrainHeight(context, spawnPoint);
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

export function dropStrandBulb(context) {
  const {
    strandState,
    localPlayer,
    dropProjectiles,
    THREE: three,
  } = context;
  let dropIndex = -1;
  for (let i = strandState.sockets.length - 1; i >= 0; i -= 1) {
    if (strandState.sockets[i]) {
      dropIndex = i;
      break;
    }
  }
  if (dropIndex === -1) {
    if (context.showToast) {
      context.showToast('No bulbs to drop yet!');
    }
    return;
  }
  const color = strandState.sockets[dropIndex];
  strandState.sockets[dropIndex] = null;
  updateStrandVisual(context, dropIndex);
  updateStrandUI(context);
  const forward = new three.Vector3(0, 0, 1).applyAxisAngle(
    new three.Vector3(0, 1, 0),
    localPlayer.group.rotation.y || 0,
  );
  forward.multiplyScalar(2.4);
  const landing = localPlayer.group.position.clone().add(forward);
  const terrainY = sampleTerrainHeight(context, landing);
  landing.y = terrainY + 0.02;
  const origin = new three.Vector3(0.15, 1.18, 0.4);
  localPlayer.group.localToWorld(origin);
  const control = origin.clone().lerp(landing, 0.5);
  control.y = Math.max(origin.y, landing.y) + 1.2;
  const projectile = createBulbPickup(color);
  projectile.scale.setScalar(0.7);
  context.scene.add(projectile);
  dropProjectiles.push({
    mesh: projectile,
    start: origin.clone(),
    control,
    end: landing.clone(),
    color,
    startTime: performance.now(),
    duration: 520,
  });
  spawnDropSpark(context, origin, color);
}

function spawnDropSpark(context, position, color) {
  const { sparkEffects, scene } = context;
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

function createBulbPickup(color) {
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 12),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.1,
    }),
  );
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 0.14, 8),
    new THREE.MeshStandardMaterial({
      color: 0xd0c6b8,
      roughness: 0.4,
      metalness: 0.8,
    }),
  );
  cap.position.y = 0.18;
  bulb.add(cap);
  return bulb;
}

export function spawnLightPickups(context) {
  const { pickupSpawnContext, bulbPickups, scene } = context;
  if (!pickupSpawnContext) return;
  while (bulbPickups.length > 0) {
    const entry = bulbPickups.pop();
    if (entry?.mesh) {
      scene.remove(entry.mesh);
    }
  }
  for (let i = 0; i < BULB_PICKUP_COUNT; i += 1) {
    spawnSingleBulb(context);
  }
}

export function spawnSingleBulb(context, options = {}) {
  const { pickupSpawnContext, bulbPickups, scene, THREE: three } = context;
  if (!pickupSpawnContext && !options.position) return null;
  const color = options.color || BULB_COLORS[Math.floor(Math.random() * BULB_COLORS.length)];
  const pickup = createBulbPickup(color);
  let position;
  if (options.position) {
    const pos = options.position;
    position = pos.clone ? pos.clone() : new three.Vector3(pos.x || 0, pos.y || 0, pos.z || 0);
  } else {
    const { pathAreas, cabinBounds, bulbSpawnBounds } = pickupSpawnContext;
    position = findSpawnPosition(pathAreas, cabinBounds, bulbSpawnBounds);
  }
  const terrainY = sampleTerrainHeight(context, position);
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

function findSpawnPosition(pathAreas, cabinBounds, bulbSpawnBounds) {
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

function isOnPath(position, pathBounds) {
  return pathBounds.some(
    (bound) =>
      position.x >= bound.x1 &&
      position.x <= bound.x2 &&
      position.z >= bound.z1 &&
      position.z <= bound.z2,
  );
}

function isNearCabin(position, bounds) {
  return bounds.some((cabin) => {
    return (
      Math.abs(position.x - cabin.x) < cabin.width / 2 &&
      Math.abs(position.z - cabin.z) < cabin.depth / 2
    );
  });
}

export function placeDecoration(context, point, normal, options = {}) {
  const { localState, network, THREE: three } = context;
  const typeId = options.typeId || localState.decorType;
  const chosenColor = options.color || defaultDecorColors[typeId] || localState.decorColor;
  const cabinId = options.cabinId || 'storybook-home';
  const facingNormal = normal ? normal.clone() : new three.Vector3(0, 1, 0);
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
  if (context.showToast) {
    context.showToast(`Placed ${typeId.replace(/_/g, ' ')} ✨`);
  }
  playChime();
  boostHouseGlow(context, cabinId);
}

