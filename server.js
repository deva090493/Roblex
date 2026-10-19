// BlockVerse - multiplayer mini-game platform server
// Rooms: "hub", "obby", "tag". Players move freely; server relays positions
// and runs game logic (obby checkpoints/finish, tag "it" rules).
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Always serve fresh game files so app users get updates immediately
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false, lastModified: false,
  setHeaders: res => res.set('Cache-Control', 'no-store')
}));
app.get('/health', (_, res) => res.json({ ok: true, players: Object.keys(players).length }));

const ROOMS = ['hub', 'obby', 'tag', 'coinrush', 'lava', 'floor', 'fight', 'tycoon', 'heist', 'hide', 'race'];
const players = {}; // id -> {id,name,color,room,x,y,z,ry,coins,checkpoint}
const tagState = { it: null, roundEnds: 0 };
const TAG_ROUND_MS = 90 * 1000;

// Level rooms: obby-2..51, race-2..21, tower-1..20 (procedurally generated maps)
const LEVEL_ROOM = /^(obby-([2-9]|[1-4]\d|5[01])|race-([2-9]|1\d|2[01])|tower-([1-9]|1\d|20))$/;
const validRoom = r => typeof r === 'string' && (ROOMS.includes(r) || LEVEL_ROOM.test(r));
const isClimb = r => r === 'obby' || r.startsWith('obby-') || r.startsWith('tower-');
const isRace = r => r === 'race' || r.startsWith('race-');
function roomPlayers(room) {
  return Object.values(players).filter(p => p.room === room);
}
function sanitizeName(n) {
  return String(n || 'Player').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 16) || 'Player';
}
function leaveVoice(socket, p) {
  if (!p.voice) return;
  p.voice = false;
  socket.to(p.room).emit('voice:bye', p.id);
  io.to(p.room).emit('voice:count', roomPlayers(p.room).filter(o => o.voice).length);
}
function pickIt() {
  const list = roomPlayers('tag');
  tagState.it = list.length ? list[Math.floor(Math.random() * list.length)].id : null;
  tagState.roundEnds = Date.now() + TAG_ROUND_MS;
  io.to('tag').emit('tag:state', tagState);
}

