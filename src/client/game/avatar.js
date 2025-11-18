import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtilsModule from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTER_PRESETS } from '../constants/game.js';
import {
  outfitColorInput,
  accentColorInput,
  outfitSelect,
  hairSelect,
  storyCharacterButtons,
  modalCharacterButtons,
} from '../components/domElements.js';
import { upsertDecoration } from './world.js';

const gltfLoader = new GLTFLoader();
const SkeletonUtils =
  SkeletonUtilsModule.SkeletonUtils ||
  SkeletonUtilsModule.default ||
  SkeletonUtilsModule;

const BOOT_BASE_HEIGHT = 0.35;
const WALK_IDLE_SPEED = 1.2;
const WALK_ACTIVE_SPEED = 5.2;

const WALK_TILT_SPEED = 0.9;
const WALK_TILT_AMOUNT = 0.08;

const CHARACTER_MODEL_CONFIGS = {
  steph: {
    url: new URL('../assets/character/steph.glb', import.meta.url).href,
    targetHeight: 4.2,
    yOffset: 1.2,
    zOffset: 0.15,
    emissiveBoost: 1.35,
    colorBoost: 1.15,
    lightIntensity: 2.4,
    lightColor: 0xfff3d6,
  },
  forrest: {
    url: new URL('../assets/character/forrest.glb', import.meta.url).href,
    targetHeight: 4.2,
    yOffset: 1.1,
    zOffset: 0.1,
    emissiveBoost: 1.15,
    colorBoost: 1.1,
    lightIntensity: 2.0,
    lightColor: 0xe9f5ff,
  },
};

const characterModelPromises = new Map();

function loadCharacterModel(character) {
  const config = CHARACTER_MODEL_CONFIGS[character];
  if (!config) {
    return Promise.reject(new Error(`No GLB configured for ${character}`));
  }
  if (!characterModelPromises.has(character)) {
    characterModelPromises.set(
      character,
      new Promise((resolve, reject) => {
        gltfLoader.load(config.url, (gltf) => resolve(gltf.scene), undefined, reject);
      }),
    );
  }
  return characterModelPromises.get(character);
}

