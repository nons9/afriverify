"""Screen-light challenge: does the face reflect the colours WE flash on the user's screen?

The server picks a random order of colours for each scan. The browser shows them full-screen one after
another while it films. A real face in front of the screen reflects that light, so its colour moves with
the sequence. A photo, or a replay of a recorded or live video on another device, cannot: it shows its
own light, and cannot know the order we picked.

Evidence = how well the face's colour change tracks the emitted colours, tested against EVERY other order
the same colours could have been shown in (exact permutation test over K! orderings, 720 for K=6), so the
result is a p-value, not a guess at a threshold.

Honest limits:
  * In direct sunlight (or a dim screen) the screen's contribution is too small to measure. That is
    "inconclusive", never "pass": it routes to review, it is not a rejection.
  * A software-injected virtual camera that tints its frames to match the plan we sent it defeats this
    (and every web-only liveness check). That needs a native app with device attestation.
"""
from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from typing import Optional, Sequence

import numpy as np

from . import config
from .vision import FrameFeatures

NEUTRAL = (24, 24, 24)       # the dark baseline the browser shows before the first colour
SETTLE_MS = 180              # camera latency + auto white balance before a colour shows in frames
TAIL_MS = 100                # frames timestamped slightly after a step ends still show its light
MIN_FRAMES_PER_STEP = 2
MAX_PERMUTATIONS = 5040


@dataclass
class FlashResult:
    verdict: str                              # pass | fail | inconclusive | skipped | missing | not_issued
    correlation: Optional[float] = None       # mean over R,G,B of Pearson r(emitted, observed)
    p_value: Optional[float] = None           # chance a random colour order fits this well
    effect: Optional[float] = None            # mean 8-bit swing of the face colour across the steps
    bg_ratio: Optional[float] = None          # background swing / face swing (real: well under 1)
    steps_used: int = 0
    flags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        r = lambda v, n: None if v is None else round(float(v), n)
        return {
            "verdict": self.verdict, "correlation": r(self.correlation, 3), "p_value": r(self.p_value, 4),
            "effect": r(self.effect, 2), "bg_ratio": r(self.bg_ratio, 3), "steps_used": self.steps_used,
            "flags": self.flags,
        }


def _lin(v: np.ndarray) -> np.ndarray:
    return (np.asarray(v, dtype=np.float64) / 255.0) ** 2.2


def _face_roi(img: np.ndarray, bbox) -> Optional[np.ndarray]:
    """Mean RGB (8-bit) of the inner face: cheeks, nose and mouth, not hair, eyes or background."""
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    if w < 40 or h < 40:
        return None
    rx0, rx1 = int(x0 + 0.28 * w), int(x0 + 0.72 * w)
    ry0, ry1 = int(y0 + 0.42 * h), int(y0 + 0.88 * h)
    patch = img[ry0:ry1, rx0:rx1]
    if patch.size == 0:
        return None
    bgr = patch.reshape(-1, 3).mean(axis=0)
    return bgr[::-1]


def _bg_roi(img: np.ndarray, bbox) -> Optional[np.ndarray]:
    """Mean RGB of everything well outside the face (expanded 25%)."""
    h, w = img.shape[:2]
    x0, y0, x1, y1 = bbox
    pw, ph = int(0.25 * (x1 - x0)), int(0.25 * (y1 - y0))
    mask = np.ones((h, w), dtype=bool)
    mask[max(y0 - ph, 0):min(y1 + ph, h), max(x0 - pw, 0):min(x1 + pw, w)] = False
    px = img[::4, ::4][mask[::4, ::4]]
    if px.shape[0] < 200:
        return None
    return px.mean(axis=0)[::-1]


def _perm_matrix(k: int) -> np.ndarray:
    from math import factorial
    if factorial(k) <= MAX_PERMUTATIONS:
        return np.array(list(itertools.permutations(range(k))), dtype=np.int64)
    rng = np.random.default_rng(0)           # fixed seed: the same capture always scores the same
    p = np.array([rng.permutation(k) for _ in range(MAX_PERMUTATIONS - 1)], dtype=np.int64)
    return np.vstack([np.arange(k)[None, :], p])


def _zscore(a: np.ndarray) -> np.ndarray:
    s = a.std(axis=0)
    return (a - a.mean(axis=0)) / np.where(s < 1e-9, 1.0, s)


