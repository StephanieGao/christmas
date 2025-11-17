import { createGameContext } from './game/context.js';
import { createLocalPlayer, hydrateWorld, sendAvatarUpdate } from './game/avatar.js';
import { initWorld } from './game/world.js';
import { initStrand } from './game/strand.js';
import { setupUI, setupInput, handleSessionJoined } from './game/ui.js';
import { startAnimationLoop } from './game/updates.js';
import { createNetwork } from './models/network.js';

const context = createGameContext();

initWorld(context);
createLocalPlayer(context);
initStrand(context);

const network = createNetwork({
  onSessionJoined: (data) => handleSessionJoined(context, data),
  onSessionState: (state) => hydrateWorld(context, state),
  onError: (message) => {
    if (context.showToast) {
      context.showToast(message);
    }
  },
});

context.network = network;

setupUI(context);
setupInput(context);

setInterval(() => {
  if (context.localState.sessionCode) {
    sendAvatarUpdate(context);
  }
}, 2500);

startAnimationLoop(context);

