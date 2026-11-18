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
# A turn that squashes the face more than a real turn of that size would (see depth.py) is suspected flat.
FLAT_TURN_MARGIN = _f("FLAT_TURN_MARGIN", 0.12)
FLAT_TURN_ACTION = os.environ.get("FLAT_TURN_ACTION", "review")   # review | fail | off

# Face presence
MIN_FACE_AREA_RATIO = _f("MIN_FACE_AREA_RATIO", 0.06)
MAX_NO_FACE_RATIO = _f("MAX_NO_FACE_RATIO", 0.35)
MAX_MULTI_FACE_RATIO = _f("MAX_MULTI_FACE_RATIO", 0.15)

# Passive score thresholds (0..1, 1 = live)
PASSIVE_PASS = _f("PASSIVE_PASS", 0.60)
PASSIVE_REVIEW = _f("PASSIVE_REVIEW", 0.40)
# Screen fringes (low-frequency moire beats from re-photographing a screen). Score is 0..1; above this it is flagged.
FRINGE_FLAG = _f("FRINGE_FLAG", 0.35)

# Face match (cosine similarity of ArcFace embeddings)
MATCH_PASS = _f("MATCH_PASS", 0.40)
MATCH_REVIEW = _f("MATCH_REVIEW", 0.28)

# Screen-light (flash) challenge. FLASH_MODE: off | advisory (flag only) | required (no pass => at most "review")
FLASH_MODE = os.environ.get("FLASH_MODE", "advisory")
FLASH_MIN_R = _f("FLASH_MIN_R", 0.55)               # mean Pearson r(emitted, observed) over R,G,B
FLASH_MAX_P = _f("FLASH_MAX_P", 0.02)               # chance a random colour order fits this well
FLASH_MIN_EFFECT = _f("FLASH_MIN_EFFECT", 2.0)      # mean 8-bit swing of the face colour; below it the light is unmeasurable
FLASH_BG_RATIO_MAX = _f("FLASH_BG_RATIO_MAX", 0.8)  # background swing / face swing at or above this = whole picture tinted
FLASH_FAIL_ACTION = os.environ.get("FLASH_FAIL_ACTION", "review")   # review | fail (a measurable but wrong response)
