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

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, res) => res.json({ ok: true, players: Object.keys(players).length }));

const ROOMS = ['hub', 'obby', 'tag'];
const players = {}; // id -> {id,name,color,room,x,y,z,ry,coins,checkpoint}
const tagState = { it: null, roundEnds: 0 };
const TAG_ROUND_MS = 90 * 1000;

function roomPlayers(room) {
  return Object.values(players).filter(p => p.room === room);
}
function sanitizeName(n) {
  return String(n || 'Player').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 16) || 'Player';
}
function pickIt() {
  const list = roomPlayers('tag');
  tagState.it = list.length ? list[Math.floor(Math.random() * list.length)].id : null;
  tagState.roundEnds = Date.now() + TAG_ROUND_MS;
  io.to('tag').emit('tag:state', tagState);
}

io.on('connection', socket => {
  socket.on('join', ({ name, color }) => {
    players[socket.id] = {
      id: socket.id, name: sanitizeName(name),
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#ff5533',
      room: 'hub', x: 0, y: 1, z: 0, ry: 0, coins: 0, checkpoint: 0
    };
    socket.join('hub');
    socket.emit('welcome', { id: socket.id, players: roomPlayers('hub') });
    socket.to('hub').emit('player:join', players[socket.id]);
  });

  socket.on('switchRoom', room => {
    const p = players[socket.id];
    if (!p || !ROOMS.includes(room) || p.room === room) return;
    socket.to(p.room).emit('player:leave', p.id);
    socket.leave(p.room);
    if (p.room === 'tag' && tagState.it === p.id) pickIt();
    p.room = room; p.x = 0; p.y = 1; p.z = 0; p.checkpoint = 0;
    socket.join(room);
    socket.emit('room', { room, players: roomPlayers(room) });
    socket.to(room).emit('player:join', p);
    if (room === 'tag') {
      if (!tagState.it || !players[tagState.it] || players[tagState.it].room !== 'tag') pickIt();
      else socket.emit('tag:state', tagState);
    }
  });

  socket.on('move', d => {
    const p = players[socket.id];
    if (!p || typeof d !== 'object') return;
    for (const k of ['x', 'y', 'z', 'ry']) if (Number.isFinite(d[k])) p[k] = d[k];
    socket.to(p.room).volatile.emit('player:move', { id: p.id, x: p.x, y: p.y, z: p.z, ry: p.ry });

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
    if (p && p.room === 'obby' && Number.isInteger(n) && n === p.checkpoint + 1) p.checkpoint = n;
  });
  socket.on('obby:finish', () => {
    const p = players[socket.id];
    if (!p || p.room !== 'obby') return;
    p.coins += 50;
    socket.emit('coins', p.coins);
    io.to('obby').emit('toast', `🏆 ${p.name} finished the Obby!`);
    p.checkpoint = 0;
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`BlockVerse running on http://localhost:${PORT}`));
