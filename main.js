import * as THREE from 'three';

// =====================================================================
//  포근 농장 — 3D 힐링 농장 게임
// =====================================================================

// ---------- 유틸 ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261020); // 지형 배치는 매번 같게
const R = (a, b) => a + (b - a) * rng();
const rand = (a, b) => a + (b - a) * Math.random();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const matCache = new Map();
function mat(color, extra) {
  if (!extra && matCache.has(color)) return matCache.get(color);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
  if (!extra) matCache.set(color, m);
  return m;
}
function M(geo, material, cast = true, receive = false) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
function add(parent, geo, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  const o = M(geo, material);
  o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, ry, rz);
  parent.add(o);
  return o;
}

// ---------- 기본 설정 ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd8f5);
scene.fog = new THREE.Fog(0x9fd8f5, 45, 120);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 400);
const cam = { yaw: 0, targetYaw: 0, pitch: 0.82, dist: 18, targetDist: 18 };

const hemi = new THREE.HemisphereLight(0xe4f4ff, 0x6b8f4e, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 120 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// ---------- 섬 ----------
const ISLAND_R = 34;
const obstacles = []; // {x,z,r} 또는 {minX,maxX,minZ,maxZ}

{
  const top = M(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R - 1.2, 1.2, 56), mat(0x8cc65a), false, true);
  top.position.y = -0.6;
  const side = M(new THREE.CylinderGeometry(ISLAND_R - 1.2, ISLAND_R - 7, 3.4, 56), mat(0xa77447), false);
  side.position.y = -2.9;
  scene.add(top, side);
}
const waterMat = new THREE.MeshStandardMaterial({ color: 0x5bb8d6, roughness: 0.25, metalness: 0.05 });
const sea = new THREE.Mesh(new THREE.CircleGeometry(260, 64), waterMat);
sea.rotation.x = -Math.PI / 2; sea.position.y = -1.3; sea.receiveShadow = true;
scene.add(sea);

// 배치 금지 구역
const reserved = [
  { minX: -6.5, maxX: 6.5, minZ: -5, maxZ: 7.5 }, // 밭 + 시작 위치
  { minX: -16, maxX: -6, minZ: -13, maxZ: -3 },   // 집
  { x: 10, z: 7, r: 5.5 },                       // 연못
  { x: 11, z: -7, r: 6.5 },                      // 닭장
];
function isFree(x, z, pad = 0) {
  for (const o of reserved) {
    if (o.r !== undefined) { if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return false; }
    else if (x > o.minX - pad && x < o.maxX + pad && z > o.minZ - pad && z < o.maxZ + pad) return false;
  }
  return true;
}

// ---------- 나무 / 바위 / 풀 / 꽃 ----------
const swayers = [];
function makeRoundTree(s) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.22, 0.32, 1.6, 6), mat(0x8a5a36), 0, 0.8, 0);
  const crown = new THREE.Group(); crown.position.y = 1.6; g.add(crown);
  const greens = [0x6fb24a, 0x5ea544, 0x7cc256];
  const ico = new THREE.IcosahedronGeometry(1, 0);
  add(crown, ico, mat(greens[0]), 0, 0.9, 0, 1.3, 1.15, 1.3);
  add(crown, ico, mat(greens[1]), 0.6, 0.5, 0.3, 0.8, 0.8, 0.8);
  add(crown, ico, mat(greens[2]), -0.5, 1.4, -0.2, 0.75, 0.75, 0.75);
  if (rng() < 0.35) { // 열매
    const fruit = new THREE.SphereGeometry(0.13, 6, 4);
    for (let i = 0; i < 5; i++) {
      const a = R(0, Math.PI * 2);
      add(crown, fruit, mat(0xf06a4f), Math.cos(a) * 1.15, R(0.4, 1.3), Math.sin(a) * 1.15);
    }
  }
  g.scale.setScalar(s);
  swayers.push({ o: crown, p: R(0, 6.28) });
  return g;
}
function makePine(s) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.18, 0.26, 1.2, 6), mat(0x7a4e2e), 0, 0.6, 0);
  const crown = new THREE.Group(); crown.position.y = 1.0; g.add(crown);
  const cone = new THREE.ConeGeometry(1, 1.6, 7);
  add(crown, cone, mat(0x4f9a5a), 0, 0.7, 0, 1.3, 1, 1.3);
  add(crown, cone, mat(0x5aa865), 0, 1.5, 0, 1.0, 0.9, 1.0);
  add(crown, cone, mat(0x66b46f), 0, 2.2, 0, 0.7, 0.8, 0.7);
  g.scale.setScalar(s);
  swayers.push({ o: crown, p: R(0, 6.28) });
  return g;
}

{
  const placed = [];
  let tries = 0;
  while (placed.length < 60 && tries++ < 3000) {
    const a = R(0, Math.PI * 2), r = R(9, ISLAND_R - 2.5);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isFree(x, z, 1)) continue;
    if (placed.some(p => Math.hypot(p.x - x, p.z - z) < 3)) continue;
    const s = R(0.8, 1.25);
    const t = rng() < 0.55 ? makeRoundTree(s) : makePine(s);
    t.position.set(x, 0, z); t.rotation.y = R(0, 6.28);
    scene.add(t);
    placed.push({ x, z });
    obstacles.push({ x, z, r: 0.45 * s });
  }
  // 바위
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 22; i++) {
    const a = R(0, Math.PI * 2), r = R(8, ISLAND_R - 1.5);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isFree(x, z, 0.5)) continue;
    const s = R(0.25, 0.7);
    const rock = M(rockGeo, mat(rng() < 0.5 ? 0xa8a39a : 0x948f88), true, true);
    rock.position.set(x, s * 0.3, z); rock.scale.set(s * 1.2, s * 0.8, s); rock.rotation.set(R(0, 3), R(0, 3), R(0, 3));
    scene.add(rock);
    if (s > 0.45) obstacles.push({ x, z, r: s * 0.9 });
  }
  // 풀
  const tuftGeo = new THREE.ConeGeometry(0.07, 0.38, 3);
  const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), 900);
  const dummy = new THREE.Object3D(); const col = new THREE.Color();
  let n = 0;
  while (n < 900) {
    const a = R(0, Math.PI * 2), r = Math.sqrt(rng()) * (ISLAND_R - 1.5);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 4.6 && Math.abs(z) < 3.6) continue;
    if (Math.hypot(x - 10, z - 7) < 4) continue;
    dummy.position.set(x, 0.15, z); dummy.rotation.set(R(-0.3, 0.3), R(0, 3), R(-0.3, 0.3));
    dummy.scale.setScalar(R(0.7, 1.4)); dummy.updateMatrix();
    tufts.setMatrixAt(n, dummy.matrix);
    tufts.setColorAt(n, col.setHSL(R(0.24, 0.3), 0.5, R(0.38, 0.5)));
    n++;
  }
  scene.add(tufts);
  // 꽃
  const petalColors = [0xffffff, 0xffb3c7, 0xffe066, 0xc8a2ff, 0xff8f6b, 0x9ad0ff];
  const flowerHead = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }), 220);
  const flowerStem = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 3), mat(0x4f8f2f), 220);
  n = 0;
  while (n < 220) {
    const a = R(0, Math.PI * 2), r = Math.sqrt(rng()) * (ISLAND_R - 2);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isFree(x, z, -0.5) && !(Math.hypot(x - 10, z - 7) > 3.8 && Math.hypot(x - 10, z - 7) < 5.5)) continue;
    dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
    dummy.position.set(x, 0.15, z); dummy.updateMatrix(); flowerStem.setMatrixAt(n, dummy.matrix);
    dummy.position.set(x, 0.32, z); dummy.updateMatrix(); flowerHead.setMatrixAt(n, dummy.matrix);
    flowerHead.setColorAt(n, col.set(petalColors[Math.floor(rng() * petalColors.length)]));
    n++;
  }
  scene.add(flowerHead, flowerStem);
}

