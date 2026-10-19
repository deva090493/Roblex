// BlockVerse client: Three.js world + Socket.io multiplayer
import * as THREE from 'three';

const COLORS = ['#ff5533', '#33aaff', '#44dd66', '#ffcc22', '#bb55ff', '#ff66aa'];
let myColor = COLORS[0];
const $ = id => document.getElementById(id);

// ---------- Start screen ----------
COLORS.forEach((c, i) => {
  const b = document.createElement('button');
  b.style.background = c;
  if (i === 0) b.className = 'sel';
  b.onclick = () => { myColor = c; [...$('colors').children].forEach(x => x.className = ''); b.className = 'sel'; };
  $('colors').appendChild(b);
});
try { $('nameIn').value = localStorage.getItem('bv_name') || ''; } catch {}

// ---------- Three.js setup ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY_TOP = new THREE.Color('#3d8bff'), SKY_BOTTOM = new THREE.Color('#cfeaff');
scene.fog = new THREE.Fog(SKY_BOTTOM, 45, 160);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 400);

// Gradient sky dome
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: SKY_TOP }, bottom: { value: SKY_BOTTOM } },
  vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.6, h)), 1.0); }'
}));
scene.add(sky);
// Sun disc
const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8), new THREE.MeshBasicMaterial({ color: '#fff6d0', fog: false }));
sunDisc.position.set(120, 160, 90); scene.add(sunDisc);

scene.add(new THREE.HemisphereLight('#dff1ff', '#6b5a3e', 0.85));
const sun = new THREE.DirectionalLight('#fff3dd', 1.6);
sun.castShadow = true;
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
sun.shadow.camera.far = 200;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// Drifting clouds (persist across rooms)
const clouds = new THREE.Group(); scene.add(clouds);
{
  const cm = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.92 });
  const r = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 18; i++) {
    const c = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(r(6, 12), r(2, 4), r(5, 9)), cm);
      m.position.set(r(-5, 5), r(-1, 1), r(-3, 3)); c.add(m);
    }
    c.position.set(r(-150, 150), r(55, 85), r(-150, 150));
    clouds.add(c);
  }
}

// Roblox-style stud texture (white so block colors tint it)
const studCanvas = document.createElement('canvas'); studCanvas.width = studCanvas.height = 64;
{
  const g = studCanvas.getContext('2d');
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
  g.strokeStyle = 'rgba(0,0,0,.10)'; g.lineWidth = 2; g.strokeRect(1, 1, 62, 62);
  const grd = g.createRadialGradient(28, 28, 2, 32, 32, 14);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.7, '#e6e6e6'); grd.addColorStop(1, 'rgba(0,0,0,.18)');
  g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 13, 0, Math.PI * 2); g.fill();
}
const studBase = new THREE.CanvasTexture(studCanvas);
studBase.wrapS = studBase.wrapT = THREE.RepeatWrapping;
studBase.colorSpace = THREE.SRGBColorSpace;
studBase.anisotropy = 4;
const studCache = {};
function studTex(w, d) {
  const k = Math.round(w * 2) + 'x' + Math.round(d * 2);
  if (!studCache[k]) { const t = studBase.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, w / 1.5), Math.max(1, d / 1.5)); studCache[k] = t; }
  return studCache[k];
}

// Particle bursts (coins, KO, save points)
const bursts = [];
const burstGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
function burst(x, y, z, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(burstGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.set(x, y, z);
    scene.add(m);
    bursts.push({ m, v: new THREE.Vector3((Math.random() - .5) * 6, Math.random() * 6 + 2, (Math.random() - .5) * 6), life: 0.9 });
  }
}
function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.life -= dt; b.v.y -= 15 * dt;
    b.m.position.addScaledVector(b.v, dt);
    b.m.rotation.x += dt * 8; b.m.material.opacity = Math.max(0, b.life / 0.9);
    if (b.life <= 0) { scene.remove(b.m); b.m.material.dispose(); bursts.splice(i, 1); }
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- World building ----------
let world = new THREE.Group(); scene.add(world);
let solids = [];      // {box: Box3, mesh, kill?, checkpoint?, finish?, portal?, move?}
let spawn = new THREE.Vector3(0, 2, 0);

function block(x, y, z, w, h, d, color, opts = {}) {
  const mat = opts.opacity
    ? new THREE.MeshStandardMaterial({ color, transparent: true, opacity: opts.opacity, emissive: color, emissiveIntensity: 0.35, roughness: 0.3 })
    : new THREE.MeshStandardMaterial({ color, map: studTex(w, d), roughness: 0.85, metalness: 0.02, emissive: opts.kill ? color : '#000', emissiveIntensity: opts.kill ? 0.4 : 0 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  world.add(m);
  const s = { mesh: m, box: new THREE.Box3().setFromObject(m), solid: opts.solid !== false, ...opts };
  solids.push(s);
  return s;
}
function label(text, x, y, z, color = '#fff') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, 0, 512, 128);
  g.font = 'bold 64px system-ui'; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c) }));
  sp.position.set(x, y, z); sp.scale.set(4, 1, 1);
  world.add(sp); return sp;
}
function clearWorld() { scene.remove(world); world = new THREE.Group(); scene.add(world); solids = []; }

