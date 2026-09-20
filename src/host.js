// MC dashboard on the laptop screen: every control, the answer key, live answers and shots, who is
// connected, whether the projector is up, and a preview of what the audience sees. The projector
// itself (/screen) only shows the game.
import { ANSWERS, shapeSvg } from './config.js';

const $ = id => document.getElementById(id);
const PHASE_NAME = {
  lobby: 'Phòng chờ', countdown: 'Đếm ngược', reading: 'Đang đọc đề', question: 'Đang trả lời', reveal: 'Hiện đáp án', fire: 'Lượt bắn',
  finalreading: 'Đọc đề câu vui', final: 'Câu đố vui', finalreveal: 'Đáp án câu vui', charge: 'Tích nước', unleash: 'Ném bình nước', victory: 'Clip chiến thắng', end: 'Vinh danh Top 5',
};
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
let fearAction = 'fear-wait';

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
    case 'fear':
      renderFear(msg);
      return;
  }
}

// ---- Mở màn: nỗi sợ ----------------------------------------------------------------
// Bốn trạng thái, mỗi trạng thái một việc duy nhất cho MC bấm, để khỏi phải nhớ gì trên sân khấu.
const FEAR_UI = {
  wait: {
    state: 'chờ quét mã',
    button: 'Mở bàn phím cho hội trường',
    action: 'fear-open',
  },
  open: {
    state: 'đang gõ',
    button: '🌪️ Triệu hồi Quái Vật',
    action: 'fear-storm',
  },
  storm: {
    state: 'đang triệu hồi',
    button: 'Đang chiếu…',
    action: null,
  },
  // Máy chiếu đứng yên ở đây cho tới khi MC bấm. Đừng bấm sớm: ngay sau nút này là phòng chờ của
  // game, tức là đấu trường và mấy chục ụ súng — hội trường thấy trước là lộ mất đoạn cuối buổi.
  outro: {
    state: 'câu hỏi đọng lại',
    button: 'Xong phần nội dung · mở phòng chờ game',
    action: 'fear-done',
  },
  done: {
    state: 'chưa chạy',
    button: '▶ Bắt đầu đoạn mở màn',
    action: 'fear-wait',
  },
};

function renderFear(msg) {
  const ui = FEAR_UI[msg.phase] ?? FEAR_UI.done;
  fearAction = ui.action;
  $('fearState').textContent = ui.state;
  $('fearBtn').textContent = ui.button;
  $('fearBtn').disabled = !ui.action;
  $('fearCard').dataset.phase = msg.phase;
  $('fearPeopleNum').textContent = String(msg.people ?? 0);
  $('fearTotalNum').textContent = (msg.total ?? 0).toLocaleString('vi-VN');
  $('fearKindsNum').textContent = String(msg.kinds ?? 0);
  // Top 5 để MC đọc thành lời trước khi bấm; ba cái đầu chính là ba cái lên màn chiếu.
  const top = (msg.words ?? []).slice(0, 5);
  $('fearTop').replaceChildren(...top.map(([text, count], i) => {
    const li = document.createElement('li');
    li.className = i < 3 ? 'hot' : '';
    li.append(
      Object.assign(document.createElement('span'), { textContent: text }),
      Object.assign(document.createElement('b'), { textContent: String(count) }),
    );
    return li;
  }));
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
  if (timer.sig !== sig) Object.assign(timer, { sig, total: Math.max(1, s.endsAt - (s.phaseAt || s.now)) });
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
  $('phaseName').textContent = s.phase === 'fire' && !s.firing ? 'Ngưng bắn' : s.phase === 'reading' || s.phase === 'question' || s.phase === 'reveal' || s.phase === 'fire'
    ? `${PHASE_NAME[s.phase]} · Câu ${s.index + 1}/${s.total}` : PHASE_NAME[s.phase];
  const chip = $('screenChip');
  chip.dataset.state = s.screens > 0 ? 'on' : 'off';
  $('screenText').textContent = s.screens > 1 ? `${s.screens} màn chiếu đang mở` : s.screens ? 'Màn chiếu đã kết nối' : 'Chưa có màn chiếu';
  $('onlineNum').textContent = s.online;
  $('playersNum').textContent = s.players;
}

