// Nhạc nền kiểu Kahoot cho máy chiếu, tự tổng hợp bằng Web Audio — không có file nhạc nào phải tải.
// Hai bài: "lobby" (sảnh chờ, vui, nhún nhảy) và "question" (lúc đọc đề / trả lời, dồn dập như
// đồng hồ). Bài câu hỏi có 3 lớp: 1 = đọc đề (bass + tiếng tích tắc), 2 = đang trả lời (thêm
// marimba và trống), 3 = 5 giây cuối (trống dồn, hi-hat dày). Đổi lớp không phát lại từ đầu.
//
// Nhạc chỉ kêu khi cửa sổ máy chiếu đã được mở tiếng (bấm F hoặc click một lần), giống tiếng bắn.
import { audioOut } from './audio.js';

const LOOKAHEAD = 0.2;    // giây lên lịch trước, đủ để một khung hình giật không làm hụt nhịp
const TICK_MS = 50;
const FADE = 0.35;

const midi = m => 440 * 2 ** ((m - 69) / 12);

// ---- Bài nhạc -------------------------------------------------------------------------------
// Mỗi bài là bộ gõ 16 nốt móc kép một ô nhịp. `bars` là hợp âm từng ô: gốc bass và ba nốt hợp âm.

const LOBBY = {
  bpm: 116,
  volume: 0.55,
  bars: [
    { root: 41, chord: [65, 69, 72] },   // F
    { root: 38, chord: [62, 65, 69] },   // Dm
    { root: 46, chord: [62, 65, 70] },   // Bb
    { root: 48, chord: [64, 67, 72] },   // C
  ],
  // Giai điệu chỉ vào ở vòng thứ hai của mỗi 8 ô nhịp: bốn ô đầu để groove thở.
  melody: [
    { 0: 72, 2: 69, 4: 72, 6: 74, 8: 72, 10: 69, 12: 65 },
    { 0: 69, 3: 69, 4: 72, 6: 74, 8: 77, 10: 74, 12: 72, 14: 69 },
    { 0: 74, 2: 72, 4: 70, 6: 69, 8: 70, 10: 72, 12: 74 },
    { 0: 76, 2: 74, 4: 72, 6: 67, 8: 72, 14: 67 },
  ],
};

const QUESTION = {
  bpm: 138,
  volume: 0.5,
  bars: [
    { root: 45, chord: [57, 60, 64] },   // Am
    { root: 41, chord: [57, 60, 65] },   // F
    { root: 43, chord: [55, 59, 62] },   // G
    { root: 40, chord: [56, 59, 64] },   // E
  ],
  arp: [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 4, 5, 4, 3, 2],
};

function lobbyStep(v, step, t, d) {
  const bar = LOBBY.bars[Math.floor(step / 16) % 4];
  const s = step % 16;
  if (s === 0 || s === 8 || s === 10) kick(v, t, 0.7);
  if (s === 4 || s === 12) clap(v, t, 0.32);
  if (s % 4 === 2) hat(v, t, 0.14);
  const bass = { 0: 0, 3: 12, 6: 7, 8: 0, 11: 12, 14: 7 }[s];
  if (bass !== undefined) tone(v, t, midi(bar.root + bass), d * 1.6, 'triangle', 0.34);
  if (s % 4 === 2) for (const n of bar.chord) tone(v, t, midi(n), d * 0.9, 'square', 0.035, 2600);
  const lead = Math.floor(step / 64) % 2 === 1 && LOBBY.melody[Math.floor(step / 16) % 4][s];
  if (lead) {
    tone(v, t, midi(lead + 12), d * 1.8, 'square', 0.05, 3400);
    tone(v, t, midi(lead), d * 1.8, 'triangle', 0.09);
  }
}

function questionStep(v, step, t, d, level) {
  const bar = QUESTION.bars[Math.floor(step / 16) % 4];
  const s = step % 16;
  // Tiếng đồng hồ: mọi móc đơn, nhấn ở đầu phách.
  if (s % 2 === 0) tick(v, t, s % 4 === 0 ? 0.22 : 0.12, s % 4 === 0 ? 1900 : 1500);
  if (s % 2 === 0) tone(v, t, midi(bar.root + (s === 6 || s === 14 ? 12 : 0)), d * 1.4, 'square', 0.08, 700);
  if (level >= 2) {
    const tones = [...bar.chord, ...bar.chord.map(n => n + 12)];
    marimba(v, t, midi(tones[QUESTION.arp[s]] + (level >= 3 ? 12 : 0)), level >= 3 ? 0.13 : 0.11);
    if (s === 0 || s === 8 || (level >= 3 && s % 4 === 0)) kick(v, t, 0.6);
    if (level >= 3 && (s === 4 || s === 12)) clap(v, t, 0.26);
  }
  if (level >= 3 && s % 2 === 1) hat(v, t, 0.1);
}

// ---- Nhạc cụ tổng hợp -----------------------------------------------------------------------

let noise = null;
function noiseBuffer(ctx) {
  if (noise?.sampleRate === ctx.sampleRate && noise.ctx === ctx) return noise.buffer;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.3), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise = { ctx, sampleRate: ctx.sampleRate, buffer };
  return buffer;
}

