import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import {
  STRAND_SOCKET_COUNT,
  STRAND_SEGMENTS,
  BULB_COLORS,
  BULB_PICKUP_COUNT,
  BULB_HOVER_OFFSET,
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
  dropButton,
  throwMeterEl,
  throwMeterFill,
  throwMeterLabel,
} from '../components/domElements.js';
import { sampleTerrainHeight, boostHouseGlow, upsertDecoration } from './world.js';

let cachedGlowTexture = null;
function getGlowTexture() {
  if (cachedGlowTexture) return cachedGlowTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.5);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  cachedGlowTexture = new THREE.CanvasTexture(canvas);
  cachedGlowTexture.needsUpdate = true;
  return cachedGlowTexture;
}

function generateDecorationId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `decor-${Math.random().toString(36).slice(2, 10)}`;
}

const STRING_STAGES = {
  IDLE: 'IDLE',
  AIMING_FIRST: 'AIMING_FIRST',
  THROWING_FIRST: 'THROWING_FIRST',
  FIRST_ATTACHED: 'FIRST_ATTACHED',
  AIMING_SECOND: 'AIMING_SECOND',
  THROWING_SECOND: 'THROWING_SECOND',
  SECOND_ATTACHED: 'SECOND_ATTACHED',
  FINALIZED: 'FINALIZED',
};

const THROW_DURATION_MS = 780;

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
  const coilRadius = 1.05;
  const axisLength = 0.6;
  const loopCount = 2;
  const palmAnchor = new THREE.Vector3(0.86, 1.38, 0.5);
  const axisStart = palmAnchor.x + 0.15;
  const centerZ = 0.5;
  const centerY = 1.28;
  const points = [palmAnchor.clone()];
  const helixSegments = STRAND_SEGMENTS;
  for (let i = 0; i <= helixSegments; i += 1) {
    const t = i / helixSegments;
    const angle = t * Math.PI * 2 * loopCount;
    const x = axisStart + t * axisLength;
    const y = centerY + Math.cos(angle) * coilRadius * 0.55 + Math.sin(elapsed * 1 + t * 4) * 0.05;
    const z = centerZ + Math.sin(angle) * coilRadius;
    points.push(new THREE.Vector3(x, y, z));
  }
  points.push(new THREE.Vector3(axisStart + axisLength + 0.1, 1.02, centerZ - 0.12));
  const curve = new three.CatmullRomCurve3(points, false, 'catmullrom', 0.4);
  const samples = curve.getPoints(STRAND_SEGMENTS);
  strandState.cachedPoints = samples;
  const positions = strandState.line.geometry.attributes.position;
  samples.forEach((point, index) => {
    positions.setXYZ(index, point.x, point.y, point.z);
  });
  positions.needsUpdate = true;
  strandState.line.geometry.computeBoundingSphere();
  if (strandState.tubeMesh) {
    strandState.tubeMesh.geometry.dispose();
    strandState.tubeMesh.geometry = new three.TubeGeometry(
      curve,
      STRAND_SEGMENTS * 2,
      0.05,
      10,
      false,
    );
  }

  if (strandState.bulbMeshes.length) {
    const socketCount = strandState.bulbMeshes.length;
    for (let i = 0; i < socketCount; i += 1) {
      const t =
        socketCount === 1
          ? 0.5
          : Math.min(0.98, Math.max(0.02, (i + 0.3) / (socketCount + 0.3)));
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
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x1f8b44,
    linewidth: 2,
    transparent: true,
    opacity: 0.85,
  });
  const line = new THREE.Line(geometry, lineMaterial);
  group.add(line);
  const initialCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0.2, 1.32, 0.45),
      new THREE.Vector3(0.6, 1.18, 0.75),
      new THREE.Vector3(0.1, 1.02, 0.25),
    ],
    false,
    'catmullrom',
    0.5,
  );
  const tubeGeometry = new THREE.TubeGeometry(initialCurve, STRAND_SEGMENTS * 2, 0.05, 10, false);
  const tubeMaterial = new THREE.MeshStandardMaterial({
    color: 0x1f8b44,
    roughness: 0.65,
    metalness: 0.15,
  });
  const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
  group.add(tubeMesh);
  const glowMap = getGlowTexture();
  const bulbMeshes = [];
  const socketMaterials = [];
  const socketAuras = [];
  const socketLights = [];
  for (let i = 0; i < STRAND_SOCKET_COUNT; i += 1) {
    const material = new THREE.MeshStandardMaterial({
      color: 0x1f8b44,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.4,
      metalness: 0.05,
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), material);
    bulb.position.set(0, 1.1, 0.5);
    const aura = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowMap,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    aura.scale.set(0.5, 0.5, 0.5);
    const light = new THREE.PointLight(0xffffff, 0, 2.5, 2);
    light.position.set(0, 0, 0);
    bulb.add(aura);
    bulb.add(light);
    group.add(bulb);
    bulbMeshes.push(bulb);
    socketMaterials.push(material);
    socketAuras.push(aura);
    socketLights.push(light);
  }
  localPlayer.group.add(group);
  strandState.group = group;
  strandState.line = line;
  strandState.tubeMesh = tubeMesh;
  strandState.bulbMeshes = bulbMeshes;
  strandState.socketMaterials = socketMaterials;
  strandState.socketAuras = socketAuras;
  strandState.socketLights = socketLights;
  const coilVisual = createCoilVisual(context, STRAND_SOCKET_COUNT);
  localPlayer.group.add(coilVisual.group);
  context.coilState.mesh = coilVisual.group;
  context.coilState.lightNodes = coilVisual.nodes;
  context.coilState.lightsTotal = coilVisual.nodes.length;
  context.coilState.lightsRemaining = coilVisual.nodes.length;
  updateCoilVisual(context.coilState);
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

