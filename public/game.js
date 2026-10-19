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

// ---------- Themes & 100-game catalog ----------
const THEMES = [
  { name: 'Sunny', icon: '🌤️', top: '#3d8bff', bottom: '#cfeaff', pal: ['#ff7f50', '#4fc3f7', '#aed581', '#ffd54f', '#ba68c8'], ground: '#5cb85c', kill: '#ff3333' },
  { name: 'Candy', icon: '🍭', top: '#ff80ab', bottom: '#fff0f6', pal: ['#ff4081', '#f8bbd0', '#ffffff', '#b388ff', '#80deea'], ground: '#f48fb1', kill: '#d500f9' },
  { name: 'Jungle', icon: '🌴', top: '#2e7d32', bottom: '#c8e6c9', pal: ['#8d6e63', '#66bb6a', '#a5d6a7', '#795548', '#cddc39'], ground: '#33691e', kill: '#76ff03' },
  { name: 'Space', icon: '🚀', top: '#000014', bottom: '#2a1b5c', pal: ['#7c4dff', '#18ffff', '#e040fb', '#b0bec5', '#ffffff'], ground: '#263238', kill: '#ff1744' },
  { name: 'Ice', icon: '❄️', top: '#81d4fa', bottom: '#ffffff', pal: ['#e1f5fe', '#b3e5fc', '#4fc3f7', '#ffffff', '#90caf9'], ground: '#eceff1', kill: '#2962ff' },
  { name: 'Desert', icon: '🏜️', top: '#ffb74d', bottom: '#fff3e0', pal: ['#d7a86e', '#c19a6b', '#ffe0b2', '#a1887f', '#ffcc80'], ground: '#e0c08a', kill: '#ff6d00' },
  { name: 'Ocean', icon: '🌊', top: '#0277bd', bottom: '#b3e5fc', pal: ['#ffffff', '#ffeb3b', '#4dd0e1', '#ff8a65', '#26c6da'], ground: '#0288d1', kill: '#00e5ff' },
  { name: 'Neon', icon: '🌃', top: '#0d0221', bottom: '#3a0ca3', pal: ['#f72585', '#4cc9f0', '#b5179e', '#7209b7', '#4361ee'], ground: '#1b1b2f', kill: '#ff0054' },
  { name: 'Volcano', icon: '🌋', top: '#3e2723', bottom: '#ff7043', pal: ['#424242', '#5d4037', '#757575', '#ff8f00', '#6d4c41'], ground: '#3e2723', kill: '#ff3d00' },
  { name: 'Sunset', icon: '🌅', top: '#ff6f00', bottom: '#ffd180', pal: ['#ff8a65', '#ffab40', '#f06292', '#ba68c8', '#fff176'], ground: '#8d6e63', kill: '#d50000' },
];
const themeFor = n => THEMES[(n - 1) % THEMES.length];
function setSky(t) {
  sky.material.uniforms.top.value.set(t.top);
  sky.material.uniforms.bottom.value.set(t.bottom);
  scene.fog.color.set(t.bottom);
  const dark = ['Space', 'Neon'].includes(t.name);
  sunDisc.visible = !dark; clouds.visible = !dark;
}
const MAIN_GAMES = [
  { id: 'obby', name: 'Obby Parkour', icon: '🏃', color: '#ff8800', desc: 'Jump பண்ணி finish வரை · save points', cat: 'popular' },
  { id: 'tycoon', name: 'House Tycoon', icon: '🏠', color: '#43a047', desc: 'Job பண்ணி சம்பாதிச்சு வீடு கட்டுங்க', cat: 'popular' },
  { id: 'heist', name: 'City Heist', icon: '🚓', color: '#1565c0', desc: 'Robber / Police · bank கொள்ளை · car ஓட்டுங்க', cat: 'popular' },
  { id: 'hide', name: 'Hide & Seek', icon: '👻', color: '#6a1b9a', desc: 'ஒளிஞ்சுக்கோங்க, seeker கண்டுபிடிக்கட்டும்', cat: 'popular' },
  { id: 'race', name: 'Car Race', icon: '🏎️', color: '#e65100', desc: 'Car-ல gates வழியா lap முடிங்க', cat: 'popular' },
  { id: 'fight', name: 'Fight Arena', icon: '🥊', color: '#d50000', desc: 'Punch பண்ணி KO · +15', cat: 'popular' },
  { id: 'tag', name: 'Tag Chase', icon: '🏷️', color: '#aa33ff', desc: 'IT கிட்ட மாட்டாம ஓடுங்க · +20', cat: 'popular' },
  { id: 'coinrush', name: 'Coin Rush', icon: '🪙', color: '#ffcc00', desc: 'Coins சேருங்க · gold = +10', cat: 'popular' },
  { id: 'lava', name: 'Lava Rise', icon: '🌋', color: '#ff3d00', desc: 'Lava-க்கு முன்னாடி மேல ஏறுங்க · +30', cat: 'popular' },
  { id: 'floor', name: 'Block Party', icon: '🟦', color: '#2979ff', desc: 'சொன்ன color-ல நில்லுங்க · +3', cat: 'popular' },
];
const ALL_GAMES = [...MAIN_GAMES];
for (let n = 2; n <= 51; n++) { const t = themeFor(n); ALL_GAMES.push({ id: 'obby-' + n, name: `${t.name} Obby ${n}`, icon: t.icon, color: t.pal[0], desc: `Level ${n} · ${n < 15 ? 'Easy' : n < 32 ? 'Medium' : 'Hard'}`, cat: 'obby' }); }
for (let n = 2; n <= 21; n++) { const t = themeFor(n + 3); ALL_GAMES.push({ id: 'race-' + n, name: `${t.name} Track ${n}`, icon: '🏁', color: t.pal[1], desc: `Race track ${n}`, cat: 'race' }); }
for (let n = 1; n <= 20; n++) { const t = themeFor(n + 6); ALL_GAMES.push({ id: 'tower-' + n, name: `Tower of ${t.name} ${n}`, icon: '🗼', color: t.pal[2], desc: `மேல ஏறுங்க · floor ${8 + n}`, cat: 'tower' }); }
const GAMES = MAIN_GAMES; // hub portals
const modeOf = r => r.split('-')[0];
const levelOf = r => parseInt(r.split('-')[1]) || 1;
const roomLabel = r => r === 'hub' ? '🏠 Hub' : (g => g ? g.icon + ' ' + g.name : r)(ALL_GAMES.find(g => g.id === r));