function release(nodes, source) {
  source.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch { /* đã nhả */ } } };
}

function tone({ ctx, bus }, t, freq, dur, type, vol, cutoff) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const nodes = [osc, gain];
  if (cutoff) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    osc.connect(lp).connect(gain);
    nodes.push(lp);
  } else {
    osc.connect(gain);
  }
  gain.connect(bus);
  release(nodes, osc);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function marimba(v, t, freq, vol) {
  tone(v, t, freq, 0.22, 'sine', vol);
  tone(v, t, freq * 4, 0.05, 'sine', vol * 0.25);
}

function kick({ ctx, bus }, t, vol) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.13);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.connect(gain).connect(bus);
  release([osc, gain], osc);
  osc.start(t);
  osc.stop(t + 0.2);
}

function noiseHit({ ctx, bus }, t, vol, dur, type, freq) {
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = noiseBuffer(ctx);
  filter.type = type;
  filter.frequency.value = freq;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(bus);
  release([src, filter, gain], src);
  src.start(t);
  src.stop(t + dur + 0.01);
}

const hat = (v, t, vol) => noiseHit(v, t, vol, 0.035, 'highpass', 7000);
const clap = (v, t, vol) => noiseHit(v, t, vol, 0.13, 'bandpass', 1600);

function tick(v, t, vol, freq) {
  tone(v, t, freq, 0.03, 'sine', vol);
}

// ---- Bộ lên lịch ----------------------------------------------------------------------------

const want = { track: null, level: 1 };
let playing = null;   // { track, bus, step, at }
let enabled = true;
let timer = 0;

function startTrack(out, track) {
  const { context: ctx, master } = out;
  const bus = ctx.createGain();
  const volume = (track === 'lobby' ? LOBBY : QUESTION).volume;
  bus.gain.setValueAtTime(0.0001, ctx.currentTime);
  bus.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + FADE);
  bus.connect(master);
  playing = { track, bus, ctx, step: 0, at: ctx.currentTime + 0.06 };
}

function stopTrack(fade = FADE) {
  if (!playing) return;
  const { bus, ctx } = playing;
  const now = ctx.currentTime;
  bus.gain.cancelScheduledValues(now);
  bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), now);
  bus.gain.exponentialRampToValueAtTime(0.0001, now + fade);
  setTimeout(() => { try { bus.disconnect(); } catch { /* đã nhả */ } }, (fade + LOOKAHEAD) * 1000 + 100);
  playing = null;
}

function pump() {
  const out = audioOut();
  if (!out) return;
  const track = enabled ? want.track : null;
  if (playing && (playing.track !== track || playing.ctx !== out.context)) stopTrack();
  if (!playing && track) startTrack(out, track);
  if (!playing) return;
  const song = playing.track === 'lobby' ? LOBBY : QUESTION;
  const d = 60 / song.bpm / 4;
  const v = { ctx: playing.ctx, bus: playing.bus };
  // Máy chiếu bị treo quá lâu thì nhảy tới hiện tại, đừng xả một tràng nốt dồn lại.
  if (playing.at < out.context.currentTime - 0.1) playing.at = out.context.currentTime + 0.02;
  while (playing.at < out.context.currentTime + LOOKAHEAD) {
    try {
      if (playing.track === 'lobby') lobbyStep(v, playing.step, playing.at, d);
      else questionStep(v, playing.step, playing.at, d, want.level);
    } catch { /* một nốt hỏng không được làm câm cả bài */ }
    playing.step = (playing.step + 1) % 128;
    playing.at += d;
  }
}

// track: 'lobby' | 'question' | null (im). level chỉ có nghĩa với 'question'.
export function setMusic(track, level = 1) {
  want.track = track;
  want.level = level;
  if (!timer && typeof window !== 'undefined') timer = setInterval(pump, TICK_MS);
}

export function setMusicEnabled(on) {
  enabled = !!on;
}

// Hiệu ứng ngắn: 'reveal' khi lật đáp án, 'count' cho mỗi nhịp đếm ngược (n = số đang hiện).
export function playSting(kind, n = 0) {
  const out = audioOut();
  if (!out || !enabled) return;
  const ctx = out.context;
  const bus = ctx.createGain();
  bus.gain.value = 0.6;
  bus.connect(out.master);
  const v = { ctx, bus };
  const t = ctx.currentTime + 0.02;
  try {
    if (kind === 'reveal') {
      stopTrack(0.12);
      noiseHit(v, t, 0.35, 0.5, 'lowpass', 900);
      kick(v, t, 0.8);
      [60, 64, 67, 72].forEach((m, i) => tone(v, t + i * 0.07, midi(m + 12), 0.14, 'square', 0.06, 3000));
      for (const m of [60, 64, 67, 72]) tone(v, t + 0.28, midi(m), 1.1, 'triangle', 0.1);
    } else if (kind === 'count') {
      tone(v, t, n <= 1 ? 1320 : 880, 0.12, 'square', 0.07, 2400);
      tone(v, t, n <= 1 ? 660 : 440, 0.16, 'triangle', 0.12);
    }
  } catch { /* hiệu ứng hỏng thì thôi */ }
  setTimeout(() => { try { bus.disconnect(); } catch { /* đã nhả */ } }, 2000);
}
