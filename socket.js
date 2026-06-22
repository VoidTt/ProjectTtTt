const players = new Map();

function randomColor() {
  const colors = [
    '#ff4d4d',
    '#4dff4d',
    '#4d4dff',
    '#ffd24d',
    '#ff4dff',
    '#4dffff'
  ];

  return colors[Math.floor(Math.random() * colors.length)];
}

function createPlayer(id) {
  return {
    id,
    username: 'Player',
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
    hp: 100,
    maxHp: 100,
    color: randomColor()
  };
}

module.exports = function setupMultiplayer(io) {

  io.on('connection', (socket) => {

    const player = createPlayer(socket.id);
    players.set(socket.id, player);

    socket.on('setProfile', ({ username, color }) => {
      const p = players.get(socket.id);
      if (!p) return;

      p.username = username || p.username;
      p.color = color || p.color;

      io.emit('playerUpdated', p);
    });

    socket.emit('init', {
      id: socket.id,
      players: Array.from(players.values())
    });

    socket.broadcast.emit('playerJoined', player);

    socket.on('move', (data) => {

      const p = players.get(socket.id);
      if (!p) return;

      p.x = data.x;
      p.y = data.y;
      p.z = data.z;

      p.rotation = Number.isFinite(data.rotation)
        ? data.rotation
        : p.rotation;

      socket.broadcast.emit('playerMoved', p);
    });

    socket.on('disconnect', () => {

      players.delete(socket.id);

      io.emit('playerLeft', socket.id);
    });

  });

};