const TEMP_SEGMENT_MAX_POINTS = 48;

function createCoilVisual(context, bulbCount) {
  const { THREE: three } = context;
  const coilGroup = new three.Group();
  const base = new three.Mesh(
    new three.TorusGeometry(0.5, 0.22, 16, 40),
    new three.MeshStandardMaterial({
      color: 0xffd19a,
      roughness: 0.55,
      metalness: 0.2,
    }),
  );
  base.rotation.x = Math.PI / 2;
  coilGroup.add(base);
  const bulbNodes = [];
  for (let i = 0; i < bulbCount; i += 1) {
    const bulb = new three.Mesh(
      new three.SphereGeometry(0.08, 10, 10),
      new three.MeshStandardMaterial({
        color: 0xfff5d4,
        emissive: 0xfff5d4,
        emissiveIntensity: 0.4,
        roughness: 0.35,
      }),
    );
    const angle = (i / bulbCount) * Math.PI * 1.7;
    const radius = 0.34 + Math.sin(i * 0.5) * 0.03;
    bulb.position.set(
      Math.cos(angle) * radius,
      Math.sin(angle) * 0.08,
      Math.sin(angle) * radius * 0.35,
    );
    bulbNodes.push(bulb);
    coilGroup.add(bulb);
  }
  coilGroup.rotation.set(0, Math.PI / 5, 0);
  coilGroup.scale.set(0.92, 0.92, 0.92);
  coilGroup.position.set(-0.24, 0, -0.18);
  return { group: coilGroup, nodes: bulbNodes, base };
}

