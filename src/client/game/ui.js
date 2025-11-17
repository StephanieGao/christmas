import { ensureAudioContext, playChime } from '../audio/audio.js';
import {
  startButton,
  joinButton,
  joinInput,
  hudPanel,
  sessionPanel,
  sessionCodeLabel,
  outfitColorInput,
  accentColorInput,
  outfitSelect,
  hairSelect,
  decorColorInput,
  decorSelect,
  snowToggle,
  photoModeBtn,
  toastEl,
  radialMenu,
  radialButtons,
  storyIntroPanel,
  introContinueBtn,
  customizeToggleBtn,
  customizeModal,
  customizeCloseBtn,
  bulbCountLabel,
  strandBar,
  storyCharacterButtons,
  modalCharacterButtons,
  joinToggleBtn,
  joinCard,
  hudCollapseBtn,
} from '../components/domElements.js';
import { selectCharacter, sendAvatarUpdate, hydrateWorld } from './avatar.js';
import {
  dropStrandBulb,
  isStrandFull,
  beginThrowCharge,
  finishThrowCharge,
  placeDecoration,
} from './strand.js';

export function randomSnowyName() {
  const prefixes = ['Frosty', 'Twinkle', 'Cozy', 'Aurora', 'Starry', 'Maple', 'Pine', 'Velvet'];
  const suffixes = ['Heart', 'Haven', 'Glow', 'Wish', 'Spark', 'Cocoa', 'Holly', 'Wreath'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  return `${prefix}${suffix}`;
}

export function showToast(context, message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => toastEl.classList.remove('visible'), 2400);
}

export function setupUI(context) {
  const { uiState, localState } = context;

  context.showToast = (message) => showToast(context, message);

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
    context.network.ensureConnection();
    context.network.send('create_session', {
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
      context.showToast('Enter a 6-letter invite code.');
      return;
    }
    uiState.awaitingStoryIntro = false;
    uiState.storyComplete = true;
    context.network.ensureConnection();
    context.network.send('join_session', {
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
      completeStoryIntro(context);
    });
  }

  outfitColorInput.addEventListener('input', (event) => {
    localState.avatarColors.outfit = event.target.value;
    context.localPlayer.setColors({ outfit: event.target.value });
    sendAvatarUpdate(context);
  });

  accentColorInput.addEventListener('input', (event) => {
    localState.avatarColors.accent = event.target.value;
    context.localPlayer.setColors({ accent: event.target.value });
    sendAvatarUpdate(context);
  });

  outfitSelect.addEventListener('change', (event) => {
    localState.outfit = event.target.value;
    context.localPlayer.setOutfit(event.target.value);
    sendAvatarUpdate(context);
  });

  hairSelect.addEventListener('change', (event) => {
    localState.hair = event.target.value;
    context.localPlayer.setHair(event.target.value);
    sendAvatarUpdate(context);
  });

  decorColorInput.addEventListener('input', (event) => {
    localState.decorColor = event.target.value;
  });

  decorSelect.addEventListener('change', (event) => {
    localState.decorType = event.target.value;
  });

  snowToggle.addEventListener('click', () => {
    localState.snowMultiplier = localState.snowMultiplier === 1 ? 1.8 : 1;
    context.showToast(
      localState.snowMultiplier > 1 ? 'Snowfall intensified ❄️' : 'Snowfall relaxed ☁️',
    );
  });

  photoModeBtn.addEventListener('click', () => {
    document.body.classList.toggle('photo-mode');
    const label = document.body.classList.contains('photo-mode')
      ? 'Exit Photo Mode'
      : 'Photo Mode';
    photoModeBtn.textContent = label;
  });

  if (customizeToggleBtn) {
    customizeToggleBtn.addEventListener('click', () => openCustomizeModal(context));
  }
  if (customizeCloseBtn) {
    customizeCloseBtn.addEventListener('click', () => closeCustomizeModal(context));
  }
  if (customizeModal) {
    customizeModal.addEventListener('click', (event) => {
      if (event.target === customizeModal) {
        closeCustomizeModal(context);
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
      selectCharacter(context, button.dataset.character, { applyPreset: true });
    });
  });

  modalCharacterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectCharacter(context, button.dataset.character, { applyPreset: true });
    });
  });

  radialButtons.forEach((button) => {
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', () => {
      if (button.disabled || !context.radialState.zone) return;
      applyDecorationToZone(context, context.radialState.zone, button.dataset.type);
    });
  });
  refreshRadialMenuLocks(context);
}