export function normalizeAvatarAppearance(avatar = {}) {
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

export function createAvatar(appearance = {}) {
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
    new THREE.MeshStandardMaterial({
      color: config.colors.outfit,
      roughness: 0.45,
      metalness: 0.05,
    }),
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
  const blushMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb9c6,
    transparent: true,
    opacity: 0.6,
  });
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
  const bootMeshes = [];
  for (let i = 0; i < 2; i += 1) {
    const boot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 0.5, 14),
      registerMaterial(
        new THREE.MeshStandardMaterial({ color: config.colors.accent, roughness: 0.45 }),
        'accent',
      ),
    );
    const offsetX = i === 0 ? -0.25 : 0.25;
    boot.position.set(offsetX, BOOT_BASE_HEIGHT, 0);
    boot.castShadow = true;
    bootGroup.add(boot);
    bootMeshes.push(boot);
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
      const waves = new THREE.Mesh(
        new THREE.TorusGeometry(0.75, 0.18, 12, 24),
        hairMaterial.clone(),
      );
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

  const baseChildren = [...group.children];
  let externalModelInstance = null;
  let externalModelKey = null;
  let externalLoadToken = 0;
  let externalFrontLight = null;

  function setBaseVisibility(visible) {
    baseChildren.forEach((child) => {
      child.visible = visible;
    });
  }

  function hideExternalModel() {
    if (externalModelInstance && externalModelInstance.parent === group) {
      group.remove(externalModelInstance);
    }
    if (externalFrontLight && externalFrontLight.parent) {
      externalFrontLight.parent.remove(externalFrontLight);
    }
    externalModelInstance = null;
    externalModelKey = null;
    externalFrontLight = null;
    setBaseVisibility(true);
    animationState.externalModel = null;
    animationState.externalModelBaseY = 0;
    animationState.externalBobPhase = 0;
    animationState.externalModelBaseX = 0;
    animationState.groupTilt = 0;
  }

  function showExternalModel(character) {
    const config = CHARACTER_MODEL_CONFIGS[character];
    if (!config) {
      hideExternalModel();
      return;
    }
    const loadToken = ++externalLoadToken;
    setBaseVisibility(false);
    loadCharacterModel(character)
      .then((sceneTemplate) => {
        if (loadToken !== externalLoadToken) return;
        if (externalModelInstance && externalModelInstance.parent === group) {
          group.remove(externalModelInstance);
        }
        const cloned = SkeletonUtils.clone(sceneTemplate);
        cloned.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              child.material = child.material.clone();
              if (child.material.emissive) {
                child.material.emissiveIntensity =
                  (child.material.emissiveIntensity || 0) + (config.emissiveBoost || 0.8);
                const boostedColor = child.material.emissive.clone().multiplyScalar(config.colorBoost || 1);
                child.material.emissive.copy(boostedColor);
                child.material.toneMapped = false;
              }
              const baseColor = child.material.color;
              if (baseColor && config.colorBoost) {
                baseColor.multiplyScalar(config.colorBoost);
              }
            }
          }
        });
        const bounds = new THREE.Box3().setFromObject(cloned);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        cloned.position.sub(center);
        cloned.position.y -= bounds.min.y;
        const targetHeight = config.targetHeight || 3.8;
        const scale = targetHeight / size.y;
        cloned.scale.setScalar(scale);
        cloned.position.z += config.zOffset || 0;
        cloned.position.y += config.yOffset || 0;
        externalModelInstance = cloned;
        externalModelKey = character;
        animationState.externalModel = cloned;
        animationState.externalModelBaseY = cloned.position.y;
        animationState.externalModelBaseX = cloned.position.x;
        animationState.externalBobPhase = 0;
        group.add(cloned);

        if (externalFrontLight && externalFrontLight.parent) {
          externalFrontLight.parent.remove(externalFrontLight);
        }
        const lightIntensity = config.lightIntensity || 1.8;
        const lightColor = new THREE.Color(config.lightColor || 0xfff5da);
        externalFrontLight = new THREE.PointLight(lightColor, lightIntensity, 7.5, 2);
        externalFrontLight.position.set(0, (targetHeight || 4) * 0.55, 1.05);
        externalFrontLight.castShadow = false;
        cloned.add(externalFrontLight);

      })
      .catch((error) => {
        console.error(`Failed to load ${character} GLB`, error);
        hideExternalModel();
      });
  }

  const appearanceState = {
    colors: { ...config.colors },
    outfit: config.outfit,
    hair: config.hair,
    character: config.character || 'steph',
  };
  const animationState = {
    boots: bootMeshes,
    stridePhase: Math.random() * Math.PI * 2,
    externalModel: null,
    externalModelBaseY: 0,
    externalModelBaseX: 0,
    externalBobPhase: Math.random() * Math.PI * 2,
    groupTilt: 0,
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
    const previousCharacter = appearanceState.character;
    appearanceState.character = variantName;
    if (options.applyPreset) {
      setColors(preset.colors);
      setHair(preset.hair);
    }
    if (CHARACTER_MODEL_CONFIGS[variantName]) {
      if (externalModelKey !== variantName) {
        showExternalModel(variantName);
      } else if (externalModelInstance) {
        setBaseVisibility(false);
        externalModelInstance.visible = true;
      }
    } else if (externalModelKey) {
      hideExternalModel();
    } else if (previousCharacter !== variantName) {
      setBaseVisibility(true);
    }
  }

  setOutfit(appearanceState.outfit);
  setHair(appearanceState.hair);
  applyColors(appearanceState.colors);
  setCharacter(appearanceState.character);

  return {
    group,
    materials: { body: bodyMat, accent: accentMat },
    animation: animationState,
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

export function createLocalPlayer(context) {
  const { scene, footstepGroup, localState } = context;
  const localPlayer = createAvatar({
    colors: localState.avatarColors,
    outfit: localState.outfit,
    hair: localState.hair,
  });
  localPlayer.group.position.set(0, 0, 0);
  scene.add(localPlayer.group);
  scene.add(footstepGroup);
  context.localPlayer = localPlayer;
  return localPlayer;
}

export function selectCharacter(context, name, options = {}) {
  const { localState, localPlayer } = context;
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
    sendAvatarUpdate(context);
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

export function sendAvatarUpdate(context) {
  const { localState, localPlayer, network } = context;
  if (!localState.sessionCode || !network || !network.socket) return;
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

export function hydrateWorld(context, state) {
  if (!state) return;
  const { scene, localState, remotePlayers, decorationMeshes } = context;
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
      remotePlayers.set(player.id, {
        ...avatar,
        targetTransform: player.transform,
        lastRemotePosition: player.transform?.position
          ? { ...player.transform.position }
          : null,
        isMoving: false,
      });
    } else {
      const prevPosition = existing.lastRemotePosition;
      const nextPosition = player.transform?.position;
      if (prevPosition && nextPosition) {
        const dx = nextPosition.x - prevPosition.x;
        const dy = nextPosition.y - prevPosition.y;
        const dz = nextPosition.z - prevPosition.z;
        existing.isMoving = Math.hypot(dx, dy, dz) > 0.01;
      } else {
        existing.isMoving = false;
      }
      if (nextPosition) {
        existing.lastRemotePosition = { ...nextPosition };
      }
      existing.targetTransform = player.transform;
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

  state.decorations?.forEach((decor) => upsertDecoration(context, decor));
  decorationMeshes.forEach((mesh, id) => {
    if (!state.decorations.find((d) => d.id === id)) {
      scene.remove(mesh);
      decorationMeshes.delete(id);
    }
  });
}

export function updateTransform(group, transform) {
  if (!transform) return;
  group.position.set(transform.position.x, transform.position.y, transform.position.z);
  group.rotation.y = transform.rotation.y || 0;
}

export function updateAvatarWalkPose(avatar, { isMoving = false, speedFactor = 1 } = {}, delta = 0) {
  if (!avatar || !avatar.animation) return;
  const animation = avatar.animation;
  const boots = animation.boots;
  const speed = (isMoving ? WALK_ACTIVE_SPEED : WALK_IDLE_SPEED) * Math.max(0.4, speedFactor);
  animation.stridePhase += delta * speed;
  if (animation.stridePhase > Math.PI * 2) {
    animation.stridePhase -= Math.PI * 2;
  }
  const amplitude = isMoving ? 0.25 : 0.07;
  const lift = isMoving ? 0.08 : 0.02;
  boots?.forEach((boot, index) => {
    const phaseOffset = index % 2 === 0 ? 0 : Math.PI;
    const footPhase = animation.stridePhase + phaseOffset;
    const targetZ = Math.sin(footPhase) * amplitude;
    const targetY = BOOT_BASE_HEIGHT + Math.max(0, Math.sin(footPhase)) * lift;
    boot.position.z = THREE.MathUtils.lerp(boot.position.z, targetZ, 0.25);
    boot.position.y = THREE.MathUtils.lerp(boot.position.y, targetY, 0.2);
    const rotationTarget = Math.sin(footPhase) * (isMoving ? 0.35 : 0.1);
    const baseX = index === 0 ? -0.25 : 0.25;
    const sideAmplitude = isMoving ? 0.14 : 0.05;
    const sideOffset =
      Math.sin(animation.stridePhase * 0.75 + phaseOffset * 0.5) * sideAmplitude * (index === 0 ? 1 : -1);
    const targetX = baseX + sideOffset;
    boot.position.x = THREE.MathUtils.lerp(boot.position.x, targetX, 0.2);
    boot.rotation.x = THREE.MathUtils.lerp(boot.rotation.x, rotationTarget, 0.25);
  });
  const tiltScale = isMoving ? 1 : 0.35;
  const tiltTarget =
    Math.sin(animation.stridePhase * (isMoving ? WALK_TILT_SPEED : WALK_TILT_SPEED * 0.8)) *
    WALK_TILT_AMOUNT *
    tiltScale;
  animation.groupTilt = THREE.MathUtils.lerp(
    animation.groupTilt ?? 0,
    tiltTarget,
    0.16,
  );
  avatar.group.rotation.z = animation.groupTilt;
  if (animation.externalModel) {
    const bobSpeed = isMoving ? 6.2 : 2.2;
    animation.externalBobPhase += delta * bobSpeed;
    if (animation.externalBobPhase > Math.PI * 2) {
      animation.externalBobPhase -= Math.PI * 2;
    }
    const bobAmplitude = isMoving ? 0.16 : 0.04;
    const bobOffset = Math.sin(animation.externalBobPhase) * bobAmplitude;
    const targetExternalY = (animation.externalModelBaseY || 0) + bobOffset;
    animation.externalModel.position.y = THREE.MathUtils.lerp(
      animation.externalModel.position.y,
      targetExternalY,
      0.25,
    );
    const lateralAmplitude = isMoving ? 0.08 : 0.02;
    const lateralOffset = Math.cos(animation.externalBobPhase * 0.7) * lateralAmplitude;
    const targetExternalX = (animation.externalModelBaseX || 0) + lateralOffset;
    animation.externalModel.position.x = THREE.MathUtils.lerp(
      animation.externalModel.position.x,
      targetExternalX,
      0.25,
    );
  }
}
