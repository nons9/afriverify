"""AfriVerify liveness + face-match engine (v1).

Stateless HTTP service called only by the AfriVerify API (shared secret).
  POST /v1/liveness/analyze  - active challenges + passive checks over a frame sequence
  POST /v1/face/match        - 1:1 selfie vs ID-photo similarity
  GET  /healthz
"""
from __future__ import annotations

import hmac
import json
import logging
import time
from typing import List

import numpy as np
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile

from . import challenges as ch
from . import config, embedding, passive, vision

log = logging.getLogger("liveness")
app = FastAPI(title="AfriVerify Liveness Engine", version="1.0.0")


def require_key(x_internal_key: str = Header(default="")) -> None:
    if config.ALLOW_NO_AUTH:
        return
    if not config.SERVICE_KEY or not hmac.compare_digest(x_internal_key, config.SERVICE_KEY):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.on_event("startup")
def _startup() -> None:
    if not config.SERVICE_KEY and not config.ALLOW_NO_AUTH:
        raise RuntimeError("LIVENESS_SERVICE_KEY must be set (or ALLOW_NO_AUTH=1 for local dev)")


@app.get("/healthz")
def healthz():
    return {
        "ok": vision.models_ready(),
        "landmarker": vision.models_ready(),
        "face_model": embedding.model_ready(),
    }


def _bad(detail: str, code: str = "invalid_capture"):
    raise HTTPException(status_code=422, detail={"error": code, "message": detail})


def _validate_meta(meta: dict, n_frames: int) -> tuple[list[str], list[float], list[dict] | None]:
    challenges = meta.get("challenges")
    ts = meta.get("timestamps_ms")
    windows = meta.get("windows")
    if not isinstance(challenges, list) or not challenges or any(c not in ch.CHALLENGE_TYPES for c in challenges):
        _bad("challenges missing or unknown")
    if not isinstance(ts, list) or len(ts) != n_frames:
        _bad("timestamps_ms must have one entry per frame")
    try:
        ts = [float(t) for t in ts]
    except (TypeError, ValueError):
        _bad("timestamps_ms must be numbers")
    if any(b <= a for a, b in zip(ts, ts[1:])):
        _bad("timestamps_ms must be strictly increasing")
    span = (ts[-1] - ts[0]) / 1000.0
    if span < config.MIN_CAPTURE_SECONDS:
        _bad(f"capture too short ({span:.1f}s)")
    if span > config.MAX_CAPTURE_SECONDS:
        _bad(f"capture too long ({span:.1f}s)")
    if (n_frames - 1) / span < config.MIN_FPS:
        _bad("frame rate too low")
    if windows is not None:
        if not isinstance(windows, list) or len(windows) != len(challenges):
            _bad("windows must match challenges")
        try:
            windows = [{"start_ms": float(w["start_ms"]), "end_ms": float(w["end_ms"])} for w in windows]
        except (KeyError, TypeError, ValueError):
            _bad("invalid windows")
        if any(w["end_ms"] <= w["start_ms"] for w in windows) or any(
            b["start_ms"] < a["start_ms"] for a, b in zip(windows, windows[1:])
        ):
            _bad("windows must be ordered")
    return challenges, ts, windows


