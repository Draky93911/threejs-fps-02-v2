// The seven bots: three Tide crewmates beside the player, four Harbor Watch
// defenders. Attackers walk waypoint routes to a site, plant, then hold it;
// defenders hold angles, rotate to gunfire or a planted bomb, and defuse.
// Every bot sees with a raycast, hears shots, reacts after a delay, and fires
// in bursts with a hit chance that falls with distance and target speed.
import * as THREE from 'three';
import { createMover, losClear } from './physics.js';
import { findPath, nearestNode, clamp } from './util.js';
import { WAYPOINTS, EDGES, SITES } from './world.js';

const NAMES = {
  attackers: ['Rook', 'Mara', 'Finn'],
  defenders: ['Sable', 'Kestrel', 'Wren', 'Heron'],
};
const BOT_HEALTH = 100;
const BOT_SPEED = 3.9;
const REACTION_MIN = 0.35;
const REACTION_MAX = 0.75;
const BURST_MIN = 3;
const BURST_MAX = 5;
const SHOT_GAP = 0.11;
const PLANT_TIME = 3;
const DEFUSE_TIME = 5;

const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
const headGeo = new THREE.SphereGeometry(0.16, 14, 10);
const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);
const ringGeo = new THREE.RingGeometry(0.34, 0.44, 24);

function smokeBlocks(a, b, zones) {
  // Segment-sphere test against each smoke puff (sphere centre y=1.5).
  for (const zone of zones) {
    const cx = zone.x;
    const cy = 1.5;
    const cz = zone.z;
    const r = zone.radius;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const fx = a.x - cx;
    const fy = a.y - cy;
    const fz = a.z - cz;
    const aa = dx * dx + dy * dy + dz * dz;
    const bb = 2 * (fx * dx + fy * dy + fz * dz);
    const cc = fx * fx + fy * fy + fz * fz - r * r;
    const disc = bb * bb - 4 * aa * cc;
    if (disc < 0) continue;
    const t = (-bb - Math.sqrt(disc)) / (2 * aa);
    if (t >= 0 && t <= 1) return true;
  }
  return false;
}

