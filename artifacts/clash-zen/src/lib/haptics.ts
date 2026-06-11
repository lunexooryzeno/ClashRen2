/**
 * Haptic feedback — centralized system wrapping navigator.vibrate.
 *
 * All functions are no-ops when:
 *   - navigator.vibrate is unsupported (iOS Safari, desktop)
 *   - the user has disabled haptics via hapticSettings.setEnabled(false)
 *
 * Semantic levels:
 *   haptic.navTap()      18 ms   — bottom nav press
 *   haptic.lightTap()   28 ms   — copy, toggle switch, minor confirmation
 *   haptic.mediumTap()  55 ms   — form submit, join match, modal open
 *   haptic.successTap() triple  — prize credited, payment confirmed, match won
 *   haptic.warningTap() double  — caution feedback
 *   haptic.errorTap()   triple  — failure, invalid input, destructive action
 *
 * Backwards-compatible aliases (existing call sites stay unchanged):
 *   softTap → lightTap,  impact → mediumTap,  reward → successTap,  error → errorTap
 */

const HAPTICS_KEY = "cz:haptics";
const MIN_INTERVAL_MS = 80;

let _lastVibration = 0;

export const hapticSettings = {
  isSupported(): boolean {
    return typeof navigator !== "undefined" && "vibrate" in navigator;
  },

  isEnabled(): boolean {
    try {
      const val = localStorage.getItem(HAPTICS_KEY);
      return val === null ? true : val === "1";
    } catch {
      return true;
    }
  },

  setEnabled(on: boolean): void {
    try { localStorage.setItem(HAPTICS_KEY, on ? "1" : "0"); } catch { /* ignore */ }
  },

  toggle(): boolean {
    const next = !this.isEnabled();
    this.setEnabled(next);
    return next;
  },
};

function v(pattern: number | number[]): void {
  if (!hapticSettings.isSupported() || !hapticSettings.isEnabled()) return;
  const now = Date.now();
  if (now - _lastVibration < MIN_INTERVAL_MS) return;
  _lastVibration = now;
  try { navigator.vibrate(pattern); } catch { /* ignore */ }
}

export const haptic = {
  /** 18 ms — bottom nav press, minimal acknowledgement */
  navTap:     () => v(18),
  /** 28 ms — copy, toggle switch, minor confirmation */
  lightTap:   () => v(28),
  /** 55 ms — modal open, form submit, important confirm button */
  mediumTap:  () => v(55),
  /** [70, 35, 100] — payment confirmed, match joined, prize credited */
  successTap: () => v([70, 35, 100]),
  /** [40, 20, 40] — caution / warning */
  warningTap: () => v([40, 20, 40]),
  /** [55, 25, 55] — error, invalid input, failure */
  errorTap:   () => v([55, 25, 55]),

  // Backwards-compatible aliases — existing call sites continue to work unchanged
  softTap: () => v(28),
  impact:  () => v(55),
  reward:  () => v([70, 35, 100]),
  error:   () => v([55, 25, 55]),
};