// ---------- 연못 ----------
{
  const pond = new THREE.Mesh(new THREE.CircleGeometry(3.6, 28), new THREE.MeshStandardMaterial({ color: 0x6cc4dd, roughness: 0.15 }));
  pond.rotation.x = -Math.PI / 2; pond.position.set(10, 0.03, 7); pond.receiveShadow = true;
  scene.add(pond);
  const stone = new THREE.DodecahedronGeometry(0.45, 0);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const s = M(stone, mat(i % 2 ? 0xb9b2a6 : 0xa59e93), true, true);
    s.position.set(10 + Math.cos(a) * 3.8, 0.1, 7 + Math.sin(a) * 3.8);
    s.scale.set(R(0.7, 1.1), R(0.4, 0.7), R(0.7, 1.1)); s.rotation.y = R(0, 3);
    scene.add(s);
  }
  const pad = new THREE.CylinderGeometry(0.45, 0.45, 0.04, 10, 1, false, 0.3, Math.PI * 1.8);
  for (let i = 0; i < 5; i++) {
    const p = M(pad, mat(0x5aa84a), false, true);
    p.position.set(10 + R(-2.2, 2.2), 0.06, 7 + R(-2.2, 2.2)); p.rotation.y = R(0, 6);
    scene.add(p);
    if (i < 2) add(scene, new THREE.SphereGeometry(0.14, 6, 4), mat(0xffb8d0), p.position.x, 0.14, p.position.z, 1, 0.6, 1);
  }
  obstacles.push({ x: 10, z: 7, r: 3.7 });
}

// ---------- 집 ----------
const windowMat = new THREE.MeshStandardMaterial({ color: 0xbfe3f2, emissive: 0xffc96b, emissiveIntensity: 0, roughness: 0.3 });
{
  const g = new THREE.Group(); g.position.set(-11, 0, -8); scene.add(g);
  add(g, new THREE.BoxGeometry(5.4, 3.2, 4.4), mat(0xf6e3c3), 0, 1.6, 0);
  add(g, new THREE.BoxGeometry(5.8, 0.3, 4.8), mat(0xc8a27a), 0, 0.15, 0);
  const roof = add(g, new THREE.ConeGeometry(4.6, 2.6, 4), mat(0xd9604c), 0, 4.5, 0, 1, 1, 0.82, 0, Math.PI / 4, 0);
  roof.castShadow = true;
  add(g, new THREE.BoxGeometry(0.7, 1.6, 0.7), mat(0xb5524a), 1.4, 5.0, -0.6);
  add(g, new THREE.BoxGeometry(1.1, 1.9, 0.12), mat(0x9a6a43), 0, 0.95, 2.22);
  add(g, new THREE.SphereGeometry(0.07, 6, 4), mat(0xffd35c), 0.35, 0.95, 2.3);
  for (const x of [-1.7, 1.7]) {
    add(g, new THREE.BoxGeometry(1, 0.9, 0.1), windowMat, x, 1.9, 2.21);
    add(g, new THREE.BoxGeometry(1.2, 0.12, 0.2), mat(0xffffff), x, 1.4, 2.25);
    add(g, new THREE.BoxGeometry(1.0, 0.25, 0.25), mat(0xf28fb0), x, 1.55, 2.35);
  }
  add(g, new THREE.BoxGeometry(0.1, 0.9, 1), windowMat, 2.71, 1.9, 0);
  obstacles.push({ minX: -13.9, maxX: -8.1, minZ: -10.4, maxZ: -5.6 });

  // 집에서 밭까지 징검다리
  const stoneGeo = new THREE.CylinderGeometry(0.42, 0.45, 0.08, 8);
  const p0 = new THREE.Vector2(-11, -5.2), p1 = new THREE.Vector2(-8, 4), p2 = new THREE.Vector2(-1, 5.8);
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const x = (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
    const z = (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
    const s = M(stoneGeo, mat(0xd8cdb8), false, true);
    s.position.set(x + R(-0.15, 0.15), 0.04, z + R(-0.15, 0.15)); s.scale.setScalar(R(0.8, 1.1));
    scene.add(s);
  }
}

// ---------- 닭장 ----------
{
  const g = new THREE.Group(); g.position.set(13.5, 0, -10); g.rotation.y = -0.6; scene.add(g);
  add(g, new THREE.BoxGeometry(2.4, 1.6, 1.8), mat(0xe07a5f), 0, 1.0, 0);
  add(g, new THREE.ConeGeometry(2.0, 1.1, 4), mat(0x8c5a3c), 0, 2.35, 0, 1, 1, 0.75, 0, Math.PI / 4, 0);
  add(g, new THREE.BoxGeometry(0.7, 0.8, 0.1), mat(0x5a3b28), 0, 0.6, 0.91);
  for (const [x, z] of [[-1, -0.7], [1, -0.7], [-1, 0.7], [1, 0.7]]) add(g, new THREE.CylinderGeometry(0.08, 0.08, 0.4, 5), mat(0x7a4e2e), x, 0.2, z);
  add(g, new THREE.BoxGeometry(0.5, 0.1, 1.4), mat(0xc9a066), 0.3, 0.35, 1.4, 1, 1, 1, 0.5, 0, 0);
  obstacles.push({ x: 13.5, z: -10, r: 1.7 });
  // 사료통
  add(scene, new THREE.CylinderGeometry(0.5, 0.4, 0.3, 10), mat(0x9b6b43), 9, 0.15, -4.5);
  add(scene, new THREE.CylinderGeometry(0.42, 0.42, 0.05, 10), mat(0xf2d27a), 9, 0.3, -4.5);
}

// ---------- 울타리 + 가로등 ----------
let lampLight;
{
  const post = new THREE.BoxGeometry(0.16, 0.8, 0.16);
  const rail = new THREE.BoxGeometry(1, 0.1, 0.07);
  const wood = mat(0xd8b384);
  const X = 4.8, Z = 3.8;
  const edge = (ax, az, bx, bz, skip) => {
    const len = Math.hypot(bx - ax, bz - az); const n = Math.round(len / 1.2);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = lerp(ax, bx, t), z = lerp(az, bz, t);
      if (skip && skip(x, z)) continue;
      add(scene, post, wood, x, 0.4, z);
      if (i < n) {
        const nx = lerp(ax, bx, (i + 1) / n), nz = lerp(az, bz, (i + 1) / n);
        if (skip && skip(nx, nz)) continue;
        for (const y of [0.35, 0.62]) {
          const r = add(scene, rail, wood, (x + nx) / 2, y, (z + nz) / 2, len / n, 1, 1);
          r.rotation.y = -Math.atan2(nz - z, nx - x);
        }
      }
    }
  };
  const gate = (x, z) => Math.abs(z - Z) < 0.01 && Math.abs(x) < 1.3;
  edge(-X, -Z, X, -Z); edge(X, -Z, X, Z); edge(X, Z, -X, Z, gate); edge(-X, Z, -X, -Z);

  const lamp = new THREE.Group(); lamp.position.set(-5.6, 0, 4.4); scene.add(lamp);
  add(lamp, new THREE.CylinderGeometry(0.07, 0.1, 2.4, 6), mat(0x4a4038), 0, 1.2, 0);
  add(lamp, new THREE.BoxGeometry(0.4, 0.45, 0.4), new THREE.MeshStandardMaterial({ color: 0xfff1c2, emissive: 0xffc96b, emissiveIntensity: 0.2 }), 0, 2.55, 0);
  add(lamp, new THREE.ConeGeometry(0.36, 0.25, 4), mat(0x4a4038), 0, 2.9, 0, 1, 1, 1, 0, Math.PI / 4, 0);
  lampLight = new THREE.PointLight(0xffc77a, 0, 12, 2);
  lampLight.position.set(-5.6, 2.5, 4.4);
  scene.add(lampLight);
  lamp.userData.bulb = lamp.children[1];
  lampLight.userData.bulb = lamp.children[1];
}

// ---------- 구름 ----------
const clouds = [];
const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.95 });
{
  const geo = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(rng() * 3);
    for (let j = 0; j < n; j++) {
      const s = R(1.4, 2.4);
      const p = M(geo, cloudMat, false); p.position.set(j * 1.8 - n, R(-0.3, 0.6), R(-0.8, 0.8)); p.scale.set(s, s * 0.75, s);
      g.add(p);
    }
    g.position.set(R(-70, 70), R(20, 28), R(-60, 40));
    scene.add(g); clouds.push(g);
  }
}

