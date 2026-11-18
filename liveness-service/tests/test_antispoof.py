"""Screen-replay and flat-turn defences (see docs/ANTISPOOF.md for how the numbers were derived)."""
import cv2
import numpy as np

from app import challenges as ch
from app import passive
from app.vision import FrameFeatures
from tests.test_passive import natural_face, feat


# ---- screen fringes ---------------------------------------------------------------------------------

def _beat_grid(img, pitch=1.2, amp=0.15, angle=5.0):
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    a = np.deg2rad(angle)
    u, v = xx * np.cos(a) + yy * np.sin(a), -xx * np.sin(a) + yy * np.cos(a)
    grid = 1 - amp * (0.5 + 0.5 * np.cos(2 * np.pi * u / pitch)) * (0.5 + 0.5 * np.cos(2 * np.pi * v / pitch))
    return np.clip(img.astype(np.float32) * grid[:, :, None], 0, 255).astype(np.uint8)


def _jpeg(img, q):
    return cv2.imdecode(cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, q])[1], 1)


def _big_face(seed):
    return cv2.resize(natural_face(seed), (260, 300), interpolation=cv2.INTER_CUBIC)


def test_screen_fringes_are_detected_after_jpeg():
    for pitch in (1.12, 1.2, 1.35):
        img = _jpeg(_beat_grid(_big_face(1), pitch=pitch), 82)
        assert passive.frame_signals(img, feat(img)).fringe > 0.35, pitch


def test_clean_faces_are_not_flagged_as_fringes():
    for seed in range(6):
        for q in (50, 82, 95):
            img = _jpeg(_big_face(seed), q)
            assert passive.frame_signals(img, feat(img)).fringe < 0.2, (seed, q)


def test_fringes_flag_and_penalise_the_report():
    img = _jpeg(_beat_grid(_big_face(2)), 82)
    sig = passive.frame_signals(img, feat(img))
    rep = passive.combine([sig] * 8, [str(i) for i in range(8)], [6.0] * 7)
    assert "screen_fringes" in rep.flags and rep.score < 0.6


# ---- glare tiers and multiple cues ------------------------------------------------------------------

def _sig(**kw):
    base = dict(sharpness=100.0, brightness=140.0, contrast=55.0, glare=0.0, moire=0.0, chroma_std=12.0, fringe=0.0)
    base.update(kw)
    return passive.FrameSignals(**base)


def _rep(**kw):
    return passive.combine([_sig(**kw)] * 8, [str(i) for i in range(8)], [6.0] * 7)


def test_heavy_glare_alone_is_no_longer_an_auto_pass():
    rep = _rep(glare=0.082)      # the owner's replay test: glare 8.2%
    assert "screen_glare" in rep.flags
    assert rep.score < 0.6, rep.score


def test_mild_glare_still_passes():
    assert _rep(glare=0.05).score >= 0.6


def test_two_mild_screen_cues_together_are_penalised_hard():
    rep = _rep(glare=0.05, fringe=0.5)
    assert "multiple_screen_cues" in rep.flags
    assert rep.score < 0.4


# ---- flat-turn (face squashed far more than a real turn explains) -----------------------------------

def _pts(width, height=100.0):
    xs = np.linspace(0, width, 20, dtype=np.float32)
    ys = np.linspace(0, height, 20, dtype=np.float32)
    return np.stack([xs, ys], axis=1)


def F(nose=0.5, width=78.0):
    f = FrameFeatures(face_count=1, width=640, height=480, bbox=(100, 100, 400, 400), area_ratio=0.3, nose_ratio=nose)
    f.plane_pts = _pts(width)
    return f


def _seq(turn_nose, turn_width):
    return [F(0.5, 78.0)] * 4 + [F(turn_nose, turn_width)] * 4


def _ts():
    return [i * 300 for i in range(8)]


def test_real_turn_is_not_flagged():
    # nose shift .17 with the face 90% as wide: what a real 30 degree turn looks like
    r = ch.verify_sequence(_seq(0.67, 78.0 * 0.90), _ts(), ["turn_left"])[0]
    assert r.passed and not r.flat_suspected, r.narrowing_mismatch


def test_over_turned_real_head_is_not_flagged():
    # 45 degrees: nose shift .28, face ~79% as wide
    r = ch.verify_sequence(_seq(0.78, 78.0 * 0.79), _ts(), ["turn_left"])[0]
    assert r.passed and not r.flat_suspected, r.narrowing_mismatch


def test_flat_photo_tilted_hard_is_flagged():
    # the measured flat-photo case: nose shift ~.13 but the whole picture squashed to ~56% width
    r = ch.verify_sequence(_seq(0.63, 78.0 * 0.56), _ts(), ["turn_left"])[0]
    assert r.passed and r.flat_suspected
    assert r.narrowing_mismatch > 0.3


def test_missing_landmarks_never_flag():
    feats = [FrameFeatures(face_count=1, width=640, height=480, bbox=(1, 1, 300, 300), area_ratio=0.3, nose_ratio=n)
             for n in [0.5] * 4 + [0.7] * 4]
    r = ch.verify_sequence(feats, _ts(), ["turn_left"])[0]
    assert r.passed and not r.flat_suspected and r.narrowing_mismatch is None
