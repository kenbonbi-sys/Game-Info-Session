// A transparent, refillable version of the fox bottle: orange fox lid,
// fox sticker and green/orange charm, with water confined to the vessel.
const VIEW_WIDTH = 180;
const VIEW_HEIGHT = 280;
const BODY = 'M55 96H125C124 123 140 141 140 163V236Q140 260 116 262H64Q40 260 40 236V163C40 141 56 123 55 96Z';
const INSIDE = 'M60 102H120C120 128 135 144 135 164V235Q135 256 115 257H65Q45 256 45 235V164C45 144 60 128 60 102Z';
const WATER = 'M32 0Q49 -5 66 0T100 0T134 0T168 0V180H32Z';
let nextBottleId = 0;

const shape = (tag, attributes) => ({ tag, ...attributes });
const path = (d, fill, stroke, width = 1) => shape('path', { d, fill, stroke, 'stroke-width': width });
const circle = (cx, cy, r, fill) => shape('circle', { cx, cy, r, fill });
const ellipse = (cx, cy, rx, ry, fill) => shape('ellipse', { cx, cy, rx, ry, fill });

// Shared geometry makes the airborne bottle identical to the bottle being filled.
const BACK = [
  path('M127 87C157 79 157 110 148 121', 'none', '#af672d', 5),
  path('M127 87C153 82 153 107 147 119', 'none', '#fff3c1', 2),
  path('M149 104L160 216', 'none', '#91bb49', 9),
  path('M146 123L152 162', 'none', '#fe892f', 14),
  ...[127, 134, 141, 148, 155].map(y => path(`M141 ${y}L156 ${y - 1}`, 'none', '#ffd088', 2)),
  circle(156, 179, 8, '#ecedac'),
  circle(158, 198, 8, '#e3e89c'),
  shape('rect', { x: 152, y: 210, width: 16, height: 18, rx: 3, fill: '#ffb572' }),
  circle(162, 239, 8, '#a9d268'),
  path(BODY, '@glass', '#c3e4e3', 2.5),
];

const FRONT = [
  // Glass catches the light while remaining transparent above the waterline.
  path('M58 130Q48 154 49 193', 'none', '#ffffffa6', 5),
  path('M50 201V219', 'none', '#ffffff80', 4),
  path('M128 167V228Q129 249 113 251', 'none', '#ffffff52', 3),
  path('M47 236Q90 246 133 236', 'none', '#ffbe77', 3),
  path('M53 247Q90 255 127 247', 'none', '#fff0ca', 2),
  ...[149, 170, 191, 212].map(y => path(`M125 ${y}H132`, 'none', '#ffffff9c', 2)),
  // Small fox sticker, leaving the majority of the water visible.
  path('M72 179L66 162Q78 162 83 172M96 172Q104 161 112 164L108 183', '#fb8940', '#fff3d8', 1.5),
  path('M68 187Q64 173 84 171Q109 167 115 186Q115 202 96 210Q77 211 68 196Z', '#ff934a', '#fff3d8', 2),
  path('M68 185Q78 195 88 190Q97 195 115 181Q118 203 96 208Q73 207 68 185Z', '#fff6e0'),
  ellipse(84, 184, 3, 4, '#493026'),
  ellipse(103, 181, 3, 4, '#493026'),
  path('M90 191Q94 187 98 190Q95 196 90 191Z', '#493026'),
  path('M92 197Q97 200 100 194', 'none', '#b16443', 1.5),
  ellipse(77, 191, 4, 2, '#ffc09b'),
  ellipse(108, 188, 4, 2, '#ffc09b'),
  path('M85 210L88 221L95 216L102 219L103 206', '#6cadbd', '#fff3d8', 1.5),
  // Wide orange screw cap.
  path('M53 83H127L129 104Q91 111 51 104Z', '@cap', '#ef8436', 2),
  path('M53 91Q90 96 128 91', 'none', '#ffcd80', 2),
  ...[62, 71, 80, 89, 98, 107, 116].map(x => path(`M${x} 97V102`, 'none', '#d77631', 1.2)),
  path('M45 68Q43 60 54 59H126Q137 60 135 71L130 86Q91 94 50 85Z', '@cap', '#ff9a46', 2),
  path('M55 65Q88 70 125 64', 'none', '#ffd297', 3),
  // The original bottle's fox-head lid.
  path('M59 39Q48 18 58 7Q72 11 81 29M101 29Q113 12 126 7Q135 22 123 43', '#ff974b', '#ef7439', 2.5),
  path('M61 31L59 14Q69 18 74 29M110 29Q117 18 125 14L122 33', '#ffc3c6'),
  path('M55 54Q55 25 89 25Q124 24 128 52L131 65Q93 77 51 64Z', '@fox', '#ef8436', 1.5),
  path('M54 51Q68 51 85 63Q91 66 98 61Q113 49 128 52L129 63Q111 73 91 71Q68 73 52 63Z', '#fff8e6'),
  ellipse(75, 49, 6, 7, '#382723'),
  ellipse(109, 48, 6, 7, '#382723'),
  circle(77, 47, 1.7, '#fff9eb'),
  circle(111, 46, 1.7, '#fff9eb'),
  path('M67 39L80 44M101 43L114 38', 'none', '#fff8e6', 3.5),
  path('M86 58Q90 54 95 57Q91 63 86 58Z', '#493026'),
  path('M85 65Q91 68 98 63', 'none', '#b96943', 1.5),
  ellipse(65, 60, 5, 2, '#ffcfbb'),
  ellipse(118, 59, 5, 2, '#ffcfbb'),
];

