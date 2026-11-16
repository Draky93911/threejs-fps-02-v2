// The round machine: buy phase, live round, bomb, and the match. First to five
// rounds takes the match (nine rounds at most). A round ends on elimination, on
// the bomb going off, on a defuse, or on the clock running out with no plant.
import { SITES } from './world.js';

export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const FUSE_SECONDS = 35;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;

export function createRounds(hooks) {
  const state = {
    phase: 'buy',
    round: 1,
    score: { attackers: 0, defenders: 0 },
    timeLeft: BUY_SECONDS,
    bomb: { status: 'carried', site: null, position: null, carrier: null },
    channel: { kind: null, progress: 0 },
    lastReason: '',
    matchOver: false,
    matchWinner: null,
  };
  let ended = false;

  function siteAt(x, z) {
    for (const site of Object.values(SITES)) {
      if (x >= site.minX && x <= site.maxX && z >= site.minZ && z <= site.maxZ) return site.name;
    }
    return null;
  }

  function endRound(winner, reason) {
    if (ended || state.phase === 'over') return;
    ended = true;
    state.phase = 'over';
    state.timeLeft = 5;
    state.lastReason = reason;
    state.score[winner] += 1;
    state.channel = { kind: null, progress: 0 };
    hooks.onRoundEnd(winner, reason, { ...state.score });
    if (state.score[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.matchOver = true;
      state.matchWinner = state.score.attackers > state.score.defenders ? 'attackers' : 'defenders';
      hooks.onMatchEnd(state.matchWinner, { ...state.score });
    }
  }

  return {
    state,
    siteAt,
    startMatch() {
      state.phase = 'buy';
      state.round = 1;
      state.score = { attackers: 0, defenders: 0 };
      state.timeLeft = BUY_SECONDS;
      state.bomb = { status: 'carried', site: null, position: null, carrier: null };
      state.channel = { kind: null, progress: 0 };
      state.matchOver = false;
      state.matchWinner = null;
      ended = false;
    },
    startRound(site, carrierIndex) {
      state.phase = 'buy';
      state.timeLeft = BUY_SECONDS;
      state.bomb = { status: 'carried', site, position: null, carrier: carrierIndex };
      state.channel = { kind: null, progress: 0 };
      ended = false;
      hooks.onRoundStart(state.round, site);
    },
    dropBomb(position) {
      if (state.bomb.status !== 'carried') return;
      state.bomb.status = 'dropped';
      state.bomb.position = { x: position.x, z: position.z };
      state.bomb.carrier = null;
    },
    pickupBomb(carrier) {
      if (state.bomb.status !== 'dropped') return false;
      state.bomb.status = 'carried';
      state.bomb.carrier = carrier;
      state.bomb.position = null;
      return true;
    },
    plantBomb(site, position, planter) {
      state.bomb.status = 'planted';
      state.bomb.site = site;
      state.bomb.position = { x: position.x, z: position.z };
      state.bomb.carrier = null;
      state.timeLeft = FUSE_SECONDS;
      hooks.onPlant(site, planter);
    },
    defuseBomb(defuser) {
      state.bomb.status = 'defused';
      hooks.onDefuse(defuser);
      endRound('defenders', 'defused');
    },
    canPlant(x, z) {
      if (state.bomb.status !== 'carried' || state.bomb.carrier !== 'player') return null;
      return siteAt(x, z);
    },
    canDefuse(x, z) {
      if (state.bomb.status !== 'planted' || !state.bomb.position) return false;
      const dx = x - state.bomb.position.x;
      const dz = z - state.bomb.position.z;
      return Math.hypot(dx, dz) < 2.2;
    },
    channelStep(kind, dt, active) {
      if (!active) {
        if (state.channel.kind === kind) state.channel = { kind: null, progress: 0 };
        return null;
      }
      if (state.channel.kind !== kind) state.channel = { kind, progress: 0 };
      state.channel.progress += dt;
      const need = kind === 'plant' ? PLANT_SECONDS : DEFUSE_SECONDS;
      if (state.channel.progress >= need) {
        state.channel = { kind: null, progress: 0 };
        return 'done';
      }
      return state.channel.progress / need;
    },
    step(dt, ctx) {
      if (state.phase === 'buy') {
        state.timeLeft -= dt;
        if (state.timeLeft <= 0) {
          state.phase = 'live';
          state.timeLeft = ROUND_SECONDS;
          hooks.onLive();
        }
        return;
      }
      if (state.phase === 'live') {
        state.timeLeft -= dt;
        if (state.bomb.status === 'planted' && state.timeLeft <= 0) {
          hooks.onExplode(state.bomb.site, state.bomb.position);
          endRound('attackers', 'detonation');
          return;
        }
        if (state.bomb.status !== 'planted' && state.timeLeft <= 0) {
          endRound('defenders', 'time');
          return;
        }
        if (ctx.attackersAlive === 0 && ctx.playerAlive === false) {
          endRound('defenders', 'elimination');
          return;
        }
        if (ctx.defendersAlive === 0) {
          if (state.bomb.status === 'planted') {
            // Planted and nobody left to defuse: the fuse decides it.
          } else {
            endRound('attackers', 'elimination');
            return;
          }
        }
        return;
      }
      if (state.phase === 'over') {
        state.timeLeft -= dt;
        if (state.timeLeft <= 0 && !state.matchOver) {
          state.round += 1;
          hooks.onNextRound(state.round);
        }
      }
    },
  };
}