io.on('connection', socket => {
  socket.on('join', ({ name, color, save } = {}) => {
    const sv = save && typeof save === 'object' ? save : {};
    const clampInt = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
    players[socket.id] = {
      id: socket.id, name: sanitizeName(name),
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#ff5533',
      room: 'hub', x: 0, y: 1, z: 0, ry: 0, coins: clampInt(sv.coins, 1e6), checkpoint: 0,
      house: clampInt(sv.house, HOUSE_PARTS.length), car: false
    };
    socket.emit('coins', players[socket.id].coins);
    socket.join('hub');
    socket.emit('welcome', { id: socket.id, players: roomPlayers('hub') });
    socket.to('hub').emit('player:join', players[socket.id]);
  });

  socket.on('switchRoom', room => {
    const p = players[socket.id];
    if (!p || !validRoom(room) || p.room === room) return;
    socket.to(p.room).emit('player:leave', p.id);
    leaveVoice(socket, p);
    socket.leave(p.room);
    if (p.room === 'tag' && tagState.it === p.id) pickIt();
    p.room = room; p.x = 0; p.y = 1; p.z = 0; p.checkpoint = 0;
    socket.join(room);
    socket.emit('room', { room, players: roomPlayers(room) });
    socket.to(room).emit('player:join', p);
    if (p.plotLeave) p.plotLeave();
    if (room === 'tycoon') tycoonJoin(p);
    if (room === 'heist') { p.team = p.team || 'robber'; p.bag = false; p.jailUntil = 0; heistBroadcast(); }
    if (room === 'hide') { p.found = hideState.phase === 'seek'; socket.emit('hide:state', hidePublic()); }
    if (isRace(room)) { p.gate = 0; p.raceStart = 0; socket.emit('race:best', bestFor(room)); }
    if (room === 'fight') { p.hp = 100; io.to('fight').emit('fight:hp', { id: p.id, hp: p.hp }); }
    if (room === 'coinrush') socket.emit('coinrush:state', coinState.coins);
    if (room === 'lava') socket.emit('lava:state', { elapsed: Date.now() - lavaState.start });
    if (room === 'floor') socket.emit('floor:phase', floorState);
    if (room === 'tag') {
      if (!tagState.it || !players[tagState.it] || players[tagState.it].room !== 'tag') pickIt();
      else socket.emit('tag:state', tagState);
    }
  });

  socket.on('move', d => {
    const p = players[socket.id];
    if (!p || typeof d !== 'object') return;
    for (const k of ['x', 'y', 'z', 'ry']) if (Number.isFinite(d[k])) p[k] = d[k];
    p.car = !!d.car;
    socket.to(p.room).volatile.emit('player:move', { id: p.id, x: p.x, y: p.y, z: p.z, ry: p.ry, car: p.car });
    if (p.room === 'heist') heistProximity(p);
    if (p.room === 'hide') hideProximity(p);

    // Tag: server checks if "it" touched someone
    if (p.room === 'tag' && tagState.it === p.id && Date.now() - (tagState.lastTag || 0) > 2000) {
      for (const o of roomPlayers('tag')) {
        if (o.id === p.id) continue;
        const dist = Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z);
        if (dist < 1.4) {
          tagState.it = o.id;
          tagState.lastTag = Date.now();
          tagState.roundEnds = Date.now() + TAG_ROUND_MS;
          io.to('tag').emit('tag:state', tagState);
          io.to('tag').emit('toast', `${p.name} tagged ${o.name}!`);
          break;
        }
      }
    }
  });

  socket.on('obby:checkpoint', n => {
    const p = players[socket.id];
    if (p && isClimb(p.room) && Number.isInteger(n) && n > p.checkpoint && n < 50) p.checkpoint = n;
  });
  socket.on('obby:finish', () => {
    const p = players[socket.id];
    if (!p || !isClimb(p.room)) return;
    const now = Date.now();
    if (now - (p.lastFinish || 0) < 15000) return;
    p.lastFinish = now;
    const lvl = parseInt(p.room.split('-')[1]) || 1;
    const reward = 40 + Math.min(60, lvl * 2);
    p.coins += reward;
    socket.emit('coins', p.coins);
    io.to(p.room).emit('toast', `🏆 ${p.name} finish பண்ணிட்டாங்க! +${reward}`);
    p.checkpoint = 0;
  });

  // Coin Rush: grab a coin if close enough
  socket.on('coinrush:grab', id => {
    const p = players[socket.id];
    if (!p || p.room !== 'coinrush') return;
    const i = coinState.coins.findIndex(c => c.id === id);
    if (i < 0) return;
    const c = coinState.coins[i];
    if (Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z) > 2.5) return;
    p.coins += c.gold ? 10 : 2;
    socket.emit('coins', p.coins);
    const n = makeCoin();
    coinState.coins[i] = n;
    io.to('coinrush').emit('coinrush:taken', { id, by: p.id, next: n });
  });

  // Lava Rise: reached the top before the lava
  socket.on('lava:win', () => {
    const p = players[socket.id];
    if (!p || p.room !== 'lava' || p.y < LAVA_TOP - 1.5 || lavaState.winners.has(p.id)) return;
    lavaState.winners.add(p.id);
    p.coins += 30;
    socket.emit('coins', p.coins);
    io.to('lava').emit('toast', `🌋 ${p.name} மேல வந்துட்டாங்க! +30`);
  });

  // ---------- House Tycoon ----------
  socket.on('tycoon:buy', () => {
    const p = players[socket.id];
    if (!p || p.room !== 'tycoon' || p.plot == null || p.house >= HOUSE_PARTS.length) return;
    const part = HOUSE_PARTS[p.house];
    if (p.coins < part.cost) { socket.emit('toast', `🪙 ${part.cost} coins தேவை (உங்ககிட்ட ${p.coins})`); return; }
    p.coins -= part.cost; p.house++;
    socket.emit('coins', p.coins); socket.emit('house', p.house);
    io.to('tycoon').emit('toast', `🏠 ${p.name}: ${part.name} கட்டி முடிச்சாங்க!`);
    io.to('tycoon').emit('tycoon:plots', plotsPublic());
  });
  socket.on('tycoon:work', () => { // delivery job: drop a box at the truck
    const p = players[socket.id];
    if (!p || p.room !== 'tycoon') return;
    const now = Date.now();
    if (now - (p.lastWork || 0) < 1500) return;
    if (!p.carry || Math.hypot(p.x - TRUCK.x, p.z - TRUCK.z) > 6) return;
    p.carry = false; p.lastWork = now; p.coins += 3; socket.emit('coins', p.coins);
  });

  socket.on('tycoon:pick', () => {
    const p = players[socket.id];
    if (p && p.room === 'tycoon' && Math.hypot(p.x - WAREHOUSE.x, p.z - WAREHOUSE.z) < 6) p.carry = true;
  });

  // ---------- City Heist ----------
  socket.on('heist:team', t => {
    const p = players[socket.id];
    if (!p || p.room !== 'heist' || !['robber', 'police'].includes(t) || p.jailUntil > Date.now()) return;
    p.team = t; p.bag = false; heistBroadcast();
    socket.emit('heist:respawn', t);
  });
  socket.on('heist:robstart', () => {
    const p = players[socket.id];
    if (p && p.room === 'heist' && p.team === 'robber' && inBox(p, VAULT)) p.robStart = Date.now();
  });
  socket.on('heist:robdone', () => {
    const p = players[socket.id];
    if (!p || p.room !== 'heist' || p.team !== 'robber' || !p.robStart || !inBox(p, VAULT)) return;
    if (Date.now() - p.robStart < 3800) return;
    p.robStart = 0; p.bag = true; heistBroadcast();
    io.to('heist').emit('toast', `🚨 ${p.name} bank-ஐ கொள்ளை அடிச்சாங்க! Police பிடிங்க!`);
  });
  socket.on('heist:deliver', () => {
    const p = players[socket.id];
    if (!p || p.room !== 'heist' || !p.bag || !inBox(p, HIDEOUT)) return;
    p.bag = false; p.coins += 40; socket.emit('coins', p.coins); heistBroadcast();
    io.to('heist').emit('toast', `💰 ${p.name} பணத்தை hideout-க்கு கொண்டு போயிட்டாங்க! +40`);
  });

  // ---------- Race ----------
  socket.on('race:gate', n => {
    const p = players[socket.id];
    if (!p || !isRace(p.room) || !Number.isInteger(n)) return;
    if (n === 1 && p.gate !== 1) { p.gate = 1; p.raceStart = Date.now(); return; }
    if (n === p.gate + 1 && n <= RACE_GATES) p.gate = n;
  });
  socket.on('race:finish', () => {
    const p = players[socket.id];
    if (!p || !isRace(p.room) || p.gate !== RACE_GATES || !p.raceStart) return;
    const raceBest = bestFor(p.room);
    const t = (Date.now() - p.raceStart) / 1000;
    p.gate = 0; p.raceStart = 0;
    if (t < 8) return; // impossible time
    const reward = t < 35 ? 40 : t < 50 ? 25 : 10;
    p.coins += reward; socket.emit('coins', p.coins);
    raceBest.push({ name: p.name, t: Math.round(t * 10) / 10 });
    raceBest.sort((a, b) => a.t - b.t); raceBest.length = Math.min(raceBest.length, 5);
    io.to(p.room).emit('race:best', raceBest);
    io.to(p.room).emit('toast', `🏁 ${p.name} ${t.toFixed(1)}s-ல finish! +${reward}`);
  });

  // ---------- Fight ----------
  socket.on('fight:punch', () => {
    const p = players[socket.id];
    if (!p || p.room !== 'fight') return;
    const now = Date.now();
    if (now - (p.lastPunch || 0) < 450) return;
    p.lastPunch = now;
    socket.to('fight').emit('fight:swing', p.id);
    let target = null, best = 2.3;
    for (const o of roomPlayers('fight')) {
      if (o.id === p.id) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z);
      if (d < best) { best = d; target = o; }
    }
    if (!target) return;
    const dmg = 10 + Math.floor(Math.random() * 6);
    target.hp = Math.max(0, (target.hp ?? 100) - dmg);
    const len = Math.hypot(target.x - p.x, target.z - p.z) || 1;
    io.to('fight').emit('fight:hit', {
      target: target.id, attacker: p.id, hp: target.hp, dmg,
      kx: (target.x - p.x) / len, kz: (target.z - p.z) / len
    });
    if (target.hp <= 0) {
      p.coins += 15; socket.emit('coins', p.coins);
      p.kos = (p.kos || 0) + 1;
      io.to('fight').emit('toast', `💥 ${p.name} KO பண்ணிட்டாங்க ${target.name}-ஐ! (+15)`);
      io.to(target.id).emit('fight:ko');
      target.hp = 100;
      io.to('fight').emit('fight:hp', { id: target.id, hp: 100 });
    }
  });
  socket.on('fight:fell', () => {
    const p = players[socket.id];
    if (!p || p.room !== 'fight') return;
    p.hp = 100; io.to('fight').emit('fight:hp', { id: p.id, hp: 100 });
  });

  // ---------- Voice chat (WebRTC signaling, per room) ----------
  socket.on('voice:join', () => {
    const p = players[socket.id];
    if (!p || p.voice) return;
    const peers = roomPlayers(p.room).filter(o => o.voice && o.id !== p.id).map(o => o.id);
    p.voice = true;
    socket.emit('voice:peers', peers);           // new member calls everyone already in voice
    io.to(p.room).emit('voice:count', roomPlayers(p.room).filter(o => o.voice).length);
  });
  socket.on('voice:leave', () => { const p = players[socket.id]; if (p) leaveVoice(socket, p); });
  socket.on('voice:signal', ({ to, data } = {}) => {
    const p = players[socket.id], o = players[to];
    if (!p || !o || !p.voice || !o.voice || o.room !== p.room) return;
    io.to(to).emit('voice:signal', { from: p.id, data });
  });
  socket.on('voice:talking', on => {
    const p = players[socket.id];
    if (p && p.voice) socket.to(p.room).emit('voice:talking', { id: p.id, on: !!on });
  });

  socket.on('chat', msg => {
    const p = players[socket.id];
    if (!p) return;
    const text = String(msg || '').slice(0, 120).trim();
    if (text) io.to(p.room).emit('chat', { name: p.name, text });
  });

  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (!p) return;
    socket.to(p.room).emit('player:leave', p.id);
    leaveVoice(socket, p);
    if (p.plotLeave) p.plotLeave();
    delete players[socket.id];
    if (tagState.it === socket.id) pickIt();
  });
});

