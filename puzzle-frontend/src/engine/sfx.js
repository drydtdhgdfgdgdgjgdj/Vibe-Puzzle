// ============================================================
// Sons synthétisés (aucun fichier audio requis). Le volume est lu à
// chaque son, pour suivre le réglage "Effets sonores" en direct.
// ============================================================
export function createSoundFx(getVolume = () => 0.8) {
  let ctx = null;
  const getCtx = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };

  const beep = (freq, duration, type = 'sine', vol = 0.1, delay = 0) => {
    const master = Math.max(0, Math.min(1, getVolume()));
    if (master <= 0) return;
    try {
      const c = getCtx();
      const t0 = c.currentTime + delay;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(vol * master, t0);
      gain.gain.exponentialRampToValueAtTime(0.0008, t0 + duration);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + duration);
    } catch { /* audio pas encore débloqué par une interaction */ }
  };

  return {
    pickup: () => beep(420, 0.07, 'triangle', 0.06),
    drop: () => beep(300, 0.05, 'triangle', 0.04),
    snap: () => { beep(600, 0.09, 'sine', 0.11); beep(900, 0.12, 'sine', 0.09, 0.07); },
    lock: () => { beep(660, 0.09, 'sine', 0.12); beep(990, 0.14, 'sine', 0.1, 0.07); beep(1320, 0.12, 'sine', 0.06, 0.14); },
    hint: () => { beep(880, 0.14, 'sine', 0.11); beep(1320, 0.14, 'sine', 0.09, 0.1); },
    ping: () => { beep(1046, 0.08, 'sine', 0.08); beep(1568, 0.1, 'sine', 0.06, 0.06); },
    deny: () => beep(180, 0.12, 'square', 0.04),
    boom: () => [392, 523, 659, 784, 1046].forEach((f, i) => beep(f, 0.22, 'triangle', 0.1, i * 0.06)),
    win: () => [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.3, 'triangle', 0.13, i * 0.12)),
  };
}
