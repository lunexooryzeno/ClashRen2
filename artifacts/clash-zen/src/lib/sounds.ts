/**
 * Synthesized micro sound effects via Web Audio API.
 * No audio files — everything is generated on-device in milliseconds.
 * Respects user's system mute and stays extremely subtle (gain ≤ 0.18).
 *
 * Usage:
 *   sound.tap()       — soft click, copy confirmation
 *   sound.success()   — ascending two-tone chime, join/verify success
 *   sound.reward()    — three-note fanfare, prize credited
 *   sound.error()     — short descending buzz, failure
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx || ctx.state === "closed") {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(
  frequency: number,
  startAt: number,
  duration: number,
  gain: number,
  type: OscillatorType = "sine",
  fadeOut = true,
) {
  const c = getCtx();
  if (!c) return;

  const osc = c.createOscillator();
  const gainNode = c.createGain();

  osc.connect(gainNode);
  gainNode.connect(c.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, c.currentTime + startAt);

  gainNode.gain.setValueAtTime(0, c.currentTime + startAt);
  gainNode.gain.linearRampToValueAtTime(gain, c.currentTime + startAt + 0.008);
  if (fadeOut) {
    gainNode.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + startAt + duration);
  }

  osc.start(c.currentTime + startAt);
  osc.stop(c.currentTime + startAt + duration + 0.01);
}

export const sound = {
  /** Soft click — 2 ms tick */
  tap() {
    tone(900, 0, 0.04, 0.06, "sine");
  },

  /** Ascending two-note chime — match joined, OTP verified */
  success() {
    tone(660, 0,    0.12, 0.12, "sine");
    tone(880, 0.10, 0.18, 0.12, "sine");
  },

  /** Three-note ascending fanfare — prize credited, tournament win */
  reward() {
    tone(523, 0,    0.10, 0.14, "sine");  // C5
    tone(659, 0.10, 0.10, 0.14, "sine");  // E5
    tone(784, 0.20, 0.22, 0.18, "sine");  // G5
  },

  /** Short descending buzz — error, failure */
  error() {
    tone(280, 0,    0.08, 0.12, "sawtooth");
    tone(220, 0.07, 0.12, 0.10, "sawtooth");
  },

  /** Single short beep — countdown alert, room opening */
  alert() {
    tone(740, 0, 0.12, 0.10, "sine");
  },
};
