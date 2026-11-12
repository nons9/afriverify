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

from . import config
from .vision import FrameFeatures

CHALLENGE_TYPES = ("turn_left", "turn_right", "blink", "smile")


@dataclass
class ChallengeResult:
    type: str
    passed: bool
    frame_index: Optional[int] = None
    detail: str = ""


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
            results.append(ChallengeResult(ctype, True, idx))
            cursor = idx + 1
    return results
