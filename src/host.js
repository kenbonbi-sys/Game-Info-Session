// Projector screen for the MC: join QR, live question + answer counts, shared boss, Top 5, CSV export.
import { loadGridSheet } from './sprites.js';
import { SPRITES } from './config.js';

const $ = id => document.getElementById(id);
const LETTERS = 'ABCD';
const BOSS_HP_PER_QUESTION = 700;
const PHASE_LABEL = { lobby: 'Phòng chờ', countdown: 'Chuẩn bị', question: 'Đang trả lời', reveal: 'Đáp án', end: 'Kết thúc' };

let key = new URLSearchParams(location.search).get('key');
try {
  if (key) sessionStorage.setItem('foxquiz.hostKey', key);
  else key = sessionStorage.getItem('foxquiz.hostKey');
} catch { /* storage blocked */ }
key ??= prompt('Nhập host key (in trong terminal khi chạy server):') ?? '';

let state = null;
let offset = 0;
let bossSheet = null;
let flashUntil = 0;
let optionsSig = '';

function connect() {
  const es = new EventSource(`/api/host/events?key=${encodeURIComponent(key)}`);
  es.onopen = () => { $('conn').hidden = true; };
  es.onmessage = e => {
    const s = JSON.parse(e.data);
    offset = s.now - Date.now();
    if (state && s.hallScore > state.hallScore) flashUntil = performance.now() + 180;
    state = s;
    render();
  };
  es.onerror = () => {
    $('conn').hidden = false;
    if (es.readyState === EventSource.CLOSED) $('conn').textContent = 'Sai host key hoặc server đã tắt. Mở lại link màn chiếu in trong terminal.';
  };
}

async function action(name) {
  const res = await fetch(`/api/host/${name}?key=${encodeURIComponent(key)}`, { method: 'POST' });
  if (!res.ok) alert((await res.json().catch(() => ({}))).error || `Lỗi ${res.status}`);
}

