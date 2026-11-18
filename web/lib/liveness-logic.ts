/**
 * Client-side GUIDANCE for the live face scan. It only drives the on-screen prompts;
 * the server re-analyses every frame and is the only authority on the outcome.
 * Frames are sent UNMIRRORED: nose_ratio > 0.5 means the person turned to THEIR left.
 */
export type ChallengeType = 'turn_left' | 'turn_right' | 'blink' | 'smile';

export interface FaceSample {
  hasFace: boolean;
  faceCount: number;
  noseRatio: number; // 0.5 = frontal (image coordinates)
  blink: number;     // 0..1
  smile: number;     // 0..1
  areaRatio: number; // face bbox / frame area
  brightness: number; // 0..255 mean luma
}

export const TURN_DELTA = 0.12;
export const BLINK_CLOSED = 0.55;
export const BLINK_OPEN = 0.3;
export const SMILE_ON = 0.5;
export const SMILE_OFF = 0.3;

export const CHALLENGE_TEXT: Record<ChallengeType, string> = {
  turn_left: 'Turn your head to your LEFT',
  turn_right: 'Turn your head to your RIGHT',
  blink: 'Blink slowly',
  smile: 'Give a big smile',
};

export function positionHint(s: FaceSample): string | null {
  if (!s.hasFace) return 'Position your face inside the oval';
  if (s.faceCount > 1) return 'Only one person should be in view';
  if (s.brightness < 55) return 'Too dark - face a light source';
  if (s.areaRatio < 0.08) return 'Move a little closer';
  if (s.areaRatio > 0.6) return 'Move back a little';
  return null;
}

/** Tracks progress of one challenge from live samples (guidance only). */
export class ChallengeTracker {
  private baseline: number[] = [];
  private sawOpen = false;
  private sawClosed = false;
  private sawNeutral = false;
  done = false;

  constructor(readonly type: ChallengeType, private frontalBaseline: number | null) {}

  update(s: FaceSample): boolean {
    if (this.done || !s.hasFace || s.faceCount !== 1) return this.done;
    switch (this.type) {
      case 'turn_left':
      case 'turn_right': {
        if (this.frontalBaseline === null) { this.baseline.push(s.noseRatio); if (this.baseline.length >= 3) this.frontalBaseline = median(this.baseline); break; }
        const dir = this.type === 'turn_left' ? 1 : -1;
        if (dir * (s.noseRatio - this.frontalBaseline) >= TURN_DELTA) this.done = true;
        break;
      }
      case 'blink':
        if (s.blink <= BLINK_OPEN && !this.sawClosed) this.sawOpen = true;
        else if (s.blink >= BLINK_CLOSED && this.sawOpen) this.sawClosed = true;
        else if (s.blink <= BLINK_OPEN && this.sawClosed) this.done = true;
        break;
      case 'smile':
        if (s.smile <= SMILE_OFF) this.sawNeutral = true;
        else if (s.smile >= SMILE_ON && this.sawNeutral) this.done = true;
        break;
    }
    return this.done;
  }
}

export function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

const REASON_TEXT: Record<string, string> = {
  face_not_consistently_visible: "We couldn't see your face clearly the whole time.",
  multiple_faces: 'Make sure only you are in the frame.',
  face_too_small: 'Move closer to the camera.',
  challenge_failed: "We couldn't confirm the actions. Follow the prompts one at a time.",
  passive_checks_failed: 'The image quality was too low. Use good, even lighting and a clean lens.',
};

export function friendlyReasons(reasons: string[]): string {
  const msgs = reasons.map((r) => REASON_TEXT[r]).filter(Boolean);
  return msgs.length ? msgs.join(' ') : "We couldn't verify the scan. Please try again in good lighting.";
}

/** Short developer-facing labels for the engine's reason codes and passive-check flags. */
export const REASON_LABEL: Record<string, string> = {
  face_not_consistently_visible: 'Face not visible',
  multiple_faces: 'Multiple faces',
  face_too_small: 'Face too small',
  challenge_failed: 'Prompts not followed',
  passive_checks_failed: 'Image checks failed',
  invalid_capture: 'Invalid capture',
  frozen_or_looped_frames: 'Frozen or looped video',
  no_natural_motion: 'No natural motion',
  moire_pattern: 'Screen pattern (replay?)',
  screen_glare: 'Screen glare',
  screen_fringes: 'Screen fringes (replay?)',
  multiple_screen_cues: 'Several signs of a screen',
  flat_face_turn: 'Flat picture turned (replay?)',
  flash_mismatch: 'Face did not reflect the screen light (replay?)',
  flash_uniform_response: 'Whole picture tinted by the screen light (replay?)',
  flash_response_too_weak: 'Screen light too weak to measure',
  flash_washed_out: 'Too bright to measure the screen light',
  flash_not_measurable: 'Screen-light check could not be measured',
  flash_skipped: 'Colour flash skipped',
  flash_missing: 'Colour flash missing',
  blurry: 'Blurry',
  too_dark: 'Too dark',
  overexposed: 'Overexposed',
  low_contrast: 'Low contrast',
  low_chroma: 'Low colour',
  no_analysable_faces: 'No usable face',
};
