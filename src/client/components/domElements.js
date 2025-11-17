export const canvas = document.getElementById('scene');
export const startButton = document.getElementById('start-session');
export const joinButton = document.getElementById('join-session');
export const joinInput = document.getElementById('join-code');
export const hudPanel = document.getElementById('hud-panel');
export const sessionPanel = document.getElementById('session-panel');
export const sessionCodeLabel = document.getElementById('session-code');
export const outfitColorInput = document.getElementById('outfit-color');
export const accentColorInput = document.getElementById('accent-color');
export const outfitSelect = document.getElementById('outfit-select');
export const hairSelect = document.getElementById('hair-select');
export const decorColorInput = document.getElementById('decor-color');
export const decorSelect = document.getElementById('decor-select');
export const snowToggle = document.getElementById('snow-toggle');
export const photoModeBtn = document.getElementById('photo-mode');
export const toastEl = document.getElementById('toast');
export const radialMenu = document.getElementById('decor-radial');
export const radialButtons = radialMenu
  ? Array.from(radialMenu.querySelectorAll('button[data-type]'))
  : [];
export const storyIntroPanel = document.getElementById('story-intro');
export const introContinueBtn = document.getElementById('intro-continue');
export const customizeToggleBtn = document.getElementById('customize-toggle');
export const customizeModal = document.getElementById('customize-modal');
export const customizeCloseBtn = document.getElementById('customize-close');
export const bulbCountLabel = document.getElementById('bulb-count');
export const strandBar = document.getElementById('strand-bar');
export const throwMeterEl = document.getElementById('throw-meter');
export const throwMeterFill = throwMeterEl ? throwMeterEl.querySelector('.fill') : null;
export const throwMeterLabel = document.getElementById('throw-meter-label');
export const storyCharacterButtons = document.querySelectorAll(
  '#story-character-select .character-card',
);
export const modalCharacterButtons = document.querySelectorAll(
  '#modal-character-select .character-card',
);
export const joinToggleBtn = document.getElementById('join-toggle');
export const joinCard = document.getElementById('join-card');
export const hudCollapseBtn = document.getElementById('hud-collapse');
export const strandSocketsEl = document.getElementById('strand-sockets');
