# AfriVerify Liveness Engine (v1)

Our own live-face-scan engine: proves a real person is in front of the camera and matches them
to their ID photo. No third-party liveness API. Stateless Python service called only by the
AfriVerify API (shared secret).

```
browser (MediaPipe guidance + camera frames) ──► API (/v1/hosted|verify/face/liveness/*)
                                                   │  issues random challenge, stores encrypted evidence
                                                   ▼
                                          liveness-service  POST /v1/liveness/analyze
                                                            POST /v1/face/match
```

## What it checks

| Layer | How | Where |
|---|---|---|
| Active liveness | Server-issued random sequence (1 head turn + blink + smile). Each motion is re-detected **server-side** from the frames (MediaPipe Face Landmarker) - client measurements are never trusted. Order + time windows enforced. | `app/challenges.py`, `app/vision.py` |
| Passive PAD (v1 heuristics) | moiré/pixel-grid spectrum peaks (screen replay), glare, blur, low light/contrast, frozen or looped frames, no natural motion | `app/passive.py` |
| Presence | one face, consistently visible, big enough | `app/main.py` |
| Face match | 1:1 SFace (OpenCV Zoo, Apache-2.0, ONNX) between best live frame and ID photo; only a similarity score leaves the service, never embeddings | `app/embedding.py` |

Decision logic lives in the API (`api/src/services/liveness.service.ts#decide`): liveness fail → reject; liveness pass + match → approve;
borderline → existing vendor (Smile/Dojah/Onfido) second opinion, else manual review case.

## Run

```bash
cd liveness-service
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
./scripts/download_models.sh                 # ~17 MB into ./models
LIVENESS_SERVICE_KEY=$(openssl rand -hex 32) .venv/bin/uvicorn app.main:app --port 8100
.venv/bin/pytest -q                          # set FACE_FIXTURES=<dir with portrait.jpg> for the face tests
```

Docker: `docker build -t afriverify-liveness . && docker run -e LIVENESS_SERVICE_KEY=... -p 8100:8100 afriverify-liveness`.
Then on the API: `LIVENESS_ENGINE_URL=http://<host>:8100`, same `LIVENESS_SERVICE_KEY`.
Linux needs `libgles2`/`libegl1` for MediaPipe (the Dockerfile installs them).

## Read before production

1. **Model licence.** The default face-match model is OpenCV Zoo SFace (Apache-2.0, commercial use allowed;
   the download is checksum-verified). Its training-data provenance should be reviewed by counsel before you
   rely on it commercially. The older InsightFace ArcFace model is non-commercial: it is only fetched with
   `FETCH_ARCFACE=1` and `FACE_MODEL=arcface` for local comparison. See `../docs/FACE-MATCH.md`.
2. **Thresholds are unvalidated.** `MATCH_*`, `PASSIVE_*` and challenge thresholds are sensible
   starting points tuned on a handful of images. Measure FAR/FRR on real captures (including African
   skin tones, low-end phones and low light) before relying on them. All are env-tunable (`app/config.py`).
3. **Passive detection is heuristic.** It catches cheap attacks (replays, still photos, loops). It is not a
   trained anti-spoof model and not iBeta/ISO 30107-3 certified. v2: fine-tune a PAD CNN on labelled attacks
   collected in production, add device attestation, deepfake/injection detection.
4. **Browser injection.** A virtual camera feeding a pre-rendered deepfake that responds to the prompts
   is not stopped in v1. The native-app path with attestation (Play Integrity / App Attest) is the real fix.
5. **Privacy.** Consent is recorded per attempt. Frames are encrypted at rest; extra frames + video are purged
   after `LIVENESS_EVIDENCE_RETENTION_DAYS`. Check retention/consent wording against NDPA, Ghana DPA, Kenya DPA.

## Configuration

See `app/config.py` - every threshold is an env var (`TURN_DELTA`, `BLINK_*`, `SMILE_*`, `PASSIVE_PASS`, `MATCH_PASS`, `MAX_FRAMES`, ...).
