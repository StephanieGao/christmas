
let audioCtx;

export function ensureAudioContext() {
  if (audioCtx) return audioCtx;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  audioCtx = new AudioCtor();
  return audioCtx;
}

export function playChime(pitches = [640, 880]) {
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

export function playFootstepSound() {
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