// ---------- Generated Obby (50 levels) ----------
function buildObby(level = 1) {
  clearWorld();
  const t = themeFor(level); setSky(t);
  const d = Math.min(1, (level - 1) / 50);
  const rnd = mulberry(level * 97 + 13);
  block(0, -0.5, 0, 10, 1, 10, t.ground);
  block(0, -6, -80, 260, 1, 260, t.kill, { kill: true });
  const count = 22 + Math.floor(level / 2);
  let z = -8, y = 0, x = 0, cp = 0;
  for (let i = 0; i < count; i++) {
    const isCp = i % 4 === 3;
    const w = isCp ? 3 : Math.max(1.1, 2.6 - d * 1.2 - rnd() * 0.5);
    x = Math.max(-7, Math.min(7, x + (rnd() - .5) * (3 + d * 3)));
    y += isCp ? 0.6 : 0.15 + rnd() * (0.3 + d * 0.5);
    const gap = 3.2 + d * 1.0 + rnd() * 0.4;
    const s = block(x, y, z, w, 0.5, w, isCp ? '#00c853' : t.pal[i % t.pal.length]);
    if (!isCp && rnd() < 0.15 + d * 0.3) s.move = { axis: 'x', amp: 1.5 + d * 2, speed: 0.8 + rnd() * (1 + d), base: x };
    if (!isCp && i > 2 && rnd() < 0.1 + d * 0.25) block(x, y + 1, z, w + 0.2, 0.3, 0.3, t.kill, { kill: true, solid: false, spin: true });
    if (isCp) addCheckpoint(++cp, x, y, z, w);
    z -= gap;
  }
  block(0, y + 0.5, z - 2, 8, 1, 8, '#ffd700', { finish: true });
  label('🏆 FINISH', 0, y + 4, z - 2, '#ffd700');
  block(0, 1.5, 4, 4, 3, 0.5, '#33aaff', { opacity: 0.6, solid: false, portal: 'hub' });
  label('🏠 Hub', 0, 4, 4);
  spawn.set(0, 2, 0);
}
function addCheckpoint(cp, x, y, z, w) {
  block(x, y + 0.6, z, w, 0.6, w, '#00e676', { solid: false, checkpoint: cp, opacity: 0.0001 });
  block(x + w / 2 - 0.2, y + 1.6, z, 0.12, 2.6, 0.12, '#eeeeee', { solid: false });
  block(x + w / 2 + 0.25, y + 2.5, z, 0.8, 0.5, 0.05, '#00e676', { solid: false });
  label('💾 ' + cp, x, y + 3.6, z, '#b9f6ca');
}

// ---------- Tower climb (20 levels) ----------
function buildTower(level = 1) {
  clearWorld();
  const t = themeFor(level + 6); setSky(t);
  const rnd = mulberry(level * 131 + 7);
  const d = (level - 1) / 19;
  block(0, -1.5, 0, 80, 1, 80, t.kill, { kill: true });
  block(0, -0.5, 0, 8, 1, 8, t.ground);
  const floors = 8 + level;
  let y = 0, a = 0, cp = 0;
  block(0, floors * 3.2 / 2, 0, 2.4, floors * 3.2, 2.4, t.pal[3]); // core
  for (let f = 0; f < floors; f++) {
    for (let k = 0; k < 6; k++) {
      a += 0.5 + rnd() * 0.25;
      y += 0.45 + rnd() * (0.15 + d * 0.25);
      const r = 5.2 + rnd() * 1.5;
      const w = Math.max(1.1, 2.2 - d * 0.9);
      const s = block(Math.cos(a) * r, y, Math.sin(a) * r, w, 0.45, w, t.pal[(f + k) % t.pal.length]);
      if (rnd() < 0.08 + d * 0.2) s.move = { axis: 'x', amp: 1 + d, speed: 1 + rnd(), base: Math.cos(a) * r };
      if (k === 3 && rnd() < 0.2 + d * 0.3) block(Math.cos(a) * r, y + 1, Math.sin(a) * r, w, 0.25, 0.25, t.kill, { kill: true, solid: false, spin: true });
    }
    // floor landing + save point
    a += 0.6; y += 0.6;
    const lx = Math.cos(a) * 6, lz = Math.sin(a) * 6;
    block(lx, y, lz, 3, 0.5, 3, '#00c853');
    addCheckpoint(++cp, lx, y, lz, 3);
  }
  block(0, y + 1.5, 0, 6, 0.6, 6, '#ffd700', { finish: true });
  label('🏆 TOP', 0, y + 5, 0, '#ffd700');
  // bridge to the top
  block(Math.cos(a) * 3, y + 1, Math.sin(a) * 3, 3, 0.5, 3, '#ffd700');
  block(0, 1.5, 3.8, 3, 3, 0.4, '#33aaff', { opacity: 0.6, solid: false, portal: 'hub' });
  spawn.set(0, 2, 3);
}

// ---------- Cars ----------
function makeCar(color, police = false) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: '#90caf9', roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.8 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(1.9, 0.6, 3.8), body, 0, 0.55, 0);
  add(new THREE.BoxGeometry(1.6, 0.55, 1.9), glass, 0, 1.1, -0.2);
  for (const [x, z] of [[-0.95, 1.2], [0.95, 1.2], [-0.95, -1.2], [0.95, -1.2]]) {
    const w = add(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14), dark, x, 0.38, z); w.rotation.z = Math.PI / 2;
  }
  add(new THREE.BoxGeometry(0.4, 0.15, 0.05), new THREE.MeshBasicMaterial({ color: '#fffde7' }), -0.6, 0.6, 1.91);
  add(new THREE.BoxGeometry(0.4, 0.15, 0.05), new THREE.MeshBasicMaterial({ color: '#fffde7' }), 0.6, 0.6, 1.91);
  if (police) {
    add(new THREE.BoxGeometry(0.4, 0.15, 0.3), new THREE.MeshBasicMaterial({ color: '#ff1744' }), -0.25, 1.45, -0.2);
    add(new THREE.BoxGeometry(0.4, 0.15, 0.3), new THREE.MeshBasicMaterial({ color: '#2979ff' }), 0.25, 1.45, -0.2);
  }
  return g;
}
let parkedCars = []; // {x,z,color,police}
function parkCar(x, z, color, police = false, ry = 0) {
  const c = makeCar(color, police); c.position.set(x, 0, z); c.rotation.y = ry; world.add(c);
  parkedCars.push({ x, z, color, police, mesh: c });
}
function setCarMode(av, on, color, police) {
  if (!!av.userData.inCar === on && (!on || av.userData.carColor === color)) return;
  av.userData.inCar = on;
  if (av.userData.carMesh) { av.remove(av.userData.carMesh); av.userData.carMesh = null; }
  for (const k of ['armL', 'armR', 'legL', 'legR']) av.userData[k].visible = !on;
  if (on) { const c = makeCar(color || '#e53935', police); c.position.y = -0.05; av.add(c); av.userData.carMesh = c; av.userData.carColor = color; }
}