function clampProgress(progress) {
  const value = Number(progress);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function attributes(node, prefix) {
  return Object.entries(node).filter(([key, value]) => key !== 'tag' && value != null)
    .map(([key, value]) => `${key}="${String(value).startsWith('@') ? `url(#${prefix}-${String(value).slice(1)})` : value}"`).join(' ');
}

function svgShapes(nodes, prefix) {
  return nodes.map(node => `<${node.tag} ${attributes(node, prefix)}/>`).join('');
}

/** Mount once per DOM element. setBottleFill uses a 0..1 fill fraction. */
export function mountBottle(element, { idPrefix = 'fox-bottle' } = {}) {
  if (!element) return null;
  const prefix = `${String(idPrefix).replace(/[^a-zA-Z0-9_-]/g, '') || 'fox-bottle'}-${++nextBottleId}`;
  element.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="fox-water-vessel" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" role="img" aria-label="Bình nước cáo — 0%" style="display:block;width:100%;height:100%;overflow:visible" stroke-linecap="round" stroke-linejoin="round">
    <defs>
      <linearGradient id="${prefix}-glass" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#fff9dd" stop-opacity=".26"/><stop offset=".48" stop-color="#fffefa" stop-opacity=".08"/><stop offset="1" stop-color="#d8f4ef" stop-opacity=".24"/></linearGradient>
      <linearGradient id="${prefix}-water" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#8ff1f6"/><stop offset=".45" stop-color="#35c4e5"/><stop offset="1" stop-color="#2798c8"/></linearGradient>
      <linearGradient id="${prefix}-cap" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffba6f"/><stop offset=".45" stop-color="#ff983c"/><stop offset="1" stop-color="#ed7930"/></linearGradient>
      <linearGradient id="${prefix}-fox" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffac5e"/><stop offset="1" stop-color="#f77f33"/></linearGradient>
      <clipPath id="${prefix}-inside"><path d="${INSIDE}"/></clipPath>
    </defs>
    ${svgShapes(BACK, prefix)}
    <g clip-path="url(#${prefix}-inside)">
      <g data-bottle-water style="transform:translateY(259px);transition:transform 650ms cubic-bezier(.2,.7,.2,1);opacity:0">
        <path d="${WATER}" fill="url(#${prefix}-water)"/>
        <path d="M32 0Q49 -5 66 0T100 0T134 0T168 0" fill="none" stroke="#d2ffff" stroke-width="2.5"/>
        <circle cx="62" cy="26" r="3" fill="#edffff" opacity=".65"/><circle cx="116" cy="49" r="2" fill="#edffff" opacity=".7"/><circle cx="74" cy="84" r="2.5" fill="#edffff" opacity=".5"/>
      </g>
    </g>
    ${svgShapes(FRONT, prefix)}
  </svg>`;
  element.dataset.bottleFill = '0';
  return element.querySelector('svg');
}

/** The surrounding element is always transparent; only the inner liquid moves. */
export function setBottleFill(element, progress) {
  if (!element) return;
  let water = element.querySelector('[data-bottle-water]');
  if (!water) {
    mountBottle(element);
    water = element.querySelector('[data-bottle-water]');
  }
  const fill = clampProgress(progress);
  const level = 259 - fill * 160;
  water.style.transform = `translateY(${level}px)`;
  water.style.opacity = fill > 0 ? '1' : '0';
  const window = element.ownerDocument?.defaultView;
  water.style.transitionDuration = window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? '0ms' : '650ms';
  element.dataset.bottleFill = String(fill);
  element.querySelector('svg')?.setAttribute('aria-label', `Bình nước cáo — ${Math.round(fill * 100)}%`);
}

const paths = new Map();
function canvasPath(d) {
  if (!paths.has(d)) paths.set(d, new Path2D(d));
  return paths.get(d);
}

function paintShapes(ctx, nodes, gradients) {
  for (const node of nodes) {
    let outline;
    if (node.tag === 'path') {
      outline = canvasPath(node.d);
    } else {
      outline = new Path2D();
      if (node.tag === 'circle') outline.arc(node.cx, node.cy, node.r, 0, Math.PI * 2);
      if (node.tag === 'ellipse') outline.ellipse(node.cx, node.cy, node.rx, node.ry, 0, 0, Math.PI * 2);
      if (node.tag === 'rect') outline.roundRect(node.x, node.y, node.width, node.height, node.rx || 0);
    }
    if (node.fill && node.fill !== 'none') {
      ctx.fillStyle = node.fill.startsWith('@') ? gradients[node.fill.slice(1)] : node.fill;
      ctx.fill(outline);
    }
    if (node.stroke) {
      ctx.strokeStyle = node.stroke;
      ctx.lineWidth = node['stroke-width'] || 1;
      ctx.stroke(outline);
    }
  }
}

/** Draw into a canvas; x/y are top-left, rotation is radians about its centre. */
export function drawBottle(ctx, x, y, width, height, progress = 1, rotation = 0) {
  if (!ctx || width <= 0 || height <= 0) return;
  const fill = clampProgress(progress);
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate(rotation);
  ctx.scale(width / VIEW_WIDTH, height / VIEW_HEIGHT);
  ctx.translate(-VIEW_WIDTH / 2, -VIEW_HEIGHT / 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const glass = ctx.createLinearGradient(40, 0, 140, 0);
  glass.addColorStop(0, '#fff9dd42');
  glass.addColorStop(.48, '#fffefa14');
  glass.addColorStop(1, '#d8f4ef3d');
  const cap = ctx.createLinearGradient(0, 59, 0, 109);
  cap.addColorStop(0, '#ffba6f');
  cap.addColorStop(.45, '#ff983c');
  cap.addColorStop(1, '#ed7930');
  const fox = ctx.createLinearGradient(0, 25, 0, 70);
  fox.addColorStop(0, '#ffac5e');
  fox.addColorStop(1, '#f77f33');
  const gradients = { glass, cap, fox };
  paintShapes(ctx, BACK, gradients);
  if (fill > 0) {
    ctx.save();
    ctx.clip(canvasPath(INSIDE));
    ctx.translate(0, 259 - fill * 160);
    const water = ctx.createLinearGradient(0, 0, 0, 180);
    water.addColorStop(0, '#8ff1f6');
    water.addColorStop(.45, '#35c4e5');
    water.addColorStop(1, '#2798c8');
    ctx.fillStyle = water;
    ctx.fill(canvasPath(WATER));
    ctx.strokeStyle = '#d2ffff';
    ctx.lineWidth = 2.5;
    ctx.stroke(canvasPath('M32 0Q49 -5 66 0T100 0T134 0T168 0'));
    paintShapes(ctx, [circle(62, 26, 3, '#edffffa6'), circle(116, 49, 2, '#edffffb3'), circle(74, 84, 2.5, '#edffff80')], gradients);
    ctx.restore();
  }
  paintShapes(ctx, FRONT, gradients);
  ctx.restore();
}
