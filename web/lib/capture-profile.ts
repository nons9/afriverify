/**
 * Capture profiles for the live face scan.
 *
 * Standard: 640x480 JPEG q0.82 at about 8 frames a second, an in-browser face model (about 6 MB, cached after the
 * first scan) for live guidance, and a short evidence video. Roughly 9 MB on a first scan.
 *
 * Lite: 480x360 JPEG q0.72 at about 5 frames a second, NO model download and NO evidence video. Roughly 1 MB.
 * The server still verifies every prompt and runs every anti-spoofing check from the frames themselves, including
 * the screen-light challenge, so Lite is not a weaker check, only a less guided one: without the in-browser model
 * the person gets no live "keep your face in the oval" feedback, so each prompt simply runs for its full time.
 */
export type ProfileName = 'standard' | 'lite';

export interface CaptureProfile {
  name: ProfileName;
  width: number;
  height: number;
  tickMs: number;
  jpegQuality: number;
  useModel: boolean;
  recordVideo: boolean;
}

export const PROFILES: Record<ProfileName, CaptureProfile> = {
  standard: { name: 'standard', width: 640, height: 480, tickMs: 125, jpegQuality: 0.82, useModel: true, recordVideo: true },
  lite: { name: 'lite', width: 480, height: 360, tickMs: 200, jpegQuality: 0.72, useModel: false, recordVideo: false },
};

export interface NetworkHint { effectiveType?: string; saveData?: boolean; downlink?: number }

/**
 * Should Lite be pre-selected? True when the browser reports data-saver, a 3G-or-slower connection, or a
 * downlink under 1.5 Mbps. Browsers without the Network Information API (Safari, Firefox) report nothing, and
 * then we stay on Standard: the person can still choose Lite themselves.
 */
export function suggestLite(c: NetworkHint | undefined | null): boolean {
  if (!c) return false;
  if (c.saveData === true) return true;
  if (c.effectiveType && ['slow-2g', '2g', '3g'].includes(c.effectiveType)) return true;
  if (typeof c.downlink === 'number' && c.downlink > 0 && c.downlink < 1.5) return true;
  return false;
}

export function profileFor(lite: boolean): CaptureProfile {
  return lite ? PROFILES.lite : PROFILES.standard;
}