// ---------- Car Race (21 tracks) ----------
const RACE_GATES = 8;
let raceGates = [], nextGate = 1, raceT0 = 0;
function buildRace(level = 1) {
  clearWorld(); parkedCars = [];
  const t = themeFor(level + 3); setSky(t);
  const rnd = mulberry(level * 211 + 5);
  block(0, -0.5, 0, 180, 1, 180, t.ground);
  const k = 2 + (level % 3), amp = 0.12 + rnd() * 0.25, ph = rnd() * 6, R = 45, sx = 0.8 + rnd() * 0.4;
  const pt = th => { const r = R * (1 + amp * Math.sin(k * th + ph)); return [Math.cos(th) * r * sx, Math.sin(th) * r]; };
  const N = 96;
  for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
    const [x0, z0] = pt(a0), [x1, z1] = pt(a1);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(8, 0.06, len + 0.4), new THREE.MeshStandardMaterial({ color: i % 2 ? '#424242' : '#4a4a4a', roughness: 0.9 }));
    seg.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2); seg.rotation.y = Math.atan2(x1 - x0, z1 - z0); seg.receiveShadow = true;
    world.add(seg);
    if (i % 3 === 0) for (const side of [-1, 1]) { // curb markers
      const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      block(x0 + nx * 4.4 * side, 0.2, z0 + nz * 4.4 * side, 0.6, 0.4, 0.6, i % 6 ? '#ffffff' : '#e53935', { solid: false });
    }
  }
  raceGates = [];
  for (let gI = 0; gI < RACE_GATES; gI++) {
    const th = gI / RACE_GATES * Math.PI * 2;
    const [x, z] = pt(th);
    const s = block(x, 2, z, 9, 4, 9, gI === 0 ? '#ffffff' : '#ffd600', { solid: false, opacity: 0.12, gate: gI + 1 });
    s.mesh.visible = false;
    const [x2, z2] = pt(th + 0.02); const ang = Math.atan2(x2 - x, z2 - z);
    const nx = Math.cos(ang), nz = -Math.sin(ang);
    for (const side of [-1, 1]) block(x + nx * 4.6 * side, 2, z + nz * 4.6 * side, 0.4, 4, 0.4, gI === 0 ? '#212121' : t.pal[gI % 5], { solid: false });
    const bar = block(x, 4.2, z, 0.4, 0.5, 0.4, gI === 0 ? '#212121' : t.pal[gI % 5], { solid: false });
    bar.mesh.scale.set(1, 1, 1); bar.mesh.rotation.y = ang; bar.mesh.geometry = new THREE.BoxGeometry(9.6, 0.5, 0.4);
    label(gI === 0 ? '🏁 START' : String(gI + 1), x, 5.5, z, gI === 0 ? '#fff' : '#ffd600');
    raceGates.push(s);
  }
  for (let i = 0; i < 25; i++) { const a = rnd() * 6.28, r = 70 + rnd() * 15; block(Math.cos(a) * r, 2, Math.sin(a) * r, 3, 4, 3, t.pal[i % 5]); }
  const [sx0, sz0] = pt(-0.06);
  const [sx1, sz1] = pt(-0.04);
  spawn.set(sx0, 2, sz0);
  yaw = Math.atan2(sx1 - sx0, sz1 - sz0); camYaw = yaw + Math.PI;
  block(0, 1.5, 0, 3, 3, 0.4, '#33aaff', { opacity: 0.6, solid: false, portal: 'hub' });
  label('🏠 Hub', 0, 4, 0);
  nextGate = 1; raceT0 = 0;
}

// ---------- Dynamic text label ----------
function dynLabel(text, x, y, z, color = '#fff', w = 4) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  sp.position.set(x, y, z); sp.scale.set(w, w / 4, 1); world.add(sp);
  sp.setText = (txt, col = color) => {
    const g = c.getContext('2d'); g.clearRect(0, 0, 512, 128);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, 512, 128);
    g.font = 'bold 46px system-ui'; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, 256, 64); tex.needsUpdate = true;
  };
  sp.setText(text); return sp;
}