export const GAMES = [
  { id: 'obby', name: 'Obby Parkour', icon: '🏃', color: '#ff8800', desc: 'Jump பண்ணி finish வரை போங்க · +50' },
  { id: 'tag', name: 'Tag Chase', icon: '🏷️', color: '#aa33ff', desc: 'IT கிட்ட மாட்டாம ஓடுங்க · +20' },
  { id: 'coinrush', name: 'Coin Rush', icon: '🪙', color: '#ffcc00', desc: 'எல்லா coins-ஐயும் சேருங்க · +2/+10' },
  { id: 'lava', name: 'Lava Rise', icon: '🌋', color: '#ff3d00', desc: 'Lava ஏறுறதுக்கு முன்னாடி மேல ஏறுங்க · +30' },
  { id: 'fight', name: 'Fight Arena', icon: '🥊', color: '#d50000', desc: 'Punch பண்ணி KO பண்ணுங்க · +15 ஒவ்வொரு KO' },
  { id: 'floor', name: 'Block Party', icon: '🟦', color: '#2979ff', desc: 'சொன்ன color-ல மட்டும் நில்லுங்க · +3' },
];
const ROOM_LABEL = { hub: '🏠 Hub', ...Object.fromEntries(GAMES.map(g => [g.id, g.icon + ' ' + g.name])) };

function buildHub() {
  clearWorld();
  block(0, -0.5, 0, 60, 1, 60, '#5cb85c');
  block(0, 0.02, 0, 6, 0.05, 40, '#d7ccc8', { solid: false });   // path
  block(0, 0.02, 0, 40, 0.05, 6, '#d7ccc8', { solid: false });
  // pond
  const water = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.1, 32), new THREE.MeshStandardMaterial({ color: '#29b6f6', transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.3 }));
  water.position.set(14, 0.06, 12); world.add(water);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; block(14 + Math.cos(a) * 5.4, 0.25, 12 + Math.sin(a) * 5.4, 1, 0.5, 1, '#9e9e9e'); }
  // trees
  const rnd = mulberry(3);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, r = 22 + rnd() * 5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, th = 2 + rnd() * 2;
    block(x, th / 2, z, 1.2, th, 1.2, '#6d4c41');
    const g = ['#2e7d32', '#388e3c', '#43a047'][i % 3];
    block(x, th + 1, z, 4, 2, 4, g);
    block(x, th + 2.6, z, 2.6, 1.4, 2.6, g);
  }
  // flowers
  for (let i = 0; i < 40; i++) {
    const x = (rnd() - .5) * 50, z = (rnd() - .5) * 50;
    if (Math.abs(x) < 4 || Math.abs(z) < 4) continue;
    block(x, 0.15, z, 0.3, 0.3, 0.3, ['#ff5252', '#ffeb3b', '#e040fb', '#ffffff'][i % 4], { solid: false });
  }
  // Portals in an arc
  GAMES.forEach((g, i) => {
    const a = -Math.PI / 2 + (i - (GAMES.length - 1) / 2) * 0.5;
    const x = Math.cos(a) * 13, z = Math.sin(a) * 13;
    const pt = block(x, 2, z, 3.5, 4, 0.5, g.color, { opacity: 0.6, solid: false, portal: g.id });
    pt.mesh.rotation.y = -a - Math.PI / 2; pt.box.setFromObject(pt.mesh);
    block(x, 0.1, z, 4, 0.2, 2, '#333');
    label(g.icon + ' ' + g.name, x, 5, z, '#fff');
  });
  label('BLOCKVERSE', 0, 9, -18, '#ffd84d');
  spawn.set(0, 2, 5);
}

function buildObby() {
  clearWorld();
  block(0, -0.5, 0, 10, 1, 10, '#cccccc');
  block(0, -6, -60, 200, 1, 200, '#ff3333', { kill: true }); // lava floor
  const cols = ['#ff7f50', '#4fc3f7', '#aed581', '#ffd54f', '#ba68c8'];
  let z = -8, y = 0, cp = 0;
  for (let i = 0; i < 26; i++) {
    const isCp = i % 4 === 3;
    const w = isCp ? 3 : 2.4 - (i % 3) * 0.4;
    const x = Math.sin(i * 0.9) * 4;
    y += (i % 4 === 3) ? 0.9 : 0.25;
    const s = block(x, y, z, w, 0.5, w, isCp ? '#00c853' : cols[i % cols.length]);
    if (i % 5 === 2 && !isCp) s.move = { axis: 'x', amp: 2.5, speed: 1 + i * 0.05, base: x };
    if (i % 7 === 6) { // kill bar
      block(x, y + 1, z, w, 0.3, 0.3, '#ff2222', { kill: true, solid: false, spin: true });
    }
    if (isCp) {
      cp++;
      block(x, y + 0.6, z, w, 0.6, w, '#00e676', { solid: false, checkpoint: cp, opacity: 0.0001 });
      block(x + w / 2 - 0.2, y + 1.6, z, 0.12, 2.6, 0.12, '#eeeeee', { solid: false }); // flag pole
      block(x + w / 2 + 0.25, y + 2.5, z, 0.8, 0.5, 0.05, '#00e676', { solid: false });
      label('💾 ' + cp, x, y + 3.6, z, '#b9f6ca');
    }
    z -= 3.6;
  }
  block(0, y + 0.5, z - 2, 8, 1, 8, '#ffd700', { finish: true });
  label('🏆 FINISH', 0, y + 4, z - 2, '#ffd700');
  block(0, 1.5, 4, 4, 3, 0.5, '#33aaff', { opacity: 0.6, solid: false, portal: 'hub' });
  label('🏠 Hub', 0, 4, 4);
  spawn.set(0, 2, 0);
}

