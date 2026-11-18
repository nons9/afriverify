/**
 * Screen-light (flash) challenge, browser side. The server sends a random colour order; we show each
 * colour full-screen for `hold_ms`, after a dark `lead_ms`, and report WHEN each one was actually put
 * on screen (the engine checks the face's colour against those windows).
 *
 * Safety: 700 ms per colour is about 1.4 changes a second (the general limit is 3), no fully saturated red,
 * the user can stop it at any time, and reduced-motion users never see it.
 */
export type RGB = [number, number, number];
export interface FlashPlan { neutral: RGB; lead_ms: number; hold_ms: number; steps: RGB[] }
export interface Win { start_ms: number; end_ms: number }
export interface FlashTiming { lead: Win; windows: Win[] }

export const rgbCss = ([r, g, b]: RGB) => `rgb(${r}, ${g}, ${b})`;

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function flashDurationMs(plan: FlashPlan): number {
  return plan.lead_ms + plan.steps.length * plan.hold_ms;
}

/** Which stage is on screen `elapsedMs` after the flash began: -1 = dark lead, 0..n-1 = a colour, n = finished. */
export function stageAt(plan: FlashPlan, elapsedMs: number): number {
  if (elapsedMs < plan.lead_ms) return -1;
  const i = Math.floor((elapsedMs - plan.lead_ms) / plan.hold_ms);
  return Math.min(i, plan.steps.length);
}

/** Turn the moments each stage was shown into the windows the engine wants (relative to the capture clock t0). */
export function toTiming(marks: number[], endAbs: number, t0: number): FlashTiming {
  // marks[0] = lead began, marks[1] = colour 0 began, ...
  const rel = (v: number) => Math.round(v - t0);
  const windows: Win[] = [];
  for (let j = 1; j < marks.length; j++) {
    windows.push({ start_ms: rel(marks[j]), end_ms: rel(j + 1 < marks.length ? marks[j + 1] : endAbs) });
  }
  return { lead: { start_ms: rel(marks[0]), end_ms: rel(marks[1]) }, windows };
}

/**
 * Plays the sequence. `apply(rgb|null)` must set the screen colour synchronously (a style assignment).
 * Resolves with the timing, or null if `aborted()` turned true (the user stopped it).
 */
export function runFlash(
  plan: FlashPlan,
  t0: number,
  apply: (rgb: RGB | null) => void,
  aborted: () => boolean,
): Promise<FlashTiming | null> {
  return new Promise((resolve) => {
    const began = performance.now();
    const total = flashDurationMs(plan);
    const marks: number[] = [];
    let shown = -2;
    const frame = () => {
      if (aborted()) { apply(null); resolve(null); return; }
      const now = performance.now();
      const stage = stageAt(plan, now - began);
      if (stage >= plan.steps.length) {
        apply(null);
        resolve(toTiming(marks, now, t0));
        return;
      }
      if (stage !== shown) {
        shown = stage;
        apply(stage === -1 ? plan.neutral : plan.steps[stage]);
        marks.push(performance.now());      // right after the style assignment: the paint follows this frame
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    void total;
  });
}