// =====================================================================
//  작물
// =====================================================================
const CROPS = {
  carrot:    { name: '당근',     emoji: '🥕', seed: 8,  sell: 22, time: 36 },
  tomato:    { name: '토마토',   emoji: '🍅', seed: 15, sell: 42, time: 60 },
  sunflower: { name: '해바라기', emoji: '🌻', seed: 12, sell: 32, time: 48 },
  pumpkin:   { name: '호박',     emoji: '🎃', seed: 30, sell: 96, time: 100 },
};
const CROP_KEYS = Object.keys(CROPS);

const G = {
  leaf: new THREE.SphereGeometry(0.18, 6, 4),
  stem: new THREE.CylinderGeometry(0.035, 0.045, 1, 5),
  ball: new THREE.SphereGeometry(0.5, 8, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 7),
  disc: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
};
const C = {
  leaf: mat(0x62b345), leaf2: mat(0x4b9a39), stem: mat(0x4f8f2f), soil: mat(0x7a4f2c), seed: mat(0xe9d7a7),
  carrot: mat(0xf08a2c), tomato: mat(0xe8413a), petal: mat(0xffd23f), core: mat(0x6b3f1f),
  pumpkin: mat(0xf29a2e), stake: mat(0xc9a066),
};

function buildCrop(key, stage) {
  const g = new THREE.Group();
  if (stage === 0) {
    add(g, G.ball, C.soil, 0, 0, 0, 0.6, 0.18, 0.6);
    add(g, G.ball, C.seed, 0.05, 0.08, 0, 0.1, 0.08, 0.1);
    return g;
  }
  if (stage === 1) {
    add(g, G.stem, C.stem, 0, 0.12, 0, 1, 0.25, 1);
    add(g, G.leaf, C.leaf, 0.11, 0.26, 0, 0.75, 0.3, 0.45, 0, 0, -0.5);
    add(g, G.leaf, C.leaf, -0.11, 0.26, 0, 0.75, 0.3, 0.45, 0, 0, 0.5);
    return g;
  }
  const ripe = stage === 3;
  switch (key) {
    case 'carrot': {
      const n = ripe ? 7 : 5, h = ripe ? 1.25 : 0.9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        add(g, G.leaf, i % 2 ? C.leaf : C.leaf2, Math.cos(a) * 0.08, 0.3 * h, Math.sin(a) * 0.08, 0.32, 1.7 * h, 0.32, Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
      }
      if (ripe) add(g, G.cone, C.carrot, 0, 0.1, 0, 0.36, 0.5, 0.36, Math.PI, 0, 0);
      break;
    }
    case 'tomato': {
      add(g, G.stem, C.stake, 0.25, 0.6, -0.1, 0.6, 1.2, 0.6);
      const s = ripe ? 1.25 : 0.95;
      add(g, G.ico, C.leaf2, 0, 0.45 * s, 0, 0.8 * s, 0.8 * s, 0.8 * s);
      add(g, G.ico, C.leaf, 0.12, 0.8 * s, 0.05, 0.6 * s, 0.6 * s, 0.6 * s);
      if (ripe) {
        const pos = [[0.33, 0.45], [-0.3, 0.6], [0.1, 0.95], [0.32, 0.8], [-0.2, 0.3]];
        pos.forEach(([x, y], i) => { const a = i * 1.3; add(g, G.ball, C.tomato, x, y, 0.28 + Math.sin(a) * 0.05, 0.26, 0.24, 0.26); });
      }
      break;
    }
    case 'sunflower': {
      const h = ripe ? 1.7 : 0.9;
      add(g, G.stem, C.stem, 0, h / 2, 0, 1.4, h, 1.4);
      add(g, G.leaf, C.leaf, 0.2, h * 0.4, 0, 1.2, 0.3, 0.6, 0, 0, -0.4);
      add(g, G.leaf, C.leaf2, -0.2, h * 0.6, 0, 1.2, 0.3, 0.6, 0, 0, 0.4);
      const head = new THREE.Group(); head.position.set(0, h, 0.05); head.rotation.x = 0.35; g.add(head);
      if (ripe) {
        add(head, G.disc, C.core, 0, 0, 0, 0.42, 0.12, 0.42, Math.PI / 2, 0, 0);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          add(head, G.leaf, C.petal, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0, 0.55, 0.28, 0.12, 0, 0, a);
        }
      } else {
        add(head, G.ball, C.leaf2, 0, 0.05, 0, 0.22, 0.22, 0.22);
      }
      break;
    }
    case 'pumpkin': {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        add(g, G.leaf, i % 2 ? C.leaf : C.leaf2, Math.cos(a) * 0.45, 0.12, Math.sin(a) * 0.45, 1.6, 0.4, 1.6, 0, a, 0);
      }
      if (ripe) {
        add(g, G.ball, C.pumpkin, 0, 0.3, 0.05, 0.95, 0.65, 0.95);
        add(g, G.stem, C.stem, 0, 0.66, 0.05, 1.6, 0.18, 1.6);
      } else {
        add(g, G.ball, C.leaf, 0, 0.18, 0, 0.35, 0.3, 0.35);
      }
      break;
    }
  }
  return g;
}

// ---------- 밭 ----------
const plotMats = { grass: mat(0x9bc969), dry: mat(0xb07b47), wet: mat(0x734a2a) };
const plotGeo = new THREE.BoxGeometry(1.7, 0.16, 1.7);
const dropGeo = new THREE.SphereGeometry(0.13, 8, 6);
const dropTip = new THREE.ConeGeometry(0.11, 0.2, 8);
const dropMat = new THREE.MeshStandardMaterial({ color: 0x5cb8ff, emissive: 0x2a7fd0, emissiveIntensity: 0.4, roughness: 0.2 });
const sparkMat = new THREE.MeshStandardMaterial({ color: 0xffe36b, emissive: 0xffc93a, emissiveIntensity: 0.8 });
const sparkGeo = new THREE.OctahedronGeometry(0.16, 0);

const plots = [];
{
  const COLS = 4, ROWS = 3, SP = 2.1;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = (c - (COLS - 1) / 2) * SP, z = (r - (ROWS - 1) / 2) * SP;
    const mesh = M(plotGeo, plotMats.grass, false, true);
    mesh.position.set(x, 0.02, z); scene.add(mesh);
    const drop = new THREE.Group();
    add(drop, dropGeo, dropMat); add(drop, dropTip, dropMat, 0, 0.14, 0);
    drop.position.set(x, 1.1, z); scene.add(drop);
    const spark = M(sparkGeo, sparkMat, false); spark.position.set(x, 1.2, z); scene.add(spark);
    const p = { x, z, mesh, drop, spark, tilled: false, crop: null, stage: 0, progress: 0, watered: false, cropObj: null, pulse: 0 };
    mesh.userData = { kind: 'plot', ref: p };
    plots.push(p);
  }
}
const stageTime = key => CROPS[key].time / 3;

function refreshPlot(p) {
  p.mesh.material = !p.tilled ? plotMats.grass : p.watered ? plotMats.wet : plotMats.dry;
  p.mesh.scale.y = p.tilled ? 1 : 0.5;
  p.mesh.position.y = p.tilled ? 0.02 : 0.0;
  if (p.cropObj) { scene.remove(p.cropObj); p.cropObj = null; }
  if (p.crop) {
    p.cropObj = buildCrop(p.crop, p.stage);
    p.cropObj.position.set(p.x, 0.1, p.z);
    p.cropObj.rotation.y = (p.x * 3.1 + p.z * 1.7) % 1 * 0.6 - 0.3;
    p.cropObj.userData = { kind: 'plot', ref: p };
    scene.add(p.cropObj);
    p.pulse = 1;
  }
  p.drop.visible = !!p.crop && p.stage < 3 && !p.watered;
  p.spark.visible = !!p.crop && p.stage === 3;
  p.spark.position.y = p.crop === 'sunflower' ? 2.4 : 1.6;
}

