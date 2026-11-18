"""Passive (presentation-attack) signals computed from the frames themselves.

v1 is a transparent, tunable heuristic stack - NOT a trained anti-spoof model.
It catches the cheap attacks (screen replays showing moire, printed/static
photos, glare, blur, frame loops). The trained model slot is v2: collect
labelled attacks in production, fine-tune an anti-spoofing CNN, and fold its
output in as one more term in `combine()`.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, asdict
from typing import Optional, Sequence

import cv2
import numpy as np

from . import config
from .vision import FrameFeatures


@dataclass
class FrameSignals:
    sharpness: float
    brightness: float
    contrast: float
    glare: float        # fraction of near-saturated pixels
    moire: float        # 0..1, periodic high-frequency structure (screen replay)
    chroma_std: float
    fringe: float = 0.0  # 0..1, low-frequency beat fringes (a screen re-photographed at ordinary phone-camera resolution)


def _face_crop(img: np.ndarray, bbox) -> np.ndarray:
    h, w = img.shape[:2]
    x0, y0, x1, y1 = bbox
    pw, ph = int((x1 - x0) * 0.1), int((y1 - y0) * 0.1)
    x0, y0, x1, y1 = max(x0 - pw, 0), max(y0 - ph, 0), min(x1 + pw, w), min(y1 + ph, h)
    return img[y0:y1, x0:x1]


def _moire_score(gray: np.ndarray) -> float:
    """Peakiness of the mid/high-frequency spectrum. Natural skin gives a smooth
    1/f fall-off; a phone/LCD pixel grid re-photographed gives sharp isolated peaks.

    Works on a NATIVE-resolution 256px patch (downscaling would average the grid
    away) and ignores bins at multiples of 32 cycles on either axis, where JPEG's
    own 8x8 block structure legitimately puts energy."""
    h, w = gray.shape
    if min(h, w) >= 256:
        y0, x0 = (h - 256) // 2, (w - 256) // 2
        g = gray[y0:y0 + 256, x0:x0 + 256].astype(np.float32)
    else:
        g = cv2.resize(gray, (256, 256), interpolation=cv2.INTER_LINEAR).astype(np.float32)
    g -= g.mean()
    win = np.outer(np.hanning(256), np.hanning(256)).astype(np.float32)
    spec = np.abs(np.fft.fftshift(np.fft.fft2(g * win)))
    yy, xx = np.indices(spec.shape)
    fy, fx = np.abs(yy - 128), np.abs(xx - 128)
    r = np.hypot(fy, fx)
    near32 = lambda f: np.abs(f - 32 * np.round(f / 32.0)) <= 2
    band = (r >= 40) & (r <= 160) & ~(near32(fx) | near32(fy))
    # How much does the strongest bin stand out from ITS OWN neighbourhood? Smooth
    # (natural) spectra stay ~3x; an isolated grid/beat peak reaches 7-10x.
    local = (spec / (cv2.blur(spec, (7, 7)) + 1e-6))[band]
    # calibrated on real portraits at JPEG q50-95 (clean 2.9-3.3) vs synthetic pixel
    # grids (6.7-10). Needs re-calibration on real screen-replay captures (v2 dataset).
    return float(np.clip((float(local.max()) - 4.5) / 3.5, 0.0, 1.0))


def _fringe_score(gray: np.ndarray) -> float:
    """Low-frequency moire beats.

    Captures arrive at ~640x480, so a face crop is ~200-300 px: a phone screen's pixel grid is then about one
    output pixel in size and cannot be seen directly (_moire_score upsamples such crops and loses it). What
    survives is the BEAT between the screen grid and the camera's sampling: broad periodic fringes, 4-30 px
    apart. Natural skin/hair has a smooth, noisy spectrum (strongest bin ~3x its neighbourhood); fringes are
    isolated peaks. JPEG's 8x8 block frequency (and harmonics) is masked out."""
    h0, w0 = gray.shape
    N = 192
    if min(h0, w0) >= N:   # native resolution: resizing DOWN would average the finer fringes away
        y0, x0 = (h0 - N) // 2, (w0 - N) // 2
        g = gray[y0:y0 + N, x0:x0 + N].astype(np.float32)
        bx = by = N / 8.0
    else:                  # small crop: resize UP (cannot create peaks); block grid scales with the crop
        g = cv2.resize(gray, (N, N), interpolation=cv2.INTER_LINEAR).astype(np.float32)
        bx, by = w0 / 8.0, h0 / 8.0
    g -= cv2.GaussianBlur(g, (0, 0), 8)   # drop illumination / shading; keeps r >= ~6 cycles
    win = np.outer(np.hanning(N), np.hanning(N)).astype(np.float32)
    spec = np.abs(np.fft.fftshift(np.fft.fft2(g * win)))
    yy, xx = np.indices(spec.shape)
    c = N // 2
    fy, fx = np.abs(yy - c), np.abs(xx - c)
    r = np.hypot(fy, fx)
    near = lambda f, b: np.abs(f - b * np.round(f / max(b, 1e-6))) <= 2.0
    band = (r >= 9) & (r <= 90) & ~(near(fx, bx) | near(fy, by)) & ~((fx <= 2) | (fy <= 2))
    local = (spec / (cv2.blur(spec, (9, 9)) + 1e-6))[band]
    if local.size == 0:
        return 0.0
    return float(np.clip((float(local.max()) - 5.0) / 4.0, 0.0, 1.0))


