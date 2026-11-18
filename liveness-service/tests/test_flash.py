"""Screen-light challenge: real response passes; replays, wrong orders and unmeasurable light never do."""
import itertools

import numpy as np
import pytest

from app import config, flash, main
from app.vision import FrameFeatures

PAL = [(255, 80, 80), (80, 255, 110), (90, 120, 255), (255, 230, 80), (255, 90, 230), (80, 235, 255)]
HOLD, LEAD, TICK, LAT = 700, 500, 125, 100
BB = (60, 40, 200, 200)


def lin(v):
    return (np.asarray(v, np.float64) / 255.0) ** 2.2


def srgb(l):
    return 255.0 * np.clip(l, 0, 1) ** (1 / 2.2)


def screen_at(t, order):
    t -= LAT
    if t < LEAD:
        return flash.NEUTRAL
    j = int((t - LEAD) // HOLD)
    return PAL[order[j]] if j < len(order) else flash.NEUTRAL


def capture(order, shown=None, s_face=0.3, s_bg=0.03, noise=1.5, seed=0, uniform=False, flicker=0.0, base=(150, 120, 105)):
    """Synthetic capture. `order` is what the server issued; `shown` is what the face actually received
    (defaults to the same: a real face)."""
    rng = np.random.default_rng(seed)
    shown = order if shown is None else shown
    imgs, feats, ts = [], [], []
    t, cast = 0.0, np.zeros(3)
    end = LEAD + HOLD * len(order) + 300
    while t < end:
        e = lin(screen_at(t, shown)) - lin(flash.NEUTRAL)
        e = e / lin(PAL).mean()
        cast = np.clip(cast + rng.normal(0, flicker, 3), -0.3, 0.3)
        face = lin(base) * (1 + s_face * e + cast)
        bg = lin((100, 105, 110)) * (1 + (s_face if uniform else s_bg) * e + (cast if uniform else 0))
        img = np.empty((240, 320, 3), np.float32)
        img[:] = srgb(bg)[::-1]
        img[BB[1]:BB[3], BB[0]:BB[2]] = srgb(face)[::-1]
        img += rng.normal(0, noise, img.shape)
        imgs.append(np.clip(img, 0, 255).astype(np.uint8))
        feats.append(FrameFeatures(face_count=1, width=320, height=240, bbox=BB, area_ratio=0.3))
        ts.append(t + rng.normal(0, 6))
        t += TICK
    ts = sorted(ts)
    wins = [{"start_ms": LEAD + HOLD * j, "end_ms": LEAD + HOLD * (j + 1)} for j in range(len(order))]
    return imgs, feats, ts, [PAL[i] for i in order], {"start_ms": 0, "end_ms": LEAD}, wins


def run(order, **kw):
    return flash.analyze(*capture(order, **kw))


ORDERS = [list(np.random.default_rng(i).permutation(6)) for i in range(12)]


def test_real_face_passes():
    for i, order in enumerate(ORDERS):
        r = run(order, seed=i)
        assert r.verdict == "pass", (i, r.to_dict())
        assert r.p_value <= 0.02 and r.correlation >= 0.55


def test_no_response_is_inconclusive_not_pass():
    for i, order in enumerate(ORDERS[:6]):
        r = run(order, s_face=0.0, s_bg=0.0, seed=i)
        assert r.verdict == "inconclusive" and "flash_response_too_weak" in r.flags, r.to_dict()


def test_response_to_a_different_order_fails():
    # a recording that reacts to some OTHER colour order (what a replay or guess looks like)
    fails = 0
    for i, order in enumerate(ORDERS):
        shown = list(np.random.default_rng(100 + i).permutation(6))
        if shown == order:
            continue
        r = run(order, shown=shown, seed=i)
        assert r.verdict != "pass", (i, r.to_dict())
        fails += r.verdict == "fail"
    assert fails >= 9


def test_independent_flicker_never_passes():
    for i, order in enumerate(ORDERS):
        r = run(order, s_face=0.0, s_bg=0.0, flicker=0.08, seed=i)
        assert r.verdict != "pass", (i, r.to_dict())


def test_whole_picture_tint_is_flagged_as_uniform():
    r = run(ORDERS[0], uniform=True, seed=3)
    assert "flash_uniform_response" in r.flags and r.verdict == "fail", r.to_dict()


def test_clipped_highlights_are_inconclusive():
    r = run(ORDERS[1], base=(250, 250, 250), seed=4)
    assert r.verdict == "inconclusive" and "flash_washed_out" in r.flags


def test_too_few_frames_is_not_measurable():
    imgs, feats, ts, cols, lead, wins = capture(ORDERS[2])
    r = flash.analyze(imgs[:6], feats[:6], ts[:6], cols, lead, wins)
    assert r.verdict == "inconclusive" and "flash_not_measurable" in r.flags


def test_same_capture_always_scores_the_same():
    a, b = run(ORDERS[3], seed=9).to_dict(), run(ORDERS[3], seed=9).to_dict()
    assert a == b


def test_exact_permutation_test_covers_all_orders():
    assert len(flash._perm_matrix(6)) == 720
    assert set(map(tuple, flash._perm_matrix(4))) == set(itertools.permutations(range(4)))


# ---- request handling and policy ---------------------------------------------------------------------

def _frames(n=40):
    ts = [i * TICK for i in range(n)]
    imgs = [np.zeros((240, 320, 3), np.uint8)] * n
    feats = [FrameFeatures(face_count=1, width=320, height=240, bbox=BB, area_ratio=0.3)] * n
    return imgs, feats, ts


def test_meta_missing_skipped_and_garbage():
    imgs, feats, ts = _frames()
    assert main._run_flash(None, imgs, feats, ts).verdict == "missing"
    assert main._run_flash({"skipped": True}, imgs, feats, ts).verdict == "skipped"
    assert main._run_flash({"not_issued": True}, imgs, feats, ts).verdict == "not_issued"
    assert main._run_flash({"colors": [[1, 2, 3]], "lead": {}, "windows": []}, imgs, feats, ts).verdict == "missing"
    bad_colour = {"colors": [[999, 0, 0]] * 6, "lead": {"start_ms": 0, "end_ms": 500},
                  "windows": [{"start_ms": 500 + 700 * j, "end_ms": 1200 + 700 * j} for j in range(6)]}
    assert main._run_flash(bad_colour, imgs, feats, ts).verdict == "missing"
    overlapping = {"colors": [list(c) for c in PAL], "lead": {"start_ms": 0, "end_ms": 500},
                   "windows": [{"start_ms": 500, "end_ms": 1200}] * 6}
    assert main._run_flash(overlapping, imgs, feats, ts).verdict == "missing"


@pytest.mark.parametrize("fv", ["pass", "fail", "inconclusive", "skipped", "missing", "not_issued"])
def test_policy(fv):
    res = flash.FlashResult(fv)
    assert flash.apply_policy("pass", res, "advisory") == "pass"          # advisory never changes the verdict
    assert flash.apply_policy("pass", res, "off") == "pass"
    assert flash.apply_policy("pass", res, "required") == ("pass" if fv in ("pass", "not_issued") else "review")
    assert flash.apply_policy("fail", res, "required") == "fail"          # never softens a fail
    assert flash.apply_policy("review", res, "required") == "review"
