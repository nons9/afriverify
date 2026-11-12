"""Face embedding + 1:1 matching (selfie vs ID photo) with an ArcFace ONNX model.

Embeddings stay inside this process: they are never returned, logged or stored.
Only the similarity score leaves the service.
"""
from __future__ import annotations

import threading
from typing import Optional

import cv2
import numpy as np

from . import config, vision

# Standard ArcFace 112x112 landmark template (left eye, right eye, nose, mouth L, mouth R)
_ARCFACE_TEMPLATE = np.array(
    [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]],
    dtype=np.float32,
)

_lock = threading.Lock()
_session = None


def model_ready() -> bool:
    return config.FACE_MODEL_PATH.exists()


def _get_session():
    global _session
    if _session is None:
        import onnxruntime as ort
        if not config.FACE_MODEL_PATH.exists():
            raise RuntimeError(f"Face model missing at {config.FACE_MODEL_PATH}; run scripts/download_models.sh")
        _session = ort.InferenceSession(str(config.FACE_MODEL_PATH), providers=["CPUExecutionProvider"])
    return _session


def align(img_bgr: np.ndarray, points5: np.ndarray) -> np.ndarray:
    m, _ = cv2.estimateAffinePartial2D(points5, _ARCFACE_TEMPLATE, method=cv2.LMEDS)
    if m is None:
        raise ValueError("alignment failed")
    return cv2.warpAffine(img_bgr, m, (112, 112), borderValue=0.0)


def embed_aligned(aligned_bgr: np.ndarray) -> np.ndarray:
    rgb = cv2.cvtColor(aligned_bgr, cv2.COLOR_BGR2RGB).astype(np.float32)
    blob = ((rgb - 127.5) / 127.5).transpose(2, 0, 1)[None]
    sess = _get_session()
    with _lock:
        out = sess.run(None, {sess.get_inputs()[0].name: blob})[0][0]
    n = np.linalg.norm(out)
    return out / max(float(n), 1e-9)


def _points_for(img: np.ndarray) -> Optional[np.ndarray]:
    feat = vision.extract(img)
    if feat.has_face and feat.points5 is not None:
        return feat.points5
    return None


def face_points_robust(img: np.ndarray) -> Optional[tuple[np.ndarray, np.ndarray]]:
    """ID photos hold a small face inside a big card. Try the whole image, then
    upscaled halves/quadrants. Returns (image_used, points5)."""
    p = _points_for(img)
    if p is not None:
        return img, p
    h, w = img.shape[:2]
    regions = [
        (0, 0, w // 2, h), (w // 2, 0, w, h),                    # left / right half
        (0, 0, w // 2, h // 2), (w // 2, 0, w, h // 2),          # top quadrants
        (0, h // 2, w // 2, h), (w // 2, h // 2, w, h),          # bottom quadrants
    ]
    for x0, y0, x1, y1 in regions:
        crop = img[y0:y1, x0:x1]
        if crop.size == 0:
            continue
        scale = 2.0 if max(crop.shape[:2]) < 900 else 1.0
        crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC) if scale != 1.0 else crop
        p = _points_for(crop)
        if p is not None:
            return crop, p
    return None


def embedding_for(img: np.ndarray, robust: bool = False) -> Optional[np.ndarray]:
    if robust:
        found = face_points_robust(img)
    else:
        p = _points_for(img)
        found = (img, p) if p is not None else None
    if not found:
        return None
    used, pts = found
    return embed_aligned(align(used, pts))


def similarity_to_confidence(cos: float) -> float:
    """Map cosine (-1..1) to a 0-100 confidence anchored on the configured thresholds."""
    lo, mid = config.MATCH_REVIEW, config.MATCH_PASS
    if cos <= 0:
        return 0.0
    if cos < lo:
        return round(40.0 * cos / lo, 1)
    if cos < mid:
        return round(40.0 + 30.0 * (cos - lo) / (mid - lo), 1)
    return round(min(100.0, 70.0 + 30.0 * (cos - mid) / (0.7 - mid)), 1)
