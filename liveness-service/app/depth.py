"""Is the head turn physically plausible for a real head?

A turn challenge passes when the nose moves far enough across the face. A real head turning does that
while the face stays almost as WIDE as before (width shrinks roughly with the cosine of the angle: ~95%
at the minimum turn, still ~80% at 45 degrees). A flat picture (a photo, or a replay on another phone)
tilted toward the camera has to be tilted ~60 degrees before the landmark model reads a turn that big,
and at that tilt the whole picture is squashed to ~55% of its width.

So: compare how much the face narrowed against how much a real head of that turn size narrows.
Measured on the REAL MediaPipe landmarker (flat photo tilted by perspective warp) and on landmarker
depth rotated like a real head, see docs/ANTISPOOF.md. Aspect ratio (width/height) is used so moving
closer to or further from the camera does not matter.

Only the geometry is calibrated, on a simulation. The margin is env-tunable and the default action
(`FLAT_TURN_ACTION=review`) never auto-approves a suspected flat turn, nor hard-rejects a real person.
"""
from __future__ import annotations

from typing import Optional, Sequence

import numpy as np

from .vision import FrameFeatures


def aspect(f: FrameFeatures) -> Optional[float]:
    """Width/height of the near-planar face landmarks (forehead, brows, eyes, cheeks, mouth, jaw)."""
    if f.plane_pts is None:
        return None
    w, h = float(np.ptp(f.plane_pts[:, 0])), float(np.ptp(f.plane_pts[:, 1]))
    if w < 20 or h < 20:
        return None
    return w / h


def expected_aspect_ratio(nose_delta: float) -> float:
    """Aspect ratio (turned / frontal) a real head shows for a nose shift of `nose_delta`.
    Fit to the simulation: delta .113 -> .952, .174 -> .896, .242 -> .833, .281 -> .792 (~ 1 - 2.6 d^2)."""
    d = abs(nose_delta)
    return float(max(0.3, 1.0 - 2.6 * d * d))


def narrowing_mismatch(base: Sequence[FrameFeatures], turned: Sequence[FrameFeatures], nose_deltas: Sequence[float]) -> Optional[float]:
    """Median of (expected - actual) aspect ratio over the frames that count as the turn.
    ~0 for a real head, large positive when the face is squashed far more than the turn explains."""
    base_ar = [a for a in (aspect(f) for f in base) if a is not None]
    if len(base_ar) < 2:
        return None
    b = float(np.median(base_ar))
    vals = []
    for f, d in zip(turned, nose_deltas):
        a = aspect(f)
        if a is not None:
            vals.append(expected_aspect_ratio(d) - a / b)
    if not vals:
        return None
    return float(np.median(vals))