// ---------- House Tycoon ----------
const HOUSE_PARTS = ['Plot claim', 'Floor', 'Walls', 'Door & Windows', 'Roof', 'Garden', 'Furniture', '2nd Floor', 'Swimming Pool', 'Car Garage', 'Gold Statue'];
const HOUSE_COSTS = [0, 15, 30, 45, 60, 80, 100, 140, 180, 230, 300];
const TRUCK = { x: 0, z: -6 }, WAREHOUSE = { x: 0, z: 10 };
let myPlot = null, myHouse = 0, plotState = [], houseGroups = [], plotLabels = [], buyPads = [], carrying = false, boxMesh = null;
const plotPos = i => ({ x: (i % 4 - 1.5) * 26, z: i < 4 ? -32 : 32, face: i < 4 ? 1 : -1 });
function buildTycoon() {
  clearWorld(); setSky(THEMES[0]); parkedCars = [];
  houseGroups = []; plotLabels = []; buyPads = [];
  block(0, -0.5, 0, 120, 1, 120, '#7cb342');
  block(0, 0.02, 0, 120, 0.05, 10, '#9e9e9e', { solid: false }); // street
  for (let i = 0; i < 8; i++) {
    const p = plotPos(i);
    block(p.x, 0.04, p.z, 20, 0.08, 20, '#a5d6a7', { solid: false });
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z); world.add(g); houseGroups.push(g);
    plotLabels.push(dynLabel('🏠 காலி plot', p.x, 12, p.z, '#fff', 6));
    const pad = block(p.x, 0.15, p.z + p.face * 12, 2.4, 0.3, 2.4, '#ffd600', { solid: false, buyPlot: i });
    pad.mesh.visible = false; buyPads.push(pad);
  }
  // job area
  block(WAREHOUSE.x, 2, WAREHOUSE.z + 3, 12, 4, 2, '#8d6e63');
  block(WAREHOUSE.x, 4.3, WAREHOUSE.z + 2, 13, 0.6, 5, '#5d4037');
  for (let i = 0; i < 6; i++) block(WAREHOUSE.x - 4 + i * 1.6, 0.4, WAREHOUSE.z + 1, 0.8, 0.8, 0.8, '#d7a86e', { solid: false });
  block(WAREHOUSE.x, 0.1, WAREHOUSE.z, 6, 0.2, 4, '#ffb300', { solid: false, pickZone: true });
  label('📦 Box எடுங்க', WAREHOUSE.x, 6, WAREHOUSE.z);
  // delivery truck
  const truck = makeCar('#1565c0'); truck.scale.set(1.6, 1.6, 1.6); truck.position.set(TRUCK.x + 3, 0, TRUCK.z); truck.rotation.y = Math.PI / 2; world.add(truck);
  block(TRUCK.x, 0.1, TRUCK.z, 5, 0.2, 4, '#00e676', { solid: false, dropZone: true });
  label('🚚 இங்க போடுங்க +3', TRUCK.x, 5, TRUCK.z);
  block(50, 1.5, 0, 0.4, 3, 3, '#33aaff', { opacity: 0.6, solid: false, portal: 'hub' });
  label('🏠 Hub', 50, 4, 0);
  spawn.set(0, 2, 0);
  carrying = false;
}
function applyPlots() {
  if (modeOf(room) !== 'tycoon') return;
  plotState.forEach((st, i) => {
    const g = houseGroups[i]; if (!g) return;
    const lvl = st ? st.level : 0;
    if (g.userData.lvl !== lvl) { buildHouse(g, lvl, i); g.userData.lvl = lvl; }
    if (!st) plotLabels[i].setText('🏠 காலி plot');
    else if (st.owner === myId) {
      plotLabels[i].setText(lvl >= HOUSE_PARTS.length ? '🏆 உங்க வீடு — முழுசா ரெடி!' : `உங்க வீடு · அடுத்து: ${HOUSE_PARTS[lvl]} 🪙${HOUSE_COSTS[lvl]}`, '#ffd600');
    } else plotLabels[i].setText(`${st.name}-ஓட வீடு · Lv ${lvl}`);
    buyPads[i].mesh.visible = !!st && st.owner === myId && lvl < HOUSE_PARTS.length;
  });
}
function buildHouse(g, lvl, plotIdx) {
  // remove previous parts (and their collision boxes)
  solids = solids.filter(s => s.houseOf !== plotIdx);
  while (g.children.length) g.remove(g.children[0]);
  const P = plotPos(plotIdx), f = P.face;
  const part = (x, y, z, w, h, d, color, solid = true, extra = {}) => {
    const s = block(P.x + x, y, P.z + z, w, h, d, color, { solid, houseOf: plotIdx, ...extra });
    world.remove(s.mesh); g.add(s.mesh); s.mesh.position.set(x, y, z); s.box.setFromObject(s.mesh);
    return s;
  };
  g.updateMatrixWorld(true);
  if (lvl >= 1) { // fence corners + sign
    for (const [x, z] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) part(x, 0.6, z, 0.4, 1.2, 0.4, '#fff8e1');
    part(-10, 0.45, 0, 0.15, 0.3, 20, '#fff8e1', false); part(10, 0.45, 0, 0.15, 0.3, 20, '#fff8e1', false);
  }
  if (lvl >= 2) part(0, 0.15, 0, 12, 0.3, 10, '#a1887f');
  const H = lvl >= 8 ? 6 : 3;
  if (lvl >= 3) {
    part(0, 0.3 + 1.5, -5 * f, 12, 3, 0.3, '#ffe0b2');                    // back
    part(-6, 0.3 + 1.5, 0, 0.3, 3, 10, '#ffe0b2'); part(6, 0.3 + 1.5, 0, 0.3, 3, 10, '#ffe0b2');
    part(-3.8, 0.3 + 1.5, 5 * f, 4.4, 3, 0.3, '#ffe0b2'); part(3.8, 0.3 + 1.5, 5 * f, 4.4, 3, 0.3, '#ffe0b2'); // front with door gap
    part(0, 0.3 + 2.8, 5 * f, 3.2, 0.6, 0.3, '#ffe0b2');
  }
  if (lvl >= 4) {
    part(0, 1.4, 5 * f + 0.1 * f, 1.4, 2.2, 0.08, '#6d4c41', false, { opacity: 0.0001 });
    for (const x of [-3.8, 3.8]) part(x, 2, 5 * f + 0.17 * f, 1.8, 1.1, 0.05, '#81d4fa', false);
    part(-6.17, 2, 0, 0.05, 1.1, 2, '#81d4fa', false); part(6.17, 2, 0, 0.05, 1.1, 2, '#81d4fa', false);
  }
  if (lvl >= 8) { // second storey
    part(0, 3.45, 0, 12, 0.3, 10, '#a1887f');
    part(0, 3.6 + 1.5, -5 * f, 12, 3, 0.3, '#ffccbc'); part(0, 3.6 + 1.5, 5 * f, 12, 3, 0.3, '#ffccbc');
    part(-6, 3.6 + 1.5, 0, 0.3, 3, 10, '#ffccbc'); part(6, 3.6 + 1.5, 0, 0.3, 3, 10, '#ffccbc');
    for (const x of [-3, 0, 3]) part(x, 5.2, 5 * f + 0.17 * f, 1.6, 1, 0.05, '#81d4fa', false);
    // outside stairs
    for (let k = 0; k < 6; k++) part(7.4, 0.3 + k * 0.6, 3.5 * f - k * 1.0 * f, 2, 0.3, 1, '#8d6e63');
  }
  if (lvl >= 5) { // roof
    const base = H + 0.3;
    for (let k = 0; k < 4; k++) part(0, base + 0.3 + k * 0.6, 0, 13 - k * 3, 0.6, 11 - k * 2.5, '#c62828', k === 0);
  }
  if (lvl >= 6) { // garden
    for (const [x, z] of [[-8, 7], [8, 7], [-8, -8], [8, -8]]) { part(x, 0.6, z * f, 1.6, 1.2, 1.6, '#2e7d32'); part(x, 1.5, z * f, 1, 0.8, 1, '#43a047', false); }
    for (let k = 0; k < 10; k++) part(-7 + k * 1.5, 0.15, 8.5 * f, 0.3, 0.3, 0.3, ['#ff5252', '#ffeb3b', '#e040fb'][k % 3], false);
  }
  if (lvl >= 7) { // furniture
    part(-3.5, 0.6, -3 * f, 2.2, 0.6, 3, '#5c6bc0');        // bed
    part(-3.5, 1, -4.3 * f, 2.2, 0.8, 0.3, '#3949ab');
    part(2.5, 0.75, 0, 2, 0.15, 1.2, '#8d6e63');             // table
    part(3.5, 0.6, -3.5 * f, 2.6, 0.6, 1, '#ef5350');        // sofa
    part(0, 1.3, -4.7 * f, 2.4, 1.4, 0.2, '#212121', false); // TV
  }
  if (lvl >= 9) { // pool
    part(0, 0.08, -8 * f, 8, 0.12, 3.4, '#ffffff', false);
    part(0, 0.12, -8 * f, 7.2, 0.12, 2.8, '#29b6f6', false);
  }
  if (lvl >= 10) { // garage + car
    part(-8.5, 1.6, 2 * f, 0.3, 3.2, 5, '#bdbdbd'); part(-8.5, 3.3, 2 * f, 3, 0.3, 5.4, '#757575', false);
    const car = makeCar(['#e53935', '#1e88e5', '#fdd835'][plotIdx % 3]); car.position.set(-8.4, 0, 2 * f); car.scale.setScalar(0.8); g.add(car);
  }
  if (lvl >= 11) { // gold statue
    part(8, 0.4, 7 * f, 1.4, 0.8, 1.4, '#9e9e9e');
    part(8, 1.6, 7 * f, 0.7, 1.6, 0.5, '#ffd700', false); part(8, 2.7, 7 * f, 0.6, 0.6, 0.6, '#ffd700', false);
  }
}