const charged = s => !!s.charge?.full;

function nextLabel(s) {
  switch (s.phase) {
    case 'lobby': return '▶ Bắt đầu game';
    case 'countdown': return 'Vào câu 1 ngay';
    case 'reading': return 'Mở đáp án ngay';
    case 'question': return 'Khoá & hiện đáp án';
    case 'reveal': return 'Cho cả hội trường bắn!';
    case 'fire': return s.index + 1 >= s.total ? 'Sang câu đố vui cuối' : `Sang câu ${s.index + 2}`;
    case 'finalreading': return 'Mở đáp án ngay';
    case 'final': return 'Khoá & hiện đáp án';
    case 'finalreveal': return '💧 Mở màn tích nước!';
    case 'charge': return charged(s) ? 'Đang ném bình…' : 'Chờ hội trường tap…';
    case 'unleash': return 'Đang ném bình…';
    case 'victory': return 'Đang chiếu clip chiến thắng…';
    case 'end': return '↺ Chơi lại';
    default: return 'Tiếp';
  }
}

function renderControl() {
  const s = state;
  const n = s.index + 1;
  // Tên bước thôi: nút ngay dưới đã nói bước kế tiếp là gì, khỏi cần một đoạn giải thích nữa.
  $('ctrlTitle').textContent = {
    lobby: 'Phòng chờ',
    countdown: 'Đếm ngược',
    question: `Câu ${n}: đang trả lời`,
    reveal: `Đáp án câu ${n}`,
    fire: s.firing ? `Lượt bắn câu ${n}` : 'Ngưng bắn',
    final: 'Câu đố vui cuối',
    finalreveal: 'Đáp án câu vui',
    charge: charged(s) ? 'Bình đã đầy!' : 'Tích nước!',
    unleash: 'Ném bình nước!',
    victory: 'Cả đội cáo cùng chiến thắng!',
    end: 'Kết thúc',
  }[s.phase] ?? '';
  $('fillBtn').hidden = s.phase !== 'charge' || charged(s);
  $('nextBtn').textContent = nextLabel(s);
  // Let the hall finish its bottle and watch the full victory clip before revealing Top 5.
  $('nextBtn').disabled = ['charge', 'unleash', 'victory'].includes(s.phase) || performance.now() < nextLockedUntil;
  $('autoBtn').setAttribute('aria-pressed', String(s.auto));
  $('autoBtn').querySelector('b').textContent = s.auto ? 'BẬT' : 'TẮT';
}

