# Anti-spoofing: what the live scan defends against, and what it does not

## The attacks, in order of difficulty
| Attack | Stopped by | Status |
|---|---|---|
| Printed or on-screen **photo** | Random prompts (a photo cannot blink, smile or turn) | Works (owner test: rejected, 67/100) |
| Photo **tilted** to fake a head turn | Flat-turn check (`app/depth.py`) | Built, simulation-calibrated, default action `review` |
| **Video replay** (a recording, or a live camera feed of a real person doing the prompts, shown on another phone) | **Screen-light challenge** (below), then screen detection: glare, pixel-grid moire, low-frequency fringes | Owner test passed at 90/100 before the screen-light challenge (glare 8.2% flagged but a lone flag cost too little). Re-test it on real phones |
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

## Screen-light challenge (`app/flash.py`)
The server picks a random order of 6 colours per attempt and stores it. The browser shows them full screen, one after another, while it films. A real face reflects that light, so its colour moves with our sequence; a photo or a video on another device shows its own light and cannot know the order. The engine tests the face's colour change against **every other order** the same colours could have appeared in (exact permutation test, 720 orderings), so the output is a p-value, not a threshold guess. A background-versus-face check catches a picture that tints as a whole.

- **Colours always come from the server's stored plan** (`liveness_sessions.flash_plan`), never the client. The client only reports when each colour was on screen, and the API rejects implausible windows.
- **Modes** (`FLASH_MODE` on the liveness service): `off`; `advisory` (default: flags only, verdict untouched); `required` (anything other than a measured, matching response stops an auto-pass: skipped, missing, too weak to measure, mismatched all give `review`). `FLASH_FAIL_ACTION=fail` turns a measurable-but-wrong response into a rejection once calibrated on real captures. API kill switch: `LIVENESS_FLASH=off`.
- **Who gets it:** hosted verification always; API integrations opt in with `flash: true` on `/verify/face/liveness/start` (the JS, Python and PHP SDKs expose it). Not issued = not held against the scan.
- **Safety:** 700 ms per colour (about 1.4 changes a second, under the 3 per second general flash limit), no fully saturated red (tested against the WCAG definition), a visible "Stop the colour flash" button, a "skip" option on the intro, and `prefers-reduced-motion` skips it automatically. Skipped scans cannot be auto-approved in `required` mode: a person reviews them.

### Rollout (recommended)
1. Deploy with `FLASH_MODE=advisory`. Test in the Live Scan Lab on your own phones, indoors and outdoors; read the correlation, p-value, effect and background ratio it shows.
2. Try your video replay again. Expect "Screen light NOT reflected" or a flag.
3. When real faces consistently show `pass`, set `FLASH_MODE=required` on the liveness service (Railway variable).

### Simulation results (real face photo, physical light model, noise, JPEG q82)
| Scenario | Accepted as live |
|---|---|
| Real face, screen/ambient light 0.03, 0.08, 0.15, 0.3, 0.6 | 100% at every strength (40 trials each) |
| Replay with no reflection of our light | 0% |
| Replay with strong independent flicker | 0% |
| Replay with our light tinting the whole picture (weak and strong) | 0% (the background-to-face ratio is 0.62-0.87 for replays vs 0.12-0.17 for real faces; flag threshold 0.45) |

Thresholds: `FLASH_MIN_R=0.6`, `FLASH_MAX_P=0.01`, `FLASH_MIN_EFFECT=2.0`, `FLASH_BG_RATIO_MAX=0.45`. A first run of this simulation reported 0% for real faces: that was a bug in the simulator (colours applied to a BGR image as RGB), caught because the unit tests disagreed.

### Limits (read these)
- **Simulation only.** No real replay captures. Real cameras apply auto white balance and exposure that shrink the response, real screens vary, and a real replay phone covers only part of the frame (so the background ratio may read lower than simulated). Use the Lab to gather real numbers before switching to `required`.
- **Sunlight.** Outdoors in direct sun the screen's light is too weak to measure. That is `inconclusive`: in `required` mode it goes to review, it is not a rejection. Expect some friction outdoors.
- **A printed photo reflects light like a face** and passes this check by itself. It is stopped by the random prompts (it cannot blink, smile or turn) and the flat-turn check.
- **Virtual camera / injected video.** Software that feeds fake frames into the browser and tints them to match the plan we sent defeats this and every web-only liveness check. That needs a native app with device attestation.
- **Cost of the safe design.** Skipped or unmeasurable scans need a person: if many users hit this, review volume (and, if enabled, second-opinion vendor spend) rises. Watch the `liveness_flash_*` counters.