// ---------- City Heist ----------
const VAULT = { x1: 18, x2: 26, z1: -30, z2: -22 }, HIDEOUT = { x1: -40, x2: -32, z1: 28, z2: 36 }, JAIL = { x: 34, z: 30 };
const STATION = { x: -30, z: -30 };
let heistTeams = {}, myTeam = 'robber', robT = 0, jailedUntil = 0;
function buildHeist() {
  clearWorld(); setSky(THEMES[9]); parkedCars = [];
  block(0, -0.5, 0, 120, 1, 120, '#757575');
  // road grid
  for (const k of [-15, 15]) { block(k, 0.03, 0, 8, 0.05, 120, '#424242', { solid: false }); block(0, 0.03, k, 120, 0.05, 8, '#424242', { solid: false }); }
  for (let i = -50; i < 50; i += 6) for (const k of [-15, 15]) { block(k, 0.06, i, 0.3, 0.02, 2, '#fff59d', { solid: false }); block(i, 0.06, k, 2, 0.02, 0.3, '#fff59d', { solid: false }); }
  // city buildings
  const rnd = mulberry(77), cols = ['#90a4ae', '#b0bec5', '#8d6e63', '#a1887f', '#78909c', '#bcaaa4'];
  for (const bx of [-45, -30, 0, 30, 45]) for (const bz of [-45, 0, 45]) {
    if ((bx === 30 && bz === 45) || (bx === -30 && bz === -45) || (bx === -45 && bz === 45)) continue;
    const h = 6 + rnd() * 16;
    block(bx + (rnd() - .5) * 3, h / 2, bz + (rnd() - .5) * 3, 9, h, 9, cols[Math.floor(rnd() * cols.length)]);
  }
  // Bank with vault
  const bx = (VAULT.x1 + VAULT.x2) / 2, bz = (VAULT.z1 + VAULT.z2) / 2;
  block(bx, 3, VAULT.z1 - 0.5, 12, 6, 1, '#eeeeee');
  block(bx - 6, 3, bz, 1, 6, 10, '#eeeeee'); block(bx + 6, 3, bz, 1, 6, 10, '#eeeeee');
  block(bx - 4, 3, VAULT.z2 + 0.5, 4, 6, 1, '#eeeeee'); block(bx + 4, 3, VAULT.z2 + 0.5, 4, 6, 1, '#eeeeee');
  block(bx, 6.3, bz, 13, 0.6, 11, '#bdbdbd', { solid: false });
  block(bx, 0.05, bz, 8, 0.1, 8, '#ffd700', { solid: false, vault: true });
  for (let i = 0; i < 6; i++) block(bx - 2.5 + (i % 3) * 2.5, 0.5 + Math.floor(i / 3) * 0.6, bz - 2, 1.4, 0.5, 0.9, '#43a047', { solid: false });
  label('🏦 BANK', bx, 8, VAULT.z2 + 1, '#ffd700');
  // Hideout
  const hx = (HIDEOUT.x1 + HIDEOUT.x2) / 2, hz = (HIDEOUT.z1 + HIDEOUT.z2) / 2;
  block(hx, 0.05, hz, 8, 0.1, 8, '#00c853', { solid: false, hideout: true });
  block(hx - 4.5, 2, hz, 1, 4, 8, '#4e342e'); 
  label('🦹 HIDEOUT', hx, 6, hz, '#69f0ae');
  // Police station
  block(STATION.x, 0.05, STATION.z, 10, 0.1, 10, '#1565c0', { solid: false });
  block(STATION.x - 6, 3, STATION.z, 1, 6, 10, '#e3f2fd');
  label('👮 POLICE', STATION.x, 7, STATION.z, '#82b1ff');
  // Jail cell (closed box)
  block(JAIL.x, 0, JAIL.z, 7, 0.4, 7, '#616161');
  block(JAIL.x - 3.5, 2.5, JAIL.z, 0.4, 5, 7, '#455a64'); block(JAIL.x + 3.5, 2.5, JAIL.z, 0.4, 5, 7, '#455a64');
  block(JAIL.x, 2.5, JAIL.z - 3.5, 7, 5, 0.4, '#455a64'); block(JAIL.x, 2.5, JAIL.z + 3.5, 7, 5, 0.4, '#455a64');
  block(JAIL.x, 5.2, JAIL.z, 7.4, 0.4, 7.4, '#455a64');
  label('🔒 JAIL', JAIL.x, 7, JAIL.z, '#ff8a80');
  // Cars
  parkCar(STATION.x + 2, STATION.z + 7, '#fafafa', true); parkCar(STATION.x + 6, STATION.z + 7, '#fafafa', true);
  parkCar(hx + 2, hz - 7, '#212121'); parkCar(hx + 6, hz - 7, '#6a1b9a');
  parkCar(0, 20, '#e53935', false, Math.PI / 2); parkCar(-20, 0, '#fdd835'); parkCar(20, 8, '#00897b');
  block(0, 1.5, -4, 3, 3, 0.4, '#33aaff', { opacity: 0.6, solid: false, portal: 'hub' });
  label('🏠 Hub', 0, 4, -4);
  heistSpawn();
}
function heistSpawn() {
  if (myTeam === 'police') spawn.set(STATION.x, 2, STATION.z);
  else spawn.set((HIDEOUT.x1 + HIDEOUT.x2) / 2, 2, (HIDEOUT.z1 + HIDEOUT.z2) / 2);
}

// ---------- Hide & Seek (mansion) ----------
let hideSt = { phase: 'wait', seeker: null, ends: 0, found: [] };
function buildHide() {
  clearWorld(); setSky(THEMES[7]); parkedCars = [];
  block(0, -0.5, 0, 90, 1, 90, '#33691e');
  const W = '#d7ccc8', F = '#8d6e63';
  block(0, 0.1, 0, 36, 0.2, 28, F);
  // outer walls with doors
  block(-18, 2.5, 0, 0.5, 5, 28, W); block(18, 2.5, 0, 0.5, 5, 28, W);
  block(-11, 2.5, -14, 14, 5, 0.5, W); block(11, 2.5, -14, 14, 5, 0.5, W);
  block(-11, 2.5, 14, 14, 5, 0.5, W); block(11, 2.5, 14, 14, 5, 0.5, W);
  // inner rooms
  block(-6, 2.5, -7, 0.4, 5, 10, W); block(6, 2.5, 7, 0.4, 5, 10, W);
  block(-12, 2.5, 3, 12, 5, 0.4, W); block(12, 2.5, -3, 12, 5, 0.4, W);
  block(0, 2.5, 0, 6, 5, 0.4, W);
  // furniture to hide behind
  const rnd = mulberry(5);
  const furn = ['#5d4037', '#6d4c41', '#3e2723', '#455a64', '#8e24aa', '#c62828'];
  for (let i = 0; i < 22; i++) {
    const x = (rnd() - .5) * 32, z = (rnd() - .5) * 24;
    const big = rnd() < 0.3;
    block(x, big ? 1.4 : 0.6, z, big ? 1.6 : 1.4 + rnd(), big ? 2.8 : 1.2, big ? 1 : 1.4 + rnd(), furn[i % furn.length]);
  }
  // garden hiding spots
  for (let i = 0; i < 18; i++) {
    const a = rnd() * 6.28, r = 24 + rnd() * 16;
    block(Math.cos(a) * r, 1.2, Math.sin(a) * r, 2.6, 2.4, 2.6, '#2e7d32');
  }
  block(0, 5.3, 0, 37, 0.4, 29, '#4e342e', { solid: false });
  // seeker box + spectator bench
  block(30, 2, -30, 4, 4, 4, '#212121', { solid: false });
  block(-34, 6, -34, 8, 0.5, 8, '#eeeeee'); label('👀 கண்டுபிடிக்கப்பட்டவங்க', -34, 9, -34);
  block(0, 1.5, 20, 3, 3, 0.4, '#33aaff', { opacity: 0.6, solid: false, portal: 'hub' });
  label('🏠 Hub', 0, 4, 20);
  spawn.set(0, 2, 18);
}