// =====================================================================
//  플레이어
// =====================================================================
function makeFarmer() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const skin = mat(0xffd6b0);
  add(body, new THREE.CapsuleGeometry(0.34, 0.45, 4, 10), mat(0x5b8fd6), 0, 0.82, 0);
  add(body, new THREE.BoxGeometry(0.5, 0.3, 0.1), mat(0x5b8fd6), 0, 1.0, 0.3);
  add(body, new THREE.SphereGeometry(0.36, 12, 10), mat(0xf4f0e6), 0, 1.15, 0, 1, 0.5, 0.95);
  add(body, new THREE.SphereGeometry(0.33, 14, 12), skin, 0, 1.55, 0);
  add(body, new THREE.SphereGeometry(0.04, 6, 4), mat(0x3a2a1e), -0.12, 1.58, 0.3);
  add(body, new THREE.SphereGeometry(0.04, 6, 4), mat(0x3a2a1e), 0.12, 1.58, 0.3);
  add(body, new THREE.SphereGeometry(0.05, 6, 4), mat(0xffa3a3), -0.2, 1.48, 0.25, 1, 0.6, 0.5);
  add(body, new THREE.SphereGeometry(0.05, 6, 4), mat(0xffa3a3), 0.2, 1.48, 0.25, 1, 0.6, 0.5);
  add(body, new THREE.CylinderGeometry(0.62, 0.62, 0.05, 16), mat(0xf2d27a), 0, 1.8, 0);
  add(body, new THREE.CylinderGeometry(0.28, 0.33, 0.26, 12), mat(0xf2d27a), 0, 1.94, 0);
  add(body, new THREE.CylinderGeometry(0.335, 0.335, 0.07, 12), mat(0xe86a5a), 0, 1.86, 0);
  const armL = add(body, new THREE.CapsuleGeometry(0.09, 0.3, 3, 6), mat(0xf4f0e6), -0.42, 0.95, 0, 1, 1, 1, 0, 0, 0.25);
  const armR = add(body, new THREE.CapsuleGeometry(0.09, 0.3, 3, 6), mat(0xf4f0e6), 0.42, 0.95, 0, 1, 1, 1, 0, 0, -0.25);
  const legL = add(g, new THREE.CapsuleGeometry(0.1, 0.22, 3, 6), mat(0x6b4a2e), -0.15, 0.22, 0);
  const legR = add(g, new THREE.CapsuleGeometry(0.1, 0.22, 3, 6), mat(0x6b4a2e), 0.15, 0.22, 0);
  return { g, body, armL, armR, legL, legR };
}
const farmer = makeFarmer();
scene.add(farmer.g);
const player = { pos: new THREE.Vector3(0, 0, 6), face: Math.PI, walk: 0, act: 0 };
let moveTarget = null;

function resolveCollisions(p, radius = 0.35) {
  for (const o of obstacles) {
    if (o.r !== undefined) {
      const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), min = o.r + radius;
      if (d < min && d > 1e-4) { p.x = o.x + (dx / d) * min; p.z = o.z + (dz / d) * min; }
    } else {
      const a = o.minX - radius, b = o.maxX + radius, c = o.minZ - radius, e = o.maxZ + radius;
      if (p.x > a && p.x < b && p.z > c && p.z < e) {
        const pen = [p.x - a, b - p.x, p.z - c, e - p.z];
        const i = pen.indexOf(Math.min(...pen));
        if (i === 0) p.x = a; else if (i === 1) p.x = b; else if (i === 2) p.z = c; else p.z = e;
      }
    }
  }
  const d = Math.hypot(p.x, p.z), lim = ISLAND_R - 1.5;
  if (d > lim) { p.x *= lim / d; p.z *= lim / d; }
}

// =====================================================================
//  닭 & 달걀
// =====================================================================
const COOP = { x: 10, z: -6, r: 4.5 };
const chickens = [];
const eggs = [];
const eggGeo = new THREE.SphereGeometry(0.16, 10, 8);
const eggMat = mat(0xfff4e0, { flatShading: false });

function makeChicken() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const white = mat(0xfffaf2);
  add(body, new THREE.SphereGeometry(0.3, 10, 8), white, 0, 0.42, 0, 1, 0.88, 1.15);
  add(body, new THREE.SphereGeometry(0.15, 8, 6), white, 0, 0.6, -0.3, 1, 1.2, 0.8, -0.5, 0, 0);
  add(body, new THREE.SphereGeometry(0.16, 8, 6), white, -0.27, 0.43, 0, 0.4, 0.8, 1.1);
  add(body, new THREE.SphereGeometry(0.16, 8, 6), white, 0.27, 0.43, 0, 0.4, 0.8, 1.1);
  const head = new THREE.Group(); head.position.set(0, 0.72, 0.24); body.add(head);
  add(head, new THREE.SphereGeometry(0.17, 10, 8), white);
  add(head, new THREE.BoxGeometry(0.06, 0.12, 0.16), mat(0xe8463c), 0, 0.17, 0);
  add(head, new THREE.ConeGeometry(0.05, 0.13, 5), mat(0xffa53a), 0, -0.02, 0.19, 1, 1, 1, Math.PI / 2, 0, 0);
  add(head, new THREE.SphereGeometry(0.04, 6, 4), mat(0xe8463c), 0, -0.1, 0.13);
  add(head, new THREE.SphereGeometry(0.025, 5, 4), mat(0x222222), -0.1, 0.04, 0.12);
  add(head, new THREE.SphereGeometry(0.025, 5, 4), mat(0x222222), 0.1, 0.04, 0.12);
  for (const x of [-0.09, 0.09]) add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.2, 4), mat(0xffa53a), x, 0.1, 0);
  return { g, body, head };
}
function spawnChicken(x, z) {
  const m = makeChicken();
  const c = { ...m, x: x ?? COOP.x + rand(-2, 2), z: z ?? COOP.z + rand(-2, 2), tx: 0, tz: 0, wait: rand(0, 2), hop: 0, face: rand(0, 6), peck: 0 };
  c.tx = c.x; c.tz = c.z;
  m.g.userData = { kind: 'chicken', ref: c };
  m.g.position.set(c.x, 0, c.z);
  scene.add(m.g);
  chickens.push(c);
  return c;
}
function spawnEgg(x, z) {
  const e = { x, z, mesh: M(eggGeo, eggMat) };
  e.mesh.scale.set(1, 1.25, 1); e.mesh.position.set(x, 0.2, z);
  e.mesh.userData = { kind: 'egg', ref: e };
  scene.add(e.mesh); eggs.push(e);
}

// =====================================================================
//  하늘 효과: 나비, 반딧불이, 비
// =====================================================================
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const FIREFLY_N = 90;
const fireflyBase = [];
const fireflyGeo = new THREE.BufferGeometry();
fireflyGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FIREFLY_N * 3), 3));
for (let i = 0; i < FIREFLY_N; i++) {
  const a = rand(0, Math.PI * 2), r = rand(4, ISLAND_R - 3);
  fireflyBase.push({ x: Math.cos(a) * r, y: rand(0.5, 2.5), z: Math.sin(a) * r, p: rand(0, 10), s: rand(0.3, 0.8) });
}
const fireflyMat = new THREE.PointsMaterial({ color: 0xe4ff8a, size: 0.45, map: glowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
const fireflies = new THREE.Points(fireflyGeo, fireflyMat);
fireflies.frustumCulled = false;
scene.add(fireflies);

const butterflies = [];
{
  const wingGeo = new THREE.CircleGeometry(0.16, 6);
  wingGeo.rotateX(-Math.PI / 2);
  wingGeo.translate(0.16, 0, 0);
  const colors = [0xffffff, 0xffd0e4, 0xffe17a, 0xb8d8ff, 0xffb37a];
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true, roughness: 0.6 });
    const wl = new THREE.Mesh(wingGeo, m), wr = new THREE.Mesh(wingGeo, m);
    wr.rotation.y = Math.PI;
    g.add(wl, wr);
    const a = rand(0, Math.PI * 2), r = rand(5, 22);
    butterflies.push({ g, wl, wr, m, cx: Math.cos(a) * r, cz: Math.sin(a) * r, p: rand(0, 10), sp: rand(0.3, 0.6) });
    scene.add(g);
  }
}

const RAIN_N = 900;
const rainPos = new Float32Array(RAIN_N * 6);
const rainDrops = [];
for (let i = 0; i < RAIN_N; i++) rainDrops.push({ x: rand(-25, 25), y: rand(0, 22), z: rand(-25, 25), v: rand(14, 20) });
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0xcfe3f5, transparent: true, opacity: 0 });
const rain = new THREE.LineSegments(rainGeo, rainMat);
rain.frustumCulled = false;
scene.add(rain);

