const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ---------- DB ----------
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(path.join(dataDir, 'users.db'));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

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

// ---------- MIDDLEWARE ----------
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(
  session({
    secret: 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false
  })
);

app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));
app.use('/auth', express.static(path.join(__dirname, 'auth')));
app.use('/game', express.static(path.join(__dirname, 'game')));

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/auth/login.html');
}

// ---------- PAGES ----------
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/game/');
  } else {
    res.redirect('/auth/login.html');
  }
});

app.get('/game/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'game', 'index.html'));
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json(req.session.user);
});

app.post('/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();

  if (!username || !password) {
    return res.status(400).send('Ник и пароль обязательны');
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const color = randomColor();

    db.run(
      `INSERT INTO users (username, password_hash, color) VALUES (?, ?, ?)`,
      [username, passwordHash, color],
      function (err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).send('Такой ник уже занят');
          }
          console.error(err);
          return res.status(500).send('Ошибка регистрации');
        }

        req.session.user = {
          id: this.lastID,
          username,
          color
        };

        res.redirect('/game/');
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка регистрации');
  }
});

app.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();

  if (!username || !password) {
    return res.status(400).send('Ник и пароль обязательны');
  }

  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    async (err, user) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Ошибка входа');
      }

      if (!user) {
        return res.status(400).send('Неверный ник или пароль');
      }

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        return res.status(400).send('Неверный ник или пароль');
      }

      req.session.user = {
        id: user.id,
        username: user.username,
        color: user.color
      };

      res.redirect('/game/');
    }
  );
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login.html');
  });
});

// ---------- MULTIPLAYER ----------
const players = new Map();

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
  p.rotation = Number.isFinite(data.rotation) ? data.rotation : p.rotation;

  socket.broadcast.emit('playerMoved', p);
});

  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('playerLeft', socket.id);
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Server running on http://0.0.0.0:3000');
});

// npm run dev
// или npm.cmd run dev
// http://localhost:3000