function buildTag() {
  clearWorld();
  block(0, -0.5, 0, 50, 1, 50, '#d2b48c');
  for (const [x, z] of [[-25, 0], [25, 0], [0, -25], [0, 25]])
    block(x, 2, z, x ? 1 : 50, 4, z ? 1 : 50, '#7a5230');
  const rnd = mulberry(7);
  for (let i = 0; i < 18; i++) {
    const x = (rnd() - 0.5) * 40, z = (rnd() - 0.5) * 40;
    if (Math.hypot(x, z) < 5) continue;
    const h = 1 + Math.floor(rnd() * 3);
    block(x, h / 2, z, 2 + rnd() * 3, h, 2 + rnd() * 3, ['#8d6e63', '#78909c', '#a1887f'][i % 3]);
  }
  block(0, 1.5, 22, 4, 3, 0.5, '#33aaff', { opacity: 0.6, solid: false, portal: 'hub' });
  label('🏠 Hub', 0, 4, 22);
  spawn.set(0, 2, 0);
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function arena(size, floorColor, wallColor) {
  block(0, -0.5, 0, size, 1, size, floorColor);
  const h = size / 2;
  for (const [x, z, w, d] of [[-h, 0, 1, size], [h, 0, 1, size], [0, -h, size, 1], [0, h, size, 1]])
    block(x, 2, z, w, 4, d, wallColor);
}

let coinMeshes = {}; // id -> {mesh, data, pending}
const coinGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 16);
function addCoin(c) {
  const m = new THREE.Mesh(coinGeo, new THREE.MeshLambertMaterial({ color: c.gold ? '#ffd700' : '#c0c0c0', emissive: c.gold ? '#553300' : '#222' }));
  m.rotation.x = Math.PI / 2; m.position.set(c.x, c.y, c.z); m.castShadow = true;
  if (c.gold) m.scale.setScalar(1.4);
  world.add(m); coinMeshes[c.id] = { mesh: m, data: c, pending: false };
}
function buildCoinRush() {
  clearWorld(); coinMeshes = {};
  arena(50, '#7cb342', '#5d4037');
  const rnd = mulberry(21);
  for (let i = 0; i < 10; i++) block((rnd() - .5) * 38, 0.75, (rnd() - .5) * 38, 3, 1.5, 3, '#a1887f');
  block(0, 1.5, 22, 4, 3, 0.5, '#33aaff', { opacity: 0.6, solid: false, portal: 'hub' });
  label('🏠 Hub', 0, 4, 22);
  spawn.set(0, 2, 0);
}

const LAVA_RATE = 0.3, LAVA_START = -2;
let lava = null, lavaT0 = 0, lavaDead = false;
function buildLava() {
  clearWorld();
  block(0, -0.5, 0, 30, 1, 30, '#616161');
  // spiral tower
  const steps = 30;
  for (let i = 0; i < steps; i++) {
    const a = i * 0.55, r = 7 + Math.sin(i * 1.3) * 1.5;
    block(Math.cos(a) * r, 0.6 + i * 1.15, Math.sin(a) * r, 2.6, 0.5, 2.6, i % 2 ? '#8d6e63' : '#bcaaa4');
  }
  block(0, 15, 0, 3, 32, 3, '#424242'); // center pillar
  const top = block(0, 35, 0, 7, 0.5, 7, '#ffd700', { lavaTop: true });
  label('🏆 TOP', 0, 38, 0, '#ffd700');
  // stairs from top platform edge down to last step
  const lastA = (steps - 1) * 0.55, lastR = 7 + Math.sin((steps - 1) * 1.3) * 1.5;
  block(Math.cos(lastA) * lastR * 0.6, 34.4, Math.sin(lastA) * lastR * 0.6, 2.6, 0.5, 2.6, '#bcaaa4');
  // spectator cloud
  block(28, 44, 0, 8, 0.5, 8, '#eeeeee');
  label('👀 அடுத்த round-க்கு wait', 28, 47, 0);
  lavaT0 = performance.now();
  lava = new THREE.Mesh(new THREE.BoxGeometry(34, 1, 34), new THREE.MeshBasicMaterial({ color: '#ff4500', transparent: true, opacity: 0.85 }));
  world.add(lava);
  block(14, 1.5, 0, 0.5, 3, 4, '#33aaff', { opacity: 0.6, solid: false, portal: 'hub' });
  label('🏠 Hub', 14, 4, 0);
  spawn.set(0, 2, 10);
}
function lavaY() { return LAVA_START + ((performance.now() - lavaT0) / 1000) * LAVA_RATE; }

const FLOOR_PALETTE = ['#e53935', '#43a047', '#1e88e5', '#fdd835', '#8e24aa'];
const FLOOR_NAMES = ['சிவப்பு', 'பச்சை', 'நீலம்', 'மஞ்சள்', 'ஊதா'];
let tiles = [], floorPhase = { color: 0, drop: false, round: 0 };
function buildFloor() {
  clearWorld(); tiles = [];
  const N = 10, S = 3;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++)
    tiles.push(block((i - N / 2 + .5) * S, -0.25, (j - N / 2 + .5) * S, S - 0.05, 0.5, S - 0.05, '#fff'));
  colorTiles(0);
  block(0, 9, -22, 8, 0.5, 6, '#eeeeee'); // spectator
  label('👀 Wait', 0, 12, -22);
  block(0, 10, -24.5, 3, 3, 0.5, '#33aaff', { opacity: 0.6, solid: false, portal: 'hub' });
  spawn.set(0, 3, 0);
}
function colorTiles(round) {
  const rnd = mulberry(round * 7919 + 1);
  for (const t of tiles) { t.colorIdx = Math.floor(rnd() * FLOOR_PALETTE.length); t.mesh.material.color.set(FLOOR_PALETTE[t.colorIdx]); }
}
function applyFloor() {
  if (room !== 'floor') return;
  colorTiles(floorPhase.round);
  for (const t of tiles) {
    const keep = !floorPhase.drop || t.colorIdx === floorPhase.color;
    t.solid = keep; t.mesh.visible = keep;
  }
  const bar = $('floorBar');
  bar.style.display = 'block';
  bar.style.background = FLOOR_PALETTE[floorPhase.color];
  bar.textContent = floorPhase.drop ? '⬇️ DROP!' : `${FLOOR_NAMES[floorPhase.color]} color-ல நில்லுங்க!`;
  // spectators rejoin when the floor comes back
  if (!floorPhase.drop && pos.y > 6) { pos.copy(spawn); vel.set(0, 0, 0); }
}