// Tag round timer: survivors earn coins when time runs out
setInterval(() => {
  if (tagState.roundEnds && Date.now() > tagState.roundEnds) {
    for (const p of roomPlayers('tag')) {
      if (p.id !== tagState.it) {
        p.coins += 20;
        io.to(p.id).emit('coins', p.coins);
      }
    }
    io.to('tag').emit('toast', 'Round over! Survivors +20 coins');
    pickIt();
  }
}, 1000);

// ---------- Coin Rush ----------
let coinSeq = 0;
function makeCoin() {
  const gold = Math.random() < 0.15;
  return { id: ++coinSeq, gold, x: (Math.random() - 0.5) * 44, y: Math.random() < 0.3 ? 2.5 : 1, z: (Math.random() - 0.5) * 44 };
}
const coinState = { coins: Array.from({ length: 20 }, makeCoin) };

// ---------- Lava Rise ----------
const LAVA_TOP = 36, LAVA_PERIOD = 120 * 1000;
const lavaState = { start: Date.now(), winners: new Set() };
setInterval(() => {
  if (Date.now() - lavaState.start > LAVA_PERIOD) {
    lavaState.start = Date.now(); lavaState.winners = new Set();
    io.to('lava').emit('lava:state', { elapsed: 0, reset: true });
  }
}, 1000);

