# Tidebreak Harbor

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Draky93911/threejs-fps-02-v2/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Draky93911/threejs-fps-02-v2/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Tidebreak Harbor is a rain-soaked night-port tactical FPS: 4v4 bomb attack and defense across a container terminal, with a buy menu between rounds, smoke and flash grenades, and bots that push lanes, hold angles, plant and defuse. You and three Tide crewmates attack two sites — the A warehouse and the open B container yard — against four Harbor Watch defenders, under a gantry crane in the rain. First to five rounds takes the harbor.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome and click to play. No build step, no network requests — the game is static files, and all sound is synthesised live with Web Audio.

### Controls

- **W A S D** — Move
- **Mouse** — Look (click to lock the pointer)
- **Click** — Fire
- **R** — Reload
- **1 / 2 / 3 / 4** — Tide AR / Gull SMG / Harpoon DMR / Anchor Pistol
- **E** (hold) — Plant the bomb at A or B / defuse a planted bomb
- **G** — Throw smoke grenade
- **F** — Throw flash grenade
- **B** — Buy menu (buy phase only)
- **Ctrl** — Crouch
- **Space** — Jump

### Rules

- Rounds are won by eliminating the other team, by detonating the planted bomb, or by defusing it; if the clock runs out with no plant, the defenders win.
- Kills pay $300, a round win pays $3,250, a loss pays $1,900 plus a $500-per-loss streak bonus (up to $2,000), so a losing team can buy back in.
- Hits are checked against bodies with 4× headshot damage; spread grows with movement and sustained fire, and crouching stills it — stopping to aim pays.

---

<sub>Entered on [make.fun](https://make.fun/?ref=640z6wc1&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