function buildFight() {
  clearWorld();
  // floating boxing ring over the void — knock people off!
  block(0, -0.5, 0, 22, 1, 22, '#eceff1');
  block(0, 0.02, 0, 18, 0.05, 18, '#c62828', { solid: false });
  for (const [x, z] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) {
    block(x, 1.2, z, 0.6, 2.4, 0.6, '#212121');
    block(x, 2.5, z, 0.8, 0.3, 0.8, '#ffd600');
  }
  for (const h of [0.9, 1.7]) { // ropes (visual only)
    block(0, h, -11, 22, 0.1, 0.1, '#ffffff', { solid: false });
    block(0, h, 11, 22, 0.1, 0.1, '#ffffff', { solid: false });
    block(-11, h, 0, 0.1, 0.1, 22, '#ffffff', { solid: false });
    block(11, h, 0, 0.1, 0.1, 22, '#ffffff', { solid: false });
  }
  // cover crates in the middle
  block(-4, 0.6, 3, 1.4, 1.2, 1.4, '#8d6e63');
  block(4, 0.6, -3, 1.4, 1.2, 1.4, '#8d6e63');
  // stands + lights for atmosphere
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    block(Math.cos(a) * 20, 1, Math.sin(a) * 20, i % 2 ? 2 : 16, 6, i % 2 ? 16 : 2, '#37474f');
  }
  label('🥊 FIGHT ARENA', 0, 8, -14, '#ff5252');
  block(0, 1.5, 10.5, 3, 3, 0.5, '#33aaff', { opacity: 0.6, solid: false, portal: 'hub' });
  label('🏠 Hub', 0, 4, 10.5);
  const rnd = Math.random;
  spawn.set((rnd() - .5) * 14, 2, (rnd() - .5) * 14);
}
const hpOf = {}; // id -> hp
function setHP(id, hp) {
  hpOf[id] = hp;
  const av = id === myId ? me : others[id]?.av;
  if (av) { av.userData.hp.scale.x = Math.max(0.01, hp / 100) * 1.4; av.userData.hp.material.color.set(hp > 50 ? '#00e676' : hp > 25 ? '#ffc400' : '#ff1744'); }
  if (id === myId) $('hpInfo').textContent = `❤️ ${hp}`;
}
function doPunch() {
  if (room !== 'fight' || !socket) return;
  if (me.userData.punchT > 0) return;
  me.userData.punchT = 0.3;
  socket.emit('fight:punch');
}

// ---------- Avatars ----------
function makeAvatar(color, name) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const skin = new THREE.MeshLambertMaterial({ color: '#ffd29c' });
  const dark = new THREE.MeshLambertMaterial({ color: '#334' });
  const part = (geo, m, x, y, z) => { const p = new THREE.Mesh(geo, m); p.position.set(x, y, z); p.castShadow = true; g.add(p); return p; };
  part(new THREE.BoxGeometry(0.8, 0.8, 0.4), mat, 0, 1.1, 0);           // torso
  part(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin, 0, 1.75, 0);         // head
  part(new THREE.BoxGeometry(0.08, 0.08, 0.02), dark, -0.11, 1.8, 0.26); // eyes
  part(new THREE.BoxGeometry(0.08, 0.08, 0.02), dark, 0.11, 1.8, 0.26);
  g.userData.armL = part(new THREE.BoxGeometry(0.3, 0.8, 0.3), skin, -0.55, 1.1, 0);
  g.userData.armR = part(new THREE.BoxGeometry(0.3, 0.8, 0.3), skin, 0.55, 1.1, 0);
  g.userData.legL = part(new THREE.BoxGeometry(0.35, 0.7, 0.35), dark, -0.2, 0.35, 0);
  g.userData.legR = part(new THREE.BoxGeometry(0.35, 0.7, 0.35), dark, 0.2, 0.35, 0);
  // name tag
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d'); x.font = 'bold 36px system-ui'; x.fillStyle = '#fff'; x.textAlign = 'center';
  x.strokeStyle = '#000'; x.lineWidth = 6; x.strokeText(name, 128, 44); x.fillText(name, 128, 44);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  tag.position.y = 2.4; tag.scale.set(2, 0.5, 1); g.add(tag);
  // "IT" crown (hidden by default)
  const crown = part(new THREE.ConeGeometry(0.3, 0.4, 4), new THREE.MeshBasicMaterial({ color: '#ff1744' }), 0, 2.2, 0);
  crown.visible = false; g.userData.crown = crown;
  const hp = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#00e676', depthTest: false }));
  hp.position.y = 2.85; hp.scale.set(1.4, 0.12, 1); hp.visible = false;
  g.add(hp); g.userData.hp = hp; g.userData.punchT = 0;
  const tc = document.createElement('canvas'); tc.width = tc.height = 64;
  const tx = tc.getContext('2d'); tx.font = '48px system-ui'; tx.textAlign = 'center'; tx.fillText('🎙️', 32, 50);
  const talk = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(tc), depthTest: false }));
  talk.position.set(0.9, 2.4, 0); talk.scale.set(0.5, 0.5, 1); talk.visible = false;
  g.add(talk); g.userData.talk = talk;
  return g;
}
function animateLimbs(av, moving, t) {
  const s = moving ? Math.sin(t * 10) * 0.7 : 0;
  av.userData.armL.rotation.x = s; av.userData.armR.rotation.x = -s;
  av.userData.legL.rotation.x = -s; av.userData.legR.rotation.x = s;
  if (av.userData.punchT > 0) { av.userData.armR.rotation.x = -1.7; av.userData.punchT -= 1 / 60; }
}