export function setupInput(context) {
  const {
    uiState,
    inputState,
    dragState,
    pointerState,
    cameraOrbit,
    cameraBase,
    AUTO_RESUME_DELAY_MS,
    renderer,
  } = context;

  window.addEventListener('keydown', (event) => {
    if (uiState.customizationOpen) {
      if (event.key === 'Escape') {
        closeCustomizeModal(context);
      }
      return;
    }
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
      case ' ':
        attemptJump(context);
        break;
      case 'shift':
        triggerSpeedBoost(context);
        break;
      case 'q':
        dropStrandBulb(context);
        break;
      case 'e': {
        const zone = context.radialState.zone;
        if (zone) {
          closeRadialMenu(context);
        } else {
          const fakeEvent = { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 };
          attemptDecorationPlacement(context, fakeEvent);
        }
        break;
      }
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
    closeRadialMenu(context);
    ensureAudioContext();
    const zone = intersectDecorZone(context, event);
    if (zone && context.throwState && context.throwState.charging === false) {
      if (beginThrowCharge(context, zone)) {
        context.throwState.pointerId = event.pointerId;
        renderer.domElement.setPointerCapture(event.pointerId);
        return;
      }
    }
    dragState.active = true;
    dragState.moved = false;
    dragState.pointerId = event.pointerId;
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
  });

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (context.throwState.charging && event.pointerId === context.throwState.pointerId) {
      return;
    }
    if (!dragState.active || event.pointerId !== dragState.pointerId) return;
    const deltaX = event.clientX - dragState.lastX;
    const deltaY = event.clientY - dragState.lastY;
    if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
      dragState.moved = true;
    }
    cameraOrbit.yaw -= deltaX * 0.0045;
    cameraOrbit.pitch = Math.min(Math.max(cameraOrbit.pitch + deltaY * 0.0045, 0.1), 1.3);
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
  });

  renderer.domElement.addEventListener('pointerup', (event) => {
    if (context.throwState.charging && event.pointerId === context.throwState.pointerId) {
      renderer.domElement.releasePointerCapture(event.pointerId);
      finishThrowCharge(context);
      return;
    }
    if (event.pointerId !== dragState.pointerId) return;
    renderer.domElement.releasePointerCapture(event.pointerId);
    dragState.active = false;
    const pointerYawOffset = (0.5 - pointerState.x) * 1.6;
    const pointerPitchOffset = (pointerState.y - 0.5) * 0.7;
    cameraBase.yaw = cameraOrbit.yaw - pointerYawOffset;
    cameraBase.pitch = Math.min(
      Math.max(cameraOrbit.pitch - pointerPitchOffset, 0.15),
      1.1,
    );
    if (dragState.moved) {
      context.autoFollowPaused = true;
      if (context.autoResumeTimeout) {
        clearTimeout(context.autoResumeTimeout);
      }
      context.autoResumeTimeout = setTimeout(() => {
        context.autoFollowPaused = false;
      }, AUTO_RESUME_DELAY_MS);
    }

    dragState.moved = false;
  });

  renderer.domElement.addEventListener('pointerleave', () => {
    if (context.throwState.charging) {
      finishThrowCharge(context, true);
    }
    dragState.active = false;
  });

  renderer.domElement.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      cameraOrbit.distance = Math.min(
        Math.max(cameraOrbit.distance + event.deltaY * 0.01, 6),
        26,
      );
    },
    { passive: false },
  );

  window.addEventListener('resize', () => onResize(context));
  window.addEventListener('pointermove', (event) => handlePointerMove(context, event));
  window.addEventListener('touchmove', (event) => handleTouchMove(context, event), {
    passive: false,
  });
}