function renderRound() {
  const s = state;
  const hp = Math.round(100 * Math.max(0, Math.min(1, 1 - s.bossDmg / s.bossMax)));
  $('bossPct').textContent = s.bossFellAt >= 0 ? `Gục ở câu ${s.bossFellAt + 1}` : `${hp}%`;
  $('bossFill').style.width = `${hp}%`;
  $('bossFill').parentElement.setAttribute('aria-valuenow', hp);
  const inRound = ['reading', 'question', 'reveal', 'fire'].includes(s.phase);
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
  const current = s && ['reading', 'question', 'reveal', 'fire'].includes(s.phase) ? s.index : -1;
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
  const inRound = ['reading', 'question', 'reveal', 'fire'].includes(s.phase);
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
  if (!state || ['charge', 'unleash', 'victory'].includes(state.phase) || performance.now() < nextLockedUntil) return;
  nextLockedUntil = performance.now() + 900;
  $('nextBtn').disabled = true;
  setTimeout(() => { if (state) renderControl(); }, 900);
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

// ---- Question editor ---------------------------------------------------------------------
// Edits a working copy of data/questions.json and only writes it back on Lưu, so a half-finished
// edit can be abandoned. The server validates again before the file is replaced.

// Câu đố vui cuối buổi cũng là một câu hỏi, nên nó nằm luôn trong danh sách bên trái và sửa
// bằng đúng cái bảng ở giữa. Khoá của nó là một Symbol, nên không đời nào đụng id người ta gõ.
const FINALE_ID = Symbol('finale');
let draft = null;        // the working copy
let picked = null;       // id of the question being edited

const byId = id => draft.questions.find(q => q.id === id);
const benchIds = () => draft.questions.filter(q => !draft.order.includes(q.id)).map(q => q.id);
const current = () => (picked === FINALE_ID ? draft.finale : byId(picked));

async function openEditor() {
  try {
    const res = await fetch(`/api/host/questions?${keyParam}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Lỗi ${res.status}`);
    const { data } = await res.json();
    draft = structuredClone(data);
    draft.finale ??= { id: 'Finale', group: 'Câu đố vui', text: '', options: ['', '', '', ''], answer: 0 };
    picked = draft.order[0] ?? draft.questions[0]?.id ?? null;
    $('editorMsg').textContent = '';
    $('editor').hidden = false;
    renderEditor();
    $('editorClose').focus();
  } catch (err) {
    toast(err.message, 'bad');
  }
}

function closeEditor() {
  $('editor').hidden = true;
  draft = null;
  picked = null;
}

function card(id, q, label) {
  const li = document.createElement('li');
  li.setAttribute('aria-selected', String(id === picked));
  li.innerHTML = `<span class="n">${escapeHtml(label)}</span>
    <span class="t"><b>${escapeHtml(q.text || '(chưa có nội dung)')}</b>${answerBar(q)}</span>`;
  li.addEventListener('click', e => {
    if (e.target.closest('.row-btns')) return;
    picked = id;
    renderEditor();
  });
  return li;
}

// Bốn vạch màu đúng thứ tự A/B/C/D: đậm là ô đã có chữ, viền trắng là đáp án đúng.
function answerBar(q) {
  const bars = ANSWERS.map((a, i) => {
    const cls = [String(q.options?.[i] ?? '').trim() && 'on', q.answer === i && 'right'].filter(Boolean).join(' ');
    return `<i class="${cls}" style="--c:${a.color}"></i>`;
  });
  return `<span class="bar" aria-hidden="true">${bars.join('')}</span>`;
}

function questionRow(id, index, inOrder) {
  const q = byId(id);
  const li = card(id, q, inOrder ? String(index + 1) : '·');
  if (q.answerConfirmed === false) {
    li.append(Object.assign(document.createElement('span'), { className: 'flag', textContent: '⚠', title: 'Đáp án chưa xác nhận' }));
  }
  const btns = document.createElement('span');
  btns.className = 'row-btns';
  if (inOrder) {
    btns.append(
      rowBtn('↑', 'Lên trên', index === 0, () => moveInOrder(index, -1)),
      rowBtn('↓', 'Xuống dưới', index === draft.order.length - 1, () => moveInOrder(index, 1)),
      rowBtn('–', 'Bỏ khỏi ván chơi', draft.order.length <= 1, () => { draft.order.splice(index, 1); renderEditor(); }),
    );
  } else {
    btns.append(rowBtn('+', 'Thêm vào ván chơi', false, () => { draft.order.push(id); renderEditor(); }));
  }
  li.append(btns);
  return li;
}

function finaleRow() {
  return card(FINALE_ID, draft.finale, '★');
}

function rowBtn(label, title, disabled, onClick) {
  const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label, title, disabled });
  b.addEventListener('click', onClick);
  return b;
}

function moveInOrder(index, delta) {
  const to = index + delta;
  if (to < 0 || to >= draft.order.length) return;
  [draft.order[index], draft.order[to]] = [draft.order[to], draft.order[index]];
  renderEditor();
}

const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Ô chữ cao dần theo nội dung. Đáp án dài thì ô cao lên chứ không mọc thanh cuộn tí hon, nên
// người set-up lúc nào cũng đọc được trọn cái mình vừa gõ.
function fitBox(el) {
  el.style.height = 'auto';
  // scrollHeight không tính viền, mà ô lại đo theo border-box: thiếu phần viền là chữ bị hụt.
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
}

function refitEditor() {
  fitBox($('fText'));
  for (const box of $('fOptions').querySelectorAll('textarea')) fitBox(box);
}

