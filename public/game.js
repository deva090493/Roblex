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
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#87ceeb');
scene.fog = new THREE.Fog('#87ceeb', 40, 120);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 300);
scene.add(new THREE.HemisphereLight('#ffffff', '#556644', 0.9));
const sun = new THREE.DirectionalLight('#ffffff', 1.1);
sun.position.set(20, 40, 15); sun.castShadow = true;
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- World building ----------
let world = new THREE.Group(); scene.add(world);
let solids = [];      // {box: Box3, mesh, kill?, checkpoint?, finish?, portal?, move?}
let spawn = new THREE.Vector3(0, 2, 0);

function block(x, y, z, w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 }));
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

function buildHub() {
  clearWorld();
  block(0, -0.5, 0, 50, 1, 50, '#5cb85c');
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    block(Math.cos(a) * 20, 1.5, Math.sin(a) * 20, 2, 3, 2, '#8b5a2b');
    block(Math.cos(a) * 20, 4, Math.sin(a) * 20, 4, 2, 4, '#2e8b3e');
  }
  // Portals
  block(-8, 2, -12, 4, 4, 0.5, '#ff8800', { opacity: 0.6, solid: false, portal: 'obby' });
  label('🏃 OBBY', -8, 5, -12, '#ffbb55');
  block(8, 2, -12, 4, 4, 0.5, '#aa33ff', { opacity: 0.6, solid: false, portal: 'tag' });
  label('🏷️ TAG', 8, 5, -12, '#dd99ff');
  label('BLOCKVERSE', 0, 7, -18, '#ffd84d');
  // Coming soon
  block(0, 2, -14, 4, 4, 0.5, '#666', { opacity: 0.4, solid: false });
  label('Soon...', 0, 5, -14, '#aaa');
  spawn.set(0, 2, 5);
}

