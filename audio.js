/* Lightweight effects for existing UI/result events. No timing hint during play. */
(function (root) {
  'use strict';
  const SOUND_KEY = 'suiteki_catch_sound_v1';
  const VOLUME_KEY = 'suiteki_catch_volume_v1';
  const TONES = Object.freeze({
    select: [440, 0.04], countdown: [520, 0.05], start: [660, 0.08],
    fail: [160, 0.12], retire: [240, 0.08], clear: [880, 0.14], best: [990, 0.10]
  });
  function create(options = {}) {
    const storage = options.storage;
    function read(key) { try { return storage?.getItem(key) ?? null; } catch (_) { return null; } }
    function save(key, value) { try { storage?.setItem(key, value); } catch (_) { /* Gameplay does not depend on saving. */ } }
    const savedSound = read(SOUND_KEY), savedVolume = read(VOLUME_KEY);
    let enabled = savedSound === 'off' ? false : true;
    const numericVolume = savedVolume === null || savedVolume.trim() === '' ? NaN : Number(savedVolume);
    let volume = Number.isFinite(numericVolume) && numericVolume >= 0 && numericVolume <= 1 ? numericVolume : 0.2;
    let context = null, hidden = false, disposed = false;
    const voices = new Set();
    function release(voice, stop) {
      if (!voices.has(voice)) return;
      voices.delete(voice);
      voice.osc.onended = null;
      if (stop) { try { voice.osc.stop(); } catch (_) {} }
      try { voice.osc.disconnect(); } catch (_) {}
      try { voice.gain.disconnect(); } catch (_) {}
    }
    function stopAll() { for (const voice of [...voices]) release(voice, true); }
    function unlock() {
      if (disposed || hidden || !enabled || volume === 0) return Promise.resolve(false);
      try {
        if (!context) context = options.contextFactory();
        if (!context) return Promise.resolve(false);
        if (context.state === 'running') return Promise.resolve(true);
        // Do not cache a pending resume promise: a later gesture must retry.
        return Promise.resolve(context.resume()).then(
          () => !disposed && !hidden && enabled && volume > 0 && context.state === 'running',
          () => false
        );
      } catch (_) { return Promise.resolve(false); }
    }
    function play(event) {
      if (!Object.hasOwn(TONES, event) || disposed || hidden || !enabled || volume === 0 || !context || context.state !== 'running') return false;
      let osc, gain, voice;
      try {
        while (voices.size >= 3) release(voices.values().next().value, true);
        osc = context.createOscillator();
        gain = context.createGain();
        voice = { osc, gain };
        voices.add(voice);
        const [frequency, duration] = TONES[event], now = context.currentTime;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume * 0.12, now + 0.008);
        gain.gain.linearRampToValueAtTime(0, now + duration);
        osc.connect(gain);
        gain.connect(context.destination);
        osc.onended = () => release(voice, false);
        osc.start(now);
        osc.stop(now + duration + 0.02);
        return true;
      } catch (_) {
        if (voice) release(voice, true);
        else {
          try { osc?.disconnect(); } catch (_) {}
          try { gain?.disconnect(); } catch (_) {}
        }
        return false;
      }
    }
    function setEnabled(value) {
      if (typeof value !== 'boolean' || disposed) return;
      enabled = value;
      save(SOUND_KEY, enabled ? 'on' : 'off');
      if (!enabled) stopAll();
    }
    function setVolume(value) {
      if (!Number.isFinite(value) || value < 0 || value > 1 || disposed) return;
      volume = value;
      save(VOLUME_KEY, String(value));
      if (volume === 0) stopAll();
    }
    function setHidden(value) { hidden = !!value; if (hidden) stopAll(); }
    function dispose() {
      if (disposed) return;
      disposed = true;
      stopAll();
      try { if (context) Promise.resolve(context.close()).catch(() => {}); } catch (_) {}
    }
    return Object.freeze({
      events: Object.freeze(Object.keys(TONES)),
      getSettings: () => Object.freeze({ enabled, volume }),
      unlock, play, setEnabled, setVolume, setHidden, dispose
    });
  }
  root.SuitekiAudio = Object.freeze({ create });
})(globalThis);