// ---------- State ----------
const isTouch = matchMedia('(pointer:coarse)').matches;
let socket, myId, room = 'hub', coins = 0, checkpoint = 0;
let me = null;
const others = {}; // id -> {av, target, ry, last}
const pos = new THREE.Vector3(), vel = new THREE.Vector3();
const knock = new THREE.Vector2();
let onGround = false, yaw = 0, camYaw = 0, camPitch = 0.35;
const keys = {};
const joy = { x: 0, y: 0 };
let tagState = { it: null, roundEnds: 0 };
const PR = 0.4, PH = 2; // player radius/height

function enterRoom(r, list) {
  room = r;
  for (const id in others) { scene.remove(others[id].av); delete others[id]; }
  ({ hub: buildHub, obby: buildObby, tag: buildTag, coinrush: buildCoinRush, lava: buildLava, floor: buildFloor, fight: buildFight })[r]();
  pos.copy(spawn); vel.set(0, 0, 0); checkpoint = 0; lavaDead = false;
  const saved = loadSave();
  if (saved && solids.some(x => x.checkpoint === saved)) {
    checkpoint = saved; socket.emit('obby:checkpoint', saved); respawn();
  }
  if (r !== 'lava') lava = null;
  $('floorBar').style.display = 'none';
  $('roomLabel').textContent = ROOM_LABEL[r];
  $('hubBtn').style.display = r === 'hub' ? 'none' : 'inline-block';
  $('tagInfo').style.display = r === 'tag' ? 'inline-block' : 'none';
  me.userData.crown.visible = false;
  list.forEach(addOther);
  const inFight = r === 'fight';
  $('hpInfo').style.display = inFight ? 'inline-block' : 'none';
  $('punchBtn').style.display = inFight && isTouch ? 'block' : 'none';
  me.userData.hp.visible = inFight;
  for (const p of list) if (p.id !== myId && others[p.id]) { others[p.id].av.userData.hp.visible = inFight; setHP(p.id, p.hp ?? 100); }
  if (inFight) setHP(myId, 100);
  voiceRejoin();
}
function addOther(p) {
  if (p.id === myId || others[p.id]) return;
  const av = makeAvatar(p.color, p.name);
  av.position.set(p.x, p.y - PH / 2, p.z);
  av.userData.hp.visible = room === 'fight';
  scene.add(av);
  others[p.id] = { av, target: new THREE.Vector3(p.x, p.y - PH / 2, p.z), ry: p.ry, last: av.position.clone() };
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.style.opacity = 1;
  clearTimeout(t._h); t._h = setTimeout(() => t.style.opacity = 0, 2500);
}
function addChat(name, text) {
  const d = document.createElement('div'); d.textContent = `${name}: ${text}`;
  $('chatLog').appendChild(d);
  while ($('chatLog').children.length > 6) $('chatLog').firstChild.remove();
  setTimeout(() => d.remove(), 15000);
}
function updateTagUI() {
  const itP = tagState.it === myId;
  me.userData.crown.visible = room === 'tag' && itP;
  for (const id in others) others[id].av.userData.crown.visible = room === 'tag' && id === tagState.it;
}

// ---------- Live voice chat (WebRTC mesh per room) ----------
const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
let voiceOn = false, micOn = true, localStream = null, analyser = null, talking = false;
const peers = {}; // id -> {pc, audio}
const talkingIds = new Set();

