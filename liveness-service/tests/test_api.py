import json
import os
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app

client = TestClient(app)
FIX = Path(os.environ.get("FACE_FIXTURES", "/nonexistent"))
needs_models = pytest.mark.skipif(not (config.LANDMARKER_PATH.exists() and config.FACE_MODEL_PATH.exists()),
                                  reason="models not downloaded")
needs_faces = pytest.mark.skipif(not (FIX / "portrait.jpg").exists(), reason="set FACE_FIXTURES to a dir with portrait.jpg")


def jpeg(img):
    return cv2.imencode(".jpg", img)[1].tobytes()


def blank_frames(n=10):
    rng = np.random.default_rng(0)
    return [("frames", (f"{i}.jpg", jpeg(rng.integers(0, 255, (320, 320, 3), dtype=np.uint8)), "image/jpeg")) for i in range(n)]


def meta(n=10, step=500, challenges=("blink", "smile"), **extra):
    return {"meta": json.dumps({"challenges": list(challenges), "timestamps_ms": [i * step for i in range(n)], **extra})}


def test_auth_required_when_key_configured(monkeypatch):
    monkeypatch.setattr(config, "ALLOW_NO_AUTH", False)
    monkeypatch.setattr(config, "SERVICE_KEY", "secret")
    assert client.post("/v1/liveness/analyze", data=meta(), files=blank_frames()).status_code == 401
    r = client.post("/v1/liveness/analyze", data=meta(), files=blank_frames(), headers={"X-Internal-Key": "wrong"})
    assert r.status_code == 401
    assert client.get("/healthz").status_code == 200


def test_rejects_malformed_capture():
    # too few frames
    assert client.post("/v1/liveness/analyze", data=meta(4), files=blank_frames(4)).status_code == 422
    # unknown challenge
    assert client.post("/v1/liveness/analyze", data=meta(challenges=("dance",)), files=blank_frames()).status_code == 422
    # non-monotonic timestamps
    bad = {"meta": json.dumps({"challenges": ["blink"], "timestamps_ms": [0, 500, 400] + [1000 + i * 500 for i in range(7)]})}
    assert client.post("/v1/liveness/analyze", data=bad, files=blank_frames()).status_code == 422
    # capture too short
    assert client.post("/v1/liveness/analyze", data=meta(step=100), files=blank_frames()).status_code == 422
    # not an image
    files = [("frames", (f"{i}.jpg", b"not-an-image", "image/jpeg")) for i in range(10)]
    assert client.post("/v1/liveness/analyze", data=meta(), files=files).status_code == 422


@needs_models
def test_noise_frames_with_no_face_fail():
    r = client.post("/v1/liveness/analyze", data=meta(), files=blank_frames())
    assert r.status_code == 200
    body = r.json()
    assert body["verdict"] == "fail" and "face_not_consistently_visible" in body["reasons"]


@needs_models
@needs_faces
def test_static_photo_replay_fails():
    img = (FIX / "portrait.jpg").read_bytes()
    files = [("frames", (f"{i}.jpg", img, "image/jpeg")) for i in range(12)]
    body = client.post("/v1/liveness/analyze", data=meta(12, 450, ("turn_left", "smile")), files=files).json()
    assert body["verdict"] == "fail"
    assert "frozen_or_looped_frames" in body["passive"]["flags"]


@needs_models
@needs_faces
def test_face_match_same_and_different_person():
    p = (FIX / "portrait.jpg").read_bytes()
    r = client.post("/v1/face/match", files={"selfie": ("a.jpg", p), "id_photo": ("b.jpg", p)}).json()
    assert r["verdict"] == "match" and "embedding" not in json.dumps(r)
    other = FIX / "other_person.png"
    if other.exists():
        r = client.post("/v1/face/match", files={"selfie": ("a.jpg", p), "id_photo": ("b.png", other.read_bytes())}).json()
        assert r["verdict"] == "no_match"


@needs_models
def test_face_match_reports_missing_face():
    noise = jpeg(np.random.default_rng(1).integers(0, 255, (320, 320, 3), dtype=np.uint8))
    r = client.post("/v1/face/match", files={"selfie": ("a.jpg", noise), "id_photo": ("b.jpg", noise)}).json()
    assert r["verdict"] == "unable" and r["selfie_face_found"] is False