function buildObby() {
  clearWorld();
  block(0, -0.5, 0, 10, 1, 10, '#cccccc');
  block(0, -6, -60, 200, 1, 200, '#ff3333', { kill: true }); // lava floor
  const cols = ['#ff7f50', '#4fc3f7', '#aed581', '#ffd54f', '#ba68c8'];
  let z = -8, y = 0, cp = 0;
  for (let i = 0; i < 26; i++) {
    const w = 2.4 - (i % 3) * 0.4;
    const x = Math.sin(i * 0.9) * 4;
    y += (i % 4 === 3) ? 0.9 : 0.25;
    const s = block(x, y, z, w, 0.5, w, cols[i % cols.length]);
    if (i % 5 === 2) s.move = { axis: 'x', amp: 2.5, speed: 1 + i * 0.05, base: x };
    if (i % 7 === 6) { // kill bar
      block(x, y + 1, z, w, 0.3, 0.3, '#ff2222', { kill: true, solid: false, spin: true });
    }
    if (i % 8 === 7) {
      cp++;
      block(x, y + 0.3, z, w, 0.1, w, '#00e676', { solid: false, checkpoint: cp });
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
  return g;
}
function animateLimbs(av, moving, t) {
  const s = moving ? Math.sin(t * 10) * 0.7 : 0;
  av.userData.armL.rotation.x = s; av.userData.armR.rotation.x = -s;
  av.userData.legL.rotation.x = -s; av.userData.legR.rotation.x = s;
}

// ---------- State ----------
let socket, myId, room = 'hub', coins = 0, checkpoint = 0;
let me = null;
const others = {}; // id -> {av, target, ry, last}
const pos = new THREE.Vector3(), vel = new THREE.Vector3();
let onGround = false, yaw = 0, camYaw = 0, camPitch = 0.35;
const keys = {};
const joy = { x: 0, y: 0 };
let tagState = { it: null, roundEnds: 0 };
const PR = 0.4, PH = 2; // player radius/height

function enterRoom(r, list) {
  room = r;
  for (const id in others) { scene.remove(others[id].av); delete others[id]; }
  ({ hub: buildHub, obby: buildObby, tag: buildTag })[r]();
  pos.copy(spawn); vel.set(0, 0, 0); checkpoint = 0;
  $('roomLabel').textContent = { hub: '🏠 Hub', obby: '🏃 Obby', tag: '🏷️ Tag' }[r];
  $('hubBtn').style.display = r === 'hub' ? 'none' : 'inline-block';
  $('tagInfo').style.display = r === 'tag' ? 'inline-block' : 'none';
  me.userData.crown.visible = false;
  list.forEach(addOther);
}
function addOther(p) {
  if (p.id === myId || others[p.id]) return;
  const av = makeAvatar(p.color, p.name);
  av.position.set(p.x, p.y - PH / 2, p.z);
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
  socket.on('player:leave', id => { if (others[id]) { scene.remove(others[id].av); delete others[id]; } });
  socket.on('player:move', d => { const o = others[d.id]; if (o) { o.target.set(d.x, d.y - PH / 2, d.z); o.ry = d.ry; } });
  socket.on('coins', c => { coins = c; $('coins').textContent = c; });
  socket.on('toast', toast);
  socket.on('chat', d => addChat(d.name, d.text));
  socket.on('tag:state', s => {
    tagState = s; updateTagUI();
    if (room === 'tag') toast(s.it === myId ? '🔴 நீங்க தான் IT! எல்லாரையும் பிடிங்க' : '🏃 ஓடுங்க! IT கிட்ட மாட்டாதீங்க');
  });
  if (matchMedia('(pointer:coarse)').matches) {
    $('joy').style.display = 'block'; $('jumpBtn').style.display = 'block'; $('help').style.display = 'none';
  }
  last = performance.now();
  requestAnimationFrame(loop);
};
$('hubBtn').onclick = () => socket.emit('switchRoom', 'hub');
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
joyEl.addEventListener('pointerup', () => { joyId = null; joy.x = joy.y = 0; knob.style.left = knob.style.top = '40px'; });
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

// ---------- Physics ----------
const pBox = new THREE.Box3();
function playerBox(p) { pBox.min.set(p.x - PR, p.y - PH / 2, p.z - PR); pBox.max.set(p.x + PR, p.y + PH / 2, p.z + PR); return pBox; }
function collideAxis(axis, delta) {
  pos[axis] += delta;
  const b = playerBox(pos);
  for (const s of solids) {
    if (!s.solid || !b.intersectsBox(s.box)) continue;
    if (axis === 'y') {
      if (delta < 0) { pos.y = s.box.max.y + PH / 2; onGround = true; s.ridden = true; }
      else pos.y = s.box.min.y - PH / 2 - 0.001;
      vel.y = 0;
    } else {
      pos[axis] = delta > 0 ? s.box.min[axis] - PR - 0.001 : s.box.max[axis] + PR + 0.001;
    }
    playerBox(pos);
  }
}
function respawn() {
  if (room === 'obby' && checkpoint > 0) {
    const c = solids.find(s => s.checkpoint === checkpoint);
    pos.set(c.mesh.position.x, c.mesh.position.y + 1.5, c.mesh.position.z);
  } else pos.copy(spawn);
  vel.set(0, 0, 0);
}

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
  vel.x = mx * speed; vel.z = mz * speed;
  if (Math.hypot(mx, mz) > 0.1) yaw = Math.atan2(mx, mz);
  if (keys.Space && onGround) { vel.y = 9.5; onGround = false; }
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
      checkpoint = s.checkpoint; socket.emit('obby:checkpoint', checkpoint); toast(`✅ Checkpoint ${checkpoint}`);
    }
  }
  const fin = solids.find(s => s.finish);
  if (fin && onGround && Math.abs(pos.y - PH / 2 - fin.box.max.y) < 0.05 &&
      pos.x > fin.box.min.x && pos.x < fin.box.max.x && pos.z > fin.box.min.z && pos.z < fin.box.max.z && !finishLock) {
    finishLock = true; socket.emit('obby:finish');
    setTimeout(() => { finishLock = false; checkpoint = 0; pos.copy(spawn); vel.set(0, 0, 0); }, 2000);
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

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
