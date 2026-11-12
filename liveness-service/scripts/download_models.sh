#!/usr/bin/env bash
# Downloads the model files the engine needs into ./models (or $MODELS_DIR).
#
#  * face_landmarker.task  - MediaPipe Face Landmarker (Apache-2.0)
#  * w600k_mbf.onnx        - ArcFace MobileFaceNet recognition model from InsightFace's buffalo_s pack
#
# LICENCE WARNING: InsightFace's pretrained packs (buffalo_*) are published for
# NON-COMMERCIAL research use only. Fine for development/evaluation; before
# production use either obtain a commercial licence from InsightFace or train/obtain a
# commercially-licensed ArcFace-style ONNX model and point FACE_MODEL_PATH at it.
set -euo pipefail
DIR="${MODELS_DIR:-$(dirname "$0")/../models}"
mkdir -p "$DIR"
cd "$DIR"

if [ ! -f face_landmarker.task ]; then
  curl -fSL -o face_landmarker.task \
    https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
fi

if [ ! -f w600k_mbf.onnx ]; then
  tmp="$(mktemp -d)"
  curl -fSL -o "$tmp/buffalo_s.zip" \
    https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_s.zip
  python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extract('w600k_mbf.onnx', sys.argv[2])" "$tmp/buffalo_s.zip" .
  rm -rf "$tmp"
fi
ls -la .