function updateCoilVisual(coilState) {
  if (!coilState.mesh || !coilState.lightNodes.length) return;
  const total = coilState.lightsTotal || coilState.lightNodes.length;
  const fraction = total > 0 ? Math.max(0, Math.min(1, coilState.lightsRemaining / total)) : 0;
  const visibleCount = Math.round(fraction * coilState.lightNodes.length);
  coilState.lightNodes.forEach((node, index) => {
    node.visible = index < visibleCount;
  });
  const baseMaterial = coilState.mesh.children[0]?.material;
  if (baseMaterial) {
    const baseColor = new THREE.Color(fraction > 0.05 ? 0xffd19a : 0x5d5d5d);
    baseMaterial.color.copy(baseColor);
    baseMaterial.emissive.setScalar(fraction > 0 ? 0.1 : 0);
  }
  coilState.isEmpty = fraction <= 0;
}

function getCoilTipWorld(context) {
  const { coilState, localPlayer } = context;
  if (!localPlayer) return new THREE.Vector3();
  const tip = coilState.tipWorld;
  tip.copy(coilState.tipPosition);
  localPlayer.group.localToWorld(tip);
  return tip;
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
  const aura = strandState.socketAuras[index];
  const light = strandState.socketLights[index];
  if (!material) return;
  const color = strandState.sockets[index];
  if (color) {
    material.color.set(color);
    material.emissive.set(color);
    material.emissiveIntensity = 1.35;
    if (aura) {
      aura.material.color.set(color);
      aura.material.opacity = 1;
      aura.visible = true;
    }
    if (light) {
      light.color.set(color);
      light.intensity = 0.9;
    }
  } else {
    material.color.set(0x1f8b44);
    material.emissive.set(0x000000);
    material.emissiveIntensity = 0;
    if (aura) {
      aura.visible = false;
      aura.material.opacity = 0;
    }
    if (light) {
      light.intensity = 0;
    }
  }
}