def frame_signals(img_bgr: np.ndarray, feat: FrameFeatures) -> Optional[FrameSignals]:
    if not feat.has_face:
        return None
    crop = _face_crop(img_bgr, feat.bbox)
    if crop.size == 0 or min(crop.shape[:2]) < 32:
        return None
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    ycc = cv2.cvtColor(crop, cv2.COLOR_BGR2YCrCb)
    return FrameSignals(
        sharpness=float(cv2.Laplacian(gray, cv2.CV_64F).var()),
        brightness=float(gray.mean()),
        contrast=float(gray.std()),
        glare=float((gray >= 250).mean()),
        moire=_moire_score(gray),
        fringe=_fringe_score(gray),
        chroma_std=float(ycc[:, :, 1:].std()),
    )


def frame_hash(img_bgr: np.ndarray) -> str:
    small = cv2.resize(img_bgr, (32, 32), interpolation=cv2.INTER_AREA)
    return hashlib.sha1(small.tobytes()).hexdigest()


@dataclass
class PassiveReport:
    score: float                 # 0..1, 1 = live
    signals: dict
    flags: list[str]

    def to_dict(self):
        return {"score": round(self.score, 4), "signals": self.signals, "flags": self.flags}


def combine(
    per_frame: Sequence[Optional[FrameSignals]],
    hashes: Sequence[str],
    motion: Sequence[float],
) -> PassiveReport:
    """motion: mean absolute pixel change between consecutive frames (0..255)."""
    sigs = [s for s in per_frame if s is not None]
    flags: list[str] = []
    if not sigs:
        return PassiveReport(0.0, {}, ["no_analysable_faces"])

    med = lambda name: float(np.median([getattr(s, name) for s in sigs]))
    sharp, bright, contrast = med("sharpness"), med("brightness"), med("contrast")
    glare, moire = med("glare"), float(np.percentile([s.moire for s in sigs], 75))
    chroma = med("chroma_std")
    fringe = float(np.percentile([s.fringe for s in sigs], 75))

    score = 1.0
    if sharp < 25:            score -= 0.25; flags.append("blurry")
    if bright < 45:           score -= 0.15; flags.append("too_dark")
    if bright > 215:          score -= 0.15; flags.append("overexposed")
    if contrast < 18:         score -= 0.10; flags.append("low_contrast")
    # Glare is the screen's most common tell (a lit screen blows out pixels). One tier is a hint, the
    # higher one is enough on its own to stop an auto-pass (verdict becomes "review", never a hard fail).
    if glare > 0.06:          score -= 0.45; flags.append("screen_glare")
    elif glare > 0.04:        score -= 0.20; flags.append("screen_glare")
    if chroma < 4.0:          score -= 0.15; flags.append("low_chroma")
    if moire > 0.35:
        score -= 0.45 * min(1.0, moire / 0.7)
        flags.append("moire_pattern")

    if fringe > config.FRINGE_FLAG:
        score -= 0.45 * min(1.0, fringe / 0.7)
        flags.append("screen_fringes")
    # Two independent screen cues together are a strong signal even when each is mild.
    screen_cues = sum(f in flags for f in ("screen_glare", "moire_pattern", "screen_fringes"))
    if screen_cues >= 2:
        score -= 0.25
        flags.append("multiple_screen_cues")

    uniq = len(set(hashes))
    dup_ratio = 1.0 - uniq / max(len(hashes), 1)
    if dup_ratio > 0.5:
        score -= 0.5; flags.append("frozen_or_looped_frames")
    mean_motion = float(np.mean(motion)) if len(motion) else 0.0
    if mean_motion < 0.35:
        score -= 0.4; flags.append("no_natural_motion")

    score = float(np.clip(score, 0.0, 1.0))
    return PassiveReport(
        score,
        {
            "sharpness": round(sharp, 1), "brightness": round(bright, 1), "contrast": round(contrast, 1),
            "glare": round(glare, 4), "moire": round(moire, 3), "fringe": round(fringe, 3), "chroma_std": round(chroma, 2),
            "duplicate_frame_ratio": round(dup_ratio, 3), "mean_motion": round(mean_motion, 3),
        },
        flags,
    )