async function startVoice() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    localStream = null;
    toast('🎤 Mic permission இல்ல — மத்தவங்க பேசுறது மட்டும் கேட்கும்');
  }
  voiceOn = true; micOn = !!localStream;
  if (localStream) setupTalkDetect();
  socket.emit('voice:join');
  updateVoiceUI();
}
function stopVoice() {
  voiceOn = false;
  socket.emit('voice:leave');
  closeAllPeers();
  localStream?.getTracks().forEach(t => t.stop());
  localStream = null; analyser = null;
  updateVoiceUI();
}
function closeAllPeers() { for (const id in peers) closePeer(id); }
function closePeer(id) {
  const pr = peers[id]; if (!pr) return;
  pr.pc.close(); pr.audio.remove(); delete peers[id]; talkingIds.delete(id);
}
function voiceRejoin() {
  // called after a room change: server already removed us from the old room's voice
  if (!voiceOn) return;
  closeAllPeers();
  socket.emit('voice:join');
}
function makePeer(id, initiator) {
  closePeer(id);
  const pc = new RTCPeerConnection(ICE);
  const audio = document.createElement('audio');
  audio.autoplay = true; audio.playsInline = true; document.body.appendChild(audio);
  peers[id] = { pc, audio };
  if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  else pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.ontrack = e => { audio.srcObject = e.streams[0] || new MediaStream([e.track]); audio.play().catch(() => {}); };
  pc.onicecandidate = e => { if (e.candidate) socket.emit('voice:signal', { to: id, data: { candidate: e.candidate } }); };
  pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) closePeer(id); };
  if (initiator) {
    pc.createOffer().then(o => pc.setLocalDescription(o)).then(() =>
      socket.emit('voice:signal', { to: id, data: { sdp: pc.localDescription } }));
  }
  return pc;
}
async function onSignal({ from, data }) {
  if (!voiceOn) return;
  let pc = peers[from]?.pc;
  if (data.sdp) {
    if (data.sdp.type === 'offer') pc = makePeer(from, false);
    if (!pc) return;
    await pc.setRemoteDescription(data.sdp);
    if (data.sdp.type === 'offer') {
      await pc.setLocalDescription(await pc.createAnswer());
      socket.emit('voice:signal', { to: from, data: { sdp: pc.localDescription } });
    }
  } else if (data.candidate && pc) {
    try { await pc.addIceCandidate(data.candidate); } catch {}
  }
}
function setupTalkDetect() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(localStream);
    analyser = ctx.createAnalyser(); analyser.fftSize = 512; src.connect(analyser);
  } catch { analyser = null; }
}
const vbuf = new Uint8Array(256);
let talkCheckT = 0;
function updateTalkIcons() {
  // local talking detection (throttled)
  if (analyser && micOn && performance.now() - talkCheckT > 150) {
    talkCheckT = performance.now();
    analyser.getByteFrequencyData(vbuf);
    const lvl = vbuf.reduce((a, b) => a + b, 0) / vbuf.length;
    const now = lvl > 18;
    if (now !== talking) { talking = now; socket.emit('voice:talking', now); }
  }
  if (me) me.userData.talk.visible = voiceOn && micOn && talking;
  for (const id in others) others[id].av.userData.talk.visible = talkingIds.has(id);
}
function updateVoiceUI() {
  $('voiceBtn').textContent = voiceOn ? '🔊 Voice ON' : '🔇 Voice';
  $('voiceBtn').classList.toggle('on', voiceOn);
  $('micBtn').style.display = voiceOn && localStream ? 'inline-block' : 'none';
  $('micBtn').textContent = micOn ? '🎤' : '🔇🎤';
}
$('voiceBtn').onclick = () => { if (!socket) return; voiceOn ? stopVoice() : startVoice(); };
$('micBtn').onclick = () => {
  micOn = !micOn;
  localStream?.getAudioTracks().forEach(t => t.enabled = micOn);
  if (!micOn && talking) { talking = false; socket.emit('voice:talking', false); }
  updateVoiceUI();
};

// ---------- Networking ----------
$('playBtn').onclick = () => {
  const name = $('nameIn').value.trim() || 'Player' + Math.floor(Math.random() * 1000);
  try { localStorage.setItem('bv_name', name); } catch {}
  $('start').style.display = 'none';
  me = makeAvatar(myColor, name); scene.add(me);
  socket = io();
  socket.on('connect', () => socket.emit('join', { name, color: myColor }));
  socket.on('welcome', d => { myId = d.id; enterRoom('hub', d.players); });
  socket.on('room', d => enterRoom(d.room, d.players));
  socket.on('player:join', addOther);
  socket.on('player:leave', id => { closePeer(id); if (others[id]) { scene.remove(others[id].av); delete others[id]; } });
  socket.on('player:move', d => { const o = others[d.id]; if (o) { o.target.set(d.x, d.y - PH / 2, d.z); o.ry = d.ry; } });
  socket.on('coins', c => { coins = c; $('coins').textContent = c; });
  socket.on('toast', toast);
  socket.on('chat', d => addChat(d.name, d.text));
  socket.on('tag:state', s => {
    tagState = s; updateTagUI();
    if (room === 'tag') toast(s.it === myId ? '🔴 நீங்க தான் IT! எல்லாரையும் பிடிங்க' : '🏃 ஓடுங்க! IT கிட்ட மாட்டாதீங்க');
  });
  socket.on('coinrush:state', list => { if (room === 'coinrush') list.forEach(addCoin); });
  socket.on('coinrush:taken', ({ id, by, next }) => {
    const c = coinMeshes[id];
    if (c) { world.remove(c.mesh); delete coinMeshes[id]; }
    if (room === 'coinrush') addCoin(next);
    if (by === myId) toast(c && c.data.gold ? '✨ Gold coin! +10' : '🪙 +2');
  });
  socket.on('lava:state', d => {
    lavaT0 = performance.now() - d.elapsed;
    if (d.reset && room === 'lava') { lavaDead = false; solids.forEach(x => x.claimed = false); pos.copy(spawn); vel.set(0, 0, 0); toast('🌋 புது round! மேல ஏறுங்க'); }
  });
  socket.on('voice:peers', list => list.forEach(id => makePeer(id, true)));
  socket.on('voice:signal', onSignal);
  socket.on('voice:bye', closePeer);
  socket.on('voice:count', n => { $('voiceCount').textContent = n ? `🔊 ${n}` : ''; });
  socket.on('voice:talking', d => { d.on ? talkingIds.add(d.id) : talkingIds.delete(d.id); });
  socket.on('fight:swing', id => { if (others[id]) others[id].av.userData.punchT = 0.3; });
  socket.on('fight:hp', d => setHP(d.id, d.hp));
  socket.on('fight:hit', d => {
    setHP(d.target, d.hp);
    const av = d.target === myId ? me : others[d.target]?.av;
    if (av) burst(av.position.x, av.position.y + 1.4, av.position.z, '#ffeb3b', 10);
    if (d.target === myId) {
      knock.set(d.kx * 14, d.kz * 14); vel.y = 6; onGround = false;
      $('hitFlash').style.opacity = 0.5; setTimeout(() => $('hitFlash').style.opacity = 0, 120);
      navigator.vibrate?.(60);
    }
  });
  socket.on('fight:ko', () => { burst(pos.x, pos.y, pos.z, '#ff1744', 30); toast('😵 KO ஆயிட்டீங்க!'); spawn.set((Math.random() - .5) * 14, 2, (Math.random() - .5) * 14); pos.copy(spawn); vel.set(0, 0, 0); knock.set(0, 0); });
  socket.on('floor:phase', st => { floorPhase = st; applyFloor(); });
  if (isTouch) {
    $('joy').style.display = 'block'; $('jumpBtn').style.display = 'block'; $('help').style.display = 'none';
  }
  last = performance.now();
  requestAnimationFrame(loop);
};
$('hubBtn').onclick = () => socket.emit('switchRoom', 'hub');
function renderMenu() {
  const grid = $('gameGrid'); grid.innerHTML = '';
  for (const g of GAMES) {
    const card = document.createElement('button');
    card.className = 'gcard';
    card.innerHTML = `<div class="gthumb" style="background:${g.color}">${g.icon}</div><b>${g.name}</b><small>${g.desc}</small>`;
    card.onclick = () => { $('menu').style.display = 'none'; if (room !== g.id) socket.emit('switchRoom', g.id); };
    grid.appendChild(card);
  }
}
renderMenu();
$('gamesBtn').onclick = () => { $('menu').style.display = 'flex'; };
$('menuClose').onclick = () => { $('menu').style.display = 'none'; };
$('chatForm').onsubmit = e => {
  e.preventDefault();
  const v = $('chatIn').value.trim();
  if (v) socket.emit('chat', v);
  $('chatIn').value = ''; $('chatIn').blur();
};

