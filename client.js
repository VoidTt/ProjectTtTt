const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const socket = io();

const players = {};
let myId = null;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function upsertPlayer(player) {
  players[player.id] = player;
}

function removePlayer(id) {
  delete players[id];
}

socket.on('init', ({ id, players: list }) => {
  myId = id;
  list.forEach(upsertPlayer);
});

socket.on('playerJoined', upsertPlayer);
socket.on('playerMoved', upsertPlayer);
socket.on('playerLeft', removePlayer);

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const player of Object.values(players)) {
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, 40, 40);

    if (player.id === myId) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(player.x - 2, player.y - 2, 44, 44);
    }
  }

  requestAnimationFrame(draw);
}
draw();

function move(dx, dy) {
  const me = players[myId];
  if (!me) return;

  me.x = Math.max(0, Math.min(canvas.width - 40, me.x + dx));
  me.y = Math.max(0, Math.min(canvas.height - 40, me.y + dy));

  socket.emit('move', { x: me.x, y: me.y });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'w') move(0, -10);
  if (e.key === 'ArrowDown' || e.key === 's') move(0, 10);
  if (e.key === 'ArrowLeft' || e.key === 'a') move(-10, 0);
  if (e.key === 'ArrowRight' || e.key === 'd') move(10, 0);
});