export function handleSessionJoined(context, data) {
  const { localState, uiState } = context;
  localState.playerId = data.playerId;
  localState.sessionCode = data.code;
  sessionPanel.classList.add('hidden');
  sessionCodeLabel.textContent = data.code;
  hydrateWorld(context, data.state);
  sendAvatarUpdate(context);
  if (uiState.awaitingStoryIntro && !uiState.storyComplete) {
    showStoryIntro(context);
  } else {
    showHudPanel(context);
  }
}

function onResize(context) {
  const { renderer, camera } = context;
  const { innerWidth, innerHeight } = window;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

function handlePointerMove(context, event) {
  const { pointerState } = context;
  pointerState.x = event.clientX / window.innerWidth;
  pointerState.y = event.clientY / window.innerHeight;
}

function handleTouchMove(context, event) {
  const { dragState, pointerState } = context;
  if (dragState.active || event.touches.length !== 1) return;
  const touch = event.touches[0];
  pointerState.x = touch.clientX / window.innerWidth;
  pointerState.y = touch.clientY / window.innerHeight;
}

function showStoryIntro(context) {
  const { uiState } = context;
  if (!storyIntroPanel) return;
  storyIntroPanel.classList.remove('hidden');
  if (strandBar) {
    strandBar.classList.add('hidden');
  }
  uiState.awaitingStoryIntro = true;
}

function completeStoryIntro(context) {
  const { uiState } = context;
  if (!storyIntroPanel) return;
  storyIntroPanel.classList.add('hidden');
  uiState.awaitingStoryIntro = false;
  uiState.storyComplete = true;
  showHudPanel(context);
}

function showHudPanel(context) {
  const { uiState } = context;
  if (storyIntroPanel) {
    storyIntroPanel.classList.add('hidden');
  }
  hudPanel.classList.remove('hidden');
  uiState.storyComplete = true;
  context.showToast('Connected! Invite your partner with the code above.');
  if (customizeToggleBtn) {
    customizeToggleBtn.classList.remove('hidden');
  }
  if (strandBar) {
    strandBar.classList.remove('hidden');
  }
}

function openCustomizeModal(context) {
  if (!customizeModal) return;
  customizeModal.classList.remove('hidden');
  context.uiState.customizationOpen = true;
}

function closeCustomizeModal(context) {
  if (!customizeModal) return;
  customizeModal.classList.add('hidden');
  context.uiState.customizationOpen = false;
}

function attemptDecorationPlacement(context, event) {
  const { localState } = context;
  if (!localState.sessionCode) return;
  const zone = intersectDecorZone(context, event);
  if (zone) {
    if (!isStrandFull(context)) {
      context.showToast('Collect a full strand before decorating!');
      return;
    }
    openRadialMenu(context, zone, { x: event.clientX, y: event.clientY });
  }
}

function intersectDecorZone(context, event) {
  const { decorZones, pointer, raycaster, camera } = context;
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

function openRadialMenu(context, zone, screenPosition) {
  const { radialState } = context;
  if (!radialMenu) return;
  radialState.zone = zone;
  radialMenu.style.left = `${screenPosition.x}px`;
  radialMenu.style.top = `${screenPosition.y}px`;
  radialMenu.classList.remove('hidden');
  radialMenu.classList.add('visible');
  refreshRadialMenuLocks(context);
}

function closeRadialMenu(context) {
  const { radialState } = context;
  if (!radialMenu) return;
  radialState.zone = null;
  radialMenu.classList.remove('visible');
  radialMenu.classList.add('hidden');
}

function applyDecorationToZone(context, zone, typeId) {
  closeRadialMenu(context);
  placeDecoration(context, zone.anchor, zone.normal, {
    typeId,
    cabinId: zone.houseId,
    glow: 0.8,
  });
}

function refreshRadialMenuLocks(context) {
  const { localState } = context;
  radialButtons.forEach((button) => {
    const type = button.dataset.type;
    button.disabled = !localState.unlockedDecor.has(type);
  });
}

function triggerSpeedBoost(context) {
  const { movementState, zoomState } = context;
  movementState.boostTimer = movementState.boostDuration;
  zoomState.target = 1;
  playChime([540, 760]);
}

function attemptJump(context) {
  const { jumpState } = context;
  if (!jumpState.grounded) return;
  jumpState.grounded = false;
  jumpState.velocity = 4.6;
  jumpState.offset = 0.01;
  playChime([520]);
}