// ---------- Input ----------
addEventListener('keydown', e => { if (document.activeElement.tagName !== 'INPUT') keys[e.code] = true; });
addEventListener('keyup', e => keys[e.code] = false);
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
addEventListener('pointermove', e => {
  if (!drag || drag.id !== e.pointerId) return;
  camYaw -= (e.clientX - drag.x) * 0.006;
  camPitch = Math.max(-0.2, Math.min(1.2, camPitch + (e.clientY - drag.y) * 0.004));
  drag.x = e.clientX; drag.y = e.clientY;
});
addEventListener('pointerup', e => { if (drag && drag.id === e.pointerId) drag = null; });
// joystick
const joyEl = $('joy'), knob = $('knob'); let joyId = null;
joyEl.addEventListener('pointerdown', e => { joyId = e.pointerId; joyEl.setPointerCapture(joyId); moveJoy(e); e.stopPropagation(); });
joyEl.addEventListener('pointermove', e => { if (e.pointerId === joyId) moveJoy(e); });
const joyEnd = () => { joyId = null; joy.x = joy.y = 0; knob.style.left = knob.style.top = '40px'; };
joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);
function moveJoy(e) {
  const r = joyEl.getBoundingClientRect();
  let dx = e.clientX - (r.left + 65), dy = e.clientY - (r.top + 65);
  const len = Math.hypot(dx, dy), max = 45;
  if (len > max) { dx *= max / len; dy *= max / len; }
  joy.x = dx / max; joy.y = dy / max;
  knob.style.left = 40 + dx + 'px'; knob.style.top = 40 + dy + 'px';
}
$('jumpBtn').addEventListener('pointerdown', e => { keys.Space = true; e.stopPropagation(); });
$('jumpBtn').addEventListener('pointerup', () => keys.Space = false);
$('punchBtn').addEventListener('pointerdown', e => { doPunch(); e.stopPropagation(); });

// ---------- Physics ----------
const pBox = new THREE.Box3();
function playerBox(p) { pBox.min.set(p.x - PR, p.y - PH / 2, p.z - PR); pBox.max.set(p.x + PR, p.y + PH / 2, p.z + PR); return pBox; }
function collideAxis(axis, delta) {
  if (delta === 0) return;
  pos[axis] += delta;
  const b = playerBox(pos);
  // Horizontal checks ignore the floor the player is standing on (step tolerance)
  if (axis !== 'y') { b.min.y += 0.15; b.max.y -= 0.05; }
  for (const s of solids) {
    if (!s.solid || !b.intersectsBox(s.box)) continue;
    if (axis === 'y') {
      if (delta < 0) { pos.y = s.box.max.y + PH / 2 + 0.001; onGround = true; s.ridden = true; }
      else pos.y = s.box.min.y - PH / 2 - 0.001;
      vel.y = 0;
    } else {
      pos[axis] = delta > 0 ? s.box.min[axis] - PR - 0.001 : s.box.max[axis] + PR + 0.001;
    }
    playerBox(pos);
    if (axis !== 'y') { b.min.y += 0.15; b.max.y -= 0.05; }
  }
}
function respawn() {
  if (room === 'lava' && lavaDead) { pos.set(28, 46, 0); vel.set(0, 0, 0); return; }
  if (room === 'floor') { pos.set(0, 11, -22); vel.set(0, 0, 0); return; }
  if (room === 'fight') socket.emit('fight:fell');
  const c = checkpoint > 0 && solids.find(s => s.checkpoint === checkpoint);
  if (c) {
    pos.set(c.mesh.position.x, c.mesh.position.y + 1.5, c.mesh.position.z);
    toast(`↩️ Save point ${checkpoint}-ல இருந்து மீண்டும்`);
  } else pos.copy(spawn);
  vel.set(0, 0, 0); knock.set(0, 0);
  burst(pos.x, pos.y, pos.z, '#ffffff', 10);
}
function saveKey() { return 'bv_cp_' + room; }
function loadSave() { try { return parseInt(localStorage.getItem(saveKey())) || 0; } catch { return 0; } }
function writeSave(n) { try { n ? localStorage.setItem(saveKey(), n) : localStorage.removeItem(saveKey()); } catch {} }