export function updateStrandUI(context) {
  const { strandState } = context;
  if (!bulbCountLabel) return;
  const filled = strandState.sockets.filter(Boolean).length;
  bulbCountLabel.textContent = `${filled}/${STRAND_SOCKET_COUNT}`;
  if (dropButton) {
    dropButton.disabled = filled === 0;
  }
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
    const aura = pickup.mesh.userData?.aura;
    const reflection = pickup.mesh.userData?.reflection;
    const light = pickup.mesh.userData?.light;
    if (aura || light || reflection) {
      const glowPulse = 0.7 + Math.sin(elapsed * 2.5 + pickup.wobbleOffset) * 0.25;
      if (aura) {
        aura.material.opacity = 0.4 + glowPulse * 0.45;
        const scale = 1.3 + glowPulse * 0.9;
        aura.scale.set(scale, scale, scale);
      }
      if (light) {
        light.intensity = 0.7 + glowPulse * 1.1;
        light.distance = 4.6 + glowPulse * 1.6;
      }
      if (reflection) {
        reflection.material.opacity = 0.2 + glowPulse * 0.3;
        reflection.scale.setScalar(0.7 + glowPulse * 0.5);
        reflection.position.y = pickup.baseY - pickup.mesh.position.y - 0.02;
      }
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
      if (isStrandFull(context)) {
        if (!context.lastStrandFullWarning || now - context.lastStrandFullWarning > 1600) {
          context.lastStrandFullWarning = now;
          if (context.showToast) {
            context.showToast('Your strand is full! Time to decorate ✨');
          }
        }
        continue;
      }
      if (!pickup.requireExitBeforeCollect || distance > 1.2) {
        pickup.collected = true;
        addBulbToStrand(context, pickup.color);
        playChime([660, 880]);
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
  const { throwState, strandState, stringPlacementState } = context;
  const isSecondAttachment =
    stringPlacementState.stage === STRING_STAGES.FIRST_ATTACHED ||
    stringPlacementState.awaitingSecondAnchor;
  if (!isSecondAttachment && !strandState.sockets.some((slot) => slot)) {
    if (context.showToast) {
      context.showToast('Collect some bulbs first!');
    }
    return false;
  }
  if (!isSecondAttachment && !isStrandFull(context)) {
    if (context.showToast) {
      context.showToast('Collect a full strand before decorating!');
    }
    return false;
  }
  if (!zone) return false;
  if (
    stringPlacementState.stage === STRING_STAGES.THROWING_SECOND ||
    stringPlacementState.stage === STRING_STAGES.AIMING_SECOND
  ) {
    if (context.showToast) {
      context.showToast('Finish the current string before starting again.');
    }
    return false;
  }
  if (stringPlacementState.stage === STRING_STAGES.FIRST_ATTACHED) {
    stringPlacementState.stage = STRING_STAGES.AIMING_SECOND;
  } else {
    stringPlacementState.stage = STRING_STAGES.AIMING_FIRST;
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
      throwMeterLabel.textContent = 'Release to place lights!';
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
      context.showToast('Hold a bit longer, then release to place!');
    }
    return;
  }
  performLightThrow(context, zone);
}

function performLightThrow(context, zone) {
  if (!zone) return;
  const {
    strandState,
    localPlayer,
    scene,
    throwEffects,
    THREE: three,
    stringPlacementState,
    coilState,
  } = context;
  const stage = stringPlacementState.stage;
  const isFirstThrow =
    stage === STRING_STAGES.AIMING_FIRST || stage === STRING_STAGES.IDLE;
  const origin =
    isFirstThrow && stringPlacementState.stage !== STRING_STAGES.THROWING_SECOND
      ? getCoilTipWorld(context)
      : stringPlacementState.firstAnchor?.anchor.clone() || getCoilTipWorld(context);
  const pattern =
    isFirstThrow || !stringPlacementState.pattern.length
      ? strandState.sockets.map((color) => color || '#ffecc3')
      : stringPlacementState.pattern;
  if (isFirstThrow) {
    stringPlacementState.pattern = [...pattern];
    coilState.lightsTotal = pattern.length;
    coilState.lightsRemaining = pattern.length;
    updateCoilVisual(coilState);
  }
  consumeStrandBulbs(context);
  const mesh = new three.Mesh(
    new three.SphereGeometry(0.18, 12, 12),
    new three.MeshBasicMaterial({ color: 0xffdfaa, transparent: true, opacity: 1 }),
  );
  mesh.position.copy(origin);
  scene.add(mesh);
  const effect = {
    mesh,
    from: origin.clone(),
    to: zone.anchor.clone(),
    start: performance.now(),
    duration: THROW_DURATION_MS,
    zone,
    placed: false,
    pattern,
    phase: isFirstThrow ? 1 : 2,
    currentPosition: origin.clone(),
  };
  throwEffects.push(effect);
  stringPlacementState.tempSegments.push(startTempSegment(context, origin, zone, effect));
  stringPlacementState.stage = isFirstThrow
    ? STRING_STAGES.THROWING_FIRST
    : STRING_STAGES.THROWING_SECOND;
  if (!isFirstThrow) {
    stringPlacementState.secondAnchor = zone;
  }
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
      if (effect.phase === 1) {
        beginPendingStringAttachment(context, effect.zone, effect.pattern);
      } else {
        completeStringAttachment(context, effect.zone);
      }
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
      const baseY = groundY + BULB_HOVER_OFFSET;
      const restHeight = baseY;
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
  const group = new THREE.Group();
  const glowMap = getGlowTexture();
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 18, 18),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.2,
      roughness: 0.25,
      metalness: 0.08,
    }),
  );
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 0.14, 8),
    new THREE.MeshStandardMaterial({
      color: 0x1f8b44,
      roughness: 0.45,
      metalness: 0.25,
    }),
  );
  cap.position.y = 0.18;
  const aura = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowMap,
      color,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  aura.scale.set(1.4, 1.4, 1.4);
  const reflection = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 32),
    new THREE.MeshBasicMaterial({
      map: glowMap,
      color,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  reflection.rotation.x = -Math.PI / 2;
  reflection.position.y = -BULB_HOVER_OFFSET - 0.02;
  const light = new THREE.PointLight(new THREE.Color(color), 1.2, 4.2, 2);
  light.position.set(0, 0, 0);
  group.add(glass);
  group.add(cap);
  group.add(aura);
  group.add(reflection);
  group.add(light);
  group.userData.aura = aura;
  group.userData.light = light;
  group.userData.reflection = reflection;
  return group;
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
  const hoverBase = terrainY + BULB_HOVER_OFFSET;
  const baseY = options.baseY ?? hoverBase;
  const restHeight = options.restHeight ?? baseY;
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

function computePointsLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += points[i].distanceTo(points[i - 1]);
  }
  return total;
}