// Bốn ô màu đúng như trên màn chiếu, kể cả khi câu này chỉ dùng hai ô: ô trống mờ đi và bị bỏ
// lúc lưu, nên người set-up không phải nghĩ xem "để trống thì sao".
function optionTiles(host, target, onChange) {
  host.replaceChildren(...ANSWERS.map((a, i) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.style.setProperty('--c', a.color);
    tile.style.setProperty('--ledge', a.ledge);
    const shape = Object.assign(document.createElement('span'), { className: 'shape' });
    shape.innerHTML = shapeSvg(a.shape);
    // textarea chứ không phải input một dòng: đáp án dài tới đâu cũng đọc được hết, khỏi phải
    // rê con trỏ trong ô để xem mình vừa gõ gì.
    const text = Object.assign(document.createElement('textarea'), { rows: 2, value: target.options[i] ?? '', maxLength: 160, placeholder: `Đáp án ${a.letter}` });
    text.setAttribute('aria-label', `Nội dung đáp án ${a.letter}`);
    text.addEventListener('input', () => { target.options[i] = text.value; fitBox(text); onChange(); });
    const mark = Object.assign(document.createElement('label'), { className: 'mark', title: `Chọn ${a.letter} làm đáp án đúng` });
    const radio = Object.assign(document.createElement('input'), { type: 'radio', name: `${host.id}-correct`, checked: target.answer === i });
    radio.setAttribute('aria-label', `Đáp án ${a.letter} là đáp án đúng`);
    radio.addEventListener('change', () => { target.answer = i; onChange(); });
    mark.append(radio);
    tile.append(shape, text, mark);
    return tile;
  }));
  for (const box of host.querySelectorAll('textarea')) fitBox(box);
  markTiles(host, target);
}

// Trạng thái của bốn ô (đúng / còn trống) chỉ là hai thuộc tính, đổi được mà không dựng lại ô —
// gõ tới đâu ô sáng lên tới đó mà con trỏ vẫn nằm yên.
function markTiles(host, target) {
  for (const [i, tile] of [...host.children].entries()) {
    tile.dataset.correct = String(target?.answer === i);
    tile.dataset.empty = String(!String(target?.options?.[i] ?? '').trim());
  }
}

function renderEditor() {
  renderEditorLists();
  const unconfirmed = draft.order.filter(id => byId(id)?.answerConfirmed === false).length;
  $('editorCount').textContent = `${draft.order.length} câu${unconfirmed ? ` · ⚠ ${unconfirmed} chưa xác nhận` : ''}`;

  const t = current();
  $('editorEmpty').hidden = !!t;
  $('editorCanvas').hidden = !t;
  if (t) {
    t.options ??= [];
    $('fText').value = t.text ?? '';
    fitBox($('fText'));
    optionTiles($('fOptions'), t, () => renderEditorLists());
  }
  $('fRead').value = draft.readSeconds ?? 10;
  $('fTime').value = draft.timePerQuestion ?? 15;
  $('fReveal').value = draft.revealSeconds ?? 5;
  $('fFire').value = draft.fireSeconds ?? 6;
  $('fCharge').value = draft.chargeSeconds ?? 45;
  $('fShuffle').checked = draft.shuffleOptions !== false;
}

// Typing in a field must not rebuild the field and steal the caret, so only the lists refresh.
function renderEditorLists() {
  $('editorOrder').replaceChildren(...draft.order.map((id, i) => questionRow(id, i, true)));
  $('editorBench').replaceChildren(...benchIds().map(id => questionRow(id, 0, false)));
  $('editorFinale').replaceChildren(finaleRow());
  markTiles($('fOptions'), current());
}

function addQuestion() {
  let n = draft.questions.length + 1;
  while (draft.questions.some(q => q.id === `Q-${n}`)) n++;
  const q = { id: `Q-${n}`, group: '', text: '', options: ['', '', '', ''], answer: 0, answerConfirmed: false };
  draft.questions.push(q);
  draft.order.push(q.id);
  picked = q.id;
  renderEditor();
  $('fText').focus();
}

