// BlockVerse human avatar: hair, face, clothes, accessories — all procedural.
import * as THREE from 'three';

export const AV_OPTIONS = {
  body: ['boy', 'girl'],
  skin: ['#ffe0c4', '#f5c9a0', '#e0ac7e', '#c68a5c', '#a0663e', '#7a4a2a', '#5a3620'],
  hair: ['short', 'spiky', 'side', 'long', 'ponytail', 'bun', 'curly', 'mohawk', 'bald'],
  hairColor: ['#1b1b1b', '#3b2416', '#6b3e1f', '#a0622d', '#d9b26a', '#b03a2e', '#e8e8e8', '#5e35b1', '#00acc1', '#ec407a'],
  eyes: ['#3b2416', '#1565c0', '#2e7d32', '#6d4c41', '#455a64'],
  top: ['tshirt', 'shirt', 'hoodie', 'jacket', 'kurta', 'dress', 'vest', 'sports'],
  topColor: ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#ff7043', '#212121', '#fafafa', '#00897b', '#f06292', '#3949ab', '#795548'],
  bottom: ['jeans', 'pants', 'shorts', 'skirt', 'trackpant', 'dhoti'],
  bottomColor: ['#1a237e', '#263238', '#5d4037', '#9e9e9e', '#000000', '#fafafa', '#33691e', '#c2185b', '#4527a0', '#bf360c'],
  shoes: ['#212121', '#fafafa', '#e53935', '#1e88e5', '#6d4c41', '#fdd835'],
  acc: ['none', 'glasses', 'sunglasses', 'cap', 'headphones', 'backpack', 'chain', 'crown'],
};
export const AV_LABELS = {
  body: 'உடல்', skin: 'தோல் நிறம்', hair: 'முடி style', hairColor: 'முடி நிறம்', eyes: 'கண் நிறம்',
  top: 'மேல் dress', topColor: 'மேல் dress நிறம்', bottom: 'கீழ் dress', bottomColor: 'கீழ் dress நிறம்', shoes: 'Shoes', acc: 'Accessory',
};
export const AV_NAMES = {
  boy: '👦 Boy', girl: '👧 Girl', short: 'Short', spiky: 'Spiky', side: 'Side part', long: 'Long', ponytail: 'Ponytail', bun: 'Bun',
  curly: 'Curly', mohawk: 'Mohawk', bald: 'Bald', tshirt: 'T-shirt', shirt: 'Shirt', hoodie: 'Hoodie', jacket: 'Jacket', kurta: 'Kurta',
  dress: 'Frock', vest: 'Vest', sports: 'Jersey', jeans: 'Jeans', pants: 'Pants', shorts: 'Shorts', skirt: 'Skirt', trackpant: 'Track',
  dhoti: 'Veshti', none: 'ஒண்ணுமில்ல', glasses: '👓 Glasses', sunglasses: '🕶️ Cooling', cap: '🧢 Cap', headphones: '🎧 Headset',
  backpack: '🎒 Bag', chain: '📿 Chain', crown: '👑 Crown',
};
export const AV_PRESETS = [
  { body: 'boy', skin: '#e0ac7e', hair: 'short', hairColor: '#1b1b1b', eyes: '#3b2416', top: 'tshirt', topColor: '#1e88e5', bottom: 'jeans', bottomColor: '#1a237e', shoes: '#fafafa', acc: 'none' },
  { body: 'girl', skin: '#e0ac7e', hair: 'long', hairColor: '#1b1b1b', eyes: '#3b2416', top: 'kurta', topColor: '#f06292', bottom: 'pants', bottomColor: '#fafafa', shoes: '#6d4c41', acc: 'none' },
  { body: 'boy', skin: '#c68a5c', hair: 'spiky', hairColor: '#3b2416', eyes: '#3b2416', top: 'hoodie', topColor: '#212121', bottom: 'trackpant', bottomColor: '#263238', shoes: '#e53935', acc: 'headphones' },
  { body: 'girl', skin: '#f5c9a0', hair: 'ponytail', hairColor: '#a0622d', eyes: '#2e7d32', top: 'dress', topColor: '#8e24aa', bottom: 'skirt', bottomColor: '#4527a0', shoes: '#fafafa', acc: 'glasses' },
  { body: 'boy', skin: '#a0663e', hair: 'side', hairColor: '#1b1b1b', eyes: '#3b2416', top: 'shirt', topColor: '#fafafa', bottom: 'dhoti', bottomColor: '#fafafa', shoes: '#6d4c41', acc: 'chain' },
  { body: 'boy', skin: '#e0ac7e', hair: 'mohawk', hairColor: '#00acc1', eyes: '#1565c0', top: 'jacket', topColor: '#795548', bottom: 'jeans', bottomColor: '#263238', shoes: '#212121', acc: 'sunglasses' },
];
export function sanitizeAvatar(a) {
  const out = { ...AV_PRESETS[0] };
  if (a && typeof a === 'object') for (const k in AV_OPTIONS) if (AV_OPTIONS[k].includes(a[k])) out[k] = a[k];
  return out;
}

