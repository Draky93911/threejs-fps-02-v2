// Tidebreak Harbor — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. 4v4 round-based bomb attack/defense: the player and
// three Tide bots attack A or B against four Harbor Watch defenders, with money
// and a buy menu between rounds, smoke and flash grenades, and a loss-streak bonus.
// ?shot=start|buy|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, clamp, nearestNode } from './util.js';
import { createWorld, WAYPOINTS, SITES, SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenades.js';
import { createEconomy } from './economy.js';
import { createRounds } from './rounds.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { losClear } from './physics.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !params.has('noshadow');
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio();
const world = createWorld(scene, random);
const player = createPlayer(world.colliders, SPAWNS.attackers[1]);
const weapon = createWeapon(camera);
const economy = createEconomy();

// ---- tracers: a small pool of fading lines, no allocation in the hot loop ----
const TRACER_COUNT = 24;
const tracers = [];
for (let i = 0; i < TRACER_COUNT; i += 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0 }));
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
let tracerNext = 0;
function fireTracer(from, to, color) {
  const tracer = tracers[tracerNext];
  tracerNext = (tracerNext + 1) % TRACER_COUNT;
  const attr = tracer.line.geometry.attributes.position;
  attr.setXYZ(0, from.x, from.y, from.z);
  attr.setXYZ(1, to.x, to.y, to.z);
  attr.needsUpdate = true;
  tracer.line.material.color.setHex(color);
  tracer.line.material.opacity = 0.85;
  tracer.line.visible = true;
  tracer.life = 0.09;
}
function stepTracers(dt) {
  for (const tracer of tracers) {
    if (tracer.life <= 0) continue;
    tracer.life -= dt;
    tracer.line.material.opacity = Math.max(0, tracer.life / 0.09) * 0.85;
    if (tracer.life <= 0) tracer.line.visible = false;
  }
}

// ---- the bomb mesh: a blinking case on the ground when dropped or planted ----
const bombGroup = new THREE.Group();
const bombCase = new THREE.Mesh(
  new THREE.BoxGeometry(0.42, 0.3, 0.3),
  new THREE.MeshStandardMaterial({ color: new THREE.Color('#1d2a3a'), roughness: 0.4, metalness: 0.6 }),
);
const bombLight = new THREE.Mesh(
  new THREE.SphereGeometry(0.06, 10, 8),
  new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff4d3d') }),
);
bombLight.position.set(0, 0.2, 0);
bombGroup.add(bombCase, bombLight);
bombGroup.visible = false;
scene.add(bombGroup);

const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const scratch = new THREE.Vector3();
const direction = new THREE.Vector3();
const losScratch = new THREE.Vector3();

let shootables = world.shootables.slice();
let elapsed = 0;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let blindUntil = 0;
let spectateBot = null;
let buyOpen = false;
let attackSite = 'A';
let bombPickupCooldown = 0;

const body = player.state;

const grenades = createGrenades(scene, world.colliders, {
  audio,
  onSmoke() {},
  onFlash(point) {
    // Bots that can see the pop are blinded.
    bots.blindBots(point, 26);
    // The player: blinded when looking toward it with a clear line.
    if (!body.alive) return;
    const eye = new THREE.Vector3(body.position.x, body.position.y + body.eye, body.position.z);
    const toFlash = new THREE.Vector3(point.x - eye.x, point.y - eye.y, point.z - eye.z);
    const dist = toFlash.length();
    if (dist > 26) return;
    toFlash.normalize();
    camera.getWorldDirection(direction);
    const facing = direction.dot(toFlash);
    if (facing < 0.2) return;
    if (!losClear(eye, new THREE.Vector3(point.x, point.y, point.z), world.shootables, raycaster, losScratch)) return;
    const strength = clamp(1.15 - dist / 26, 0.35, 1);
    hud.flashBlind(strength);
    blindUntil = elapsed + strength * 1.6;
  },
});

function aliveBots(team) {
  return bots.aliveCount(team);
}

function roundContext() {
  return {
    phase: rounds.state.phase,
    playerAlive: body.alive,
    player: body,
    playerSpeed: player.groundSpeed(),
    attackersAlive: aliveBots('attackers'),
    defendersAlive: aliveBots('defenders'),
    smokeZones: grenades.smokeZones(),
  };
}

