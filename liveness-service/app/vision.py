"""Server-side face landmark extraction.

The browser also runs MediaPipe to guide the user, but the server NEVER trusts
client-reported measurements: every frame is re-analysed here, so a tampered
client cannot claim a blink or head-turn that is not in the pixels.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

from . import config

# MediaPipe face-mesh landmark indices
_CHEEK_A, _CHEEK_B = 234, 454   # face-width extremes
_NOSE_TIP = 1
_MOUTH_L, _MOUTH_R = 61, 291
_IRIS_A, _IRIS_B = 468, 473     # iris centres (need refine => 478 points)


@dataclass
class FrameFeatures:
    face_count: int = 0
    width: int = 0
    height: int = 0
    bbox: Optional[tuple[int, int, int, int]] = None  # x0,y0,x1,y1 px
    area_ratio: float = 0.0
    # nose position between the two cheek extremes in IMAGE coordinates.
    # 0.5 = frontal. Frames are expected UNMIRRORED, so ratio > 0.5 means the
    # nose moved toward image-right = the person turned to THEIR left.
    nose_ratio: float = 0.5
    blink: float = 0.0   # 0 open .. 1 closed
    smile: float = 0.0   # 0 neutral .. 1 broad smile
    points5: Optional[np.ndarray] = field(default=None, repr=False)  # 5x2 px, for alignment

    @property
    def has_face(self) -> bool:
        return self.face_count >= 1 and self.bbox is not None


_lock = threading.Lock()
_landmarker = None


def _get_landmarker():
    global _landmarker
    if _landmarker is None:
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision as mp_vision

        if not config.LANDMARKER_PATH.exists():
            raise RuntimeError(f"Face landmarker model missing at {config.LANDMARKER_PATH}; run scripts/download_models.sh")
        opts = mp_vision.FaceLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(config.LANDMARKER_PATH)),
            running_mode=mp_vision.RunningMode.IMAGE,
            num_faces=2,
            output_face_blendshapes=True,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
        )
        _landmarker = mp_vision.FaceLandmarker.create_from_options(opts)
    return _landmarker


def models_ready() -> bool:
    return config.LANDMARKER_PATH.exists()


def decode_image(data: bytes) -> Optional[np.ndarray]:
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)  # BGR
    return img


def _blend(blendshapes, name: str) -> float:
    for b in blendshapes:
        if b.category_name == name:
            return float(b.score)
    return 0.0


def extract(img_bgr: np.ndarray) -> FrameFeatures:
    import mediapipe as mp

    h, w = img_bgr.shape[:2]
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
    with _lock:  # the landmarker object is not thread-safe
        res = _get_landmarker().detect(mp_img)

    feat = FrameFeatures(width=w, height=h)
    if not res.face_landmarks:
        return feat

    feat.face_count = len(res.face_landmarks)
    lm = res.face_landmarks[0]
    xs = np.array([p.x for p in lm]) * w
    ys = np.array([p.y for p in lm]) * h
    x0, x1 = int(max(xs.min(), 0)), int(min(xs.max(), w - 1))
    y0, y1 = int(max(ys.min(), 0)), int(min(ys.max(), h - 1))
    feat.bbox = (x0, y0, x1, y1)
    feat.area_ratio = ((x1 - x0) * (y1 - y0)) / float(w * h)

    ca, cb = xs[_CHEEK_A], xs[_CHEEK_B]
    left, right = min(ca, cb), max(ca, cb)
    span = max(right - left, 1e-6)
    feat.nose_ratio = float((xs[_NOSE_TIP] - left) / span)

    if res.face_blendshapes:
        bs = res.face_blendshapes[0]
        feat.blink = (_blend(bs, "eyeBlinkLeft") + _blend(bs, "eyeBlinkRight")) / 2
        feat.smile = (_blend(bs, "mouthSmileLeft") + _blend(bs, "mouthSmileRight")) / 2

    if len(lm) >= 478:
        pa = np.array([xs[_IRIS_A], ys[_IRIS_A]])
        pb = np.array([xs[_IRIS_B], ys[_IRIS_B]])
        eyes = sorted([pa, pb], key=lambda p: p[0])  # image-left eye first
        feat.points5 = np.array(
            [eyes[0], eyes[1], [xs[_NOSE_TIP], ys[_NOSE_TIP]],
             [min(xs[_MOUTH_L], xs[_MOUTH_R]), ys[_MOUTH_L if xs[_MOUTH_L] < xs[_MOUTH_R] else _MOUTH_R]],
             [max(xs[_MOUTH_L], xs[_MOUTH_R]), ys[_MOUTH_R if xs[_MOUTH_L] < xs[_MOUTH_R] else _MOUTH_L]]],
            dtype=np.float32,
        )
    return feat