def analyze(
    images: Sequence[np.ndarray],
    feats: Sequence[FrameFeatures],
    timestamps_ms: Sequence[float],
    colors: Sequence[Sequence[int]],
    lead: dict,
    windows: Sequence[dict],
) -> FlashResult:
    k = len(colors)
    ts = np.asarray(timestamps_ms, dtype=np.float64)
    face = [(_face_roi(im, f.bbox) if (f.has_face and f.face_count == 1) else None) for im, f in zip(images, feats)]
    bg = [(_bg_roi(im, f.bbox) if (f.has_face and f.face_count == 1) else None) for im, f in zip(images, feats)]

    def collect(start: float, end: float, series):
        idx = [i for i, t in enumerate(ts) if start <= t <= end and series[i] is not None]
        return np.mean([series[i] for i in idx], axis=0) if len(idx) >= MIN_FRAMES_PER_STEP else None

    base_f = collect(lead["start_ms"] + 100, lead["end_ms"] + TAIL_MS, face)
    base_b = collect(lead["start_ms"] + 100, lead["end_ms"] + TAIL_MS, bg)
    step_f, step_b, used = [], [], []
    for j, w in enumerate(windows):
        f = collect(w["start_ms"] + SETTLE_MS, w["end_ms"] + TAIL_MS, face)
        step_f.append(f)
        step_b.append(collect(w["start_ms"] + SETTLE_MS, w["end_ms"] + TAIL_MS, bg))
        if f is not None:
            used.append(j)

    flags: list[str] = []
    if base_f is None or len(used) < max(4, k - 1):
        return FlashResult("inconclusive", steps_used=len(used), flags=["flash_not_measurable"])

    F = np.array([step_f[j] for j in used])                       # (n,3) 8-bit RGB of the face per step
    E = np.array([_lin(np.array(colors[j])) - _lin(np.array(NEUTRAL)) for j in used])   # emitted light
    delta = _lin(F) - _lin(base_f)                                 # observed change in linear light
    effect = float(np.mean(F.max(axis=0) - F.min(axis=0)))         # 8-bit swing, readable

    if F.max() >= 247:                                             # clipped highlights: ratios meaningless
        return FlashResult("inconclusive", effect=effect, steps_used=len(used), flags=["flash_washed_out"])
    if effect < config.FLASH_MIN_EFFECT:
        return FlashResult("inconclusive", effect=effect, steps_used=len(used), flags=["flash_response_too_weak"])

    Ez, Dz = _zscore(E), _zscore(delta)
    n = len(used)
    obs = float(np.mean(np.sum(Ez * Dz, axis=0) / n))
    perms = _perm_matrix(n)                                         # (P,n): which emitted row each step saw
    # statistic for every permutation: mean over channels of sum_k Ez[perm[k]] * Dz[k] / n
    stats = np.mean(np.einsum("pkc,kc->pc", Ez[perms], Dz) / n, axis=1)
    p = float(np.mean(stats >= obs - 1e-9))

    bg_ratio = None
    if base_b is not None and all(step_b[j] is not None for j in used):
        B = np.array([step_b[j] for j in used])
        bg_effect = float(np.mean(B.max(axis=0) - B.min(axis=0)))
        bg_ratio = bg_effect / max(effect, 1e-6)
        if bg_ratio >= config.FLASH_BG_RATIO_MAX:
            flags.append("flash_uniform_response")      # the whole picture tinted, not just a nearby face

    ok = obs >= config.FLASH_MIN_R and p <= config.FLASH_MAX_P and "flash_uniform_response" not in flags
    if not ok:
        flags.append("flash_mismatch")
    return FlashResult("pass" if ok else "fail", obs, p, effect, bg_ratio, n, flags)


def apply_policy(verdict: str, res: FlashResult, mode: str) -> str:
    """advisory: flags only. required: only a measured, matching response counts as proof, so anything else
    (skipped, missing, too weak to measure e.g. sunlight, mismatched) stops an auto-pass. It is never a
    rejection by itself: that is FLASH_FAIL_ACTION=fail, off by default until calibrated on real captures."""
    if mode == "required" and verdict == "pass" and res.verdict not in ("pass", "not_issued"):
        return "review"
    return verdict
