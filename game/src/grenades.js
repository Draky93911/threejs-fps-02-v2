// Thrown grenades: a smoke that blooms into a wall of puffs bots cannot see
// through, and a flash that whites out anyone looking at it. Projectiles arc,
// bounce once off the world, then do their job.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const SMOKE_SECONDS = 14;
const FLASH_RADIUS = 26;

export function createGrenades(scene, colliders, hooks) {
  const puffs = [];
  const projectiles = [];
  const puffGeo = new THREE.SphereGeometry(1, 12, 10);
  const puffMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8fa3b0'), roughness: 1, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false });
  const shellGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const shellMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2c323a'), roughness: 0.5, metalness: 0.6 });

  function deploySmoke(position) {
    const zone = { x: position.x, z: position.z, radius: 4.2, left: SMOKE_SECONDS, puffs: [] };
    for (let i = 0; i < 10; i += 1) {
      const puff = new THREE.Mesh(puffGeo, puffMat.clone());
      const angle = (i / 10) * Math.PI * 2;
      const r = 0.8 + (i % 3) * 1.1;
      puff.position.set(position.x + Math.cos(angle) * r, 0.9 + (i % 4) * 0.5, position.z + Math.sin(angle) * r);
      const scale = 1.4 + (i % 3) * 0.5;
      puff.scale.set(scale, scale * 0.8, scale);
      scene.add(puff);
      zone.puffs.push(puff);
    }
    puffs.push(zone);
    hooks.audio.smoke();
    hooks.onSmoke(zone);
  }

  function detonateFlash(position) {
    hooks.audio.flash();
    hooks.onFlash(position, FLASH_RADIUS);
  }

  function throwGrenade(kind, origin, direction) {
    const mesh = new THREE.Mesh(shellGeo, shellMat);
    mesh.position.copy(origin);
    scene.add(mesh);
    projectiles.push({
      kind,
      mesh,
      velocity: direction.clone().multiplyScalar(16).add(new THREE.Vector3(0, 5.5, 0)),
      fuse: kind === 'flash' ? 1.1 : 1.6,
      bounced: false,
    });
  }

  function step(dt) {
    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const p = projectiles[i];
      p.fuse -= dt;
      p.velocity.y -= 16 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      const pos = p.mesh.position;
      let hitWall = false;
      for (const box of colliders) {
        if (pos.x > box.min.x - 0.1 && pos.x < box.max.x + 0.1 && pos.y > box.min.y - 0.1 && pos.y < box.max.y + 0.1 && pos.z > box.min.z - 0.1 && pos.z < box.max.z + 0.1) {
          hitWall = true;
          break;
        }
      }
      if (pos.y <= 0.09) {
        pos.y = 0.09;
        if (!p.bounced) {
          p.velocity.y = Math.abs(p.velocity.y) * 0.35;
          p.velocity.x *= 0.6;
          p.velocity.z *= 0.6;
          p.bounced = true;
        } else {
          p.velocity.set(0, 0, 0);
        }
      } else if (hitWall) {
        p.velocity.x *= -0.4;
        p.velocity.z *= -0.4;
        p.velocity.y *= 0.3;
      }
      if (p.fuse <= 0 || (p.velocity.lengthSq() === 0 && p.fuse < 0.8)) {
        const at = p.mesh.position.clone();
        scene.remove(p.mesh);
        projectiles.splice(i, 1);
        if (p.kind === 'smoke') deploySmoke(at);
        else detonateFlash(at);
      }
    }
    for (let i = puffs.length - 1; i >= 0; i -= 1) {
      const zone = puffs[i];
      zone.left -= dt;
      const fade = Math.min(1, zone.left / 3);
      for (const puff of zone.puffs) puff.material.opacity = 0.55 * fade;
      if (zone.left <= 0) {
        for (const puff of zone.puffs) {
          scene.remove(puff);
          puff.material.dispose();
        }
        puffs.splice(i, 1);
      }
    }
  }

  return {
    throwGrenade,
    step,
    smokeZones() {
      return puffs.map((z) => ({ x: z.x, z: z.z, radius: z.radius }));
    },
    clear() {
      for (const p of projectiles) scene.remove(p.mesh);
      projectiles.length = 0;
      for (const zone of puffs) {
        for (const puff of zone.puffs) {
          scene.remove(puff);
          puff.material.dispose();
        }
      }
      puffs.length = 0;
    },
  };
}