// ---------- Block Party (Floor) ----------
const FLOOR_COLORS = 5;
const floorState = { color: 0, drop: false, round: 0 };
function floorTick() {
  if (!floorState.drop) {
    // show color for a few seconds, then drop other tiles
    floorState.drop = true;
    io.to('floor').emit('floor:phase', floorState);
    setTimeout(floorTick, 2500);
  } else {
    // survivors (still standing on the floor level) earn coins
    for (const p of roomPlayers('floor')) {
      if (p.y > 0.5 && p.y < 4) { p.coins += 3; io.to(p.id).emit('coins', p.coins); }
    }
    floorState.drop = false;
    floorState.round++;
    floorState.color = Math.floor(Math.random() * FLOOR_COLORS);
    io.to('floor').emit('floor:phase', floorState);
    setTimeout(floorTick, Math.max(2000, 4500 - (floorState.round % 10) * 250));
  }
}
setTimeout(floorTick, 4000);

function inBox(p, b) { return p.x > b.x1 && p.x < b.x2 && p.z > b.z1 && p.z < b.z2; }

// ---------- House Tycoon ----------
const HOUSE_PARTS = [
  { name: 'Plot claim', cost: 0 }, { name: 'Floor', cost: 15 }, { name: 'Walls', cost: 30 },
  { name: 'Door & Windows', cost: 45 }, { name: 'Roof', cost: 60 }, { name: 'Garden', cost: 80 },
  { name: 'Furniture', cost: 100 }, { name: '2nd Floor', cost: 140 }, { name: 'Swimming Pool', cost: 180 },
  { name: 'Car Garage', cost: 230 }, { name: 'Gold Statue', cost: 300 }
];
const PLOTS = 8;
const plots = Array(PLOTS).fill(null); // player id per plot
const TRUCK = { x: 0, z: -6 }, WAREHOUSE = { x: 0, z: 10 };
function plotsPublic() {
  return plots.map(id => id && players[id] ? { owner: id, name: players[id].name, level: players[id].house } : null);
}
function tycoonJoin(p) {
  let i = plots.indexOf(null);
  if (i < 0) { io.to(p.id).emit('toast', 'எல்லா plots-உம் full — job பண்ணி coins சம்பாதிக்கலாம்'); p.plot = null; }
  else {
    plots[i] = p.id; p.plot = i;
    p.plotLeave = () => { if (plots[i] === p.id) plots[i] = null; p.plot = null; p.plotLeave = null; io.to('tycoon').emit('tycoon:plots', plotsPublic()); };
  }
  io.to('tycoon').emit('tycoon:plots', plotsPublic());
  io.to(p.id).emit('tycoon:you', { plot: p.plot, house: p.house });
}
// passive rent income from your house
setInterval(() => {
  for (const p of roomPlayers('tycoon')) {
    if (p.plot != null && p.house > 1) { p.coins += Math.floor(p.house / 2); io.to(p.id).emit('coins', p.coins); }
  }
}, 5000);