const rounds = createRounds({
  onRoundStart(round, site) {
    attackSite = site;
    hud.showBanner(`Round ${round} — hit ${site}`, site === 'A' ? 'Warehouse, west wall' : 'Container yard, east side');
    audio.roundStart();
    if (!shot) openBuy();
  },
  onLive() {
    closeBuy();
    hud.setHint('');
  },
  onRoundEnd(winner, reason, score) {
    closeBuy();
    const weWon = winner === 'attackers';
    const reasonText = {
      elimination: 'Enemy team eliminated',
      detonation: 'The bomb went off',
      defused: 'The bomb was defused',
      time: 'Time ran out — no plant',
    }[reason] ?? reason;
    economy.awardRound(weWon);
    hud.setMoney(economy.state.money);
    hud.showBanner(weWon ? 'Round won' : 'Round lost', `${reasonText} · ${score.attackers}–${score.defenders}`, 4200);
    if (weWon) audio.roundWin();
    else audio.roundLose();
  },
  onMatchEnd(winner, score) {
    const weWon = winner === 'attackers';
    hud.showEndOverlay(
      weWon ? 'Harbor taken — match won' : 'Harbor held — match lost',
      `Final score ${score.attackers}–${score.defenders}. ${weWon ? 'The Tide crew owns the night.' : 'The Watch kept the docks.'}`,
      'Play again',
    );
    matchEnded = true;
  },
  onNextRound() {
    startRound();
  },
  onPlant(site, planter) {
    economy.awardPlant();
    hud.setMoney(economy.state.money);
    hud.setBombStatus(`BOMB PLANTED — ${site} · ${35}s`, 'planted');
    hud.showBanner('Bomb planted', `${site} site — hold it for 35 seconds`, 3000);
    audio.plantDone();
    bots.rotateDefenders(site);
  },
  onDefuse(defuser) {
    hud.setBombStatus('Bomb defused', '');
    audio.defuseDone();
  },
  onExplode(site, position) {
    audio.explosion();
    hud.showBanner('Detonation', `${site} site is gone`, 3000);
    const flash = new THREE.PointLight(new THREE.Color('#ffb02e'), 400, 40);
    flash.position.set(position.x, 2, position.z);
    scene.add(flash);
    setTimeout(() => scene.remove(flash), 900);
  },
});

let matchEnded = false;

const bots = createBots(scene, world, random, {
  audio,
  tracer: fireTracer,
  damagePlayer(amount, fromBot) {
    damagePlayer(amount, fromBot);
  },
  damageBot(bot, amount, attacker, headshot) {
    const killed = bots.damage(bot, amount, attacker, headshot);
    if (killed && attacker && attacker.team) {
      hud.killfeed(`${attacker.name} ▸ ${bot.name}${headshot ? ' (headshot)' : ''}`);
    }
    return killed;
  },
  onBotDown(bot, attacker, headshot) {
    if (bot.carrier) {
      bot.carrier = false;
      rounds.dropBomb(bot.position);
      bombGroup.visible = true;
      bombGroup.position.set(bot.position.x, 0.2, bot.position.z);
      hud.setBombStatus('Bomb dropped — pick it up', 'carried');
    }
    if (attacker === 'player') {
      economy.awardKill();
      hud.setMoney(economy.state.money);
    }
  },
  plantDone(bot) {
    rounds.plantBomb(bot.site, bot.position, bot.name);
    bombGroup.visible = true;
    bombGroup.position.set(bot.position.x, 0.2, bot.position.z);
  },
  defuseDone(bot) {
    rounds.defuseBomb(bot.name);
    bombGroup.visible = false;
  },
});

