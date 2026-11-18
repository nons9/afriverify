"""Verifies the random active-liveness challenge sequence from frame features.

The server issues the sequence (random order, per-session nonce) so a recorded
video cannot anticipate it. A challenge only passes if the matching motion is
visible in the server's own landmark analysis, in order, inside (or near) the
window in which the client says it prompted it.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence

import numpy as np

from . import config, depth
from .vision import FrameFeatures

CHALLENGE_TYPES = ("turn_left", "turn_right", "blink", "smile")


@dataclass
class ChallengeResult:
    type: str
    passed: bool
    frame_index: Optional[int] = None
    detail: str = ""
    narrowing_mismatch: Optional[float] = None   # turn only: how much more the face narrowed than a real turn explains
    flat_suspected: bool = False


def _baseline_nose(features: Sequence[FrameFeatures], upto: int) -> Optional[float]:
    vals = [f.nose_ratio for f in features[:upto] if f.has_face]
    return float(np.median(vals)) if len(vals) >= 2 else None


def _in_window(ts: Sequence[float], i: int, win: Optional[dict]) -> bool:
    if not win:
        return True
    tol = config.WINDOW_TOLERANCE_MS
    return (win["start_ms"] - tol) <= ts[i] <= (win["end_ms"] + tol)


def _find_turn(features, ts, start, win, direction: int, baseline: float):
    for i in range(start, len(features)):
        f = features[i]
        if not f.has_face or f.face_count != 1 or not _in_window(ts, i, win):
            continue
        if direction * (f.nose_ratio - baseline) >= config.TURN_DELTA:
            return i
    return None


def _find_blink(features, ts, start, win):
    opened_at = None
    closed_at = None
    for i in range(start, len(features)):
        f = features[i]
        if not f.has_face or not _in_window(ts, i, win):
            continue
        if closed_at is None:
            if f.blink <= config.BLINK_OPEN:
                opened_at = i
            elif f.blink >= config.BLINK_CLOSED and opened_at is not None:
                closed_at = i
        elif f.blink <= config.BLINK_OPEN:
            return i  # open -> closed -> open
    return None


def _find_smile(features, ts, start, win):
    neutral_at = None
    for i in range(start, len(features)):
        f = features[i]
        if not f.has_face or not _in_window(ts, i, win):
            continue
        if f.smile <= config.SMILE_OFF:
            neutral_at = i
        elif f.smile >= config.SMILE_ON and neutral_at is not None:
            return i
    return None


def _check_flat_turn(res: ChallengeResult, features, idx: int, direction: int, baseline: float, n_base: int) -> None:
    """Compare the face's narrowing during the turn with what a real head of that turn size shows."""
    turned, deltas = [], []
    for j in range(idx, min(idx + 4, len(features))):
        f = features[j]
        if f.has_face and f.face_count == 1 and direction * (f.nose_ratio - baseline) >= config.TURN_DELTA:
            turned.append(f)
            deltas.append(f.nose_ratio - baseline)
    base_frames = [f for f in features[:n_base] if f.has_face]
    m = depth.narrowing_mismatch(base_frames, turned, deltas)
    res.narrowing_mismatch = None if m is None else round(m, 3)
    if m is not None and m > config.FLAT_TURN_MARGIN:
        res.flat_suspected = True
        res.detail = "face narrowed far more than a real head turn would"


def verify_sequence(
    features: Sequence[FrameFeatures],
    timestamps_ms: Sequence[float],
    challenges: Sequence[str],
    windows: Optional[Sequence[dict]] = None,
) -> list[ChallengeResult]:
    results: list[ChallengeResult] = []
    cursor = 0
    # Frontal baseline: frames before the first challenge window opens (or the first 25%).
    first_start = windows[0]["start_ms"] if windows else None
    if first_start is not None:
        n_base = sum(1 for t in timestamps_ms if t < first_start)
    else:
        n_base = max(2, len(features) // 4)
    baseline = _baseline_nose(features, max(n_base, 2))

    for k, ctype in enumerate(challenges):
        win = windows[k] if windows and k < len(windows) else None
        idx: Optional[int] = None
        detail = ""
        if ctype in ("turn_left", "turn_right"):
            if baseline is None:
                detail = "no frontal baseline"
            else:
                idx = _find_turn(features, timestamps_ms, cursor, win, +1 if ctype == "turn_left" else -1, baseline)
        elif ctype == "blink":
            idx = _find_blink(features, timestamps_ms, cursor, win)
        elif ctype == "smile":
            idx = _find_smile(features, timestamps_ms, cursor, win)
        else:
            detail = "unknown challenge"
        if idx is None:
            results.append(ChallengeResult(ctype, False, None, detail or "motion not observed"))
        else:
            res = ChallengeResult(ctype, True, idx)
            if ctype in ("turn_left", "turn_right") and baseline is not None:
                _check_flat_turn(res, features, idx, +1 if ctype == "turn_left" else -1, baseline, max(n_base, 2))
            results.append(res)
            cursor = idx + 1
    return results
