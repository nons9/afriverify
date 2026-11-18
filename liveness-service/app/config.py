"""Runtime configuration. Everything tunable lives here so thresholds can be
adjusted from env without code changes (and later driven by measured FAR/FRR)."""
import os
from pathlib import Path


def _f(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


def _i(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


MODELS_DIR = Path(os.environ.get("MODELS_DIR", Path(__file__).resolve().parent.parent / "models"))
LANDMARKER_PATH = Path(os.environ.get("LANDMARKER_PATH", MODELS_DIR / "face_landmarker.task"))
FACE_MODEL_PATH = Path(os.environ.get("FACE_MODEL_PATH", MODELS_DIR / "w600k_mbf.onnx"))

# Shared secret between the Node API and this service.
SERVICE_KEY = os.environ.get("LIVENESS_SERVICE_KEY", "")
ALLOW_NO_AUTH = os.environ.get("ALLOW_NO_AUTH", "") == "1"  # local dev only

# Upload limits
MAX_FRAMES = _i("MAX_FRAMES", 120)
MIN_FRAMES = _i("MIN_FRAMES", 8)
MAX_FRAME_BYTES = _i("MAX_FRAME_BYTES", 1_500_000)

# Capture sanity
MIN_CAPTURE_SECONDS = _f("MIN_CAPTURE_SECONDS", 3.0)
MAX_CAPTURE_SECONDS = _f("MAX_CAPTURE_SECONDS", 60.0)
MIN_FPS = _f("MIN_FPS", 2.0)

# Active challenges
TURN_DELTA = _f("TURN_DELTA", 0.12)          # nose-ratio shift from frontal baseline
BLINK_CLOSED = _f("BLINK_CLOSED", 0.55)
BLINK_OPEN = _f("BLINK_OPEN", 0.30)
SMILE_ON = _f("SMILE_ON", 0.50)
SMILE_OFF = _f("SMILE_OFF", 0.30)
WINDOW_TOLERANCE_MS = _i("WINDOW_TOLERANCE_MS", 1500)

# Face presence
MIN_FACE_AREA_RATIO = _f("MIN_FACE_AREA_RATIO", 0.06)
MAX_NO_FACE_RATIO = _f("MAX_NO_FACE_RATIO", 0.35)
MAX_MULTI_FACE_RATIO = _f("MAX_MULTI_FACE_RATIO", 0.15)

# Passive score thresholds (0..1, 1 = live)
PASSIVE_PASS = _f("PASSIVE_PASS", 0.60)
PASSIVE_REVIEW = _f("PASSIVE_REVIEW", 0.40)

# Face match (cosine similarity of ArcFace embeddings)
MATCH_PASS = _f("MATCH_PASS", 0.40)
MATCH_REVIEW = _f("MATCH_REVIEW", 0.28)