// ---------- City Heist ----------
const VAULT = { x1: 18, x2: 26, z1: -30, z2: -22 };
const HIDEOUT = { x1: -40, x2: -32, z1: 28, z2: 36 };
const JAIL = { x: 34, z: 30 };
function heistBroadcast() {
  io.to('heist').emit('heist:state', Object.fromEntries(roomPlayers('heist').map(p =>
    [p.id, { team: p.team, bag: p.bag, jailed: p.jailUntil > Date.now() }])));
}
function heistProximity(p) {
  if (p.team !== 'police') return;
  const now = Date.now();
  for (const o of roomPlayers('heist')) {
    if (o.team !== 'robber' || o.jailUntil > now) continue;
    if (Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z) < (o.car || p.car ? 3 : 1.6)) {
      const reward = o.bag ? 40 : 15;
      o.bag = false; o.jailUntil = now + 20000; o.robStart = 0;
      p.coins += reward; io.to(p.id).emit('coins', p.coins);
      io.to(o.id).emit('heist:jail', { x: JAIL.x, z: JAIL.z, secs: 20 });
      io.to('heist').emit('toast', `🚓 ${p.name} arrest பண்ணாங்க ${o.name}-ஐ! +${reward}`);
      heistBroadcast();
    }
  }
}
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const p of roomPlayers('heist')) {
    if (p.jailUntil && p.jailUntil <= now) { p.jailUntil = 0; changed = true; io.to(p.id).emit('heist:free'); }
  }
  if (changed) heistBroadcast();
}, 1000);