function damagePlayer(amount, fromBot) {
  if (!body.alive) return;
  let remaining = amount;
  if (body.armor > 0) {
    const absorbed = Math.min(body.armor, amount * 0.5);
    body.armor -= absorbed;
    remaining -= absorbed;
  }
  body.health -= remaining;
  hud.damageFlash();
  audio.hurt();
  hud.setHealth(body.health, body.armor);
  if (body.health <= 0) {
    body.health = 0;
    body.alive = false;
    hud.killfeed(`${fromBot ? fromBot.name : 'Harbor Watch'} ▸ You`);
    hud.showBanner('You are down', 'Your crew fights on', 2600);
    const mates = bots.bots.filter((b) => b.alive && b.team === 'attackers');
    spectateBot = mates.length ? mates[Math.floor(random() * mates.length)] : null;
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

const hud = createHud({
  onBuy(item) {
    if (rounds.state.phase !== 'buy' || !started) return;
    if (item.kind === 'armor') {
      if (economy.buyArmor()) {
        body.armor = 100;
        audio.buy();
        hud.setHealth(body.health, body.armor);
      } else audio.denied();
    } else if (economy.buy(item)) {
      audio.buy();
      if (item.kind === 'weapon') {
        weapon.buyAmmo(item.id);
        weapon.equip(item.id);
      }
    } else {
      audio.denied();
    }
    hud.setMoney(economy.state.money);
    hud.refreshBuy(economy.state.money, economy.state.owned, economy.state.grenades);
    syncAmmoHud();
  },
  onBuyClose() {
    closeBuy();
  },
});

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (matchEnded) {
    matchEnded = false;
    economy.resetMatch();
    rounds.startMatch();
    startRound();
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  input.requestLock();
});

function openBuy() {
  if (shot || !started) return;
  buyOpen = true;
  hud.showBuy(economy.state.money, economy.state.owned, economy.state.grenades);
  input.exitLock();
}
function closeBuy() {
  if (!buyOpen) return;
  buyOpen = false;
  hud.hideBuy();
  if (started && !shot && body.alive && rounds.state.phase !== 'over') input.requestLock();
}

function syncAmmoHud() {
  const slot = weapon.ammo();
  hud.setAmmo(slot.mag, slot.reserve, weapon.def().name);
}

function startRound() {
  // Fresh positions, health and ammo; the bomb goes to a random crewmate.
  attackSite = random() < 0.5 ? 'A' : 'B';
  const carrierIndex = Math.floor(random() * 3);
  player.respawn(SPAWNS.attackers[1]);
  weapon.refillAll();
  weapon.equip('anchor');
  if (economy.hasWeapon('tide')) weapon.equip('tide');
  else if (economy.hasWeapon('gull')) weapon.equip('gull');
  else if (economy.hasWeapon('harpoon')) weapon.equip('harpoon');
  grenades.clear();
  spectateBot = null;
  bombGroup.visible = false;
  bots.spawnRound(attackSite, carrierIndex);
  shootables = world.shootables.concat(
    bots.bots.flatMap((b) => [b.mesh.torso, b.mesh.head]),
  );
  const carrier = bots.carrier();
  rounds.startRound(attackSite, carrier);
  hud.setHealth(body.health, body.armor);
  hud.setMoney(economy.state.money);
  hud.setBombStatus(carrier ? `Bomb with ${carrier.name}` : '', 'carried');
  syncAmmoHud();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (buyOpen) closeBuy();
  } else if (!matchEnded && rounds.state.phase !== 'over' && !buyOpen) {
    hud.showOverlay(started ? 'paused' : 'start', 0);
  }
}

const input = createInput(renderer.domElement, onLockChange);

function shoot() {
  const def = weapon.def();
  if (!weapon.takeRound()) {
    audio.dryFire();
    return;
  }
  const spread = shot ? 0 : weapon.spread(player.groundSpeed(), body.crouching);
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  raycaster.far = def.range;
  const hits = raycaster.intersectObjects(shootables, false);
  const hit = hits[0];
  const muzzle = camera.position.clone().addScaledVector(direction, 0.9);
  muzzle.y -= 0.12;
  if (hit) {
    fireTracer(muzzle, hit.point, 0xffd27a);
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      const headshot = hit.object.userData.part === 'head';
      const damage = def.damage * (headshot ? def.headMult : 1);
      const killed = bots.damage(bot, damage, 'player', headshot);
      hud.hitMarker(killed, shot ? 4000 : 110);
      audio.hit(killed);
      if (killed) {
        economy.awardKill();
        hud.setMoney(economy.state.money);
        hud.killfeed(`You ▸ ${bot.name}${headshot ? ' (headshot)' : ''}`);
      }
    }
  } else {
    const far = camera.position.clone().addScaledVector(direction, def.range);
    fireTracer(muzzle, far, 0xffd27a);
  }
  weapon.pullTrigger();
  player.recoil(def.kick * (0.8 + random() * 0.4), (random() * 2 - 1) * def.kick * 0.4);
  audio.shot(def.id);
  bots.hearShot(body.position.x, body.position.z);
  syncAmmoHud();
}

