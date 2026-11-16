// All sound is synthesised live with Web Audio: no audio files, no network.
// A shared noise buffer plus small envelopes cover gunfire, reloads, grenades,
// the bomb, the explosion and the round stingers.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let enabled = true;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return context;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    context = new AC();
    master = context.createGain();
    master.gain.value = 0.5;
    master.connect(context.destination);
    const length = context.sampleRate;
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return context;
  }

  function noise({ duration, type = 'lowpass', frequency = 1200, gain = 0.5, at = 0, q = 0.8 }) {
    const ctx = ensure();
    if (!ctx || !enabled) return;
    const t0 = ctx.currentTime + at;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    source.connect(filter).connect(amp).connect(master);
    source.start(t0);
    source.stop(t0 + duration + 0.05);
  }

  function tone({ frequency, end = null, duration, type = 'sine', gain = 0.25, at = 0 }) {
    const ctx = ensure();
    if (!ctx || !enabled) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t0);
    if (end !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), t0 + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(amp).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  return {
    unlock() {
      ensure();
    },
    setEnabled(value) {
      enabled = value;
    },
    shot(kind) {
      // kind: 'tide' | 'gull' | 'harpoon' | 'pistol' | 'enemy'
      if (kind === 'harpoon') {
        noise({ duration: 0.22, frequency: 900, gain: 0.7 });
        tone({ frequency: 160, end: 55, duration: 0.2, type: 'square', gain: 0.3 });
      } else if (kind === 'enemy') {
        noise({ duration: 0.12, type: 'bandpass', frequency: 700, gain: 0.22 });
      } else if (kind === 'gull') {
        noise({ duration: 0.08, frequency: 1600, gain: 0.4 });
        tone({ frequency: 220, end: 90, duration: 0.08, type: 'square', gain: 0.16 });
      } else if (kind === 'pistol') {
        noise({ duration: 0.09, frequency: 1400, gain: 0.42 });
        tone({ frequency: 200, end: 80, duration: 0.09, type: 'square', gain: 0.18 });
      } else {
        noise({ duration: 0.11, frequency: 1300, gain: 0.5 });
        tone({ frequency: 190, end: 70, duration: 0.1, type: 'square', gain: 0.22 });
      }
    },
    dryFire() {
      tone({ frequency: 1400, duration: 0.03, type: 'square', gain: 0.12 });
    },
    reload() {
      tone({ frequency: 900, duration: 0.04, type: 'square', gain: 0.14, at: 0 });
      tone({ frequency: 620, duration: 0.05, type: 'square', gain: 0.14, at: 0.45 });
      tone({ frequency: 1100, duration: 0.05, type: 'square', gain: 0.16, at: 1.15 });
    },
    hit(kill) {
      tone({ frequency: kill ? 1320 : 990, duration: 0.07, type: 'sine', gain: 0.22 });
      if (kill) tone({ frequency: 1760, duration: 0.12, type: 'sine', gain: 0.18, at: 0.07 });
    },
    hurt() {
      tone({ frequency: 130, end: 70, duration: 0.18, type: 'sawtooth', gain: 0.22 });
    },
    beep(planted) {
      tone({ frequency: planted ? 1180 : 880, duration: 0.09, type: 'sine', gain: 0.2 });
    },
    plantDone() {
      tone({ frequency: 880, duration: 0.1, type: 'sine', gain: 0.22 });
      tone({ frequency: 1174, duration: 0.14, type: 'sine', gain: 0.22, at: 0.11 });
    },
    defuseDone() {
      tone({ frequency: 1174, duration: 0.1, type: 'sine', gain: 0.22 });
      tone({ frequency: 1568, duration: 0.16, type: 'sine', gain: 0.22, at: 0.11 });
    },
    explosion() {
      noise({ duration: 1.4, frequency: 320, gain: 0.9 });
      noise({ duration: 0.7, type: 'bandpass', frequency: 2400, gain: 0.3 });
      tone({ frequency: 90, end: 28, duration: 1.2, type: 'sine', gain: 0.7 });
    },
    smoke() {
      noise({ duration: 0.9, type: 'highpass', frequency: 3000, gain: 0.16 });
    },
    flash() {
      tone({ frequency: 2400, end: 900, duration: 0.5, type: 'sine', gain: 0.14 });
      noise({ duration: 0.12, type: 'highpass', frequency: 4000, gain: 0.3 });
    },
    buy() {
      tone({ frequency: 1046, duration: 0.09, type: 'sine', gain: 0.2 });
      tone({ frequency: 1568, duration: 0.14, type: 'sine', gain: 0.2, at: 0.09 });
    },
    denied() {
      tone({ frequency: 220, duration: 0.12, type: 'square', gain: 0.14 });
      tone({ frequency: 175, duration: 0.16, type: 'square', gain: 0.14, at: 0.12 });
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => tone({ frequency: f, duration: 0.22, type: 'triangle', gain: 0.2, at: i * 0.12 }));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => tone({ frequency: f, duration: 0.24, type: 'triangle', gain: 0.18, at: i * 0.13 }));
    },
    roundStart() {
      tone({ frequency: 660, duration: 0.08, type: 'sine', gain: 0.16 });
      tone({ frequency: 880, duration: 0.12, type: 'sine', gain: 0.16, at: 0.09 });
    },
  };
}
