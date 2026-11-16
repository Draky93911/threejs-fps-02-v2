// The arsenal: four original weapons with their own numbers, view models and feel.
// Accuracy beats rate of fire: spread grows with movement and with sustained fire
// (bloom), and crouching stills it. The module owns the numbers; main.js owns the
// ray, the damage and the grenade throws.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  tide: {
    id: 'tide', name: 'Tide AR', price: 2700, damage: 34, headMult: 4, magSize: 25,
    reserve: 75, fireGap: 0.11, reloadTime: 2.1, auto: true,
    spreadStill: 0.0021, spreadMove: 0.03, bloomPerShot: 0.0022, bloomMax: 0.02,
    kick: 0.011, range: 90,
  },
  gull: {
    id: 'gull', name: 'Gull SMG', price: 1500, damage: 22, headMult: 4, magSize: 32,
    reserve: 96, fireGap: 0.075, reloadTime: 1.7, auto: true,
    spreadStill: 0.004, spreadMove: 0.042, bloomPerShot: 0.0016, bloomMax: 0.024,
    kick: 0.007, range: 55,
  },
  harpoon: {
    id: 'harpoon', name: 'Harpoon DMR', price: 4750, damage: 65, headMult: 4, magSize: 10,
    reserve: 30, fireGap: 0.45, reloadTime: 2.8, auto: false,
    spreadStill: 0.0009, spreadMove: 0.05, bloomPerShot: 0.006, bloomMax: 0.012,
    kick: 0.03, range: 120,
  },
  anchor: {
    id: 'anchor', name: 'Anchor Pistol', price: 0, damage: 26, headMult: 4, magSize: 12,
    reserve: 999, fireGap: 0.16, reloadTime: 1.4, auto: false,
    spreadStill: 0.0035, spreadMove: 0.032, bloomPerShot: 0.002, bloomMax: 0.014,
    kick: 0.008, range: 45,
  },
};

const VIEW = {
  tide: { body: [0.09, 0.11, 0.5], barrel: [0.04, 0.04, 0.42], stock: [0.07, 0.09, 0.2], accent: '#ffb02e' },
  gull: { body: [0.08, 0.1, 0.36], barrel: [0.035, 0.035, 0.3], stock: [0.06, 0.08, 0.16], accent: '#2ec8b8' },
  harpoon: { body: [0.07, 0.1, 0.62], barrel: [0.03, 0.03, 0.55], stock: [0.06, 0.09, 0.24], accent: '#b4502e' },
  anchor: { body: [0.06, 0.09, 0.2], barrel: [0.03, 0.03, 0.14], stock: [0.05, 0.08, 0.1], accent: '#dfe8ef' },
};

export function createWeapon(camera) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.25 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.4 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), bodyMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), gripMat);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), gripMat);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), accentMat);
  model.add(receiver, barrel, stock, stripe);
  model.position.set(0.26, -0.23, -0.45);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.17, 0.17),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.2, -1.05);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.26, -0.18, -0.65);
  camera.add(flashLight);

  let current = WEAPONS.tide;
  const ammo = {};
  for (const def of Object.values(WEAPONS)) ammo[def.id] = { mag: def.magSize, reserve: def.reserve };
  const state = { weaponId: 'tide', cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bloom: 0, triggerHeld: false };

  function applyViewModel() {
    const v = VIEW[current.id];
    receiver.scale.set(v.body[0], v.body[1], v.body[2]);
    receiver.position.set(0, 0, 0);
    barrel.scale.set(v.barrel[0], v.barrel[1], v.barrel[2]);
    barrel.position.set(0, 0.03, -v.body[2] / 2 - v.barrel[2] / 2 + 0.04);
    stock.scale.set(v.stock[0], v.stock[1], v.stock[2]);
    stock.position.set(0, -0.02, v.body[2] / 2 + v.stock[2] / 2 - 0.04);
    stripe.scale.set(0.06, 0.012, v.body[2] * 0.7);
    stripe.position.set(0, 0.062, -0.02);
    accentMat.color.set(v.accent);
  }
  applyViewModel();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.bloom = Math.max(0, state.bloom - dt * 0.03);
    model.position.z = -0.45 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (current.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const slot = ammo[current.id];
        const need = current.magSize - slot.mag;
        const take = Math.min(need, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
  }

  return {
    state,
    def() {
      return current;
    },
    ammo() {
      return ammo[current.id];
    },
    allAmmo() {
      return ammo;
    },
    step,
    ready() {
      const slot = ammo[current.id];
      return slot.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = current.fireGap;
      state.flash = 0.06;
      state.kick = current.id === 'harpoon' ? 0.09 : 0.055;
      state.bloom = Math.min(current.bloomMax, state.bloom + current.bloomPerShot);
    },
    takeRound() {
      const slot = ammo[current.id];
      if (slot.mag <= 0) return false;
      slot.mag -= 1;
      return true;
    },
    reload() {
      const slot = ammo[current.id];
      if (state.reloadLeft > 0 || slot.mag === current.magSize || slot.reserve === 0) return false;
      state.reloadLeft = current.reloadTime;
      return true;
    },
    spread(speed, crouching) {
      const move = Math.min(1, speed / 5.4);
      let value = current.spreadStill + move * current.spreadMove + state.bloom;
      if (crouching) value *= 0.7;
      return value;
    },
    equip(id) {
      if (!WEAPONS[id] || id === current.id) return false;
      current = WEAPONS[id];
      state.weaponId = id;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
      applyViewModel();
      return true;
    },
    refillAll() {
      for (const def of Object.values(WEAPONS)) {
        ammo[def.id] = { mag: def.magSize, reserve: def.reserve };
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
    buyAmmo(id) {
      ammo[id] = { mag: WEAPONS[id].magSize, reserve: WEAPONS[id].reserve };
    },
  };
}