function buildHub() {
  clearWorld();
  block(0, -0.5, 0, 60, 1, 60, '#5cb85c');
  // pond
  const water = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.1, 32), new THREE.MeshStandardMaterial({ color: '#29b6f6', transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.3 }));
  water.position.set(0, 0.06, 0); water.scale.set(0.7, 1, 0.7); world.add(water);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; block(Math.cos(a) * 3.9, 0.25, Math.sin(a) * 3.9, 0.8, 0.5, 0.8, '#9e9e9e'); }
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
    if (Math.hypot(x, z) < 19) continue;
    block(x, 0.15, z, 0.3, 0.3, 0.3, ['#ff5252', '#ffeb3b', '#e040fb', '#ffffff'][i % 4], { solid: false });
  }
  // Portals in a ring around the pond
  GAMES.forEach((g, i) => {
    const a = (i / GAMES.length) * Math.PI * 2 + Math.PI / 2 + Math.PI / GAMES.length;
    const x = Math.cos(a) * 15, z = Math.sin(a) * 15;
    const pt = block(x, 2, z, 3.5, 4, 0.5, g.color, { opacity: 0.6, solid: false, portal: g.id });
    pt.mesh.rotation.y = -a + Math.PI / 2; pt.box.setFromObject(pt.mesh);
    block(x, 0.1, z, 4, 0.2, 4, '#333', { solid: false });
    label(g.icon + ' ' + g.name, x, 5, z, '#fff');
  });
  // 100 games board
  block(0, 3, -9, 6, 4, 0.4, '#ffb400', { opacity: 0.7, solid: false, portal: 'menu' });
  label('🎮 100 GAMES', 0, 6, -9, '#ffd84d');
  label('BLOCKVERSE', 0, 10, -26, '#ffd84d');
  spawn.set(0, 2, 8);
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
  const cap = part(new THREE.BoxGeometry(0.56, 0.16, 0.6), new THREE.MeshStandardMaterial({ color: '#0d47a1' }), 0, 2.05, 0.03);
  const mask = part(new THREE.BoxGeometry(0.54, 0.14, 0.54), new THREE.MeshStandardMaterial({ color: '#111' }), 0, 1.82, 0);
  const bag = part(new THREE.BoxGeometry(0.5, 0.6, 0.3), new THREE.MeshStandardMaterial({ color: '#c8a400' }), 0, 1.15, -0.38);
  cap.visible = mask.visible = bag.visible = false;
  Object.assign(g.userData, { cap, mask, bag, tag });
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
let raceBestList = [], buyCool = 0, delivCool = 0;
let inCar = false, carColor = '#e53935', carPolice = false;
function setBox(on) {
  if (!me) return;
  if (on && !boxMesh) { boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), new THREE.MeshStandardMaterial({ color: '#d7a86e', map: studTex(1, 1) })); boxMesh.position.set(0, 2.45, 0); me.add(boxMesh); }
  if (!on && boxMesh) { me.remove(boxMesh); boxMesh = null; }
}

