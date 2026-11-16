// One axis-at-a-time AABB mover shared by the player and every bot: a wall never
// swallows a body, and standing on a crate is not read as walking into it.
import * as THREE from 'three';

export function createMover(colliders, radius, height) {
  const probe = new THREE.Box3();

  function overlaps(x, y, z, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (const collider of colliders) {
      if (probe.intersectsBox(collider)) return collider;
    }
    return null;
  }

  // Moves `body` (a THREE.Vector3 feet position) by velocity * dt. Returns whether
  // the body is standing on something after the move.
  function move(body, velocity, dt) {
    const nextX = body.x + velocity.x * dt;
    if (!overlaps(nextX, body.y, body.z, 0.04)) body.x = nextX;
    else velocity.x = 0;
    const nextZ = body.z + velocity.z * dt;
    if (!overlaps(body.x, body.y, nextZ, 0.04)) body.z = nextZ;
    else velocity.z = 0;
    body.y += velocity.y * dt;
    let onGround = false;
    const hit = overlaps(body.x, body.y, body.z, 0);
    if (hit && velocity.y <= 0) {
      body.y = hit.max.y;
      velocity.y = 0;
      onGround = true;
    } else if (hit) {
      body.y = hit.min.y - height;
      velocity.y = 0;
    }
    if (body.y < 0) {
      body.y = 0;
      velocity.y = 0;
      onGround = true;
    }
    return onGround;
  }

  return { overlaps, move };
}

// A horizontal ray blocked by the world: used for bot sight lines and tracer stops.
export function losClear(origin, target, shootables, raycaster, scratch) {
  scratch.copy(target).sub(origin);
  const distance = scratch.length();
  if (distance < 0.001) return true;
  scratch.normalize();
  raycaster.set(origin, scratch);
  raycaster.far = distance;
  const hit = raycaster.intersectObjects(shootables, false)[0];
  return !hit;
}