function throwGrenade(kind) {
  if (!economy.useGrenade(kind)) {
    audio.denied();
    hud.setHint(kind === 'smoke' ? 'No smoke grenades — buy some (B)' : 'No flash grenades — buy some (B)');
    return;
  }
  camera.getWorldDirection(direction);
  const origin = camera.position.clone().addScaledVector(direction, 0.5);
  grenades.throwGrenade(kind, origin, direction.clone());
  hud.setHint('');
}

function step(dt) {
  elapsed += dt;
  bombPickupCooldown = Math.max(0, bombPickupCooldown - dt);

  // Edge-triggered keys.
  for (const code of input.takePressed()) {
    if (code === 'KeyR' && body.alive) {
      if (weapon.reload()) audio.reload();
    }
    if (code === 'KeyB' && body.alive && rounds.state.phase === 'buy' && started) {
      if (buyOpen) closeBuy();
      else openBuy();
    }
    if (code === 'KeyG' && body.alive && rounds.state.phase === 'live') throwGrenade('smoke');
    if (code === 'KeyF' && body.alive && rounds.state.phase === 'live') throwGrenade('flash');
    if (code === 'Digit1' && economy.hasWeapon('tide')) weapon.equip('tide');
    if (code === 'Digit2' && economy.hasWeapon('gull')) weapon.equip('gull');
    if (code === 'Digit3' && economy.hasWeapon('harpoon')) weapon.equip('harpoon');
    if (code === 'Digit4') weapon.equip('anchor');
  }

  player.step(dt, input.state.keys);
  weapon.step(dt);
  grenades.step(dt);
  stepTracers(dt);

  // Bomb carrier routing: a dropped bomb pulls the nearest crewmate to it.
  const bomb = rounds.state.bomb;
  if (bomb.status === 'dropped' && bomb.position && rounds.state.phase === 'live') {
    if (body.alive) {
      const d = Math.hypot(body.position.x - bomb.position.x, body.position.z - bomb.position.z);
      if (d < 1.6 && bombPickupCooldown === 0) {
        rounds.pickupBomb('player');
        bombGroup.visible = false;
        hud.setBombStatus('You carry the bomb — plant at A or B', 'carried');
        hud.showBanner('Bomb picked up', 'Hold E at a site to plant', 2200);
        audio.beep(true);
      }
    }
    for (const bot of bots.bots) {
      if (!bot.alive || bot.team !== 'attackers' || bot.carrier) continue;
      const d = Math.hypot(bot.position.x - bomb.position.x, bot.position.z - bomb.position.z);
      if (d < 1.6) {
        rounds.pickupBomb(bot);
        bot.carrier = true;
        bombGroup.visible = false;
        bots.routeTo(bot, bot.site === 'A' ? 10 : 16);
        break;
      }
    }
  }

  // Carrier bot arriving at its site starts the plant.
  const carrier = bots.carrier();
  if (carrier && rounds.state.phase === 'live' && bomb.status === 'carried') {
    const goal = WAYPOINTS[carrier.site === 'A' ? 10 : 16];
    const d = Math.hypot(carrier.position.x - goal.x, carrier.position.z - goal.z);
    if (d < 2.2 && carrier.pathIndex >= carrier.path.length) bots.startPlant(carrier);
  }

  // A defender reaching the planted bomb starts the defuse.
  if (bomb.status === 'planted' && bomb.position) {
    for (const bot of bots.bots) {
      if (!bot.alive || bot.team !== 'defenders' || bot.channelKind) continue;
      const d = Math.hypot(bot.position.x - bomb.position.x, bot.position.z - bomb.position.z);
      if (d < 1.8) bots.startDefuse(bot);
    }
  }

  // Player plant / defuse channels on E.
  if (body.alive && rounds.state.phase === 'live') {
    const holdingE = input.state.keys.has('KeyE');
    const plantSite = rounds.canPlant(body.position.x, body.position.z);
    const defusing = rounds.canDefuse(body.position.x, body.position.z);
    if (plantSite && holdingE) {
      const result = rounds.channelStep('plant', dt, true);
      if (result === 'done') {
        rounds.plantBomb(plantSite, body.position, 'player');
        bombGroup.visible = true;
        bombGroup.position.set(body.position.x, 0.2, body.position.z);
      } else {
        hud.setChannel('plant', result ?? 0);
        if (Math.floor(elapsed * 2) !== Math.floor((elapsed - dt) * 2)) audio.beep(false);
      }
      hud.setHint('');
    } else if (defusing && holdingE) {
      const result = rounds.channelStep('defuse', dt, true);
      if (result === 'done') {
        rounds.defuseBomb('player');
        bombGroup.visible = false;
      } else {
        hud.setChannel('defuse', result ?? 0);
        if (Math.floor(elapsed * 2) !== Math.floor((elapsed - dt) * 2)) audio.beep(true);
      }
      hud.setHint('');
    } else {
      rounds.channelStep('plant', dt, false);
      rounds.channelStep('defuse', dt, false);
      hud.setChannel(null, 0);
      if (plantSite) hud.setHint('Hold E to plant the bomb');
      else if (defusing) hud.setHint('Hold E to defuse');
      else if (bomb.status === 'carried' && bomb.carrier === 'player') hud.setHint('Carry the bomb to A or B');
      else hud.setHint('');
    }
  } else {
    hud.setChannel(null, 0);
  }

  bots.step(dt, elapsed, roundContext());
  world.step(dt, camera.position);
  rounds.step(dt, {
    attackersAlive: aliveBots('attackers'),
    defendersAlive: aliveBots('defenders'),
    playerAlive: body.alive,
  });

  // Bomb blink.
  if (bombGroup.visible && bomb.status === 'planted') {
    bombLight.material.color.setHex(Math.sin(elapsed * 9) > 0 ? 0xff4d3d : 0x550000);
  }

  // HUD numbers.
  hud.setHealth(body.health, body.armor);
  hud.setMoney(economy.state.money);
  hud.setTimer(rounds.state.timeLeft, rounds.state.phase);
  hud.setScore(rounds.state.score.attackers, rounds.state.score.defenders, rounds.state.round);
  hud.setAlive(aliveBots('attackers') + (body.alive ? 1 : 0), aliveBots('defenders'));
  if (bomb.status === 'planted') {
    hud.setBombStatus(`BOMB PLANTED — ${bomb.site} · ${Math.ceil(rounds.state.timeLeft)}s`, 'planted');
  }
  syncAmmoHud();
}

