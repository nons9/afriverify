#!/usr/bin/env bash
# Downloads the model files the engine needs into ./models (or $MODELS_DIR).
#
#  * face_landmarker.task                   - MediaPipe Face Landmarker (Apache-2.0)
#  * face_recognition_sface_2021dec.onnx    - OpenCV Zoo SFace (Apache-2.0), the default face-match model
#
# Optional, LOCAL COMPARISON ONLY (set FETCH_ARCFACE=1): InsightFace buffalo_s w600k_mbf.onnx. Its licence is
# NON-COMMERCIAL research use, so it must never ship in a production image.
set -euo pipefail
DIR="${MODELS_DIR:-$(dirname "$0")/../models}"
mkdir -p "$DIR"
cd "$DIR"

if [ ! -f face_landmarker.task ]; then
  curl -fSL -o face_landmarker.task \
    https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
fi

SFACE=face_recognition_sface_2021dec.onnx
SFACE_SHA256=0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79
if [ ! -f "$SFACE" ]; then
  curl -fSL -o "$SFACE" \
    https://huggingface.co/opencv/face_recognition_sface/resolve/main/$SFACE
fi
echo "$SFACE_SHA256  $SFACE" | sha256sum -c -

if [ "${FETCH_ARCFACE:-0}" = "1" ] && [ ! -f w600k_mbf.onnx ]; then
  tmp="$(mktemp -d)"
  curl -fSL -o "$tmp/buffalo_s.zip" \
    https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_s.zip
  python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extract('w600k_mbf.onnx', sys.argv[2])" "$tmp/buffalo_s.zip" .
  rm -rf "$tmp"
fi
ls -la .