// 클릭 표시
const marker = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.36, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
marker.rotation.x = -Math.PI / 2; marker.position.y = 0.05;
scene.add(marker);

// 작은 입자 (흙먼지, 물방울)
const particles = [];
const partGeo = new THREE.SphereGeometry(0.06, 5, 4);
function burst(x, y, z, color, n = 10, up = 2.5) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true });
  for (let i = 0; i < n; i++) {
    const o = new THREE.Mesh(partGeo, m);
    o.position.set(x + rand(-0.3, 0.3), y, z + rand(-0.3, 0.3));
    scene.add(o);
    particles.push({ o, v: new THREE.Vector3(rand(-1.2, 1.2), rand(up * 0.6, up), rand(-1.2, 1.2)), life: rand(0.5, 0.9), m });
  }
}

// =====================================================================
//  사운드 (Web Audio 로 직접 생성)
// =====================================================================
const audio = { ctx: null, master: null, music: null, sfx: null, rainGain: null, on: true, next: 0, beat: 0 };
function initAudio() {
  if (audio.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = new AC(); audio.ctx = ctx;
  audio.master = ctx.createGain(); audio.master.gain.value = audio.on ? 0.8 : 0;
  audio.master.connect(ctx.destination);
  audio.music = ctx.createGain(); audio.music.gain.value = 0.32;
  audio.sfx = ctx.createGain(); audio.sfx.gain.value = 0.5;
  const delay = ctx.createDelay(); delay.delayTime.value = 0.42;
  const fb = ctx.createGain(); fb.gain.value = 0.35;
  const wet = ctx.createGain(); wet.gain.value = 0.5;
  audio.music.connect(audio.master); audio.music.connect(delay);
  delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(audio.master);
  audio.sfx.connect(audio.master);
  // 빗소리
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  audio.rainGain = ctx.createGain(); audio.rainGain.gain.value = 0;
  src.connect(lp); lp.connect(audio.rainGain); audio.rainGain.connect(audio.master); src.start();
  audio.next = ctx.currentTime + 0.2;
  setInterval(scheduleMusic, 200);
}
function tone(freq, t, dur, { type = 'sine', vol = 0.15, dest, attack = 0.01, slide } = {}) {
  const ctx = audio.ctx; if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || audio.sfx);
  o.start(t); o.stop(t + dur + 0.05);
}
const hz = n => 440 * Math.pow(2, (n - 69) / 12);
const CHORDS = [[48, 55, 64], [45, 52, 60], [41, 48, 57], [43, 50, 59]]; // C Am F G
const PENTA = [72, 74, 76, 79, 81, 84];
function scheduleMusic() {
  const ctx = audio.ctx; if (!ctx) return;
  const BEAT = 0.55;
  while (audio.next < ctx.currentTime + 0.6) {
    const t = audio.next, b = audio.beat;
    const chord = CHORDS[Math.floor(b / 8) % 4];
    if (b % 8 === 0) chord.forEach(n => tone(hz(n), t, BEAT * 8, { type: 'triangle', vol: 0.05, dest: audio.music, attack: 0.8 }));
    if (b % 2 === 0) tone(hz(chord[0] - 12), t, BEAT * 1.6, { type: 'sine', vol: 0.06, dest: audio.music, attack: 0.05 });
    const quiet = night > 0.5 ? 0.25 : 0.45;
    if (Math.random() < quiet) tone(hz(PENTA[Math.floor(Math.random() * PENTA.length)]), t, 1.2, { vol: 0.07, dest: audio.music, attack: 0.02 });
    audio.next += BEAT; audio.beat++;
  }
}
function sfx(name) {
  const ctx = audio.ctx; if (!ctx) return;
  const t = ctx.currentTime;
  switch (name) {
    case 'till': tone(160, t, 0.18, { type: 'triangle', vol: 0.3, slide: 70 }); tone(90, t + 0.06, 0.15, { type: 'triangle', vol: 0.2 }); break;
    case 'plant': tone(hz(76), t, 0.2, { vol: 0.18 }); tone(hz(81), t + 0.09, 0.3, { vol: 0.18 }); break;
    case 'water': for (let i = 0; i < 6; i++) tone(rand(1300, 2200), t + i * 0.05, 0.08, { vol: 0.07, slide: 600 }); break;
    case 'harvest': [72, 76, 79, 84].forEach((n, i) => tone(hz(n), t + i * 0.07, 0.35, { type: 'triangle', vol: 0.18 })); break;
    case 'coin': tone(hz(83), t, 0.1, { type: 'square', vol: 0.05 }); tone(hz(88), t + 0.08, 0.3, { type: 'square', vol: 0.05 }); break;
    case 'cluck': tone(rand(650, 800), t, 0.09, { type: 'square', vol: 0.04, slide: 420 }); tone(rand(700, 850), t + 0.12, 0.09, { type: 'square', vol: 0.035, slide: 450 }); break;
    case 'nope': tone(220, t, 0.18, { type: 'triangle', vol: 0.2, slide: 180 }); break;
    case 'pop': tone(hz(79), t, 0.12, { vol: 0.15, slide: hz(91) }); break;
  }
}
window.addEventListener('pointerdown', initAudio, { once: true });
window.addEventListener('keydown', initAudio, { once: true });

// =====================================================================
//  게임 상태 & 저장
// =====================================================================
const SAVE_KEY = 'cozyFarm.v1';
const state = {
  coins: 30, day: 1, hour: 7,
  seeds: { carrot: 6, tomato: 2, sunflower: 2, pumpkin: 0 },
  selected: 'carrot', harvested: 0,
  raining: false, rainLeft: 0,
};
let rainAmt = 0;
let night = 0;

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      ...state,
      plots: plots.map(p => ({ t: p.tilled, c: p.crop, s: p.stage, p: p.progress, w: p.watered })),
      chickens: chickens.length,
      eggs: eggs.map(e => [e.x, e.z]),
      player: [player.pos.x, player.pos.z],
    }));
  } catch (_) { /* 저장 불가 환경 */ }
}
function load() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (_) {}
  if (!data) return false;
  for (const k of Object.keys(state)) if (k in data) state[k] = data[k];
  state.seeds = { carrot: 0, tomato: 0, sunflower: 0, pumpkin: 0, ...data.seeds };
  (data.plots || []).forEach((d, i) => {
    const p = plots[i]; if (!p) return;
    p.tilled = !!d.t; p.crop = CROPS[d.c] ? d.c : null; p.stage = d.s || 0; p.progress = d.p || 0; p.watered = !!d.w;
  });
  for (let i = 0; i < (data.chickens || 2); i++) spawnChicken();
  (data.eggs || []).forEach(([x, z]) => spawnEgg(x, z));
  if (data.player) { player.pos.x = data.player[0]; player.pos.z = data.player[1]; }
  rainAmt = state.raining ? 1 : 0;
  return true;
}
const hadSave = load();
if (!hadSave) { spawnChicken(); spawnChicken(); }
plots.forEach(refreshPlot);

// =====================================================================
//  UI
// =====================================================================
const $ = id => document.getElementById(id);
const ui = {
  coins: $('coins'), day: $('day'), clock: $('clock'), weather: $('weather'),
  status: $('status'), hotbar: $('hotbar'), toast: $('toast'), floats: $('floats'),
  shop: $('shop'), shopList: $('shopList'), shopCoins: $('shopCoins'), help: $('help'),
};

function buildHotbar() {
  ui.hotbar.innerHTML = '';
  CROP_KEYS.forEach((k, i) => {
    const c = CROPS[k], n = state.seeds[k] || 0;
    const el = document.createElement('div');
    el.className = 'slot' + (state.selected === k ? ' sel' : '');
    el.innerHTML = `<span class="key">${i + 1}</span><span class="emo">${c.emoji}</span><span class="nm">${c.name} 씨앗</span><span class="cnt ${n ? '' : 'zero'}">${n}</span>`;
    el.onclick = () => selectSeed(k);
    ui.hotbar.appendChild(el);
  });
}
function selectSeed(k) { state.selected = k; buildHotbar(); sfx('pop'); }