// Blank option slots are dropped here, and the correct answer follows its text to the new index.
function payload() {
  const trim = t => ({
    ...t,
    options: t.options.map((o, i) => [String(o ?? '').trim(), i]).filter(([o]) => o),
  });
  const shrink = t => {
    const kept = trim(t).options;
    return { ...t, options: kept.map(([o]) => o), answer: Math.max(0, kept.findIndex(([, i]) => i === t.answer)) };
  };
  return {
    readSeconds: Number($('fRead').value),
    timePerQuestion: Number($('fTime').value),
    revealSeconds: Number($('fReveal').value),
    fireSeconds: Number($('fFire').value),
    chargeSeconds: Number($('fCharge').value),
    shuffleOptions: $('fShuffle').checked,
    finale: shrink(draft.finale),
    order: [...draft.order],
    questions: draft.questions.map(shrink),
  };
}

async function saveEditor() {
  const body = payload();
  $('editorSave').disabled = true;
  $('editorMsg').textContent = 'Đang lưu…';
  try {
    const res = await fetch(`/api/host/questions?${keyParam}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
    toast(data.applied ? `Đã lưu ${data.count} câu, áp dụng ngay` : `Đã lưu ${data.count} câu — áp dụng ở ván sau`, 'good');
    closeEditor();
  } catch (err) {
    $('editorMsg').textContent = err.message;
    toast(err.message, 'bad');
  } finally {
    $('editorSave').disabled = false;
  }
}

// The escape hatch on hosting, where the written file does not survive a restart.
function downloadDraft() {
  const blob = new Blob([`${JSON.stringify(payload(), null, 2)}\n`], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'questions.json' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function bindEditor() {
  $('editBtn').addEventListener('click', openEditor);
  $('editorClose').addEventListener('click', closeEditor);
  $('editorCancel').addEventListener('click', closeEditor);
  $('editorSave').addEventListener('click', saveEditor);
  $('editorAdd').addEventListener('click', addQuestion);
  $('editorDownload').addEventListener('click', downloadDraft);
  $('fText').addEventListener('input', e => { const t = current(); fitBox(e.target); if (t) { t.text = e.target.value; renderEditorLists(); } });
  $('editor').addEventListener('keydown', e => { if (e.key === 'Escape') closeEditor(); });
  // Cửa sổ đổi cỡ thì bề rộng ô đổi theo, chiều cao vừa tính lúc trước không còn đúng nữa.
  addEventListener('resize', () => { if (!$('editor').hidden && draft) refitEditor(); });
}

function boot() {
  bindEditor();
  $('nextBtn').addEventListener('click', next);
  $('fillBtn').addEventListener('click', () => action('fill'));
  $('autoBtn').addEventListener('click', () => action('auto'));
  $('resetBtn').addEventListener('click', () => confirm('Reset về phòng chờ? Điểm hiện tại sẽ bị xoá.') && action('reset'));
  $('fearBtn').addEventListener('click', () => {
    if (!fearAction) return;
    // Triệu hồi là đường một chiều giữa lúc đang diễn: hỏi lại một câu trước khi cả hội trường thấy.
    if (fearAction === 'fear-storm' && !confirm('Triệu hồi Quái Vật từ những nỗi sợ này? Bàn phím của hội trường sẽ đóng lại.')) return;
    if (fearAction === 'fear-done' && !confirm('Mở phòng chờ của game lên máy chiếu? Hội trường sẽ thấy đấu trường và mã QR vào chơi.')) return;
    action(fearAction);
  });
  $('fearSkipBtn').addEventListener('click', () => confirm('Bỏ qua đoạn nỗi sợ, về thẳng phòng chờ của game?') && action('fear-skip'));
  $('fearResetBtn').addEventListener('click', () => confirm('Xoá hết chữ hội trường đã gõ và quay lại màn quét mã?') && action('fear-reset'));
  $('csvBtn').href = `/api/host/results.csv?${keyParam}`;
  $('openScreen').addEventListener('click', openScreen);
  $('copyJoin').addEventListener('click', () => state && copy(state.joinUrl, 'Đã sao chép link vào chơi'));
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
    // Typing in the search box or pressing a focused button must not also advance the game,
    // and neither must anything done while the question editor is open over the dashboard.
    if (!$('editor').hidden) return;
    if (e.target instanceof Element && e.target.closest('button, a, input, select, textarea')) return;
    if (e.repeat || !['Enter', 'NumpadEnter', 'ArrowRight', 'Space'].includes(e.code)) return;
    e.preventDefault();
    next();
  });

  connect();
  setInterval(tick, 200);
}

boot();
