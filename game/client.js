import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const me = await fetch('/api/me').then((r) => r.json());
const socket = io();

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';

const playerInfo = document.getElementById('player-info') || (() => {
  const el = document.createElement('div');
  el.id = 'player-info';
  document.body.appendChild(el);
  return el;
})();

Object.assign(playerInfo.style, {
  position: 'fixed',
  top: '16px',
  right: '16px',
  zIndex: '10',
  padding: '10px 14px',
  borderRadius: '12px',
  background: 'rgba(0, 0, 0, 0.45)',
  color: me.color,
  fontFamily: 'Arial, sans-serif',
  fontSize: '16px',
  pointerEvents: 'none',
  border: `1px solid ${me.color}`,
  boxShadow: `0 0 0 1px ${me.color}33`,
});

playerInfo.textContent = me.username;

socket.on('connect', () => {
  socket.emit('setProfile', {
    username: me.username,
    color: me.color,
  });
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x22252d);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 18, 18);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 1.6));

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(5, 10, 7);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  new THREE.MeshStandardMaterial({ color: 0x555555 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

scene.add(new THREE.GridHelper(100, 100));

const loader = new FBXLoader();
const clock = new THREE.Clock();

const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

const remotePlayers = new Map();
const pendingProfiles = new Map();

let localPlayer = null;

function createNameTag(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4, 1, 1);
  sprite.renderOrder = 999;

  return sprite;
}

function disposeMaterial(material) {
  if (!material) return;
  if (material.map) material.map.dispose();
  material.dispose();
}

function disposeEntity(entity) {
  if (!entity) return;

  entity.group.traverse((child) => {
    if (child.isMesh) {
      if (child.geometry) child.geometry.dispose();

      if (Array.isArray(child.material)) {
        child.material.forEach(disposeMaterial);
      } else {
        disposeMaterial(child.material);
      }
    }

    if (child.isSprite && child.material) {
      disposeMaterial(child.material);
    }
  });
}

function applyColorToModel(model, color) {
  model.traverse((child) => {
    if (!child.isMesh || !child.material) return;

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => {
        const cloned = material.clone();
        if (cloned.color) cloned.color.set(color);
        return cloned;
      });
    } else {
      const cloned = child.material.clone();
      if (cloned.color) cloned.color.set(color);
      child.material = cloned;
    }
  });
}

function centerAndScaleModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  const maxSize = Math.max(size.x, size.y, size.z);
  const scale = 3 / maxSize;

  model.scale.setScalar(scale);
  model.position.set(0, -box.min.y * scale, 0);
}

function loadCharacterModel(color) {
  return new Promise((resolve, reject) => {
    loader.load(
      '/game/models/SKM_Skeleton_Var_1.fbx',
      (object) => {
        centerAndScaleModel(object);
        applyColorToModel(object, color);

        object.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        resolve(object);
      },
      undefined,
      reject
    );
  });
}

async function createPlayerEntity({ username, color, x = 0, y = 0, z = 0, rotation = 0 }) {
  const group = new THREE.Group();
  const model = await loadCharacterModel(color);
  const tag = createNameTag(username, color);

  tag.position.set(0, 3.8, 0);

  group.add(model);
  group.add(tag);
  group.position.set(x, y, z);
  group.rotation.y = rotation;

  scene.add(group);

  return {
    group,
    model,
    tag,
    targetPosition: new THREE.Vector3(x, y, z),
    targetRotation: rotation,
  };
}

function setEntityProfile(entity, username, color) {
  if (!entity) return;

  if (entity.tag) {
    entity.group.remove(entity.tag);
    disposeMaterial(entity.tag.material);
  }

  applyColorToModel(entity.model, color);

  const tag = createNameTag(username || 'Player', color || '#ffffff');
  tag.position.set(0, 3.8, 0);

  entity.group.add(tag);
  entity.tag = tag;
}

async function spawnRemotePlayer(player) {
  if (remotePlayers.has(player.id)) return;

  const pending = pendingProfiles.get(player.id);

  const entity = await createPlayerEntity({
    username: pending?.username || player.username || 'Player',
    color: pending?.color || player.color || '#ffffff',
    x: player.x,
    y: player.y,
    z: player.z,
    rotation: player.rotation || 0,
  });

  remotePlayers.set(player.id, entity);
  pendingProfiles.delete(player.id);
}

socket.on('init', async (data) => {
  for (const player of data.players || []) {
    if (player.id === data.id) continue;
    await spawnRemotePlayer(player);
  }
});

socket.on('playerJoined', async (player) => {
  if (player.id === socket.id) return;
  await spawnRemotePlayer(player);
});

socket.on('playerMoved', (player) => {
  const remote = remotePlayers.get(player.id);
  if (!remote) return;

  remote.targetPosition.set(player.x, player.y, player.z);
  remote.targetRotation = Number.isFinite(player.rotation) ? player.rotation : 0;
});

socket.on('playerUpdated', (player) => {
  if (player.id === socket.id) return;

  const remote = remotePlayers.get(player.id);
  if (!remote) {
    pendingProfiles.set(player.id, player);
    return;
  }

  setEntityProfile(remote, player.username, player.color);
});

socket.on('playerLeft', (id) => {
  const remote = remotePlayers.get(id);
  if (!remote) return;

  scene.remove(remote.group);
  disposeEntity(remote);
  remotePlayers.delete(id);
});

function updateCamera() {
  if (!localPlayer) return;

  const p = localPlayer.group.position;
  camera.position.set(p.x, p.y + 18, p.z + 18);
  camera.lookAt(p.x, p.y + 2, p.z);
}

function updateLocalMovement(delta) {
  if (!localPlayer) return false;

  let moveX = 0;
  let moveZ = 0;

  if (keys['w']) moveZ -= 1;
  if (keys['s']) moveZ += 1;
  if (keys['a']) moveX -= 1;
  if (keys['d']) moveX += 1;

  if (moveX === 0 && moveZ === 0) return false;

  const length = Math.hypot(moveX, moveZ);
  moveX /= length;
  moveZ /= length;

  const speed = keys['shift'] ? 10 : 5;

  localPlayer.group.position.x += moveX * speed * delta;
  localPlayer.group.position.z += moveZ * speed * delta;
  localPlayer.group.rotation.y = Math.atan2(moveX, moveZ);

  return true;
}

async function initLocalPlayer() {
  localPlayer = await createPlayerEntity({
    username: me.username,
    color: me.color,
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
  });
}

await initLocalPlayer();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const moved = updateLocalMovement(delta);

  if (moved && localPlayer) {
    socket.emit('move', {
      x: localPlayer.group.position.x,
      y: localPlayer.group.position.y,
      z: localPlayer.group.position.z,
      rotation: localPlayer.group.rotation.y,
    });
  }

  for (const entity of remotePlayers.values()) {
    entity.group.position.lerp(entity.targetPosition, 0.18);
    entity.group.rotation.y = THREE.MathUtils.lerp(
      entity.group.rotation.y,
      entity.targetRotation,
      0.18
    );
  }

  updateCamera();
  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});