function startTempSegment(context, startPoint, zone, effect) {
  const { scene, THREE: three } = context;
  const geometry = new three.BufferGeometry().setFromPoints([startPoint.clone()]);
  const material = new three.LineBasicMaterial({
    color: 0xfff4d6,
    transparent: true,
    opacity: 0.75,
    linewidth: 4,
  });
  const line = new three.Line(geometry, material);
  line.frustumCulled = false;
  scene.add(line);
  return {
    points: [startPoint.clone()],
    mesh: line,
    target: zone.anchor.clone(),
    zone,
    effect,
    bulbsUsed: 0,
    wiggle: Math.random() * Math.PI * 2,
    completed: false,
  };
}

function cleanupTempSegments(context) {
  const { stringPlacementState, scene } = context;
  stringPlacementState.tempSegments.forEach((segment) => {
    if (segment.mesh) {
      if (segment.mesh.parent) {
        scene.remove(segment.mesh);
      }
      segment.mesh.geometry?.dispose();
      segment.mesh.material?.dispose();
    }
  });
  stringPlacementState.tempSegments.length = 0;
}

export function updateStringSegments(context, delta) {
  const { stringPlacementState, coilState } = context;
  if (!stringPlacementState.tempSegments.length) return;
  stringPlacementState.tempSegments.forEach((segment) => {
    if (segment.completed || !segment.mesh) return;
    const nextPos = segment.effect?.currentPosition?.clone() ?? segment.target.clone();
    nextPos.x += Math.sin(segment.wiggle + segment.points.length * 0.35) * 0.03;
    nextPos.z += Math.cos(segment.wiggle + segment.points.length * 0.18) * 0.02;
    segment.points.push(nextPos);
    if (segment.points.length > TEMP_SEGMENT_MAX_POINTS) {
      segment.points.shift();
    }
    segment.mesh.geometry.setFromPoints(segment.points);
    segment.mesh.geometry.computeBoundingSphere();
    let length = computePointsLength(segment.points);
    let threshold = (segment.bulbsUsed + 1) * coilState.bulbSpacing;
    while (length >= threshold && coilState.lightsRemaining > 0) {
      segment.bulbsUsed += 1;
      coilState.lightsRemaining = Math.max(0, coilState.lightsRemaining - 1);
      threshold = (segment.bulbsUsed + 1) * coilState.bulbSpacing;
    }
    if (segment.effect?.progress >= 0.99) {
      segment.completed = true;
    }
  });
  updateCoilVisual(coilState);
  updateStringPreview(context);
}

function updateStringPreview(context) {
  const { stringPlacementState, THREE: three } = context;
  if (
    stringPlacementState.stage !== STRING_STAGES.FIRST_ATTACHED ||
    !stringPlacementState.preview ||
    !stringPlacementState.firstAnchor
  ) {
    return;
  }
  const preview = stringPlacementState.preview;
  const start = getCoilTipWorld(context);
  const anchor = stringPlacementState.firstAnchor.anchor;
  const mid = start.clone().lerp(anchor, 0.45);
  const minHeight = Math.min(start.y, anchor.y);
  mid.y = minHeight - 0.45;
  const curve = new three.CatmullRomCurve3([start.clone(), mid, anchor.clone()]);
  const tube = preview?.userData?.tube;
  if (!tube) return;
  const geometry = new three.TubeGeometry(curve, 28, 0.04, 10, false);
  tube.geometry?.dispose();
  tube.geometry = geometry;
  const bulbInfos = preview.userData?.bulbInfos || [];
  bulbInfos.forEach((info, index) => {
    const spanT = bulbInfos.length === 1 ? 0.5 : index / (bulbInfos.length - 1);
    const point = curve.getPoint(spanT);
    info.mesh.position.copy(point);
    info.glow.position.copy(point);
    info.light.position.copy(point);
  });
}

