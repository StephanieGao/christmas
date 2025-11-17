import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
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