function syncCamera() {
  if (!body.alive && spectateBot && spectateBot.alive) {
    const yaw = spectateBot.yaw;
    camera.position.set(
      spectateBot.position.x + Math.sin(yaw) * 2.4,
      spectateBot.position.y + 2.2,
      spectateBot.position.z + Math.cos(yaw) * 2.4,
    );
    camera.lookAt(spectateBot.position.x, spectateBot.position.y + 1.4, spectateBot.position.z);
    return;
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (body.alive && elapsed > blindUntil) player.look(look.x, look.y);
    const firing = input.state.firing && body.alive && (rounds.state.phase === 'live' || rounds.state.phase === 'buy') && elapsed > blindUntil;
    const def = weapon.def();
    if (firing && weapon.ready() && (def.auto || !prevFiring)) shoot();
    prevFiring = input.state.firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.clearKillfeed();
  started = true;
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    body.position.set(-6, 0, 16);
    settle(20);
    aimAt(new THREE.Vector3(4, 4, -10));
    hud.showOverlay('start', 0);
    hud.setScore(0, 0, 1);
    hud.setTimer(12, 'buy');
    hud.setMoney(800);
    hud.setHealth(100, 0);
    syncAmmoHud();
  } else if (name === 'buy') {
    economy.state.money = 3500;
    economy.buy({ id: 'tide', kind: 'weapon', price: 2700 });
    weapon.buyAmmo('tide');
    weapon.equip('tide');
    startRound();
    body.position.set(0, 0, 17);
    body.yaw = 0;
    settle(20);
    aimAt(new THREE.Vector3(0, 2, -8));
    hud.setMoney(economy.state.money);
    hud.showBuy(economy.state.money, economy.state.owned, economy.state.grenades);
    syncAmmoHud();
  } else if (name === 'play') {
    economy.state.money = 3500;
    economy.buy({ id: 'tide', kind: 'weapon', price: 2700 });
    startRound();
    rounds.state.phase = 'live';
    rounds.state.timeLeft = 62;
    // Stage the fight: player mid-lane, one defender in the open, smoke drifting.
    body.position.set(0, 0, 8);
    body.yaw = 0;
    settle(10);
    grenades.throwGrenade('smoke', new THREE.Vector3(-4, 1.5, -3), new THREE.Vector3(0, 1, 0));
    settle(110); // let the smoke bloom and the bots take their angles
    // Re-stage after the settle: the player may have taken fire while waiting.
    body.alive = true;
    body.health = 100;
    body.armor = 0;
    spectateBot = null;
    body.position.set(0, 0, 8);
    body.yaw = 0;
    const foe = bots.bots.find((b) => b.team === 'defenders' && b.alive);
    if (foe) {
      foe.position.set(1.5, 0, -4);
      foe.mesh.group.position.set(1.5, 0, -4);
      foe.yaw = Math.PI;
      foe.path = [];
      foe.state = 'hold';
    }
    const mate = bots.bots.find((b) => b.team === 'attackers' && b.alive && !b.carrier);
    if (mate) {
      mate.position.set(-3.5, 0, 4);
      mate.mesh.group.position.set(-3.5, 0, 4);
      mate.yaw = -0.4;
      mate.path = [];
      mate.state = 'hold';
    }
    body.health = 100;
    body.armor = 0;
    aimAt(new THREE.Vector3(1.5, 1.3, -4));
    shoot();
    // Hold the frame a touch off the foe so it reads beside the hit marker.
    aimAt(new THREE.Vector3(2.6, 1.3, -4));
    settle(2);
    hud.setBombStatus('Bomb with Rook — push A', 'carried');
  } else if (name === 'end') {
    economy.state.money = 7350;
    economy.buy({ id: 'tide', kind: 'weapon', price: 2700 });
    startRound();
    rounds.state.phase = 'over';
    rounds.state.timeLeft = 5;
    rounds.state.score = { attackers: 1, defenders: 0 };
    const foe = bots.bots.find((b) => b.team === 'defenders' && b.alive);
    if (foe) {
      foe.alive = false;
      foe.fall = 1;
      foe.mesh.group.rotation.x = -1.5;
      foe.mesh.group.position.set(19, 0, -9);
      foe.position.set(19, 0, -9);
    }
    grenades.throwGrenade('smoke', new THREE.Vector3(21, 1.5, -12), new THREE.Vector3(0, 1, 0));
    body.position.set(14, 0, -2);
    settle(110); // let the smoke bloom before the frame freezes
    aimAt(new THREE.Vector3(21, 1, -11));
    hud.setScore(1, 0, 1);
    hud.setTimer(5, 'over');
    hud.showEndOverlay('Round won', 'Enemy team eliminated · Score 1–0. Next round starts soon.', 'Continue');
  }
  hud.hideBanner();
  hud.setHint('');
  hud.clearKillfeed();
  hud.setScore(rounds.state.score.attackers, rounds.state.score.defenders, rounds.state.round);
  hud.setAmmo(weapon.ammo().mag, weapon.ammo().reserve, weapon.def().name);
  hud.setAlive(aliveBots('attackers') + (body.alive ? 1 : 0), aliveBots('defenders'));
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug handle for automated checks (read-only state, no secrets).
window.__tidebreak = {
  get phase() { return rounds.state.phase; },
  get round() { return rounds.state.round; },
  get score() { return { ...rounds.state.score }; },
  get timeLeft() { return rounds.state.timeLeft; },
  get bomb() { return rounds.state.bomb.status; },
  get playerAlive() { return body.alive; },
  get attackersAlive() { return aliveBots('attackers'); },
  get defendersAlive() { return aliveBots('defenders'); },
  get money() { return economy.state.money; },
  get smokeZones() { return grenades.smokeZones().length; },
  get pos() { return { x: +body.position.x.toFixed(2), z: +body.position.z.toFixed(2) }; },
  get ammo() { return { mag: weapon.ammo().mag, weapon: weapon.def().id }; },
  get health() { return Math.ceil(body.health); },
};

// Boot: round one is staged immediately so the first frame already shows the harbor.
startRound();
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
