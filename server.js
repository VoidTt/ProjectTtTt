const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const players = new Map();

function randomColor() {
  const colors = ['#ff4d4d', '#4dff4d', '#4d4dff', '#ffd24d', '#ff4dff', '#4dffff'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function createPlayer(id) {
  return {
    id,
    x: Math.floor(Math.random() * 700) + 20,
    y: Math.floor(Math.random() * 400) + 20,
    color: randomColor(),
  };
}

io.on('connection', (socket) => {
  const player = createPlayer(socket.id);
  players.set(socket.id, player);

  socket.emit('init', {
    id: socket.id,
    players: Array.from(players.values()),
  });

  socket.broadcast.emit('playerJoined', player);

  socket.on('move', ({ x, y }) => {
    const p = players.get(socket.id);
    if (!p) return;

    p.x = x;
    p.y = y;

    socket.broadcast.emit('playerMoved', p);
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('playerLeft', socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



// npm run dev
//или npm.cmd run dev
// http://localhost:3000