function cancelStringAttachmentPreview(context) {
  const { stringPlacementState, scene } = context;
  const preview = stringPlacementState.preview;
  if (!preview) return;
  scene.remove(preview);
  const tube = preview.userData?.tube;
  if (tube) {
    tube.geometry?.dispose();
    tube.material?.dispose();
  }
  const bulbInfos = preview.userData?.bulbInfos || [];
  bulbInfos.forEach(({ mesh, glow }) => {
    mesh.geometry?.dispose();
    mesh.material?.dispose();
    glow.material?.dispose();
  });
  stringPlacementState.preview = null;
}

function buildStringPreviewMesh(context, anchor, pattern) {
  const { THREE: three } = context;
  const glowMap = getGlowTexture();
  const start = getCoilTipWorld(context);
  const mid = start.clone().lerp(anchor, 0.45);
  const minHeight = Math.min(start.y, anchor.y);
  mid.y = minHeight - 0.45;

  const curve = new three.CatmullRomCurve3([start.clone(), mid, anchor.clone()]);
  const geometry = new three.TubeGeometry(curve, 32, 0.04, 10, false);
  const tubeMaterial = new three.MeshStandardMaterial({
    color: 0x1f8b44,
    roughness: 0.55,
    metalness: 0.25,
    transparent: true,
    opacity: 0.75,
  });
  const tubeMesh = new three.Mesh(geometry, tubeMaterial);
  tubeMesh.renderOrder = 1;

  const bulbCount = Math.max(2, pattern?.length || 8);
  const bulbColors =
    pattern && pattern.length
      ? pattern
      : Array.from({ length: bulbCount }, () => '#ffecc3');
  const bulbInfos = [];
  for (let i = 0; i < bulbCount; i += 1) {
    const colorValue = bulbColors[i % bulbColors.length];
    const bulbColor = new three.Color(colorValue);
    const bulbMaterial = new three.MeshStandardMaterial({
      color: bulbColor,
      emissive: bulbColor,
      emissiveIntensity: 0.9,
      roughness: 0.25,
      metalness: 0.08,
    });
    const bulb = new three.Mesh(new three.SphereGeometry(0.12, 12, 12), bulbMaterial);

    const halo = new three.Sprite(
      new three.SpriteMaterial({
        map: glowMap,
        color: bulbColor,
        transparent: true,
        opacity: 0.85,
        blending: three.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.scale.set(0.8, 0.8, 0.8);

    const light = new three.PointLight(bulbColor, 0.65, 3, 2);

    bulbInfos.push({ mesh: bulb, glow: halo, light });
  }

  const preview = new three.Group();
  preview.add(tubeMesh);
  bulbInfos.forEach((info) => {
    preview.add(info.mesh);
    preview.add(info.glow);
    preview.add(info.light);
  });
  preview.userData = { tube: tubeMesh, bulbInfos };

  return preview;
}

function beginPendingStringAttachment(context, zone, pattern) {
  const { stringPlacementState } = context;
  if (!zone) return;
  cancelStringAttachmentPreview(context);
  stringPlacementState.awaitingSecondAnchor = true;
  stringPlacementState.firstAnchor = zone;
  stringPlacementState.pattern = pattern && pattern.length ? [...pattern] : stringPlacementState.pattern;
  stringPlacementState.stage = STRING_STAGES.FIRST_ATTACHED;
  const preview = buildStringPreviewMesh(context, zone.anchor, stringPlacementState.pattern);
  if (preview) {
    context.scene.add(preview);
    stringPlacementState.preview = preview;
  }
  if (context.showToast) {
    context.showToast('Pick another glowing spot to anchor the other end of the string.');
  }
}

export function completeStringAttachment(context, zone) {
  const { stringPlacementState, coilState } = context;
  const firstAnchor = stringPlacementState.firstAnchor;
  if (!zone || !firstAnchor) return false;
  if (zone.id === firstAnchor.id) {
    if (context.showToast) {
      context.showToast('Pick a different spot to anchor the other end.');
    }
    return false;
  }
  if (zone.houseId !== firstAnchor.houseId) {
    if (context.showToast) {
      context.showToast('Both ends must attach to the same cabin.');
    }
    return false;
  }
  const firstAnchorPos = firstAnchor.anchor;
  const secondAnchorPos = zone.anchor;
  const anchorPoints = [
    { x: firstAnchorPos.x, y: firstAnchorPos.y, z: firstAnchorPos.z },
    { x: secondAnchorPos.x, y: secondAnchorPos.y, z: secondAnchorPos.z },
  ];
  cancelStringAttachmentPreview(context);
  cleanupTempSegments(context);
  const pattern =
    stringPlacementState.pattern.length > 0 ? [...stringPlacementState.pattern] : ['#ffecc3'];
  placeDecoration(context, firstAnchorPos, zone.normal, {
    typeId: 'string_lights',
    colors: pattern,
    anchorPoints,
    cabinId: zone.houseId,
    glow: 0.95,
  });
  stringPlacementState.stage = STRING_STAGES.FINALIZED;
  stringPlacementState.awaitingSecondAnchor = false;
  stringPlacementState.firstAnchor = null;
  stringPlacementState.secondAnchor = null;
  stringPlacementState.pattern = [];
  stringPlacementState.tempSegments.length = 0;
  coilState.lightsRemaining = 0;
  updateCoilVisual(coilState);
  if (context.showToast) {
    context.showToast('String hung! Ready for another bundle.');
  }
  stringPlacementState.stage = STRING_STAGES.IDLE;
  return true;
}

export function placeDecoration(context, point, normal, options = {}) {
  const { localState, network, THREE: three } = context;
  const typeId = options.typeId || localState.decorType;
  const chosenColor = options.color || defaultDecorColors[typeId] || localState.decorColor;
  const cabinId = options.cabinId || 'storybook-home';
  const facingNormal = normal ? normal.clone() : new three.Vector3(0, 1, 0);
  const decorationId = options.id || generateDecorationId();
  const transformPosition =
    typeId === 'string_lights'
      ? { x: 0, y: 0, z: 0 }
      : { x: point.x, y: point.y, z: point.z };
  const decoration = {
    id: decorationId,
    typeId,
    color: chosenColor,
    glow: options.glow ?? 0.65,
    cabinId,
    transform: {
      position: transformPosition,
      rotation: { x: 0, y: Math.atan2(facingNormal.x, facingNormal.z) || 0, z: 0 },
      scale: 1,
    },
    colors: Array.isArray(options.colors) ? options.colors : undefined,
    anchorPoints: options.anchorPoints
      ? options.anchorPoints.map((pt) => ({
          x: pt.x,
          y: pt.y,
          z: pt.z,
        }))
      : undefined,
  };

  upsertDecoration(context, {
    ...decoration,
    type: typeId,
  });
  network.send('place_decoration', decoration);
  localState.decorType = typeId;
  if (context.showToast) {
    context.showToast(`Placed ${typeId.replace(/_/g, ' ')} ✨`);
  }
  playChime();
  boostHouseGlow(context, cabinId);
}
