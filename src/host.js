// MC dashboard on the laptop screen: every control, the answer key, live answers and shots, who is
// connected, whether the projector is up, and a preview of what the audience sees. The projector
// itself (/screen) only shows the game.
import { ANSWERS, shapeSvg } from './config.js';

const $ = id => document.getElementById(id);
const PHASE_NAME = { lobby: 'Phòng chờ', countdown: 'Đếm ngược', question: 'Đang trả lời', reveal: 'Hiện đáp án', fire: 'Lượt bắn', end: 'Kết thúc' };
const STATUS_LABEL = { answered: 'Đã chọn', correct: 'Đúng', wrong: 'Sai', timeout: 'Hết giờ', blocked: 'Khiên đỡ' };

let key = new URLSearchParams(location.search).get('key');
try {
  if (key) sessionStorage.setItem('foxquiz.hostKey', key);
  else key = sessionStorage.getItem('foxquiz.hostKey');
} catch { /* storage blocked */ }
key ??= prompt('Nhập host key (in trong terminal khi chạy server):') ?? '';
const keyParam = `key=${encodeURIComponent(key)}`;
const screenUrl = `${location.origin}/screen?${keyParam}`;

let state = null;
let offset = 0;
let round = [];
let logCount = 0;
// The phase timer bar measures against the length of the wait as first seen.
const timer = { sig: '', total: 1 };
const rate = { index: -1, shots: 0, at: 0, perSecond: 0 };
let builtQuestion = '';

function connect() {
  const es = new EventSource(`/api/host/events?${keyParam}&view=admin`);
  es.onopen = () => { $('conn').hidden = true; };
  es.onmessage = e => onMessage(JSON.parse(e.data));
  es.onerror = () => {
    $('conn').hidden = false;
    if (es.readyState === EventSource.CLOSED) $('conn').textContent = 'Sai host key hoặc server đã tắt. Mở lại link bảng điều khiển in trong terminal.';
  };
}

