// Short, synthesized cannon sounds. The browser is unlocked only by a real gesture;
// remote game events never create/resume an AudioContext or queue delayed sounds.
let context, master, splashBuffer;
let installed = false;
let activeVoices = 0;
const nextVoiceAt = { mine: 0, other: 0, boss: 0 };

function unlockAudio(event) {
  if (!event.isTrusted) return;
  try {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    if (!context || context.state === 'closed') {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.45;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -18;
      limiter.knee.value = 6;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      master.connect(limiter);
      limiter.connect(context.destination);
      splashBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.24), context.sampleRate);
      const data = splashBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      for (const key of Object.keys(nextVoiceAt)) nextVoiceAt[key] = 0;
    }
    if (context.state !== 'running') context.resume()?.catch(() => {});
  } catch {
    // Muted/restricted/unsupported audio must never interfere with gameplay.
  }
}

export function initGameAudio() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  // Keep listeners installed so a new gesture can also recover an interrupted
  // mobile audio session. pointerup covers browsers that unlock at touch end.
  for (const type of ['pointerdown', 'pointerup', 'keydown']) {
    document.addEventListener(type, unlockAudio, { capture: true, passive: true });
  }
}

function envelope(gain, start, peak, end) {
  gain.setValueAtTime(0.0001, start);
  gain.exponentialRampToValueAtTime(peak, start + 0.009);
  gain.exponentialRampToValueAtTime(0.0001, end);
}

// Own shots are clearer; group volleys collapse into a quiet, bounded layer.
// `kind: 'boss'` uses a lower pitch so incoming fire is distinguishable.
export function playShotSfx({ own = false, kind = 'water' } = {}) {
  if (!context || context.state !== 'running' || globalThis.document?.hidden) return;
  const isBoss = kind === 'boss';
  const group = isBoss ? 'boss' : own ? 'mine' : 'other';
  const now = context.currentTime;
  if (now < nextVoiceAt[group] || activeVoices >= (own ? 7 : 5)) return;
  nextVoiceAt[group] = now + (own ? 0.065 : 0.11);

  const nodes = [];
  let counted = false;
  const cleanup = () => {
    for (const node of nodes) { try { node.disconnect(); } catch { /* already released */ } }
    if (counted) { activeVoices--; counted = false; }
  };
  try {
    const end = now + (isBoss ? 0.24 : 0.20);
    const volume = isBoss ? 0.14 : own ? 0.25 : 0.11;
    const tone = context.createOscillator();
    const toneGain = context.createGain();
    const splash = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const splashGain = context.createGain();
    nodes.push(tone, toneGain, splash, filter, splashGain);

    tone.type = isBoss ? 'triangle' : 'sine';
    tone.frequency.setValueAtTime(isBoss ? 190 : 590, now);
    tone.frequency.exponentialRampToValueAtTime(isBoss ? 70 : 145, end);
    envelope(toneGain.gain, now, volume, end);
    tone.connect(toneGain);
    toneGain.connect(master);

    splash.buffer = splashBuffer;
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(isBoss ? 900 : 1900, now);
    filter.frequency.exponentialRampToValueAtTime(isBoss ? 300 : 650, end);
    envelope(splashGain.gain, now, volume * 0.65, end);
    splash.connect(filter);
    filter.connect(splashGain);
    splashGain.connect(master);

    activeVoices++;
    counted = true;
    tone.onended = cleanup;
    tone.start(now);
    splash.start(now);
    tone.stop(end + 0.02);
    splash.stop(end);
  } catch {
    for (const node of nodes) { try { node.stop?.(); } catch { /* not started */ } }
    cleanup();
  }
}
