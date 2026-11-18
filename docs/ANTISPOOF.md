# Anti-spoofing: what the live scan defends against, and what it does not

## The attacks, in order of difficulty
| Attack | Stopped by | Status |
|---|---|---|
| Printed or on-screen **photo** | Random prompts (a photo cannot blink, smile or turn) | Works (owner test: rejected, 67/100) |
| Photo **tilted** to fake a head turn | Flat-turn check (`app/depth.py`) | Built, simulation-calibrated, default action `review` |
| **Video replay** (a recording, or a live camera feed of a real person doing the prompts, shown on another phone) | Screen detection only: glare, pixel-grid moire, low-frequency fringes | **The weak spot.** Owner test passed at 90/100 before this work (glare 8.2% flagged but a lone flag cost too little) |
| Deepfake / injected camera feed | Nothing here | Out of scope for a web scan |

Challenge-response cannot stop a replay of a live person: the person really does the prompts. Only evidence that the face is on a screen can.

## What changed in this round
1. **Glare** above 6% now costs enough to stop an auto-pass (verdict `review`, never a hard fail). 4-6% keeps the old small penalty.
2. **Screen fringes** (`_fringe_score`). Captures are ~640x480, so a face is ~200-300 px and a phone's pixel grid is about one output pixel: the old moire detector resizes such crops and cannot see it. What survives re-photographing a screen is the beat between the grid and the camera sampling: broad periodic fringes. Detected as isolated spectral peaks at native resolution; JPEG's 8x8 block frequency is masked out.
3. **Multiple cues**: two independent screen cues (glare, moire, fringes) together cost an extra 0.25.
4. **Flat-turn check**: a turn that squashes the face far more than a real head turn of that size does is flagged. Default `FLAT_TURN_ACTION=review` (never auto-approve a suspected flat turn, never hard-reject on an uncalibrated cue); set `fail` once validated on real captures.

## How it was measured (and what that does and does not prove)
Real MediaPipe landmarker on a real face photo (scikit-image `astronaut`), no real attack captures:
- **Flat photo tilted by perspective warp**: to reach the turn threshold (nose shift 0.12) the photo must be tilted ~60 degrees, where the face is 54-56% as wide. A real head reaches the threshold at ~21 degrees with 95% width, and stays >= 79% wide even at 45 degrees. Landmark depth is hallucinated by the model, so a "parallax" test was tried and DROPPED: for a given nose shift flat and real look the same in landmark space.
- **Fringes on simulated screen captures** (grid pitch 1.12-1.35 output px, 6-25% strength, JPEG q82): 67-100% flagged. Weaker at the finest and coarsest pitches. **0 of 72** clean variants (size, light, blur, JPEG 50-95) flagged.
- This is SIMULATION. Real phones, screens, brightness and cameras differ. Treat thresholds as starting points; use the Live Scan Lab with real attacks and read the `fringe` and `glare` numbers.

## What would make replay hard to pass (not done yet)
1. **A trained anti-spoof network** (MiniFASNet, Apache-2.0, 1.8 MB, CPU) fused into the score. It learns screen/print cues no hand-written rule captures. Needs the official weights converted to ONNX (PyTorch needed once, not at runtime).
2. **Screen-light challenge**: flash a random colour sequence on the scanning phone's own screen and check the face reflects it. A face shown on another screen cannot track our colours. Weak in direct sunlight, so it would route to `review` rather than fail.
3. **Real data**: record consented attack and genuine captures, measure false accept / false reject, then tighten thresholds and set `FLAT_TURN_ACTION=fail`.