async function action(name, body) {
  try {
    const res = await fetch(`/api/host/${name}?${keyParam}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) toast((await res.json().catch(() => ({}))).error || `Lỗi ${res.status}`, 'bad');
  } catch {
    toast('Không kết nối được server', 'bad');
  }
}

function onMessage(msg) {
  switch (msg.type) {
    case 'state':
      onState(msg);
      return;
    case 'round':
      round = msg.questions;
      renderTimeline();
      renderQuestion();
      return;
    case 'logs':
      $('log').replaceChildren();
      logCount = 0;
      for (const entry of msg.entries) addLog(entry);
      return;
    case 'log':
      addLog(msg.entry);
      return;
  }
}

function onState(s) {
  offset = s.now - Date.now();
  // Shots per second over the last update, smoothed so the number is readable.
  if (s.phase === 'fire' && rate.index === s.index && s.now > rate.at) {
    const instant = ((s.roundShots - rate.shots) * 1000) / (s.now - rate.at);
    rate.perSecond = rate.perSecond * 0.5 + Math.max(0, instant) * 0.5;
  } else if (s.phase !== 'fire') {
    rate.perSecond = 0;
  }
  Object.assign(rate, { index: s.index, shots: s.roundShots, at: s.now });
  state = s;
  document.body.dataset.phase = s.phase;
  const sig = `${s.phase}|${s.index}|${s.firing}|${s.endsAt}`;
  if (timer.sig !== sig) Object.assign(timer, { sig, total: Math.max(1, s.endsAt - s.now) });
  renderTop();
  renderControl();
  renderRound();
  renderJoin();
  renderTimeline();
  renderQuestion();
  renderRoster();
}

// ---- Rendering -------------------------------------------------------------------------

const fmt = n => Number(n ?? 0).toLocaleString('vi-VN');
const secondsLeft = () => (state?.endsAt ? Math.max(0, state.endsAt - (Date.now() + offset)) / 1000 : 0);

function renderTop() {
  const s = state;
  $('phaseName').textContent = s.phase === 'fire' && !s.firing ? 'Ngưng bắn' : s.phase === 'question' || s.phase === 'reveal' || s.phase === 'fire'
    ? `${PHASE_NAME[s.phase]} · Câu ${s.index + 1}/${s.total}` : PHASE_NAME[s.phase];
  const chip = $('screenChip');
  chip.dataset.state = s.screens > 0 ? 'on' : 'off';
  $('screenText').textContent = s.screens > 1 ? `${s.screens} màn chiếu đang mở` : s.screens ? 'Màn chiếu đã kết nối' : 'Chưa có màn chiếu';
  $('onlineNum').textContent = s.online;
  $('playersNum').textContent = s.players;
}

function nextLabel(s) {
  switch (s.phase) {
    case 'lobby': return '▶ Bắt đầu game';
    case 'countdown': return 'Vào câu 1 ngay';
    case 'question': return 'Khoá & hiện đáp án';
    case 'reveal': return 'Cho cả hội trường bắn!';
    case 'fire': return s.index + 1 >= s.total ? 'Kết thúc game' : `Sang câu ${s.index + 2}`;
    case 'end': return '↺ Chơi lại';
    default: return 'Tiếp';
  }
}

function renderControl() {
  const s = state;
  const n = s.index + 1;
  const right = s.answer !== undefined ? s.counts?.[s.answer] ?? 0 : 0;
  const [title, text] = {
    lobby: ['Phòng chờ', `${s.players} người đã vào. Mời mọi người quét QR trên màn chiếu, đủ người thì bắt đầu.`],
    countdown: ['Đếm ngược', 'Câu 1 sắp hiện trên màn chiếu.'],
    question: [`Câu ${n}: đang trả lời`, 'Khi mọi người online đã chọn, đáp án tự hiện sau 1,5 giây.'],
    reveal: [`Đáp án câu ${n}`, s.auto ? 'Tự chuyển sang lượt bắn khi hết giờ.' : 'Đang dừng chờ MC: bấm để cho cả hội trường bắn.'],
    fire: s.firing
      ? [`Lượt bắn câu ${n}`, `${right} người trả lời đúng đang tap bắn.`]
      : ['Ngưng bắn', s.auto ? 'Tự sang câu tiếp theo.' : 'Đang dừng chờ MC: bấm để sang câu tiếp.'],
    end: ['Kết thúc', 'Màn chiếu đang hiện Top 5. Tải CSV để lấy danh sách trao quà.'],
  }[s.phase] ?? ['', ''];
  $('ctrlTitle').textContent = title;
  $('ctrlText').textContent = text;
  $('nextBtn').textContent = nextLabel(s);
  $('autoBtn').setAttribute('aria-pressed', String(s.auto));
  $('autoBtn').querySelector('b').textContent = s.auto ? 'BẬT' : 'TẮT';
}

function renderRound() {
  const s = state;
  const hp = Math.round(100 * Math.max(0, Math.min(1, 1 - s.bossDmg / s.bossMax)));
  $('bossPct').textContent = s.bossFellAt >= 0 ? `Gục ở câu ${s.bossFellAt + 1}` : `${hp}%`;
  $('bossFill').style.width = `${hp}%`;
  $('bossFill').parentElement.setAttribute('aria-valuenow', hp);
  const inRound = ['question', 'reveal', 'fire'].includes(s.phase);
  $('statAnswered').textContent = inRound ? `${s.answered}/${s.players}` : '–';
  $('statRight').textContent = inRound && s.answer !== undefined ? `${s.counts[s.answer] ?? 0} người` : '–';
  $('statShots').textContent = fmt(s.roundShots);
  $('statRate').textContent = `${fmt(Math.round(rate.perSecond))}/giây`;
  $('statTotal').textContent = fmt(s.totalShots);
  const seated = s.roster.filter(r => r[2] >= 0).length;
  $('statSeats').textContent = `${seated}/${s.turrets}`;
}

function renderJoin() {
  const s = state;
  const urls = s.joinUrls?.length ? s.joinUrls : [s.joinUrl];
  const pick = $('urlPick');
  if (pick.dataset.sig !== urls.join('\n')) {
    pick.dataset.sig = urls.join('\n');
    pick.replaceChildren(...urls.map(u => Object.assign(document.createElement('option'), { value: u, textContent: u })));
    pick.hidden = urls.length < 2;
  }
  if (document.activeElement !== pick) pick.value = s.joinUrl;
  $('joinUrl').textContent = s.joinUrl.replace(/^https?:\/\//, '');
  const box = $('qr');
  if (box.dataset.url !== s.joinUrl) {
    box.dataset.url = s.joinUrl;
    if (window.qrcode) {
      const qr = window.qrcode(0, 'M');
      qr.addData(s.joinUrl);
      qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
    } else {
      box.textContent = 'Không tải được QR';
    }
  }
}

function renderTimeline() {
  const nav = $('timeline');
  const s = state;
  const current = s && ['question', 'reveal', 'fire'].includes(s.phase) ? s.index : -1;
  const done = s?.phase === 'end' ? round.length : s && s.index >= 0 ? s.index + (current >= 0 ? 0 : 1) : 0;
  const sig = `${round.map(q => q.id).join()}|${current}|${done}`;
  if (nav.dataset.sig === sig) return;
  nav.dataset.sig = sig;
  nav.replaceChildren(...round.map((q, i) => {
    const el = document.createElement('span');
    el.className = `tl${i === current ? ' current' : i < done ? ' done' : ''}`;
    el.title = `${q.id}${q.group ? ` · ${q.group}` : ''}: ${q.text}${q.unconfirmed ? ' (đáp án chưa xác nhận)' : ''}`;
    el.append(Object.assign(document.createElement('b'), { textContent: i + 1 }), Object.assign(document.createElement('span'), { className: 'id', textContent: q.id }));
    if (q.unconfirmed) el.append(Object.assign(document.createElement('span'), { className: 'flag', textContent: '⚠' }));
    return el;
  }));
}

function renderQuestion() {
  const s = state;
  if (!s) return;
  const q = s.question;
  const meta = q && round.find(r => r.id === q.id);
  $('qWarn').hidden = !meta?.unconfirmed;
  const upcoming = round[q ? s.index + 1 : s.phase === 'end' ? round.length : Math.max(0, s.index + 1)];
  $('qNext').innerHTML = '';
  if (upcoming) $('qNext').append('Câu tiếp theo: ', Object.assign(document.createElement('b'), { textContent: `${upcoming.id} · ${upcoming.text}` }));
  if (!q) {
    builtQuestion = '';
    $('qBadge').textContent = s.phase === 'end' ? 'Đã hết câu hỏi' : `${s.total} câu sẵn sàng`;
    $('qGroup').textContent = '';
    $('qAnswered').textContent = '';
    $('qText').textContent = s.phase === 'end' ? 'Game đã kết thúc.' : 'Câu hỏi sẽ hiện ở đây khi game bắt đầu.';
    $('qOptions').replaceChildren();
    return;
  }
  $('qBadge').textContent = `Câu ${s.index + 1}/${s.total}`;
  $('qGroup').textContent = `${q.id}${q.group ? ` · ${q.group}` : ''}`;
  $('qAnswered').textContent = `${s.answered}/${s.players} đã trả lời · ${s.online} online`;
  const sig = `${s.index}|${q.id}`;
  if (builtQuestion !== sig) {
    builtQuestion = sig;
    $('qText').textContent = q.text;
    $('qOptions').replaceChildren(...q.options.map((text, i) => {
      const a = ANSWERS[i];
      const li = document.createElement('li');
      li.className = 'q-opt';
      li.style.setProperty('--c', a.color);
      li.style.setProperty('--ledge', a.ledge);
      li.innerHTML = `<span class="shape" aria-label="${a.letter}">${shapeSvg(a.shape)}</span>`;
      li.append(
        Object.assign(document.createElement('span'), { className: 'text', textContent: text }),
        Object.assign(document.createElement('span'), { className: 'count', innerHTML: '<i></i><b>0</b>' }),
      );
      return li;
    }));
  }
  const total = Math.max(1, s.answered);
  [...$('qOptions').children].forEach((li, i) => {
    li.classList.toggle('key', i === s.answerKey);
    li.querySelector('.count b').textContent = s.counts[i] ?? 0;
    li.querySelector('.count i').style.setProperty('--p', `${((s.counts[i] ?? 0) / total) * 100}%`);
  });
}

function renderRoster() {
  const s = state;
  const query = $('search').value.trim().toLocaleLowerCase('vi');
  const inRound = ['question', 'reveal', 'fire'].includes(s.phase);
  const rows = s.roster
    .map((r, i) => ({ rank: i + 1, n: r[0], name: r[1], turret: r[2], online: r[3], score: r[4], status: r[6], roundShots: r[7], shots: r[8] }))
    .filter(r => !query || r.name.toLocaleLowerCase('vi').includes(query));
  $('rosterCount').textContent = s.roster.length;
  $('rosterEmpty').hidden = rows.length > 0;
  $('rosterEmpty').textContent = s.roster.length ? 'Không có ai khớp tên này.' : 'Chưa có ai vào phòng.';
  $('roster').replaceChildren(...rows.map(r => {
    const tr = document.createElement('tr');
    tr.className = `${r.online ? 'on' : 'off'}${r.rank <= 5 && r.score > 0 ? ' leader' : ''}`;
    const status = inRound ? r.status || (s.phase === 'question' ? 'pending' : '') : '';
    const cells = [
      [r.rank],
      [r.name, 'name'],
      [r.turret >= 0 ? r.turret + 1 : '–', 'seat'],
      [null],
      [fmt(r.score), 'num'],
      [fmt(s.phase === 'fire' ? r.roundShots : r.shots), 'num'],
    ];
    for (const [text, cls] of cells) {
      const td = document.createElement('td');
      if (cls) td.className = cls;
      if (cls === 'name') {
        td.append(Object.assign(document.createElement('i'), { className: 'dot' }), text);
        td.title = `${text}${r.online ? '' : ' (mất kết nối)'}`;
      } else if (text === null) {
        const chip = Object.assign(document.createElement('span'), { className: `st ${status}`, textContent: STATUS_LABEL[status] ?? (status === 'pending' ? 'Chưa chọn' : '–') });
        td.append(chip);
      } else {
        td.textContent = text;
      }
      tr.append(td);
    }
    return tr;
  }));
}

function addLog(entry) {
  const li = document.createElement('li');
  li.dataset.tone = entry.tone;
  li.append(
    Object.assign(document.createElement('time'), { textContent: new Date(entry.t).toLocaleTimeString('vi-VN', { hour12: false }) }),
    Object.assign(document.createElement('span'), { textContent: entry.text }),
  );
  const list = $('log');
  list.prepend(li);
  while (list.children.length > 200) list.lastElementChild.remove();
  logCount++;
  $('logCount').textContent = logCount;
}

let toastTimer = 0;
function toast(text, tone = 'info') {
  const el = $('toast');
  el.textContent = text;
  el.dataset.tone = tone;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

function tick() {
  if (!state) return;
  const left = secondsLeft();
  const counting = state.endsAt > 0 && left > 0;
  $('phaseTimer').textContent = counting ? `${Math.ceil(left)}s` : state.phase === 'reveal' || (state.phase === 'fire' && !state.firing) ? 'chờ MC' : '';
  $('phaseTimer').hidden = !$('phaseTimer').textContent;
  $('phaseFill').style.width = counting ? `${Math.min(100, (left * 1000 / timer.total) * 100)}%` : '0%';
}

// ---- Controls --------------------------------------------------------------------------

// A short lockout after each press, so a double click can't skip the reveal or the shooting.
let nextLockedUntil = 0;
function next() {
  if (!state || performance.now() < nextLockedUntil) return;
  nextLockedUntil = performance.now() + 900;
  $('nextBtn').disabled = true;
  setTimeout(() => { $('nextBtn').disabled = false; }, 900);
  if (state.phase === 'lobby') return action('start');
  if (state.phase === 'end') {
    if (confirm('Chơi lại từ đầu? Điểm lượt trước sẽ bị xoá (tải CSV trước nếu cần).')) action('start');
    return;
  }
  action('next');
}

function openScreen() {
  const win = window.open(screenUrl, 'foxquiz-screen', 'popup=yes,width=1280,height=720');
  if (!win) {
    toast('Trình duyệt chặn cửa sổ mới. Cho phép popup hoặc dán link màn chiếu vào một cửa sổ khác.', 'bad');
    return;
  }
  win.focus();
  toast('Kéo cửa sổ vừa mở sang máy chiếu, rồi bấm F (hoặc double-click) để toàn màn hình.');
}

async function copy(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    prompt('Sao chép link này:', text);
  }
}

function setPreview(on) {
  $('previewFrame').hidden = !on;
  $('previewOff').hidden = on;
  // Unloading the frame stops its rendering entirely, rather than merely hiding it.
  $('previewFrame').src = on ? `/screen?${keyParam}&preview=1` : 'about:blank';
  try { localStorage.setItem('foxquiz.preview', on ? '1' : '0'); } catch { /* storage blocked */ }
}

function selectTab(logTab) {
  $('tabPlayers').setAttribute('aria-selected', String(!logTab));
  $('tabLog').setAttribute('aria-selected', String(logTab));
  $('panelPlayers').hidden = logTab;
  $('panelLog').hidden = !logTab;
}

function boot() {
  $('nextBtn').addEventListener('click', next);
  $('autoBtn').addEventListener('click', () => action('auto'));
  $('resetBtn').addEventListener('click', () => confirm('Reset về phòng chờ? Điểm hiện tại sẽ bị xoá.') && action('reset'));
  $('csvBtn').href = `/api/host/results.csv?${keyParam}`;
  $('openScreen').addEventListener('click', openScreen);
  $('copyJoin').addEventListener('click', () => state && copy(state.joinUrl, 'Đã sao chép link vào chơi'));
  $('copyScreen').addEventListener('click', () => copy(screenUrl, 'Đã sao chép link màn chiếu'));
  $('urlPick').addEventListener('change', e => action('joinurl', { url: e.target.value }));
  $('search').addEventListener('input', () => state && renderRoster());
  $('tabPlayers').addEventListener('click', () => selectTab(false));
  $('tabLog').addEventListener('click', () => selectTab(true));
  $('previewToggle').addEventListener('change', e => setPreview(e.target.checked));
  let preview = true;
  try { preview = localStorage.getItem('foxquiz.preview') !== '0'; } catch { /* storage blocked */ }
  $('previewToggle').checked = preview;
  setPreview(preview);

  addEventListener('keydown', e => {
    // Typing in the search box or pressing a focused button must not also advance the game.
    if (e.target instanceof Element && e.target.closest('button, a, input, select, textarea')) return;
    if (e.repeat || !['Enter', 'NumpadEnter', 'ArrowRight', 'Space'].includes(e.code)) return;
    e.preventDefault();
    next();
  });

  connect();
  setInterval(tick, 200);
}

boot();