function buildShop() {
  ui.shopCoins.textContent = state.coins;
  ui.shopList.innerHTML = '';
  const row = (emoji, html, buttons) => {
    const el = document.createElement('div'); el.className = 'shop-item';
    el.innerHTML = `<span class="emo">${emoji}</span><div class="desc">${html}</div>`;
    buttons.forEach(b => el.appendChild(b));
    ui.shopList.appendChild(el);
  };
  const btn = (label, cost, fn) => {
    const b = document.createElement('button'); b.textContent = label;
    b.disabled = state.coins < cost;
    b.onclick = () => { if (state.coins < cost) return; state.coins -= cost; fn(); sfx('coin'); updateHUD(); buildShop(); buildHotbar(); save(); };
    return b;
  };
  for (const k of CROP_KEYS) {
    const c = CROPS[k];
    row(c.emoji, `${c.name} 씨앗 <b>💰${c.seed}</b><br><small>판매가 ${c.sell} · 자라는 시간 약 ${c.time}초 · 보유 ${state.seeds[k] || 0}개</small>`, [
      btn('1개', c.seed, () => state.seeds[k]++),
      btn('5개', c.seed * 5, () => state.seeds[k] += 5),
    ]);
  }
  const chickCost = 40 + chickens.length * 10;
  const full = chickens.length >= 8;
  const cb = btn(full ? '가득 참' : '입양', full ? Infinity : chickCost, () => { spawnChicken(); toast('🐔 새 친구가 왔어요!'); });
  row('🐔', `닭 입양 <b>💰${full ? '-' : chickCost}</b><br><small>아침마다 달걀을 낳아요 · 지금 ${chickens.length}마리 (최대 8)</small>`, [cb]);
}