// ---------- Hide & Seek ----------
const HIDE_SECS = 20, SEEK_SECS = 90;
const hideState = { phase: 'wait', seeker: null, ends: 0 };
function hidePublic() {
  return { phase: hideState.phase, seeker: hideState.seeker, ends: hideState.ends,
    found: roomPlayers('hide').filter(p => p.found).map(p => p.id) };
}
function hideStart() {
  const list = roomPlayers('hide');
  if (list.length < 2) { hideState.phase = 'wait'; hideState.seeker = null; hideState.ends = 0; }
  else {
    hideState.seeker = list[Math.floor(Math.random() * list.length)].id;
    hideState.phase = 'hide'; hideState.ends = Date.now() + HIDE_SECS * 1000;
    list.forEach(p => p.found = false);
  }
  io.to('hide').emit('hide:state', { ...hidePublic(), newRound: true });
}
function hideEnd() {
  for (const p of roomPlayers('hide')) {
    if (p.id !== hideState.seeker && !p.found) { p.coins += 25; io.to(p.id).emit('coins', p.coins); }
  }
  const left = roomPlayers('hide').filter(p => p.id !== hideState.seeker && !p.found).length;
  io.to('hide').emit('toast', left ? `🙈 ${left} பேர் ஒளிஞ்சு தப்பிச்சாங்க! +25` : '👁️ Seeker எல்லாரையும் கண்டுபிடிச்சாங்க!');
  hideState.phase = 'wait'; hideState.ends = Date.now() + 5000;
  io.to('hide').emit('hide:state', hidePublic());
}
function hideProximity(p) {
  if (hideState.phase !== 'seek' || p.id !== hideState.seeker) return;
  for (const o of roomPlayers('hide')) {
    if (o.id === p.id || o.found) continue;
    if (Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z) < 1.7) {
      o.found = true; p.coins += 10; io.to(p.id).emit('coins', p.coins);
      io.to('hide').emit('toast', `👀 ${p.name} கண்டுபிடிச்சாங்க ${o.name}-ஐ!`);
      io.to('hide').emit('hide:state', hidePublic());
      if (roomPlayers('hide').every(x => x.id === hideState.seeker || x.found)) hideEnd();
    }
  }
}
setInterval(() => {
  const now = Date.now(), list = roomPlayers('hide');
  if (hideState.phase !== 'wait' && (!players[hideState.seeker] || players[hideState.seeker].room !== 'hide' || list.length < 2)) {
    hideState.phase = 'wait'; hideState.ends = now + 3000; io.to('hide').emit('hide:state', hidePublic()); return;
  }
  if (hideState.phase === 'wait' && list.length >= 2 && now > hideState.ends) hideStart();
  else if (hideState.phase === 'hide' && now > hideState.ends) {
    hideState.phase = 'seek'; hideState.ends = now + SEEK_SECS * 1000; io.to('hide').emit('hide:state', hidePublic());
  } else if (hideState.phase === 'seek' && now > hideState.ends) hideEnd();
}, 1000);

// ---------- Race ----------
const RACE_GATES = 8;
const raceBests = {};
const bestFor = r => (raceBests[r] ||= []);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`BlockVerse running on http://localhost:${PORT}`));
