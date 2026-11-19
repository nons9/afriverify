# Face match model

Face match compares the best live frame with the photo on the ID and returns only a similarity score (embeddings never leave the service).

## Model choice

| | SFace (default) | ArcFace buffalo_s (comparison only) |
| --- | --- | --- |
| Licence | Apache-2.0 (OpenCV Zoo) | Non-commercial research only |
| Commercial use | Allowed, subject to review of training-data provenance | Not allowed without a licence from InsightFace |
| Env | `FACE_MODEL=sface` | `FACE_MODEL=arcface`, download with `FETCH_ARCFACE=1` |

We switched the default from ArcFace to SFace because the ArcFace licence did not allow charging customers.

## Measured on LFW (699 pairs, run through our own detection and alignment pipeline)

| Model | AUC | Same-person accepted at 1% false match | Same-person accepted at 0.1% false match |
| --- | --- | --- | --- |
| ArcFace | 0.9905 | 97.1% | 96.8% |
| SFace | 0.9854 | 96.8% | 96.2% |

Thresholds in use for SFace: pass 0.40, review 0.30. On the same sample, pass 0.40 accepted 96.2% of same-person pairs and 0 of 360 different-person pairs.

SFace expects raw 0-255 RGB input. Feeding it BGR lowers accuracy (AUC 0.981), so the preprocessing is per model in `app/embedding.py`.

## What this does not tell you

- LFW is mostly lighter-skinned public figures taken from news photos. It says nothing about African faces, ID-card photos, or low-end phones. The sample is also small: zero false matches in 360 pairs only shows the rate is below about 1%.
- Both models were trained on public face datasets that are weak on African faces. Expect higher error for darker skin tones until measured.
- Before trusting the thresholds, measure on real ID photo vs selfie pairs from your own users (consented), reported per skin-tone group, and tune `MATCH_PASS` and `MATCH_REVIEW`. Use the Accuracy Studies tool for the live-scan side; a face-match study uses the same consent and fairness approach.

## Reproducing

The comparison used LFW pairs, our `vision.extract` landmarks, the standard 112x112 alignment and cosine similarity. The model SHA-256 is pinned in `scripts/download_models.sh`.