function fmtClock(h) {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 6) * 10;
  const ampm = hh < 12 ? '오전' : '오후';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${ampm} ${h12}:${String(mm).padStart(2, '0')}`;
}
function updateHUD() {
  ui.coins.textContent = state.coins;
  ui.day.textContent = state.day;
  ui.clock.textContent = fmtClock(state.hour);
  ui.weather.textContent = state.raining ? '🌧️' : night > 0.5 ? '🌙' : '☀️';
}
let toastTimer = 0;
function toast(msg) {
  ui.toast.textContent = msg; ui.toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2200);
}
const floats = [];
function floatText(text, pos, cls = '') {
  const el = document.createElement('div'); el.className = 'float ' + cls; el.textContent = text;
  ui.floats.appendChild(el);
  floats.push({ el, pos: pos.clone(), life: 0 });
}

$('shopBtn').onclick = () => { buildShop(); ui.shop.classList.remove('hidden'); };
$('helpBtn').onclick = () => ui.help.classList.remove('hidden');
$('soundBtn').onclick = e => {
  initAudio();
  audio.on = !audio.on;
  if (audio.master) audio.master.gain.value = audio.on ? 0.8 : 0;
  e.currentTarget.textContent = audio.on ? '🔊' : '🔇';
};
$('resetBtn').onclick = () => {
  if (!confirm('정말 처음부터 다시 시작할까요? 저장된 농장이 사라져요.')) return;
  try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
  location.reload();
};
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).classList.add('hidden'));
document.querySelectorAll('.modal').forEach(m => m.addEventListener('pointerdown', e => { if (e.target === m) m.classList.add('hidden'); }));
if (!hadSave) ui.help.classList.remove('hidden');
buildHotbar();
updateHUD();

// =====================================================================
//  상호작용
// =====================================================================
const pctOf = p => Math.floor(((p.stage + p.progress / stageTime(p.crop)) / 3) * 100);

function describePlot(p) {
  if (!p.tilled) return '🌱 풀밭 — 클릭해서 땅 갈기';
  if (!p.crop) {
    const c = CROPS[state.selected];
    return `🟫 갈아 둔 밭 — 클릭해서 ${c.emoji} ${c.name} 심기 (씨앗 ${state.seeds[state.selected] || 0}개)`;
  }
  const c = CROPS[p.crop];
  if (p.stage >= 3) return `${c.emoji} ${c.name} 다 자랐어요! 클릭해서 수확 (+${c.sell})`;
  return `${c.emoji} ${c.name} ${pctOf(p)}% — ${p.watered ? '촉촉해요 😊' : '목말라요, 물을 주세요 💧'}`;
}

function actOnPlot(p) {
  player.act = 1;
  const top = new THREE.Vector3(p.x, 1.2, p.z);
  if (!p.tilled) {
    p.tilled = true; sfx('till'); burst(p.x, 0.2, p.z, 0x9b6b43, 12, 2.2);
  } else if (!p.crop) {
    const k = state.selected, c = CROPS[k];
    if ((state.seeds[k] || 0) <= 0) { toast(`${c.emoji} ${c.name} 씨앗이 없어요. 상점에서 살 수 있어요!`); sfx('nope'); return; }
    state.seeds[k]--; p.crop = k; p.stage = 0; p.progress = 0; p.watered = state.raining;
    sfx('plant'); floatText(`${c.emoji} 심었어요`, top); buildHotbar();
  } else if (p.stage >= 3) {
    const c = CROPS[p.crop];
    state.coins += c.sell; state.harvested++;
    floatText(`${c.emoji} +${c.sell}`, top, 'gold'); sfx('harvest');
    burst(p.x, 0.6, p.z, 0xffe36b, 14, 3);
    p.crop = null; p.stage = 0; p.progress = 0; p.watered = false;
    if (state.harvested === 1) toast('첫 수확 축하해요! 🎉 상점에서 새 씨앗을 사 보세요');
  } else if (!p.watered) {
    p.watered = true; sfx('water'); burst(p.x, 1.0, p.z, 0x6cc4ff, 14, 1.5);
  } else {
    toast(`${CROPS[p.crop].emoji} 쑥쑥 자라는 중... ${pctOf(p)}%`); return;
  }
  refreshPlot(p); updateHUD(); save();
}
function petChicken(c) {
  c.hop = 1; c.wait = 1.5; player.act = 1;
  sfx('cluck');
  floatText('❤️', new THREE.Vector3(c.x, 1.2, c.z));
}
function collectEgg(e) {
  scene.remove(e.mesh); eggs.splice(eggs.indexOf(e), 1);
  state.coins += 12; player.act = 1;
  floatText('🥚 +12', new THREE.Vector3(e.x, 0.9, e.z), 'gold'); sfx('coin');
  updateHUD(); save();
}

function interact(hit) {
  if (!hit) return;
  if (hit.kind === 'plot') { const p = hit.ref; moveTarget = { get: () => p, reach: 1.35, cb: () => actOnPlot(p), t: 0 }; }
  else if (hit.kind === 'chicken') { const c = hit.ref; moveTarget = { get: () => c, reach: 1.3, cb: () => petChicken(c), t: 0 }; }
  else if (hit.kind === 'egg') { const e = hit.ref; moveTarget = { get: () => e, reach: 0.9, cb: () => eggs.includes(e) && collectEgg(e), t: 0 }; }
  else if (hit.kind === 'ground') {
    const pt = { x: hit.point.x, z: hit.point.z };
    moveTarget = { get: () => pt, reach: 0.1, cb: null, t: 0 };
    marker.position.x = pt.x; marker.position.z = pt.z; marker.material.opacity = 0.9; marker.scale.setScalar(1);
  }
}
function actNearest() {
  let best = null, bd = Infinity;
  const check = (kind, ref, x, z, r) => { const d = Math.hypot(x - player.pos.x, z - player.pos.z); if (d < r && d < bd) { bd = d; best = { kind, ref }; } };
  plots.forEach(p => check('plot', p, p.x, p.z, 1.6));
  chickens.forEach(c => check('chicken', c, c.x, c.z, 1.6));
  eggs.forEach(e => check('egg', e, e.x, e.z, 1.3));
  if (!best) return;
  if (best.kind === 'plot') actOnPlot(best.ref);
  else if (best.kind === 'chicken') petChicken(best.ref);
  else collectEgg(best.ref);
}

// ---------- 입력 ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function pick(cx, cy) {
  ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const list = [];
  plots.forEach(p => { list.push(p.mesh); if (p.cropObj) list.push(p.cropObj); });
  chickens.forEach(c => list.push(c.g));
  eggs.forEach(e => list.push(e.mesh));
  const hits = raycaster.intersectObjects(list, true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.kind) o = o.parent;
    if (o) return { kind: o.userData.kind, ref: o.userData.ref, point: h.point };
  }
  const pt = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, pt) && Math.hypot(pt.x, pt.z) < ISLAND_R - 1) return { kind: 'ground', point: pt };
  return null;
}

canvas.addEventListener('pointerdown', e => { if (e.button === 0) interact(pick(e.clientX, e.clientY)); });
let hoverPlot = null;
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  const h = pick(e.clientX, e.clientY);
  hoverPlot = h && h.kind === 'plot' ? h.ref : null;
  canvas.style.cursor = h && h.kind !== 'ground' ? 'pointer' : 'default';
  if (h && h.kind === 'chicken') showStatus('🐔 닭 — 클릭해서 쓰다듬기');
  else if (h && h.kind === 'egg') showStatus('🥚 달걀 — 클릭해서 줍기 (+12)');
  else if (!hoverPlot) showStatus(null);
});
canvas.addEventListener('pointerleave', () => { hoverPlot = null; showStatus(null); });
function showStatus(text) {
  if (text) { ui.status.textContent = text; ui.status.classList.add('show'); }
  else ui.status.classList.remove('show');
}
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.targetDist = clamp(cam.targetDist + e.deltaY * 0.015, 9, 32); }, { passive: false });

const keys = new Set();
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k >= '1' && k <= '4') selectSeed(CROP_KEYS[+k - 1]);
  if (k === 'q') cam.targetYaw += Math.PI / 4;
  if (k === 'e') cam.targetYaw -= Math.PI / 4;
  if (k === ' ') { e.preventDefault(); actNearest(); }
  if (k === 'escape') document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// =====================================================================
//  하늘 색 / 시간
// =====================================================================
const SKY = [
  [0, 0x1d2752], [4.5, 0x1d2752], [6, 0xf6b88a], [7.5, 0x9fd8f5], [17, 0x9fd8f5],
  [18.5, 0xf49a7a], [20, 0x2a2f60], [24, 0x1d2752],
].map(([h, c]) => [h, new THREE.Color(c)]);
const skyCol = new THREE.Color(), rainSky = new THREE.Color(0x9aa6b2), tmpC = new THREE.Color();
function skyAt(h) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, c0] = SKY[i], [h1, c1] = SKY[i + 1];
    if (h >= h0 && h <= h1) return skyCol.copy(c0).lerp(c1, (h - h0) / (h1 - h0));
  }
  return skyCol.copy(SKY[0][1]);
}
const HOURS_PER_SEC = 24 / 360; // 하루 = 실제 6분
const sunDir = new THREE.Vector3();

function updateTime(dt) {
  const prev = state.hour;
  state.hour += dt * HOURS_PER_SEC;
  if (state.hour >= 24) { state.hour -= 24; state.day++; }
  const h = state.hour;
  // 아침
  if (prev < 6 && h >= 6) {
    toast(`☀️ ${state.day}일차 아침이 밝았어요`);
    for (const c of chickens) if (eggs.length < 16) {
      const a = rand(0, Math.PI * 2), r = rand(0.5, COOP.r);
      spawnEgg(COOP.x + Math.cos(a) * r, COOP.z + Math.sin(a) * r);
    }
    save();
  }
  if (prev < 20 && h >= 20) toast('🌙 밤이 되었어요. 반딧불이가 날아다녀요');
  // 날씨 (한 시간마다 확인)
  if (Math.floor(prev) !== Math.floor(h)) {
    if (state.raining) {
      state.rainLeft--;
      if (state.rainLeft <= 0) { state.raining = false; toast('🌈 비가 그쳤어요'); }
    } else if (Math.random() < 0.05) {
      state.raining = true; state.rainLeft = 2 + Math.floor(Math.random() * 3);
      toast('🌧️ 비가 내려요. 작물이 저절로 물을 머금어요');
    }
  }
  rainAmt = lerp(rainAmt, state.raining ? 1 : 0, 1 - Math.exp(-dt * 0.6));

  // 해 / 달
  const ang = ((h - 6) / 12) * Math.PI;
  const elev = Math.sin(ang);
  const dayF = clamp(elev * 3 + 0.3, 0, 1);
  night = 1 - dayF;
  if (elev > -0.05) {
    sunDir.set(Math.cos(ang) * 0.9, Math.max(elev, 0.12), 0.45).normalize();
    sun.color.setHSL(0.1, 0.8, lerp(0.7, 0.92, clamp(elev * 2, 0, 1)));
    sun.intensity = lerp(0.4, 2.3, clamp(elev * 2, 0, 1)) * (1 - 0.6 * rainAmt);
  } else {
    sunDir.set(-Math.cos(ang) * 0.6, Math.max(-elev, 0.3), 0.5).normalize();
    sun.color.set(0x9fb4ff);
    sun.intensity = 0.55;
  }
  hemi.intensity = lerp(0.5, 0.95, dayF) * (1 - 0.2 * rainAmt);
  hemi.color.set(0xe4f4ff).lerp(tmpC.set(0x7c8fd8), night * 0.7);
  skyAt(h).lerp(rainSky, rainAmt * 0.6 * dayF + rainAmt * 0.2);
  scene.background.copy(skyCol);
  scene.fog.color.copy(skyCol);
  cloudMat.color.set(0xffffff).lerp(tmpC.set(0x8a95a3), rainAmt * 0.7).lerp(tmpC.set(0x4a5280), night * 0.7);
  waterMat.color.set(0x5bb8d6).lerp(tmpC.set(0x1e3a66), night * 0.7);
  windowMat.emissiveIntensity = night * 1.4;
  lampLight.intensity = night * 10;
  lampLight.userData.bulb.material.emissiveIntensity = 0.2 + night * 2;
}

// =====================================================================
//  메인 루프
// =====================================================================
const clock = new THREE.Clock();
let elapsed = 0, saveTimer = 0, hudTimer = 0;
const camTarget = new THREE.Vector3().copy(player.pos);

function update(dt) {
  elapsed += dt;
  updateTime(dt);

  // ---- 작물 성장 ----
  for (const p of plots) {
    if (!p.crop) continue;
    if (state.raining && rainAmt > 0.5 && p.stage < 3 && !p.watered) { p.watered = true; refreshPlot(p); }
    if (p.watered && p.stage < 3) {
      p.progress += dt;
      if (p.progress >= stageTime(p.crop)) {
        p.progress = 0; p.stage++; p.watered = state.raining;
        refreshPlot(p);
        if (p.stage === 3) burst(p.x, 0.8, p.z, 0xfff3a0, 8, 2);
      }
    }
    if (p.cropObj) {
      p.pulse = Math.max(0, p.pulse - dt * 3);
      const s = 1 + Math.sin(p.pulse * Math.PI) * 0.25;
      p.cropObj.scale.set(s, s, s);
      p.cropObj.rotation.z = Math.sin(elapsed * 1.5 + p.x) * 0.04;
    }
    if (p.drop.visible) p.drop.position.y = 1.1 + Math.sin(elapsed * 3 + p.x) * 0.1;
    if (p.spark.visible) { p.spark.rotation.y += dt * 2; p.spark.position.y += Math.sin(elapsed * 3 + p.z) * 0.003; }
  }
  if (hoverPlot) showStatus(describePlot(hoverPlot));

  // ---- 플레이어 이동 ----
  let mx = 0, mz = 0;
  if (keys.has('w') || keys.has('arrowup')) mz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) mz += 1;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  let dirX = 0, dirZ = 0;
  if (mx || mz) {
    moveTarget = null;
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    dirX = mx * cy + mz * sy;
    dirZ = -mx * sy + mz * cy;
    const l = Math.hypot(dirX, dirZ); dirX /= l; dirZ /= l;
  } else if (moveTarget) {
    const tg = moveTarget.get();
    const dx = tg.x - player.pos.x, dz = tg.z - player.pos.z, d = Math.hypot(dx, dz);
    moveTarget.t += dt;
    if (d <= moveTarget.reach || d < 0.05) {
      const cb = moveTarget.cb; moveTarget = null;
      if (d > 0.05) player.face = Math.atan2(dx, dz);
      if (cb) cb();
    } else if (moveTarget.t > 8) moveTarget = null;
    else { dirX = dx / d; dirZ = dz / d; }
  }
  const moving = dirX || dirZ;
  if (moving) {
    const speed = 4.4;
    player.pos.x += dirX * speed * dt; player.pos.z += dirZ * speed * dt;
    resolveCollisions(player.pos);
    player.face = lerpAngle(player.face, Math.atan2(dirX, dirZ), 1 - Math.exp(-dt * 12));
    player.walk += dt * 11;
  } else {
    player.walk = lerp(player.walk, Math.round(player.walk / Math.PI) * Math.PI, 1 - Math.exp(-dt * 10));
  }
  const f = farmer;
  f.g.position.copy(player.pos);
  f.g.rotation.y = lerpAngle(f.g.rotation.y, player.face, 1 - Math.exp(-dt * 14));
  const sw = Math.sin(player.walk);
  f.body.position.y = Math.abs(sw) * 0.07 + Math.sin(elapsed * 2) * 0.01;
  f.legL.rotation.x = sw * 0.6; f.legR.rotation.x = -sw * 0.6;
  player.act = Math.max(0, player.act - dt * 3);
  const actSwing = Math.sin(player.act * Math.PI);
  f.armL.rotation.x = -sw * 0.5; f.armR.rotation.x = sw * 0.5 - actSwing * 1.8;
  f.body.rotation.x = actSwing * 0.25;

  // ---- 닭 ----
  for (const c of chickens) {
    if (c.wait > 0) {
      c.wait -= dt;
      c.peck = Math.max(0, c.peck - dt);
      if (c.peck <= 0 && Math.random() < dt * 0.8) c.peck = 0.5;
      if (c.wait <= 0) {
        const a = rand(0, Math.PI * 2), r = rand(0, COOP.r);
        c.tx = COOP.x + Math.cos(a) * r; c.tz = COOP.z + Math.sin(a) * r;
      }
    } else {
      const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
      if (d < 0.1) c.wait = rand(1, 4);
      else {
        c.x += (dx / d) * 0.9 * dt; c.z += (dz / d) * 0.9 * dt;
        c.face = lerpAngle(c.face, Math.atan2(dx, dz), 1 - Math.exp(-dt * 8));
      }
    }
    c.hop = Math.max(0, c.hop - dt * 2);
    const walking = c.wait <= 0;
    c.g.position.set(c.x, Math.sin(c.hop * Math.PI) * 0.5 + (walking ? Math.abs(Math.sin(elapsed * 14)) * 0.04 : 0), c.z);
    c.g.rotation.y = c.face;
    c.head.rotation.x = c.peck > 0 ? Math.sin((c.peck / 0.5) * Math.PI) * 0.9 : 0;
  }
  for (const e of eggs) e.mesh.rotation.z = Math.sin(elapsed * 2 + e.x) * 0.08;

  // ---- 나무 흔들림 / 구름 ----
  const wind = 0.025 + rainAmt * 0.03;
  for (const s of swayers) s.o.rotation.z = Math.sin(elapsed * 1.2 + s.p) * wind;
  for (const c of clouds) { c.position.x += dt * (0.6 + rainAmt); if (c.position.x > 80) c.position.x = -80; }

  // ---- 반딧불이 ----
  fireflyMat.opacity = night * (1 - rainAmt) * (0.6 + Math.sin(elapsed * 2) * 0.2);
  if (fireflyMat.opacity > 0.01) {
    const arr = fireflyGeo.attributes.position.array;
    fireflyBase.forEach((b, i) => {
      arr[i * 3] = b.x + Math.sin(elapsed * b.s + b.p) * 1.2;
      arr[i * 3 + 1] = b.y + Math.sin(elapsed * b.s * 1.7 + b.p) * 0.4;
      arr[i * 3 + 2] = b.z + Math.cos(elapsed * b.s * 0.9 + b.p) * 1.2;
    });
    fireflyGeo.attributes.position.needsUpdate = true;
  }

  // ---- 나비 ----
  const bfVis = (1 - night) * (1 - rainAmt);
  for (const b of butterflies) {
    b.g.visible = bfVis > 0.05;
    if (!b.g.visible) continue;
    b.m.opacity = bfVis;
    const t = elapsed * b.sp + b.p;
    const x = b.cx + Math.sin(t) * 2.5, z = b.cz + Math.sin(t * 1.3) * 2.0;
    const nx = b.cx + Math.sin(t + 0.05) * 2.5, nz = b.cz + Math.sin((t + 0.05) * 1.3) * 2.0;
    b.g.position.set(x, 1.0 + Math.sin(t * 2.3) * 0.4, z);
    b.g.rotation.y = Math.atan2(nx - x, nz - z);
    const flap = Math.sin(elapsed * 18 + b.p) * 1.1;
    b.wl.rotation.set(0, 0, flap);
    b.wr.rotation.set(0, Math.PI, flap);
  }

  // ---- 비 ----
  rainMat.opacity = rainAmt * 0.55;
  rain.visible = rainAmt > 0.02;
  if (rain.visible) {
    for (let i = 0; i < RAIN_N; i++) {
      const d = rainDrops[i];
      d.y -= d.v * dt;
      if (d.y < 0) { d.y = rand(16, 22); d.x = rand(-25, 25); d.z = rand(-25, 25); }
      const x = d.x + player.pos.x, z = d.z + player.pos.z, o = i * 6;
      rainPos[o] = x; rainPos[o + 1] = d.y; rainPos[o + 2] = z;
      rainPos[o + 3] = x + 0.05; rainPos[o + 4] = d.y + 0.6; rainPos[o + 5] = z;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  if (audio.rainGain) audio.rainGain.gain.value = rainAmt * 0.06;

  // ---- 입자 ----
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.v.y -= 9 * dt;
    p.o.position.addScaledVector(p.v, dt);
    if (p.o.position.y < 0.05) { p.o.position.y = 0.05; p.v.set(0, 0, 0); }
    p.m.opacity = clamp(p.life * 2, 0, 1);
    if (p.life <= 0) { scene.remove(p.o); particles.splice(i, 1); }
  }
  marker.material.opacity = Math.max(0, marker.material.opacity - dt * 1.8);
  marker.scale.addScalar(dt * 0.8);

  // ---- 카메라 ----
  cam.yaw = lerp(cam.yaw, cam.targetYaw, 1 - Math.exp(-dt * 6));
  cam.dist = lerp(cam.dist, cam.targetDist, 1 - Math.exp(-dt * 6));
  camTarget.lerp(player.pos, 1 - Math.exp(-dt * 4));
  const cp = Math.cos(cam.pitch) * cam.dist;
  camera.position.set(camTarget.x + Math.sin(cam.yaw) * cp, Math.sin(cam.pitch) * cam.dist + 0.8, camTarget.z + Math.cos(cam.yaw) * cp);
  camera.lookAt(camTarget.x, 0.8, camTarget.z);

  // 그림자 카메라가 플레이어를 따라가도록
  sun.target.position.copy(camTarget);
  sun.position.copy(camTarget).addScaledVector(sunDir, 45);

  // ---- 떠오르는 글자 ----
  const v = new THREE.Vector3();
  for (let i = floats.length - 1; i >= 0; i--) {
    const fl = floats[i];
    fl.life += dt;
    v.copy(fl.pos); v.y += fl.life * 1.2; v.project(camera);
    fl.el.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
    fl.el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
    fl.el.style.opacity = String(clamp(1.6 - fl.life * 1.3, 0, 1));
    if (fl.life > 1.3) { fl.el.remove(); floats.splice(i, 1); }
  }

  hudTimer -= dt;
  if (hudTimer <= 0) { updateHUD(); hudTimer = 0.5; }
  saveTimer -= dt;
  if (saveTimer <= 0) { save(); saveTimer = 5; }
}

camTarget.copy(player.pos);
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
window.addEventListener('beforeunload', save);

// 디버그/테스트용
window.__farm = { state, plots, chickens, eggs, player, actOnPlot, refreshPlot };