export function createBots(scene, world, random, hooks) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const scratch = new THREE.Vector3();
  const eyeScratch = new THREE.Vector3();
  const targetScratch = new THREE.Vector3();
  const bots = [];
  let now = 0;

  function makeMesh(team) {
    const group = new THREE.Group();
    const torsoMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'attackers' ? '#c97a1e' : '#27a396'), roughness: 0.6, metalness: 0.15 });
    const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'attackers' ? '#e8b06a' : '#8fd8cf'), roughness: 0.5, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#141a21'), roughness: 0.7, metalness: 0.3 });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.02;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.56;
    head.userData.part = 'head';
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.18, 1.05, -0.25);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(team === 'attackers' ? '#ffb02e' : '#2ec8b8'), side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(torso, head, gun, ring);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);
    return { group, torso, head, gun, ring };
  }

  function spawnBot(team, index, spawn) {
    const mover = createMover(world.colliders, 0.34, 1.72);
    const mesh = makeMesh(team);
    const bot = {
      team,
      name: NAMES[team][index],
      mesh,
      mover,
      position: new THREE.Vector3(spawn.x, 0, spawn.z),
      velocity: new THREE.Vector3(),
      yaw: spawn.yaw ?? 0,
      health: BOT_HEALTH,
      alive: true,
      fall: 0,
      speed: BOT_SPEED * (0.92 + random() * 0.16),
      path: [],
      pathIndex: 0,
      holdNode: -1,
      state: 'idle',
      site: null,
      carrier: false,
      reaction: 0,
      burstLeft: 0,
      burstTimer: 0,
      target: null,
      targetKind: null,
      blindUntil: 0,
      channel: 0,
      channelKind: null,
      heardAt: null,
      stuckTimer: 0,
      lastPos: new THREE.Vector3(spawn.x, 0, spawn.z),
    };
    mesh.torso.userData.bot = bot;
    mesh.head.userData.bot = bot;
    bots.push(bot);
    return bot;
  }

  function setPath(bot, goalNode) {
    const start = nearestNode(WAYPOINTS, bot.position.x, bot.position.z);
    const path = findPath(WAYPOINTS, EDGES, start, goalNode);
    if (!path) {
      bot.path = [];
      return false;
    }
    bot.path = path;
    bot.pathIndex = 0;
    return true;
  }

  function eyeOf(bot) {
    return eyeScratch.set(bot.position.x, bot.position.y + 1.5, bot.position.z);
  }

  function canSee(bot, point, ctx) {
    if (smokeBlocks(eyeOf(bot), point, ctx.smokeZones)) return false;
    targetScratch.copy(point);
    return losClear(eyeOf(bot), targetScratch, world.shootables, raycaster, scratch);
  }

  function visibleEnemy(bot, ctx) {
    // Returns {kind, ref, point, dist} for the nearest visible enemy, or null.
    let best = null;
    const candidates = [];
    if (ctx.playerAlive) {
      candidates.push({
        kind: 'player',
        ref: ctx.player,
        point: new THREE.Vector3(ctx.player.position.x, ctx.player.position.y + (ctx.player.crouching ? 0.7 : 1.3), ctx.player.position.z),
        speed: ctx.playerSpeed,
      });
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      candidates.push({
        kind: 'bot',
        ref: other,
        point: new THREE.Vector3(other.position.x, other.position.y + 1.3, other.position.z),
        speed: Math.hypot(other.velocity.x, other.velocity.z),
      });
    }
    for (const cand of candidates) {
      const dx = cand.point.x - bot.position.x;
      const dz = cand.point.z - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 46) continue;
      // Must be roughly in front of the bot's facing.
      const facingX = -Math.sin(bot.yaw);
      const facingZ = -Math.cos(bot.yaw);
      const dot = (dx * facingX + dz * facingZ) / (dist || 1);
      if (dot < 0.15 && dist > 4) continue;
      if (!canSee(bot, cand.point, ctx)) continue;
      if (!best || dist < best.dist) best = { ...cand, dist };
    }
    return best;
  }

  function faceToward(bot, x, z, dt) {
    const targetYaw = Math.atan2(-(x - bot.position.x), -(z - bot.position.z));
    let diff = targetYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += clamp(diff, -dt * 7, dt * 7);
  }

  function fireAt(bot, enemy, ctx) {
    const muzzle = new THREE.Vector3(bot.position.x, bot.position.y + 1.25, bot.position.z);
    muzzle.x += -Math.sin(bot.yaw) * 0.4;
    muzzle.z += -Math.cos(bot.yaw) * 0.4;
    const aim = enemy.point.clone();
    const dist = enemy.dist;
    // Hit chance falls with distance, target speed and while the bot moves.
    const moving = Math.hypot(bot.velocity.x, bot.velocity.z);
    let chance = 0.58 - dist * 0.007 - enemy.speed * 0.022 - moving * 0.02;
    if (enemy.kind === 'player' && ctx.player.crouching) chance -= 0.07;
    chance = clamp(chance, 0.06, 0.7);
    const hit = random() < chance;
    let end;
    if (hit) {
      const headshot = random() < 0.12;
      const damage = (headshot ? 52 : 26);
      end = aim.clone();
      if (enemy.kind === 'player') hooks.damagePlayer(damage, bot);
      else hooks.damageBot(enemy.ref, damage, bot, headshot);
    } else {
      end = aim.clone();
      end.x += (random() - 0.5) * 2.4;
      end.y += (random() - 0.5) * 1.6;
      end.z += (random() - 0.5) * 2.4;
    }
    hooks.tracer(muzzle, end, bot.team === 'attackers' ? 0xffb02e : 0x2ec8b8);
    hooks.audio.shot('enemy');
  }

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) {
      if (bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.mesh.group.rotation.x = -bot.fall * 1.5;
        bot.mesh.group.position.y = -bot.fall * 0.1;
      }
      return;
    }
    const blinded = now < bot.blindUntil;

    // ---- combat scan ----
    let enemy = null;
    if (!blinded && ctx.phase === 'live') enemy = visibleEnemy(bot, ctx);
    if (enemy) {
      bot.target = enemy;
      faceToward(bot, enemy.point.x, enemy.point.z, dt);
      if (bot.reaction <= 0 && bot.burstLeft <= 0) {
        bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN + 1));
        bot.burstTimer = 0;
      }
    } else {
      bot.target = null;
      bot.reaction = REACTION_MIN + random() * (REACTION_MAX - REACTION_MIN);
      bot.burstLeft = 0;
    }
    if (enemy) bot.reaction -= dt;
    if (bot.burstLeft > 0 && bot.reaction <= 0) {
      bot.burstTimer -= dt;
      if (bot.burstTimer <= 0) {
        bot.burstTimer = SHOT_GAP;
        bot.burstLeft -= 1;
        fireAt(bot, enemy, ctx);
        if (bot.burstLeft === 0) bot.reaction = REACTION_MIN + random() * (REACTION_MAX - REACTION_MIN);
      }
    }

    // ---- bomb channel (plant / defuse) ----
    if (bot.channelKind && !enemy) {
      bot.channel += dt;
      const need = bot.channelKind === 'plant' ? PLANT_TIME : DEFUSE_TIME;
      if (bot.channel >= need) {
        const kind = bot.channelKind;
        bot.channelKind = null;
        bot.channel = 0;
        if (kind === 'plant') hooks.plantDone(bot);
        else hooks.defuseDone(bot);
      }
    } else if (bot.channelKind && enemy) {
      bot.channelKind = null;
      bot.channel = 0;
    }

    // ---- movement ----
    bot.velocity.x = 0;
    bot.velocity.z = 0;
    if (!blinded && bot.channelKind === null && ctx.phase === 'live') {
      let dest = null;
      if (bot.pathIndex < bot.path.length) {
        const node = WAYPOINTS[bot.path[bot.pathIndex]];
        dest = node;
        const dx = node.x - bot.position.x;
        const dz = node.z - bot.position.z;
        if (Math.hypot(dx, dz) < 0.9) {
          bot.pathIndex += 1;
          bot.stuckTimer = 0;
        }
      } else if (bot.state === 'hold' && bot.holdNode >= 0) {
        const node = WAYPOINTS[bot.holdNode];
        const dx = node.x - bot.position.x;
        const dz = node.z - bot.position.z;
        if (Math.hypot(dx, dz) > 0.6) dest = node;
      }
      if (dest && !enemy) {
        const dx = dest.x - bot.position.x;
        const dz = dest.z - bot.position.z;
        const len = Math.hypot(dx, dz) || 1;
        const speed = bot.speed * (bot.target ? 0.55 : 1);
        bot.velocity.x = (dx / len) * speed;
        bot.velocity.z = (dz / len) * speed;
        faceToward(bot, dest.x, dest.z, dt);
        bot.stuckTimer += dt;
        if (bot.stuckTimer > 4) {
          // Stuck against a crate: sidestep to the next waypoint.
          bot.pathIndex = Math.min(bot.pathIndex + 1, bot.path.length);
          bot.stuckTimer = 0;
        }
      } else if (enemy) {
        // Strafe a little while firing so bots are not statues.
        const strafe = Math.sin(now * 1.3 + bot.name.length) * 0.8;
        bot.velocity.x = Math.cos(bot.yaw) * strafe;
        bot.velocity.z = -Math.sin(bot.yaw) * strafe;
      }
    }
    bot.velocity.y = -20 * dt;
    const wasY = bot.position.y;
    bot.mover.move(bot.position, bot.velocity, dt);
    if (bot.position.y < 0) bot.position.y = 0;
    void wasY;

    bot.mesh.group.position.set(bot.position.x, bot.position.y, bot.position.z);
    bot.mesh.group.rotation.y = bot.yaw;
    if (bot.channelKind) {
      bot.mesh.ring.material.opacity = 0.4 + 0.6 * Math.sin(now * 10);
    } else {
      bot.mesh.ring.material.opacity = bot.carrier ? 0.95 : 0.55;
    }
  }

  function damage(bot, amount, attacker, headshot) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    bot.channelKind = null;
    bot.channel = 0;
    bot.velocity.set(0, 0, 0);
    hooks.onBotDown(bot, attacker, headshot);
    return true;
  }

  return {
    bots,
    spawnRound(attackSite, carrierIndex) {
      for (const bot of bots) scene.remove(bot.mesh.group);
      bots.length = 0;
      const atk = [...Array(3).keys()];
      const def = [...Array(4).keys()];
      // Attackers: carrier + one mate to the called site, one to the other site as a feint.
      const otherSite = attackSite === 'A' ? 'B' : 'A';
      atk.forEach((i) => {
        const bot = spawnBot('attackers', i, { x: -3 + i * 3, z: 18 + (i % 2), yaw: 0 });
        bot.site = i === 2 ? otherSite : attackSite;
        bot.carrier = i === carrierIndex;
      });
      def.forEach((i) => {
        const bot = spawnBot('defenders', i, { x: -3 + i * 2, z: -18 - (i % 2), yaw: Math.PI });
        bot.site = i < 2 ? 'A' : 'B';
      });
      // Defenders take their holds; attackers route to their site.
      for (const bot of bots) {
        if (bot.team === 'defenders') {
          const holdNodes = bot.site === 'A' ? [10, 20, 11, 19] : [16, 21, 17, 19];
          bot.holdNode = holdNodes[bot.name === 'Sable' || bot.name === 'Wren' ? 0 : 1];
          bot.state = 'hold';
          setPath(bot, bot.holdNode);
        } else {
          const goal = bot.site === 'A' ? 10 : 16;
          bot.state = 'push';
          setPath(bot, goal);
        }
      }
    },
    step(dt, time, ctx) {
      now = time;
      for (const bot of bots) stepBot(bot, dt, ctx);
    },
    damage,
    aliveCount(team) {
      return bots.filter((b) => b.alive && b.team === team).length;
    },
    carrier() {
      return bots.find((b) => b.carrier && b.alive) ?? null;
    },
    startPlant(bot) {
      if (!bot.alive || bot.channelKind) return false;
      bot.channelKind = 'plant';
      bot.channel = 0;
      bot.path = [];
      return true;
    },
    startDefuse(bot) {
      if (!bot.alive || bot.channelKind) return false;
      bot.channelKind = 'defuse';
      bot.channel = 0;
      bot.path = [];
      return true;
    },
    routeTo(bot, nodeIndex) {
      bot.state = 'rotate';
      setPath(bot, nodeIndex);
    },
    rotateDefenders(site) {
      const goal = site === 'A' ? 10 : 16;
      for (const bot of bots) {
        if (bot.team !== 'defenders' || !bot.alive) continue;
        if (bot.site !== site) {
          bot.site = site;
          bot.state = 'rotate';
          setPath(bot, goal);
        }
      }
    },
    hearShot(x, z) {
      for (const bot of bots) {
        if (!bot.alive || bot.team !== 'defenders') continue;
        const d = Math.hypot(bot.position.x - x, bot.position.z - z);
        if (d < 26 && bot.state === 'hold') {
          bot.heardAt = { x, z };
        }
      }
    },
    blindBots(point, radius) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        const d = Math.hypot(bot.position.x - point.x, bot.position.z - point.z);
        if (d > radius) continue;
        const eye = new THREE.Vector3(bot.position.x, bot.position.y + 1.5, bot.position.z);
        if (!losClear(eye, point, world.shootables, raycaster, scratch)) continue;
        bot.blindUntil = now + 2.5;
        bot.burstLeft = 0;
      }
    },
    reset() {
      for (const bot of bots) {
        bot.mesh.group.rotation.set(0, bot.yaw, 0);
        bot.mesh.group.position.y = 0;
      }
    },
  };
}
