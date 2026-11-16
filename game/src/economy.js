// The money between rounds: kill pay, round pay, and a loss-streak bonus so a
// team that keeps losing can still buy back in. The buy list is the shop the HUD
// renders; this module only owns the numbers and the rules.
import { WEAPONS } from './weapons.js';

export const KILL_PAY = 300;
export const WIN_PAY = 3250;
export const LOSS_PAY = 1900;
export const STREAK_BONUS = 500;
export const STREAK_MAX = 2000;
export const PLANT_PAY = 300;

export const SHOP = [
  { id: 'gull', kind: 'weapon', name: 'Gull SMG', price: WEAPONS.gull.price, desc: 'Fast, close, wild' },
  { id: 'tide', kind: 'weapon', name: 'Tide AR', price: WEAPONS.tide.price, desc: 'Accurate at range' },
  { id: 'harpoon', kind: 'weapon', name: 'Harpoon DMR', price: WEAPONS.harpoon.price, desc: 'One shot, one lesson' },
  { id: 'armor', kind: 'armor', name: 'Kevlar Vest', price: 650, desc: 'Halves bullet damage' },
  { id: 'smoke', kind: 'grenade', name: 'Smoke Grenade', price: 300, desc: 'Blocks sight for 14 s' },
  { id: 'flash', kind: 'grenade', name: 'Flash Grenade', price: 200, desc: 'Blinds anyone looking' },
];

export function createEconomy() {
  const state = {
    money: 800,
    owned: { anchor: true },
    grenades: { smoke: 0, flash: 0 },
    lossStreak: 0,
    kills: 0,
  };

  return {
    state,
    resetMatch() {
      state.money = 800;
      state.owned = { anchor: true };
      state.grenades = { smoke: 0, flash: 0 };
      state.lossStreak = 0;
      state.kills = 0;
    },
    canAfford(price) {
      return state.money >= price;
    },
    buy(item) {
      if (state.money < item.price) return false;
      if (item.kind === 'weapon' && state.owned[item.id]) return false;
      if (item.kind === 'grenade' && state.grenades[item.id] >= 2) return false;
      if (item.kind === 'armor') return false; // handled by buyArmor
      state.money -= item.price;
      if (item.kind === 'weapon') state.owned[item.id] = true;
      else state.grenades[item.id] += 1;
      return true;
    },
    buyArmor() {
      if (state.money < 650) return false;
      state.money -= 650;
      return true;
    },
    hasWeapon(id) {
      return !!state.owned[id];
    },
    awardKill() {
      state.money += KILL_PAY;
      state.kills += 1;
    },
    awardRound(won) {
      if (won) {
        state.money += WIN_PAY;
        state.lossStreak = 0;
      } else {
        state.money += LOSS_PAY + Math.min(STREAK_MAX, state.lossStreak * STREAK_BONUS);
        state.lossStreak += 1;
      }
    },
    awardPlant() {
      state.money += PLANT_PAY;
    },
    useGrenade(kind) {
      if (state.grenades[kind] <= 0) return false;
      state.grenades[kind] -= 1;
      return true;
    },
  };
}
