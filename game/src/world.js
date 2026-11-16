// Tidebreak Harbor: a rain-slick container port at night. Two bomb sites — the A
// warehouse on the west wall and the open B container yard on the east — joined by
// a west lane, an east lane and a middle lane under a gantry crane, with a raised
// catwalk bridge over the middle. Every box is a collider and a surface a bullet
// stops on. Plain geometry only, no models and no textures.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const CONTAINER_COLORS = ['#8a3b26', '#1f5f5a', '#274058', '#9a6b2a', '#3a4550', '#6b2f3d'];

export const WAYPOINTS = [
  { x: 0, z: 18 }, // 0 T spawn
  { x: 0, z: 12 }, // 1 south plaza
  { x: 0, z: 6 }, // 2 mid south
  { x: -6, z: 0 }, // 3 mid west
  { x: 6, z: 0 }, // 4 mid east
  { x: 0, z: -4 }, // 5 mid north
  { x: -10, z: 12 }, // 6 A lane south
  { x: -10, z: 2 }, // 7 A lane mid
  { x: -10, z: -4 }, // 8 A lane north
  { x: -21, z: -4 }, // 9 A south door
  { x: -21, z: -12 }, // 10 A site
  { x: -21, z: -16 }, // 11 A site north
  { x: 10, z: 12 }, // 12 B lane south
  { x: 10, z: 2 }, // 13 B lane mid
  { x: 10, z: -4 }, // 14 B lane north
  { x: 20, z: -2 }, // 15 B yard south
  { x: 21, z: -11 }, // 16 B site
  { x: 21, z: -16 }, // 17 B site north
  { x: 0, z: -18 }, // 18 CT spawn
  { x: -4, z: -10 }, // 19 CT mid hold
  { x: -16, z: -14 }, // 20 A hold
  { x: 25, z: -14 }, // 21 B hold
  { x: -4, z: 6 }, // 22 mid hold west
  { x: 4, z: 6 }, // 23 mid hold east
  { x: -13, z: -10 }, // 24 A east door
  { x: 16, z: -8 }, // 25 B approach
];

export const EDGES = [
  [0, 1], [1, 2], [1, 6], [1, 12], [2, 3], [2, 4], [2, 22], [2, 23],
  [3, 7], [4, 13], [3, 5], [4, 5], [5, 18], [5, 8], [5, 14], [5, 19],
  [6, 7], [7, 8], [8, 9], [8, 24], [9, 10], [10, 11], [10, 20], [24, 10],
  [12, 13], [13, 14], [14, 15], [14, 25], [15, 16], [16, 17], [16, 21],
  [19, 8], [19, 14], [19, 18], [20, 11], [21, 17], [25, 16],
];

export const SITES = {
  A: { name: 'A', center: { x: -21, z: -12 }, minX: -28, maxX: -14, minZ: -18, maxZ: -6, color: '#ffb02e' },
  B: { name: 'B', center: { x: 21, z: -11 }, minX: 14, maxX: 28, minZ: -18, maxZ: -4, color: '#2ec8b8' },
};

export const SPAWNS = {
  attackers: [
    { x: -3, z: 18, yaw: 0 }, { x: 0, z: 19, yaw: 0 }, { x: 3, z: 18, yaw: 0 }, { x: 0, z: 17, yaw: 0 },
  ],
  defenders: [
    { x: -3, z: -18, yaw: Math.PI }, { x: 0, z: -19, yaw: Math.PI }, { x: 3, z: -18, yaw: Math.PI }, { x: 0, z: -17, yaw: Math.PI },
  ],
};

