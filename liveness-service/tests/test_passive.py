import numpy as np
from app import passive
from app.vision import FrameFeatures


def feat(img):
    h, w = img.shape[:2]
    return FrameFeatures(face_count=1, width=w, height=h, bbox=(0, 0, w - 1, h - 1), area_ratio=0.9)


def natural_face(seed):
    rng = np.random.default_rng(seed)
    base = np.zeros((300, 300, 3), np.float32)
    yy, xx = np.mgrid[0:300, 0:300]
    for c, v in enumerate((120, 150, 180)):
        base[:, :, c] = v + 40 * np.sin(xx / 60.0 + seed) * np.cos(yy / 80.0)
    base += rng.normal(0, 6, base.shape)
    return np.clip(base, 0, 255).astype(np.uint8)


def test_pixel_grid_screen_is_flagged_as_moire():
    img = natural_face(1).astype(np.float32)
    grid = (np.indices((300, 300)).sum(axis=0) % 3 == 0) * 35.0   # periodic subpixel-like structure
    img = np.clip(img + grid[:, :, None], 0, 255).astype(np.uint8)
    s = passive.frame_signals(img, feat(img))
    clean = passive.frame_signals(natural_face(1), feat(natural_face(1)))
    assert s.moire > clean.moire
    assert s.moire > 0.35, s.moire


def test_frozen_frames_are_flagged():
    img = natural_face(2)
    sig = passive.frame_signals(img, feat(img))
    rep = passive.combine([sig] * 10, [passive.frame_hash(img)] * 10, [0.0] * 9)
    assert "frozen_or_looped_frames" in rep.flags and "no_natural_motion" in rep.flags
    assert rep.score < 0.4


def test_varied_natural_frames_score_high():
    imgs = [natural_face(i) for i in range(10)]
    sigs = [passive.frame_signals(i, feat(i)) for i in imgs]
    rep = passive.combine(sigs, [passive.frame_hash(i) for i in imgs], [8.0] * 9)
    assert rep.score >= 0.6, rep.flags


def test_no_faces_scores_zero():
    assert passive.combine([None, None], ["a", "b"], [1.0]).score == 0.0


def test_clean_jpeg_compression_is_not_flagged_as_moire():
    import cv2
    for q in (50, 75, 95):
        img = natural_face(3)
        img = cv2.imdecode(cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, q])[1], 1)
        assert passive.frame_signals(img, feat(img)).moire < 0.2, q