// ---------- Main loop ----------
let last = 0, sendT = 0, portalCooldown = 0, finishLock = false;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;

  // moving platforms (carry player)
  for (const s of solids) {
    if (s.move) {
      const old = s.mesh.position.x;
      s.mesh.position.x = s.move.base + Math.sin(t * s.move.speed) * s.move.amp;
      s.box.setFromObject(s.mesh);
      if (s.ridden) pos.x += s.mesh.position.x - old;
    }
    if (s.spin) { s.mesh.rotation.y += dt * 2; s.box.setFromObject(s.mesh); }
    s.ridden = false;
  }

  // input -> movement relative to camera
  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
  let iz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + joy.y;
  const len = Math.hypot(ix, iz); if (len > 1) { ix /= len; iz /= len; }
  const speed = room === 'tag' && tagState.it === myId ? 8.5 : 7.5;
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  const mx = ix * cos + iz * sin, mz = -ix * sin + iz * cos;
  vel.x = mx * speed + knock.x; vel.z = mz * speed + knock.y;
  knock.multiplyScalar(Math.exp(-4 * dt));
  if (Math.hypot(mx, mz) > 0.1) yaw = Math.atan2(mx, mz);
  if (keys.Space && onGround) { vel.y = 9.5; onGround = false; }
  if (keys.KeyF) { keys.KeyF = false; doPunch(); }
  vel.y -= 25 * dt;

  onGround = false;
  collideAxis('x', vel.x * dt);
  collideAxis('z', vel.z * dt);
  collideAxis('y', vel.y * dt);
  if (pos.y < -15) respawn();

  // triggers
  const b = playerBox(pos);
  portalCooldown -= dt;
  for (const s of solids) {
    if (!b.intersectsBox(s.box)) continue;
    if (s.kill) { respawn(); break; }
    if (s.portal && portalCooldown <= 0) { portalCooldown = 2; socket.emit('switchRoom', s.portal); break; }
    if (s.checkpoint && s.checkpoint === checkpoint + 1) {
      checkpoint = s.checkpoint; writeSave(checkpoint);
      socket.emit('obby:checkpoint', checkpoint); toast(`💾 Save point ${checkpoint} saved!`);
      burst(pos.x, pos.y, pos.z, '#00e676', 20);
    }
  }
  const fin = solids.find(s => s.finish);
  if (fin && onGround && Math.abs(pos.y - PH / 2 - fin.box.max.y) < 0.1 &&
      pos.x > fin.box.min.x && pos.x < fin.box.max.x && pos.z > fin.box.min.z && pos.z < fin.box.max.z && !finishLock) {
    finishLock = true; socket.emit('obby:finish');
    setTimeout(() => { finishLock = false; checkpoint = 0; writeSave(0); pos.copy(spawn); vel.set(0, 0, 0); }, 2000);
  }

  // Coin Rush
  if (room === 'coinrush') {
    for (const id in coinMeshes) {
      const c = coinMeshes[id];
      c.mesh.rotation.z += dt * 3;
      c.mesh.position.y = c.data.y + Math.sin(t * 3 + c.data.id) * 0.15;
      if (!c.pending && c.mesh.position.distanceTo(pos) < 1.6) { c.pending = true; socket.emit('coinrush:grab', c.data.id); }
    }
  }
  // Lava Rise
  if (room === 'lava' && lava) {
    const ly = Math.min(lavaY(), 34);
    lava.position.set(0, ly - 0.5, 0);
    if (!lavaDead && pos.y - PH / 2 < ly) { lavaDead = true; toast('🔥 Lava-ல விழுந்துட்டீங்க!'); respawn(); }
    const topS = solids.find(s => s.lavaTop);
    if (topS && onGround && pos.y - PH / 2 >= topS.box.max.y - 0.05 && !lavaDead && !topS.claimed) { topS.claimed = true; socket.emit('lava:win'); }
  }

  // my avatar
  me.position.set(pos.x, pos.y - PH / 2, pos.z);
  me.rotation.y += ((yaw - me.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 12);
  animateLimbs(me, Math.hypot(vel.x, vel.z) > 0.5 && onGround, t);

  // others (interpolate)
  for (const id in others) {
    const o = others[id];
    o.last.copy(o.av.position);
    o.av.position.lerp(o.target, Math.min(1, dt * 12));
    o.av.rotation.y = o.ry;
    animateLimbs(o.av, o.av.position.distanceTo(o.last) > 0.01, t);
  }

  // tag timer
  if (room === 'tag' && tagState.roundEnds) {
    const left = Math.max(0, Math.ceil((tagState.roundEnds - Date.now()) / 1000));
    const itName = tagState.it === myId ? 'நீங்க' : (tagState.it ? 'வேற ஒருத்தர்' : '-');
    $('tagInfo').textContent = `IT: ${itName} · ⏱ ${left}s`;
  }

  // camera follow
  const dist = 7;
  camera.position.set(
    pos.x + Math.sin(camYaw) * Math.cos(camPitch) * dist,
    pos.y + 1 + Math.sin(camPitch) * dist,
    pos.z + Math.cos(camYaw) * Math.cos(camPitch) * dist
  );
  camera.lookAt(pos.x, pos.y + 0.8, pos.z);

  // network (15/sec)
  sendT += dt;
  if (sendT > 1 / 15) { sendT = 0; socket.emit('move', { x: pos.x, y: pos.y, z: pos.z, ry: me.rotation.y }); }

  // follow lights / sky with player
  sun.position.set(pos.x + 30, pos.y + 60, pos.z + 22); sun.target.position.copy(pos);
  sky.position.copy(camera.position);
  clouds.children.forEach((c, i) => { c.position.x += dt * (1 + (i % 3)); if (c.position.x > 160) c.position.x = -160; });
  updateBursts(dt);
  updateTalkIcons();

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
