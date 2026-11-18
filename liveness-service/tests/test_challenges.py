from app import challenges as ch
from app.vision import FrameFeatures


def F(nose=0.5, blink=0.0, smile=0.0, faces=1):
    return FrameFeatures(face_count=faces, width=640, height=480, bbox=(100, 100, 400, 400),
                         area_ratio=0.3, nose_ratio=nose, blink=blink, smile=smile)


def ts(n, step=300):
    return [i * step for i in range(n)]


def test_turn_left_detected_after_frontal_baseline():
    feats = [F(0.5)] * 4 + [F(0.56), F(0.66), F(0.7)]
    r = ch.verify_sequence(feats, ts(7), ["turn_left"])
    assert r[0].passed and r[0].frame_index == 5


def test_wrong_direction_does_not_pass():
    feats = [F(0.5)] * 4 + [F(0.34), F(0.3)]
    assert not ch.verify_sequence(feats, ts(6), ["turn_left"])[0].passed
    assert ch.verify_sequence(feats, ts(6), ["turn_right"])[0].passed


def test_blink_requires_open_closed_open():
    feats = [F(blink=0.05)] * 3 + [F(blink=0.8)] * 2 + [F(blink=0.05)] * 2
    assert ch.verify_sequence(feats, ts(7), ["blink"])[0].passed
    stuck_closed = [F(blink=0.05)] * 3 + [F(blink=0.9)] * 4
    assert not ch.verify_sequence(stuck_closed, ts(7), ["blink"])[0].passed
    never_open = [F(blink=0.9)] * 6
    assert not ch.verify_sequence(never_open, ts(6), ["blink"])[0].passed


def test_smile_needs_neutral_then_smile():
    feats = [F(smile=0.05)] * 3 + [F(smile=0.8)] * 3
    assert ch.verify_sequence(feats, ts(6), ["smile"])[0].passed
    always_smiling = [F(smile=0.9)] * 6
    assert not ch.verify_sequence(always_smiling, ts(6), ["smile"])[0].passed


def test_sequence_must_happen_in_order():
    # smile first, then turn: asking for [turn_left, smile] must fail
    feats = [F(0.5, smile=0.0)] * 3 + [F(0.5, smile=0.9)] * 2 + [F(0.7, smile=0.0)] * 3
    assert not all(r.passed for r in ch.verify_sequence(feats, ts(8), ["turn_left", "smile"]))
    ok = [F(0.5)] * 3 + [F(0.7)] * 2 + [F(0.7, smile=0.0)] * 2 + [F(0.7, smile=0.9)] * 2
    assert all(r.passed for r in ch.verify_sequence(ok, ts(9), ["turn_left", "smile"]))


def test_motion_outside_claimed_window_is_rejected():
    feats = [F(0.5)] * 4 + [F(0.7)] * 2
    t = ts(6, 1000)                       # 0..5000ms, turn happens at 4000-5000
    win = [{"start_ms": 0, "end_ms": 1500}]
    assert not ch.verify_sequence(feats, t, ["turn_left"], win)[0].passed
    win = [{"start_ms": 3500, "end_ms": 5000}]
    assert ch.verify_sequence(feats, t, ["turn_left"], win)[0].passed


def test_multiple_faces_do_not_count_for_turns():
    feats = [F(0.5)] * 4 + [F(0.7, faces=2)] * 3
    assert not ch.verify_sequence(feats, ts(7), ["turn_left"])[0].passed