function renderTop(list) {
  const ol = document.createElement('ol');
  ol.append(...list.map((p, i) => {
    const li = document.createElement('li');
    const rank = document.createElement('b');
    rank.textContent = ['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`;
    const name = document.createElement('span');
    name.textContent = p.name;
    const score = document.createElement('em');
    score.textContent = `${p.score}`;
    li.append(rank, name, score);
    return li;
  }));
  return ol;
}

function renderQr(url) {
  const box = $('qr');
  if (box.dataset.url === url) return;
  box.dataset.url = url;
  if (!window.qrcode) {
    box.textContent = 'Không tải được QR (thiếu internet), đọc link bên dưới';
    return;
  }
  const qr = window.qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  box.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

function renderLobby(s) {
  const urls = s.joinUrls?.length ? s.joinUrls : [s.joinUrl];
  const pick = $('urlPick');
  if (pick.dataset.sig !== urls.join('\n')) {
    pick.dataset.sig = urls.join('\n');
    pick.replaceChildren(...urls.map(u => Object.assign(document.createElement('option'), { value: u, textContent: u })));
    pick.hidden = urls.length < 2;
  }
  const url = urls.includes(pick.value) ? pick.value : urls[0];
  renderQr(url);
  $('joinUrl').textContent = url;
  $('lobbyCount').textContent = s.players;
  const names = $('names');
  if (names.dataset.sig !== s.names.join('\n')) {
    names.dataset.sig = s.names.join('\n');
    names.replaceChildren(...s.names.map(n => Object.assign(document.createElement('span'), { textContent: n })));
  }
}

function renderPlay(s) {
  const q = s.question;
  const reveal = s.phase === 'reveal';
  $('qMeta').textContent = q ? `Câu ${s.index + 1}/${s.total}${q.group ? ` · ${q.group}` : ''}` : 'Chuẩn bị';
  $('qText').textContent = q ? q.text : 'Quái Vật Dễ Sợ sắp xuất hiện…';
  $('answered').textContent = q ? `${s.answered}/${s.players} người đã trả lời` : '';

  const sig = `${s.phase}:${s.index}:${reveal ? s.counts.join(',') : ''}`;
  if (sig !== optionsSig) {
    optionsSig = sig;
    const total = Math.max(1, s.counts.reduce((a, b) => a + b, 0));
    $('options').replaceChildren(...(q?.options ?? []).map((text, i) => {
      const el = document.createElement('div');
      el.className = `option opt-${i}`;
      const letter = Object.assign(document.createElement('b'), { textContent: LETTERS[i] });
      const label = Object.assign(document.createElement('span'), { textContent: text });
      el.append(letter, label);
      if (reveal) {
        el.classList.add(i === s.answer ? 'correct' : 'dim');
        const bar = document.createElement('i');
        bar.style.width = `${(s.counts[i] / total) * 100}%`;
        el.append(bar, Object.assign(document.createElement('em'), { textContent: s.counts[i] }));
      }
      return el;
    }));
  }

  const max = Math.max(1, s.players) * s.total * BOSS_HP_PER_QUESTION;
  const hp = Math.max(0, 1 - s.hallScore / max);
  $('hallHp').style.width = `${hp * 100}%`;
  $('hallText').textContent = hp === 0 ? 'Quái Vật Dễ Sợ đã bị hạ gục!' : `Cả hội trường đã gây ${s.hallScore.toLocaleString('vi-VN')} sát thương`;
  const top = $('top5');
  top.hidden = !reveal || !s.top.length;
  if (reveal) top.replaceChildren(Object.assign(document.createElement('h3'), { textContent: 'Top 5' }), renderTop(s.top));
}

function renderEnd(s) {
  $('podium').replaceChildren(...renderTop(s.top).children);
  $('endStats').textContent = `${s.players} người chơi · ${s.total} câu hỏi`;
}

function render() {
  const s = state;
  $('players').textContent = s.players;
  $('phaseLabel').textContent = PHASE_LABEL[s.phase] ?? s.phase;
  $('startBtn').hidden = !(s.phase === 'lobby' || s.phase === 'end');
  $('startBtn').textContent = s.phase === 'end' ? 'Chơi lại' : 'Bắt đầu';
  $('nextBtn').hidden = !['countdown', 'question', 'reveal'].includes(s.phase);
  $('nextBtn').textContent = s.phase === 'question' ? 'Hiện đáp án' : 'Câu tiếp';
  $('autoBtn').textContent = `Tự chuyển câu: ${s.auto ? 'BẬT' : 'TẮT'}`;
  const view = s.phase === 'lobby' ? 'lobby' : s.phase === 'end' ? 'end' : 'play';
  for (const id of ['lobby', 'play', 'end']) $(id).hidden = id !== view;
  if (view === 'lobby') renderLobby(s);
  else if (view === 'play') renderPlay(s);
  else renderEnd(s);
}

function drawBoss(now) {
  const canvas = $('bossCanvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!bossSheet || !state) return;
  const { frames, anims } = bossSheet;
  const f = frames[anims.idle.frames[Math.floor(now / 125) % anims.idle.frames.length]];
  const defeated = $('hallHp').style.width === '0%';
  ctx.globalAlpha = defeated ? 0.25 : 1;
  const shake = now < flashUntil ? Math.round(Math.random() * 4 - 2) : 0;
  ctx.drawImage(now < flashUntil ? bossSheet.flashImage : bossSheet.image, f.x, f.y, f.w, f.h, shake, 0, f.w, f.h);
  ctx.globalAlpha = 1;
}

function tick(now) {
  if (state) {
    const left = Math.max(0, state.endsAt - (Date.now() + offset)) / 1000;
    const label = { question: Math.ceil(left), countdown: Math.ceil(left) || '', reveal: '✔' }[state.phase] ?? '';
    $('countdown').textContent = label;
    $('timeFill').style.width = state.phase === 'question' ? `${(left / state.time) * 100}%` : '0%';
  }
  drawBoss(now);
  requestAnimationFrame(tick);
}

$('startBtn').onclick = () => {
  if (state?.phase === 'end' && !confirm('Chơi lại từ đầu? Điểm lượt trước sẽ bị xoá (tải CSV trước nếu cần).')) return;
  action('start');
};
$('nextBtn').onclick = () => action('next');
$('urlPick').onchange = () => state && render();
$('autoBtn').onclick = () => action('auto');
$('resetBtn').onclick = () => confirm('Reset về phòng chờ? Điểm hiện tại sẽ bị xoá.') && action('reset');
$('csvBtn').href = `/api/host/results.csv?key=${encodeURIComponent(key)}`;
addEventListener('keydown', e => {
  if (!state || !(e.code === 'Enter' || e.code === 'ArrowRight')) return;
  if (state.phase === 'lobby') action('start');
  else if (state.phase !== 'end') action('next');
});

loadGridSheet(SPRITES.boss.url, SPRITES.boss).then(sheet => { bossSheet = sheet; }).catch(err => console.warn(err));
connect();
requestAnimationFrame(tick);