export function createWorld(scene, random) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'water' ? 0.12 : 0.85,
      metalness: name === 'water' ? 0.85 : 0.08,
    });
  }
  const containerMats = CONTAINER_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.62, metalness: 0.35 }));
  const groundMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0d141c'), roughness: 0.38, metalness: 0.4 });
  const puddleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#16324a'), roughness: 0.06, metalness: 0.95, transparent: true, opacity: 0.8 });
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb02e'), transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function container(x, z, yaw, stacked) {
    const mat = containerMats[Math.floor(random() * containerMats.length)];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(6.1, 2.6, 2.6), mat);
    mesh.position.set(x, 1.3, z);
    mesh.rotation.y = yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    if (stacked) {
      const top = new THREE.Mesh(new THREE.BoxGeometry(6.1, 2.6, 2.6), containerMats[Math.floor(random() * containerMats.length)]);
      top.position.set(x, 3.9, z);
      top.rotation.y = yaw;
      top.castShadow = true;
      top.receiveShadow = true;
      group.add(top);
      colliders.push(new THREE.Box3().setFromObject(top));
      shootables.push(top);
    }
    return mesh;
  }

  // Wet asphalt ground, 60 x 44 m.
  box(60.4, 0.4, 44.4, 0, -0.2, 0, groundMat);
  // Puddles catching the crane light.
  const puddles = [];
  for (const [px, pz, pw, pd] of [[-4, 8, 5, 3], [8, -8, 4, 3], [-16, 4, 4, 2.5], [18, 8, 5, 3], [0, -12, 4, 3], [-24, 10, 4, 2.5]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(px, 0.02, pz);
    p.receiveShadow = true;
    group.add(p);
    puddles.push(p);
  }

  // Perimeter walls, 4 m. The east wall drops to a low fence by the water basin.
  box(0.4, 4, 44.4, -30, 2, 0, materials.surface);
  box(60.4, 4, 0.4, 0, 2, -22, materials.surface);
  box(60.4, 4, 0.4, 0, 2, 22, materials.surface);
  box(0.4, 4, 10, 30, 2, -17, materials.surface);
  box(0.4, 4, 10, 30, 2, 17, materials.surface);
  box(0.4, 1.3, 24, 30, 0.65, 0, materials.hairline);
  for (let z = -11; z <= 11; z += 2.75) box(0.18, 1.3, 0.18, 30, 0.65, z, materials.hairline);

  // ---- A site: the west warehouse, open roof, two doorways ----
  // South wall (z=-6) with a 3 m door at x=-21.
  box(4.5, 4.5, 0.4, -25.75, 2.25, -6, materials.surface);
  box(4.5, 4.5, 0.4, -16.25, 2.25, -6, materials.surface);
  box(5, 1.5, 0.4, -21, 3.75, -6, materials.surface);
  // East wall (x=-14) with a 3 m door at z=-12.
  box(0.4, 4.5, 3, -14, 2.25, -16.5, materials.surface);
  box(0.4, 4.5, 3, -14, 2.25, -7.5, materials.surface);
  box(0.4, 1.5, 6, -14, 3.75, -12, materials.surface);
  // North + west walls are the perimeter; add a roof lip so the room reads.
  box(14.4, 0.3, 12.4, -21, 4.6, -12, materials.hairline, false);
  // Interior crates.
  box(2.2, 1.2, 2.2, -25, 0.6, -15, containerMats[0]);
  box(2.2, 1.2, 2.2, -17, 0.6, -16, containerMats[3]);
  box(1.6, 1.0, 1.6, -24, 0.5, -8.5, containerMats[1]);
  box(1.6, 1.0, 1.6, -17.5, 0.5, -8.5, containerMats[4]);

  // ---- B site: open container yard ----
  container(20, -15, 0, true);
  container(26, -8, Math.PI / 2, false);
  container(17, -6, 0, false);
  container(25, -15.5, Math.PI / 2, true);

  // ---- Mid: gantry crane over the middle lane + catwalk bridge ----
  box(1.1, 11, 1.1, -8.5, 5.5, -1.4, materials.hairline);
  box(1.1, 11, 1.1, -8.5, 5.5, 1.4, materials.hairline);
  box(1.1, 11, 1.1, 8.5, 5.5, -1.4, materials.hairline);
  box(1.1, 11, 1.1, 8.5, 5.5, 1.4, materials.hairline);
  box(18.1, 1.2, 3.4, 0, 11.4, 0, materials.accent);
  box(3, 1.6, 2.6, -2, 10.2, 0, materials.rust);
  // Catwalk bridge at y=3 across mid, with stepped ends.
  box(16, 0.3, 2.4, 0, 3, 0, materials.hairline);
  for (let i = 0; i < 3; i += 1) {
    box(1, 1 + i, 2.4, -8.5 - i, (1 + i) / 2, 0, materials.hairline);
    box(1, 1 + i, 2.4, 8.5 + i, (1 + i) / 2, 0, materials.hairline);
  }
  // Mid-lane cover flanking the bridge.
  container(-4, 3.2, 0, false);
  container(5, -3.4, 0, false);
  container(0, -6.5, Math.PI / 2, false);

  // ---- Lanes and plaza cover ----
  container(-12, 8, Math.PI / 2, false);
  container(-12, -1, 0, false);
  container(12, 8, Math.PI / 2, false);
  container(12, -1, 0, false);
  // Trucks at the south plaza.
  box(2.4, 2.6, 6.5, -7, 1.3, 14, containerMats[2]);
  box(2.4, 2.2, 2.2, -7, 1.1, 18.2, materials.hairline);
  box(2.4, 2.6, 6.5, 7, 1.3, 14, containerMats[0]);
  box(2.4, 2.2, 2.2, 7, 1.1, 18.2, materials.hairline);
  // Barrels near the lanes.
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12);
  for (const [bx, bz] of [[-6, 10], [-6.8, 10], [6, 10], [-13, -8], [13, -8]]) {
    const barrel = new THREE.Mesh(barrelGeo, containerMats[5]);
    barrel.position.set(bx, 0.55, bz);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
    colliders.push(new THREE.Box3().setFromObject(barrel));
    shootables.push(barrel);
  }

  // ---- Site beacons: coloured light columns so a site reads at a glance ----
  for (const site of Object.values(SITES)) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 9, 12, 1, true), new THREE.MeshBasicMaterial({
      color: new THREE.Color(site.color), transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false,
    }));
    beam.position.set(site.center.x, 4.5, site.center.z);
    group.add(beam);
    const beacon = new THREE.PointLight(new THREE.Color(site.color), 14, 16);
    beacon.position.set(site.center.x, 3.4, site.center.z);
    scene.add(beacon);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(site.color) }));
    sign.position.set(site.center.x, 4.2, site.center.z + (site.name === 'A' ? 5.9 : 6.9));
    group.add(sign);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.2, 0.14), materials.hairline);
    pole.position.set(site.center.x, 2.1, site.center.z + (site.name === 'A' ? 5.9 : 6.9));
    pole.castShadow = true;
    group.add(pole);
    colliders.push(new THREE.Box3().setFromObject(pole));
    shootables.push(pole);
  }

  // ---- Water basin east of the fence, with a moored barge ----
  const waterMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.water), roughness: 0.08, metalness: 0.9, transparent: true, opacity: 0.92 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(16, 26), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(39, -0.5, 0);
  group.add(water);
  box(8, 1.2, 4, 38, -0.1, -6, containerMats[2]);
  box(2, 1.6, 2, 36, 0.8, -6, materials.hairline);

  // ---- Rain: one Points cloud, recycled around the camera ----
  const RAIN_COUNT = 1400;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN_COUNT * 3);
  for (let i = 0; i < RAIN_COUNT; i += 1) {
    rainPos[i * 3] = (random() - 0.5) * 70;
    rainPos[i * 3 + 1] = random() * 22;
    rainPos[i * 3 + 2] = (random() - 0.5) * 50;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: new THREE.Color('#9db8cc'), size: 0.06, transparent: true, opacity: 0.55, sizeAttenuation: true,
  }));
  scene.add(rain);

  // ---- Night lighting ----
  const sky = new THREE.HemisphereLight(new THREE.Color('#27405e'), new THREE.Color('#05080d'), 1.05);
  scene.add(sky);
  const moon = new THREE.DirectionalLight(new THREE.Color('#b8cfe8'), 1.15);
  moon.position.set(-14, 26, -10);
  moon.target.position.set(4, 0, 4);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -36;
  moon.shadow.camera.right = 36;
  moon.shadow.camera.top = 36;
  moon.shadow.camera.bottom = -36;
  moon.shadow.camera.far = 80;
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);
  // Crane floodlights washing the middle lane amber.
  for (const sx of [-4, 4]) {
    const spot = new THREE.SpotLight(new THREE.Color('#ffb02e'), 220, 30, 0.7, 0.5, 1.2);
    spot.position.set(sx, 10.6, 0);
    spot.target.position.set(sx, 0, 0);
    scene.add(spot, spot.target);
  }
  // Warm lamp over A, cool lamp over B, dim lamps at the spawns.
  const lampA = new THREE.PointLight(new THREE.Color('#ff9a3c'), 30, 18);
  lampA.position.set(-21, 4.2, -12);
  scene.add(lampA);
  const lampB = new THREE.PointLight(new THREE.Color('#9fd8ff'), 26, 18);
  lampB.position.set(21, 4.2, -11);
  scene.add(lampB);
  for (const [lx, lz] of [[0, 19], [0, -19]]) {
    const lamp = new THREE.PointLight(new THREE.Color('#ffd9a0'), 12, 12);
    lamp.position.set(lx, 3.6, lz);
    scene.add(lamp);
  }

  let waterTime = 0;
  return {
    colliders,
    shootables,
    group,
    step(dt, cameraPosition) {
      waterTime += dt;
      waterMat.opacity = 0.88 + Math.sin(waterTime * 0.9) * 0.04;
      water.position.y = -0.5 + Math.sin(waterTime * 0.7) * 0.06;
      const positions = rainGeo.attributes.position.array;
      const cx = cameraPosition.x;
      const cz = cameraPosition.z;
      for (let i = 0; i < RAIN_COUNT; i += 1) {
        let y = positions[i * 3 + 1] - dt * 19;
        if (y < 0) {
          y = 20 + random() * 2;
          positions[i * 3] = cx + (random() - 0.5) * 70;
          positions[i * 3 + 2] = cz + (random() - 0.5) * 50;
        }
        positions[i * 3 + 1] = y;
        positions[i * 3] += dt * 1.6; // wind slant
      }
      rainGeo.attributes.position.needsUpdate = true;
    },
  };
}
