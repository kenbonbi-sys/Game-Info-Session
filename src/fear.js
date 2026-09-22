// Điện thoại ở đoạn mở màn: chỉ là một ô gõ chữ. Chữ gửi lên nằm trên màn chiếu, không nằm ở đây —
// người ta phải ngẩng lên nhìn đám mây lớn dần, đó mới là phần đáng xem.
const $ = id => document.getElementById(id);

const net = { pid: null, es: null };
const state = { phase: 'connecting' };
const mine = [];

const session = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* chế độ riêng tư */ } },
};

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

// ---- Kết nối ---------------------------------------------------------------------

async function join() {
  const saved = session.get('foxfear.pid');
  if (saved) {
    net.pid = saved;
    connect();
    return;
  }
  const r = await post('/api/fear/join', {});
  if (!r.ok) {
    $('waitText').textContent = 'Không kết nối được, thử tải lại trang nhé.';
    return;
  }
  net.pid = r.data.pid;
  session.set('foxfear.pid', net.pid);
  connect();
}

function connect() {
  net.es?.close();
  const es = new EventSource('/api/fear/events');
  net.es = es;
  es.onopen = () => { $('conn').hidden = true; };
  es.onmessage = e => onMessage(JSON.parse(e.data));
  es.onerror = () => { $('conn').hidden = false; };
}

function onMessage(msg) {
  if (msg.type !== 'fear') return;
  state.phase = msg.phase;
  render();
}

// ---- Gửi chữ ---------------------------------------------------------------------

let sending = false;

async function send(text) {
  if (sending) return;
  sending = true;
  $('fearSend').disabled = true;
  $('fearError').textContent = '';
  try {
    const r = await post('/api/fear/word', { pid: net.pid, text });
    if (!r.ok) throw new Error(r.data.error || `Lỗi ${r.status}`);
    // Server trả về chữ của người gõ đầu tiên nếu trùng: đó mới là chữ hiện trên màn chiếu.
    addMine(r.data.text ?? text);
    $('fearInput').value = '';
    toast(r.data.full ? 'Màn chiếu đã đầy chữ rồi!' : 'Đã gửi lên màn chiếu!');
  } catch (err) {
    $('fearError').textContent = err instanceof TypeError ? 'Mất mạng, thử lại nhé' : err.message;
  } finally {
    sending = false;
    $('fearSend').disabled = false;
    // Bàn phím ở lại: gõ tiếp là chuyện bình thường, không phải ngoại lệ.
    $('fearInput').focus();
  }
}

function addMine(text) {
  mine.unshift(text);
  const li = document.createElement('li');
  li.textContent = text;
  $('mine').prepend(li);
  while ($('mine').childElementCount > 12) $('mine').lastElementChild.remove();
}

let toastTimer = 0;

function toast(text) {
  const el = $('banner');
  el.textContent = text;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('pop'), 1600);
}

// ---- Vẽ ---------------------------------------------------------------------------

// Điện thoại đang nằm trong túi hoặc trên đùi: một nhịp rung dài một giây là cách duy nhất
// nói được "tới lượt bạn gõ" mà không cần ai nhìn màn hình.
// Trình duyệt chỉ cho rung sau khi người ta đã chạm vào trang, nên lần rung bị nuốt sẽ được
// hẹn lại cho cú chạm kế tiếp.
let buzzPending = false;

function buzz() {
  if (!navigator.vibrate) return;
  // Trang chưa được chạm lần nào thì Chrome nuốt lệnh rung — có khi còn trả về true. Nên chỉ coi
  // là rung thật khi máy đã có tương tác; không thì để cú chạm kế tiếp rung bù.
  const landed = navigator.vibrate(1000) && (navigator.userActivation?.hasBeenActive ?? true);
  buzzPending = !landed;
}

function armBuzzRetry() {
  const retry = () => {
    if (buzzPending && !$('typeView').hidden) buzz();
  };
  addEventListener('pointerdown', retry);
  $('fearInput').addEventListener('focus', retry);
}

function render() {
  const view = state.phase === 'open' ? 'type'
    : ['storm', 'outro', 'done'].includes(state.phase) ? 'storm'
    : 'wait';
  const opened = view === 'type' && $('typeView').hidden;
  document.body.dataset.phase = state.phase;
  $('waitView').hidden = view !== 'wait';
  $('typeView').hidden = view !== 'type';
  $('stormView').hidden = view !== 'storm';
  if (view === 'wait') {
    $('waitTitle').textContent = state.phase === 'connecting' ? 'Đang kết nối…' : 'Chờ MC một chút…';
  }
  if (opened) buzz();
  if (view !== 'type') buzzPending = false;
}

function boot() {
  const setHeight = () => {
    const viewport = window.visualViewport;
    const height = viewport && Math.abs(viewport.scale - 1) < 0.05 ? viewport.height : innerHeight;
    document.documentElement.style.setProperty('--app-height', `${height}px`);
    document.documentElement.style.setProperty('--viewport-top', `${viewport?.offsetTop ?? 0}px`);
    // Bàn phím ăn mất nửa màn hình: nói cho CSS biết để thu gọn câu hỏi thay vì đẩy chữ ra ngoài.
    document.body.dataset.keyboard = String(document.activeElement === $('fearInput') && height < innerHeight - 100);
  };
  setHeight();
  addEventListener('resize', setHeight);
  window.visualViewport?.addEventListener('resize', setHeight);
  window.visualViewport?.addEventListener('scroll', setHeight);
  $('fearInput').addEventListener('focus', setHeight);
  $('fearInput').addEventListener('blur', setHeight);
  armBuzzRetry();

  $('fearForm').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('fearInput').value.trim();
    if (!text) return;
    send(text);
  });
  render();
  join();
}

boot();