@app.post("/v1/liveness/analyze", dependencies=[Depends(require_key)])
def analyze(meta: str = Form(...), frames: List[UploadFile] = File(...)):
    t0 = time.time()
    n = len(frames)
    if n < config.MIN_FRAMES or n > config.MAX_FRAMES:
        _bad(f"need between {config.MIN_FRAMES} and {config.MAX_FRAMES} frames")
    try:
        meta_obj = json.loads(meta)
    except json.JSONDecodeError:
        _bad("meta is not valid JSON")
    challenges, ts, windows = _validate_meta(meta_obj, n)

    images, feats, sigs, hashes = [], [], [], []
    for i, f in enumerate(frames):
        data = f.file.read(config.MAX_FRAME_BYTES + 1)
        if len(data) > config.MAX_FRAME_BYTES:
            _bad(f"frame {i} too large")
        img = vision.decode_image(data)
        if img is None:
            _bad(f"frame {i} is not a decodable image")
        if min(img.shape[:2]) < 240:
            _bad(f"frame {i} resolution too low")
        feat = vision.extract(img)
        images.append(img)
        feats.append(feat)
        sigs.append(passive.frame_signals(img, feat))
        hashes.append(passive.frame_hash(img))

    motion = []
    for a, b in zip(images, images[1:]):
        if a.shape == b.shape:
            motion.append(float(np.mean(np.abs(a[::4, ::4].astype(np.int16) - b[::4, ::4].astype(np.int16)))))

    reasons: list[str] = []
    no_face = sum(1 for x in feats if not x.has_face) / n
    multi = sum(1 for x in feats if x.face_count > 1) / n
    small = sum(1 for x in feats if x.has_face and x.area_ratio < config.MIN_FACE_AREA_RATIO) / n
    if no_face > config.MAX_NO_FACE_RATIO:
        reasons.append("face_not_consistently_visible")
    if multi > config.MAX_MULTI_FACE_RATIO:
        reasons.append("multiple_faces")
    if small > 0.5:
        reasons.append("face_too_small")

    results = ch.verify_sequence(feats, ts, challenges, windows)
    if not all(r.passed for r in results):
        reasons.append("challenge_failed")
    flat_turn = any(r.flat_suspected for r in results) and config.FLAT_TURN_ACTION != "off"
    if flat_turn and config.FLAT_TURN_ACTION == "fail":
        reasons.append("flat_face_turn")

    report = passive.combine(sigs, hashes, motion)

    # best frame: frontal, eyes open, neutral, large and sharp
    best, best_q = None, -1.0
    for i, (f, s) in enumerate(zip(feats, sigs)):
        if not f.has_face or f.face_count != 1 or s is None:
            continue
        q = (1.0 - abs(f.nose_ratio - 0.5) * 4) * (1.0 - f.blink) * (1.0 - 0.5 * f.smile) \
            * min(1.0, f.area_ratio / 0.15) * min(1.0, s.sharpness / 120.0)
        if q > best_q:
            best, best_q = i, q

    challenge_frac = sum(1 for r in results if r.passed) / len(results)
    score = round(100.0 * (0.5 * challenge_frac + 0.5 * report.score), 1)
    structural_fail = bool(reasons)
    if structural_fail or best is None:
        verdict = "fail"
    elif report.score >= config.PASSIVE_PASS:
        verdict = "pass"
    elif report.score >= config.PASSIVE_REVIEW:
        verdict = "review"
    else:
        verdict = "fail"
    if report.flags and verdict == "fail" and not structural_fail:
        reasons.append("passive_checks_failed")
    if flat_turn:
        report.flags.append("flat_face_turn")
        if verdict == "pass":
            verdict = "review"   # never auto-approve a suspected flat turn; never hard-reject on an uncalibrated cue

    out = {
        "verdict": verdict,
        "liveness_score": score,
        "challenges": [r.__dict__ for r in results],
        "passive": report.to_dict(),
        "reasons": reasons,
        "best_frame_index": best,
        "frame_stats": {
            "frames": n,
            "no_face_ratio": round(no_face, 3),
            "multi_face_ratio": round(multi, 3),
            "face_too_small_ratio": round(small, 3),
        },
        "processing_ms": int((time.time() - t0) * 1000),
    }
    log.info("liveness verdict=%s score=%s reasons=%s", verdict, score, reasons)
    return out


@app.post("/v1/face/match", dependencies=[Depends(require_key)])
def face_match(selfie: UploadFile = File(...), id_photo: UploadFile = File(...)):
    t0 = time.time()
    s_img = vision.decode_image(selfie.file.read(5_000_000))
    i_img = vision.decode_image(id_photo.file.read(10_000_000))
    if s_img is None or i_img is None:
        _bad("selfie and id_photo must be decodable images")
    e_s = embedding.embedding_for(s_img)
    e_i = embedding.embedding_for(i_img, robust=True)
    if e_s is None or e_i is None:
        return {
            "verdict": "unable",
            "selfie_face_found": e_s is not None,
            "id_face_found": e_i is not None,
            "confidence": 0.0,
            "processing_ms": int((time.time() - t0) * 1000),
        }
    cos = float(np.dot(e_s, e_i))
    verdict = "match" if cos >= config.MATCH_PASS else "review" if cos >= config.MATCH_REVIEW else "no_match"
    return {
        "verdict": verdict,
        "similarity": round(cos, 4),
        "confidence": embedding.similarity_to_confidence(cos),
        "selfie_face_found": True,
        "id_face_found": True,
        "processing_ms": int((time.time() - t0) * 1000),
    }