function enterRoom(r, list) {
  room = r;
  for (const id in others) { scene.remove(others[id].av); delete others[id]; }
  setSky(THEMES[0]);
  const mode = modeOf(r);
  ({ hub: buildHub, obby: buildObby, tower: buildTower, race: buildRace, tycoon: buildTycoon, heist: buildHeist, hide: buildHide,
     tag: buildTag, coinrush: buildCoinRush, lava: buildLava, floor: buildFloor, fight: buildFight })[mode](levelOf(r));
  pos.copy(spawn); vel.set(0, 0, 0); checkpoint = 0; lavaDead = false; knock.set(0, 0);
  inCar = mode === 'race'; carColor = myColor; carPolice = false; carrying = false; setBox(false);
  jailedUntil = 0; robT = 0;
  $('modeInfo').style.display = ['race', 'heist', 'hide'].includes(mode) ? 'inline-block' : 'none';
  $('teamBox').style.display = mode === 'heist' ? 'flex' : 'none';
  $('blind').style.display = 'none';
  if (me) { me.userData.cap.visible = me.userData.mask.visible = me.userData.bag.visible = false; me.userData.tag.visible = true; }
  const saved = loadSave();
  if (saved && solids.some(x => x.checkpoint === saved)) {
    checkpoint = saved; socket.emit('obby:checkpoint', saved); respawn();
  }
  if (r !== 'lava') lava = null;
  $('floorBar').style.display = 'none';
  $('roomLabel').textContent = roomLabel(r);
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
  others[p.id] = { color: p.color, av, target: new THREE.Vector3(p.x, p.y - PH / 2, p.z), ry: p.ry, last: av.position.clone() };
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

function loadProfile() {
  try { return { coins: +localStorage.getItem('bv_coins') || 0, house: +localStorage.getItem('bv_house') || 0 }; } catch { return {}; }
}
// ---------- Networking ----------
$('playBtn').onclick = () => {
  const name = $('nameIn').value.trim() || 'Player' + Math.floor(Math.random() * 1000);
  try { localStorage.setItem('bv_name', name); } catch {}
  $('start').style.display = 'none';
  me = makeAvatar(myColor, name); scene.add(me);
  socket = io();
  socket.on('connect', () => socket.emit('join', { name, color: myColor, save: loadProfile() }));
  socket.on('welcome', d => { myId = d.id; enterRoom('hub', d.players); });
  socket.on('room', d => enterRoom(d.room, d.players));
  socket.on('player:join', addOther);
  socket.on('player:leave', id => { closePeer(id); if (others[id]) { scene.remove(others[id].av); delete others[id]; } });
  socket.on('player:move', d => { const o = others[d.id]; if (o) { o.target.set(d.x, d.y - PH / 2, d.z); o.ry = d.ry; setCarMode(o.av, !!d.car, o.color, heistTeams[d.id]?.team === 'police'); } });
  socket.on('coins', c => { coins = c; $('coins').textContent = c; try { localStorage.setItem('bv_coins', c); } catch {} });
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
  socket.on('house', h => { myHouse = h; try { localStorage.setItem('bv_house', h); } catch {} });
  socket.on('tycoon:you', d => {
    myPlot = d.plot; myHouse = d.house;
    if (myPlot != null) { const P = plotPos(myPlot); pos.set(P.x, 2, P.z + P.face * 14); vel.set(0, 0, 0); toast('🏠 இது உங்க plot! மஞ்சள் pad-ல நின்னா வீடு கட்டலாம்'); }
  });
  socket.on('tycoon:plots', list => { plotState = list; applyPlots(); });
  socket.on('heist:state', st => {
    heistTeams = st;
    if (st[myId]) myTeam = st[myId].team;
    const gear = (av, info) => { av.userData.cap.visible = info?.team === 'police'; av.userData.mask.visible = info?.team === 'robber'; av.userData.bag.visible = !!info?.bag; };
    if (me) gear(me, st[myId]);
    for (const id in others) gear(others[id].av, st[id]);
    updateTeamUI();
  });
  socket.on('heist:respawn', t => { myTeam = t; inCar = false; heistSpawn(); pos.copy(spawn); vel.set(0, 0, 0); toast(t === 'police' ? '👮 நீங்க Police — robbers-ஐ தொட்டு arrest பண்ணுங்க' : '🦹 நீங்க Robber — bank vault-ல 4 sec நின்னு கொள்ளையடிங்க'); });
  socket.on('heist:jail', d => { inCar = false; jailedUntil = performance.now() + d.secs * 1000; pos.set(d.x, 2, d.z); vel.set(0, 0, 0); toast('🔒 Jail-ல மாட்டிக்கிட்டீங்க! 20 sec'); });
  socket.on('heist:free', () => { jailedUntil = 0; heistSpawn(); pos.copy(spawn); toast('🔓 விடுதலை!'); });
  socket.on('hide:state', st => {
    const prev = hideSt; hideSt = st;
    if (modeOf(room) !== 'hide') return;
    const amSeeker = st.seeker === myId;
    if (st.newRound) {
      if (amSeeker) { pos.set(30, 2, -30); toast('👁️ நீங்க தான் SEEKER! 20 sec கண்ணை மூடுங்க'); }
      else { pos.copy(spawn); toast('🙈 ஒளிஞ்சுக்கோங்க! 20 sec இருக்கு'); }
      vel.set(0, 0, 0);
    }
    if (st.phase === 'seek' && prev.phase === 'hide' && amSeeker) { pos.copy(spawn); toast('👀 இப்போ தேடுங்க!'); }
    if (st.found.includes(myId) && !prev.found?.includes(myId)) { pos.set(-34, 7.5, -34); toast('😅 கண்டுபிடிச்சிட்டாங்க! அடுத்த round-க்கு wait'); }
    if (st.phase === 'wait' && prev.phase !== 'wait' && pos.x < -28) pos.copy(spawn);
  });
  socket.on('race:best', list => { raceBestList = list; });
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
let menuCat = 'popular';
const CATS = [['popular', '⭐ Popular'], ['obby', '🏃 Obby 50'], ['race', '🏎️ Race 20'], ['tower', '🗼 Tower 20'], ['all', '🎮 எல்லாம் 100']];
function renderMenu() {
  const tabs = $('menuTabs'); tabs.innerHTML = '';
  for (const [id, name] of CATS) {
    const b = document.createElement('button'); b.textContent = name; b.className = 'tab' + (id === menuCat ? ' on' : '');
    b.onclick = () => { menuCat = id; renderMenu(); }; tabs.appendChild(b);
  }
  const q = ($('menuSearch').value || '').trim().toLowerCase();
  const grid = $('gameGrid'); grid.innerHTML = '';
  let done = {};
  try { done = JSON.parse(localStorage.getItem('bv_done') || '{}'); } catch {}
  const list = ALL_GAMES.filter(g => (menuCat === 'all' || g.cat === menuCat || q) && (!q || g.name.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q)));
  for (const g of list) {
    const card = document.createElement('button');
    card.className = 'gcard';
    card.innerHTML = `<div class="gthumb" style="background:linear-gradient(135deg,${g.color},#0006)">${g.icon}${done[g.id] ? '<span class="done">✅</span>' : ''}</div><b>${g.name}</b><small>${g.desc}</small>`;
    card.onclick = () => { $('menu').style.display = 'none'; if (room !== g.id) socket.emit('switchRoom', g.id); };
    grid.appendChild(card);
  }
  $('menuCount').textContent = `${ALL_GAMES.length} games`;
}
$('menuSearch').oninput = renderMenu;
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
  if (modeOf(room) === 'race') { pos.copy(spawn); vel.set(0, 0, 0); nextGate = 1; raceT0 = 0; return; }
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

function markDone(r) {
  try { const d = JSON.parse(localStorage.getItem('bv_done') || '{}'); d[r] = 1; localStorage.setItem('bv_done', JSON.stringify(d)); } catch {}
}
function toggleCar() {
  if (modeOf(room) !== 'heist' || jailedUntil) return;
  if (inCar) { inCar = false; pos.x += 2; return; }
  const c = parkedCars.find(c => Math.hypot(c.x - pos.x, c.z - pos.z) < 3.8);
  if (!c) return;
  if (c.police && myTeam !== 'police') { toast('🚓 Police car — police மட்டும் தான்'); return; }
  inCar = true; carColor = c.color; carPolice = c.police; pos.x = c.x; pos.z = c.z; yaw = c.mesh.rotation.y;
}
function raceGate(n) {
  if (n !== (nextGate > RACE_GATES ? 1 : nextGate)) return;
  if (n === 1) {
    if (nextGate > RACE_GATES) { // lap complete
      const t = (performance.now() - raceT0) / 1000;
      socket.emit('race:finish'); markDone(room); toast(`🏁 Lap ${t.toFixed(1)}s!`); burst(pos.x, pos.y, pos.z, '#ffd600', 30);
    }
    raceT0 = performance.now(); socket.emit('race:gate', 1); nextGate = 2;
  } else { socket.emit('race:gate', n); nextGate = n + 1; burst(pos.x, pos.y + 1, pos.z, '#ffffff', 6); }
}
function updateTeamUI() {
  $('robberBtn').classList.toggle('on', myTeam === 'robber');
  $('policeBtn').classList.toggle('on', myTeam === 'police');
}
$('robberBtn').onclick = () => socket?.emit('heist:team', 'robber');
$('policeBtn').onclick = () => socket?.emit('heist:team', 'police');
$('carBtn').onclick = () => toggleCar();

// debug hook (used by automated tests)
window.BV = { pos, get room() { return room; }, get onGround() { return onGround; }, get solids() { return solids.length; } };

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
  const mode = modeOf(room);
  const frozen = (mode === 'hide' && hideSt.phase === 'hide' && hideSt.seeker === myId) || (jailedUntil && performance.now() < jailedUntil && false);
  if (frozen) { ix = iz = 0; }
  const speed = inCar ? (mode === 'race' ? 24 : 19) : (room === 'tag' && tagState.it === myId ? 8.5 : 7.5);
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  const mx = ix * cos + iz * sin, mz = -ix * sin + iz * cos;
  vel.x = mx * speed + knock.x; vel.z = mz * speed + knock.y;
  knock.multiplyScalar(Math.exp(-4 * dt));
  if (Math.hypot(mx, mz) > 0.1) {
    const target = Math.atan2(mx, mz);
    if (inCar) { yaw += ((target - yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 5); camYaw += ((yaw + Math.PI - camYaw + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 2.5); }
    else yaw = target;
  }
  if (keys.Space && onGround && !inCar && !frozen) { vel.y = 9.5; onGround = false; }
  if (keys.KeyE) { keys.KeyE = false; toggleCar(); }
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
    if (s.portal && portalCooldown <= 0) {
      portalCooldown = 2;
      if (s.portal === 'menu') { $('menu').style.display = 'flex'; pos.z += 2; } else socket.emit('switchRoom', s.portal);
      break;
    }
    if (s.gate) raceGate(s.gate);
    if (s.buyPlot != null && s.buyPlot === myPlot && now > buyCool) { buyCool = now + 1500; socket.emit('tycoon:buy'); burst(pos.x, pos.y, pos.z, '#ffd600', 12); }
    if (s.pickZone && !carrying) { carrying = true; setBox(true); socket.emit('tycoon:pick'); toast('📦 Box எடுத்தீங்க — truck-க்கு கொண்டு போங்க'); }
    if (s.dropZone && carrying && now > delivCool) { delivCool = now + 1600; carrying = false; setBox(false); socket.emit('tycoon:work'); toast('🚚 Delivered! +3'); burst(pos.x, pos.y, pos.z, '#00e676', 10); }
    if (s.checkpoint && s.checkpoint === checkpoint + 1) {
      checkpoint = s.checkpoint; writeSave(checkpoint);
      socket.emit('obby:checkpoint', checkpoint); toast(`💾 Save point ${checkpoint} saved!`);
      burst(pos.x, pos.y, pos.z, '#00e676', 20);
    }
  }
  const fin = solids.find(s => s.finish);
  if (fin && onGround && Math.abs(pos.y - PH / 2 - fin.box.max.y) < 0.1 &&
      pos.x > fin.box.min.x && pos.x < fin.box.max.x && pos.z > fin.box.min.z && pos.z < fin.box.max.z && !finishLock) {
    finishLock = true; socket.emit('obby:finish'); markDone(room);
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

  // City Heist
  if (mode === 'heist') {
    const me_ = heistTeams[myId] || {};
    const inV = pos.x > VAULT.x1 && pos.x < VAULT.x2 && pos.z > VAULT.z1 && pos.z < VAULT.z2;
    const inH = pos.x > HIDEOUT.x1 && pos.x < HIDEOUT.x2 && pos.z > HIDEOUT.z1 && pos.z < HIDEOUT.z2;
    let info = myTeam === 'police' ? '👮 Police · 💰 bag உள்ள robbers-ஐ பிடிங்க' : '🦹 Robber · 🏦 bank vault-க்கு போங்க';
    if (jailedUntil) info = `🔒 Jail · ${Math.max(0, Math.ceil((jailedUntil - performance.now()) / 1000))}s`;
    else if (myTeam === 'robber' && !me_.bag && inV && !inCar) {
      if (robT === 0) socket.emit('heist:robstart');
      robT += dt; info = `💰 கொள்ளை... ${Math.min(100, Math.floor(robT / 4 * 100))}%`;
      if (robT >= 4.1) { robT = -999; socket.emit('heist:robdone'); }
    } else { if (robT > 0) robT = 0; if (!inV && robT < 0) robT = 0; }
    if (me_.bag) info = '💰 பணம் கையில! 🦹 Hideout-க்கு ஓடுங்க';
    if (me_.bag && inH && now > delivCool) { delivCool = now + 2000; socket.emit('heist:deliver'); }
    $('modeInfo').textContent = info;
    const near = parkedCars.some(c => Math.hypot(c.x - pos.x, c.z - pos.z) < 3.8);
    $('carBtn').style.display = !jailedUntil && (inCar || near) ? 'inline-block' : 'none';
    $('carBtn').textContent = inCar ? '🚶 இறங்கு (E)' : '🚗 ஏறு (E)';
  } else $('carBtn').style.display = 'none';
  // Race HUD
  if (mode === 'race') {
    const tt = raceT0 ? ((performance.now() - raceT0) / 1000).toFixed(1) + 's' : 'START gate வழியா போங்க';
    const best = raceBestList[0] ? ` · 🏆 ${raceBestList[0].name} ${raceBestList[0].t}s` : '';
    $('modeInfo').textContent = `🏁 Gate ${Math.min(nextGate, RACE_GATES)}/${RACE_GATES} · ${tt}${best}`;
  }
  // Hide & Seek HUD
  if (mode === 'hide') {
    const left = Math.max(0, Math.ceil((hideSt.ends - Date.now()) / 1000));
    const amSeeker = hideSt.seeker === myId;
    let info = '⏳ இன்னொரு player வர்றதுக்கு wait…';
    if (hideSt.phase === 'hide') info = amSeeker ? `👁️ Seeker · ${left}s` : `🙈 ஒளிஞ்சுக்கோங்க · ${left}s`;
    if (hideSt.phase === 'seek') info = amSeeker ? `👀 தேடுங்க! · ${left}s` : `🤫 அமைதியா இருங்க · ${left}s`;
    if (hideSt.phase === 'wait' && hideSt.ends > Date.now()) info = `அடுத்த round ${left}s-ல`;
    $('modeInfo').textContent = info;
    const blind = amSeeker && hideSt.phase === 'hide';
    $('blind').style.display = blind ? 'flex' : 'none';
    if (blind) { $('blindT').textContent = left; pos.set(30, 2, -30); vel.set(0, 0, 0); }
    for (const id in others) others[id].av.userData.tag.visible = !(amSeeker && hideSt.phase !== 'wait');
  }
  // car visual for me
  setCarMode(me, inCar, carColor, carPolice);

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
  if (sendT > 1 / 15) { sendT = 0; socket.emit('move', { x: pos.x, y: pos.y, z: pos.z, ry: me.rotation.y, car: inCar }); }

  // follow lights / sky with player
  sun.position.set(pos.x + 30, pos.y + 60, pos.z + 22); sun.target.position.copy(pos);
  sky.position.copy(camera.position);
  clouds.children.forEach((c, i) => { c.position.x += dt * (1 + (i % 3)); if (c.position.x > 160) c.position.x = -160; });
  updateBursts(dt);
  updateTalkIcons();

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