const matCache = new Map();
function mat(color, rough = 0.75, extra = {}) {
  const k = color + rough + JSON.stringify(extra);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  return matCache.get(k);
}
function mesh(geo, m, x = 0, y = 0, z = 0, parent) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true;
  if (parent) parent.add(o); return o;
}
const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 12);
const sphere = (r, w = 20, h = 16) => new THREE.SphereGeometry(r, w, h);

// Face texture: eyes, brows, nose shading, mouth — drawn once per look
const faceCache = new Map();
function faceTexture(a) {
  const k = [a.skin, a.eyes, a.hairColor, a.body].join();
  if (faceCache.has(k)) return faceCache.get(k);
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = a.skin; g.fillRect(0, 0, 256, 256);
  // soft cheeks
  const blush = (x) => { const r = g.createRadialGradient(x, 165, 2, x, 165, 26); r.addColorStop(0, 'rgba(255,120,120,.28)'); r.addColorStop(1, 'rgba(255,120,120,0)'); g.fillStyle = r; g.fillRect(x - 30, 135, 60, 60); };
  blush(78); blush(178);
  for (const x of [92, 164]) {
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x, 120, 17, 13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = a.eyes; g.beginPath(); g.arc(x, 121, 10, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(x, 121, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 4, 116, 3, 0, Math.PI * 2); g.fill();
    if (a.body === 'girl') { g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, 120, 18, 14, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    g.strokeStyle = a.hairColor === '#e8e8e8' ? '#9e9e9e' : a.hairColor; g.lineWidth = a.body === 'girl' ? 4 : 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - 18, 96); g.quadraticCurveTo(x, 86, x + 18, 94); g.stroke();
  }
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 3; g.beginPath(); g.moveTo(128, 128); g.lineTo(122, 158); g.lineTo(131, 160); g.stroke();
  g.strokeStyle = a.body === 'girl' ? '#c2185b' : '#8d4b3a'; g.lineWidth = a.body === 'girl' ? 6 : 5;
  g.beginPath(); g.arc(128, 172, 20, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  faceCache.set(k, t); return t;
}

export function buildHuman(a) {
  a = sanitizeAvatar(a);
  const g = new THREE.Group();
  const girl = a.body === 'girl';
  const skin = mat(a.skin, 0.6), hairM = mat(a.hairColor, 0.55), top = mat(a.topColor, 0.8), bot = mat(a.bottomColor, 0.85), shoe = mat(a.shoes, 0.5);
  const sw = girl ? 0.9 : 1; // shoulder width factor

  // ---- legs (pivot at hip) ----
  const legs = {};
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(0.13 * side, 0.95, 0); g.add(pivot);
    const bareLeg = ['shorts', 'skirt'].includes(a.bottom) || a.top === 'dress';
    if (a.bottom === 'shorts') { mesh(capsule(0.12, 0.25), bot, 0, -0.2, 0, pivot); mesh(capsule(0.095, 0.45), skin, 0, -0.55, 0, pivot); }
    else if (bareLeg) mesh(capsule(0.095, 0.7), skin, 0, -0.45, 0, pivot);
    else {
      const lc = a.bottom === 'dhoti' ? 0.15 : a.bottom === 'trackpant' ? 0.125 : 0.115;
      mesh(capsule(lc, 0.72), bot, 0, -0.44, 0, pivot);
      if (a.bottom === 'trackpant') mesh(new THREE.BoxGeometry(0.02, 0.8, 0.03), mat('#ffffff'), 0.12 * side, -0.42, 0, pivot);
    }
    const s = mesh(new THREE.BoxGeometry(0.2, 0.12, 0.34), shoe, 0, -0.9, 0.05, pivot);
    s.geometry.translate(0, 0, 0.02);
    legs[side] = pivot;
  }
  // hips / skirt / dhoti
  if (a.bottom === 'skirt' || a.top === 'dress') {
    const col = a.top === 'dress' ? top : bot;
    mesh(new THREE.CylinderGeometry(0.24, 0.42, 0.5, 20, 1, true), col, 0, 0.78, 0, g).material = col.clone();
    g.children[g.children.length - 1].material.side = THREE.DoubleSide;
  } else if (a.bottom === 'dhoti') mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.9, 18), bot, 0, 0.55, 0, g);
  else mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.22, 16), bot, 0, 0.98, 0, g);

  // ---- torso ----
  const torso = mesh(new THREE.CylinderGeometry(0.29 * sw, 0.24, 0.62, 20), top, 0, 1.36, 0, g);
  torso.scale.z = 0.62;
  if (girl) mesh(new THREE.SphereGeometry(0.2, 16, 10), top, 0, 1.43, 0.06, g).scale.set(1.1, 0.55, 0.55);
  mesh(sphere(0.3 * sw, 18, 10), top, 0, 1.62, 0, g).scale.set(1, 0.35, 0.62); // shoulders
  if (a.top === 'kurta') mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.42, 18), top, 0, 0.9, 0, g).scale.z = 0.7;
  if (a.top === 'hoodie') {
    mesh(new THREE.TorusGeometry(0.17, 0.07, 8, 16, Math.PI), top, 0, 1.72, -0.1, g).rotation.x = -0.4;
    mesh(new THREE.BoxGeometry(0.3, 0.12, 0.02), mat(a.topColor, 0.9, { emissive: '#000' }), 0, 1.2, 0.165, g);
    for (const x of [-0.05, 0.05]) mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18), mat('#eeeeee'), x, 1.58, 0.16, g);
  }
  if (a.top === 'jacket') {
    mesh(new THREE.BoxGeometry(0.14, 0.6, 0.02), mat('#fafafa'), 0, 1.35, 0.17, g);
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.06, 0.3, 0.02), top, 0.09 * s, 1.52, 0.18, g).rotation.z = -0.3 * s;
  }
  if (a.top === 'shirt') {
    for (let i = 0; i < 4; i++) mesh(sphere(0.015, 6, 4), mat('#fafafa'), 0, 1.2 + i * 0.12, 0.165, g);
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.1, 0.06, 0.02), top, 0.06 * s, 1.66, 0.15, g).rotation.z = 0.5 * s;
  }
  if (a.top === 'sports') {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.font = 'bold 44px system-ui'; x.textAlign = 'center'; x.fillText('7', 32, 48);
    const t = new THREE.CanvasTexture(c);
    mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: t, transparent: true }), 0, 1.38, -0.155, g).rotation.y = Math.PI;
    mesh(new THREE.BoxGeometry(0.5, 0.04, 0.3), mat('#ffffff'), 0, 1.25, 0, g).scale.z = 0.62;
  }
  // neck
  mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.14, 12), skin, 0, 1.73, 0, g);

  // ---- arms (pivot at shoulder) ----
  const arms = {};
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(0.36 * sw * side, 1.62, 0); g.add(pivot);
    const longSleeve = ['shirt', 'hoodie', 'jacket', 'kurta'].includes(a.top);
    const noSleeve = a.top === 'vest' || a.top === 'dress';
    if (longSleeve) mesh(capsule(0.085, 0.5), top, 0, -0.32, 0, pivot);
    else {
      if (!noSleeve) mesh(capsule(0.095, 0.12), top, 0, -0.1, 0, pivot);
      mesh(capsule(0.07, 0.48), skin, 0, -0.34, 0, pivot);
    }
    mesh(sphere(0.075, 12, 10), skin, 0, -0.66, 0.01, pivot);
    pivot.rotation.z = 0.08 * side;
    arms[side] = pivot;
  }

  // ---- head ----
  const head = new THREE.Group(); head.position.set(0, 1.98, 0); g.add(head);
  const skull = mesh(sphere(0.25, 28, 22), skin, 0, 0, 0, head); skull.scale.set(0.95, 1.08, 1);
  const face = mesh(new THREE.SphereGeometry(0.252, 28, 22, Math.PI / 2 - Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.28, Math.PI * 0.42),
    new THREE.MeshStandardMaterial({ map: faceTexture(a), roughness: 0.6 }), 0, 0, 0, head);
  face.scale.set(0.95, 1.08, 1);
  for (const s of [-1, 1]) mesh(sphere(0.05, 10, 8), skin, 0.235 * s, 0, 0, head).scale.set(0.5, 1, 0.8); // ears
  mesh(sphere(0.035, 10, 8), skin, 0, -0.02, 0.25, head); // nose

  // ---- hair ----
  // hair cap: full crown on top, and a back/sides piece that leaves the face open
  const cap = (r = 0.268, thetaLen = 0.55, yScale = 1.1) => {
    const top = mesh(new THREE.SphereGeometry(r, 26, 12, 0, Math.PI * 2, 0, Math.PI * 0.3), hairM, 0, 0.02, -0.01, head);
    top.scale.set(0.97, yScale, 1.03);
    const gap = 0.62; // radians of open face on each side of +z
    const backG = new THREE.SphereGeometry(r, 26, 16, Math.PI / 2 + gap, Math.PI * 2 - gap * 2, Math.PI * 0.12, Math.PI * (thetaLen - 0.12));
    const bk = mesh(backG, hairM, 0, 0.02, -0.01, head); bk.scale.set(0.97, yScale, 1.03);
    // fringe across the forehead
    const fr = mesh(new THREE.SphereGeometry(r + 0.004, 20, 6, Math.PI / 2 - gap - 0.05, gap * 2 + 0.1, Math.PI * 0.2, Math.PI * 0.12), hairM, 0, 0.02, -0.01, head);
    fr.scale.set(0.97, yScale, 1.03);
    return top;
  };
  const back = (len, w = 0.42) => { const b = mesh(new THREE.BoxGeometry(w, len, 0.12), hairM, 0, -len / 2 + 0.05, -0.17, head); b.geometry.translate(0, 0, 0); return b; };
  switch (a.hair) {
    case 'short': cap(0.268, 0.5); break;
    case 'side': { cap(0.27, 0.52); const f = mesh(sphere(0.14, 14, 10), hairM, 0.08, 0.2, 0.15, head); f.scale.set(1.4, 0.45, 0.7); f.rotation.z = -0.3; break; }
    case 'spiky': cap(0.265, 0.48); for (let i = 0; i < 9; i++) { const an = i / 9 * Math.PI * 2; const s = mesh(new THREE.ConeGeometry(0.06, 0.2, 6), hairM, Math.cos(an) * 0.13, 0.25, Math.sin(an) * 0.13 - 0.02, head); s.rotation.set(Math.sin(an) * 0.6, 0, -Math.cos(an) * 0.6); } mesh(new THREE.ConeGeometry(0.07, 0.24, 6), hairM, 0, 0.32, 0, head); break;
    case 'long': cap(0.272, 0.56); back(0.62, 0.46); for (const s of [-1, 1]) mesh(capsule(0.06, 0.35), hairM, 0.2 * s, -0.18, 0.04, head); break;
    case 'ponytail': { cap(0.27, 0.52); mesh(sphere(0.07, 10, 8), hairM, 0, 0.12, -0.26, head); const t = mesh(capsule(0.075, 0.35), hairM, 0, -0.12, -0.33, head); t.rotation.x = 0.35; break; }
    case 'bun': cap(0.27, 0.52); mesh(sphere(0.12, 16, 12), hairM, 0, 0.24, -0.15, head); break;
    case 'curly': for (let i = 0; i < 40; i++) { const u = Math.random() * Math.PI * 2, v = Math.random() * 0.55; const r = 0.27; mesh(sphere(0.07, 8, 6), hairM, Math.sin(v * Math.PI) * Math.cos(u) * r, Math.cos(v * Math.PI) * r * 1.05 + 0.03, Math.sin(v * Math.PI) * Math.sin(u) * r - 0.02, head); } break;
    case 'mohawk': { const m = mesh(new THREE.BoxGeometry(0.07, 0.16, 0.5), hairM, 0, 0.26, -0.02, head); m.geometry.translate(0, 0, 0); cap(0.258, 0.32, 1.0); break; }
    default: break;
  }
  if (girl && !['long', 'bald', 'curly'].includes(a.hair)) { /* small side locks */ for (const s of [-1, 1]) mesh(capsule(0.04, 0.12), hairM, 0.22 * s, -0.02, 0.06, head); }

  // ---- accessories ----
  if (a.acc === 'glasses' || a.acc === 'sunglasses') {
    const fr = mat('#111', 0.3);
    const lens = a.acc === 'sunglasses' ? new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.1, metalness: 0.5 }) : new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.35 });
    for (const s of [-1, 1]) { mesh(new THREE.TorusGeometry(0.055, 0.01, 6, 16), fr, 0.085 * s, 0.03, 0.245, head); mesh(new THREE.CircleGeometry(0.055, 16), lens, 0.085 * s, 0.03, 0.246, head); }
    mesh(new THREE.BoxGeometry(0.06, 0.012, 0.012), fr, 0, 0.04, 0.25, head);
  }
  if (a.acc === 'cap') { const c = mesh(new THREE.SphereGeometry(0.275, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), mat(a.topColor, 0.7), 0, 0.04, 0, head); c.scale.y = 1.05; mesh(new THREE.BoxGeometry(0.3, 0.025, 0.2), mat(a.topColor, 0.7), 0, 0.1, 0.3, head); }
  if (a.acc === 'headphones') { mesh(new THREE.TorusGeometry(0.28, 0.025, 8, 24, Math.PI), mat('#212121', 0.4), 0, 0.02, 0, head); for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16), mat('#e53935', 0.4), 0.27 * s, 0, 0, head).rotation.z = Math.PI / 2; }
  if (a.acc === 'crown') { const cr = mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.12, 8, 1, true), mat('#ffd700', 0.25, { metalness: 0.9, side: THREE.DoubleSide }), 0, 0.31, 0, head); cr.userData.k = 1; }
  if (a.acc === 'backpack') { mesh(new THREE.BoxGeometry(0.4, 0.5, 0.18), mat('#ff7043', 0.8), 0, 1.35, -0.25, g); }
  if (a.acc === 'chain') { const ch = mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 24), mat('#ffd700', 0.2, { metalness: 0.9 }), 0, 1.6, 0.07, g); ch.rotation.x = Math.PI / 2 + 0.6; }

  g.userData.armL = arms[-1]; g.userData.armR = arms[1];
  g.userData.legL = legs[-1]; g.userData.legR = legs[1];
  g.userData.head = head;
  return g;
}
