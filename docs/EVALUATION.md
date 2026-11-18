# Accuracy Studies: measuring the live scan on real people

A verification product is judged on two numbers. Buyers, banks and test labs ask for both, with confidence intervals and a breakdown by skin tone. This program produces them. Dashboard: **Accuracy Studies**.

| Term (ISO/IEC 30107-3) | Meaning here | Why it matters |
|---|---|---|
| **APCER** | Share of attacks that were **auto-accepted** (verdict `pass`). `review` and `fail` both stop an attack. | The security number. One breach is a headline. |
| **BPCER strict** | Share of real people **not** auto-passed (sent to review or rejected). | The cost number: each one is a human review. |
| **BPCER hard** | Share of real people **rejected outright**. | The user-experience number. |

Every rate shows a 95% Wilson interval. "0 breaches in 30 attacks" means the true rate could still be about 11%: the interval says so, and the dashboard refuses to call a sample adequate until it has enough data.

## Sample plan (minimum before you quote a number)
- **100 genuine captures**, with **at least 30 in each skin group** (light 1-3, medium 4-6, dark 7-10 on the Monk Skin Tone scale). For AfriVerify the dark group is the one that must be well covered.
- **30 attacks per attack type**: `print_photo`, `screen_photo`, `screen_video`, `screen_live_video`, `mask`.
- Vary what you can: at least 5 phone models (include cheap Android), all four lighting conditions, different people, different attackers.
- Test labs use far more. This is the floor at which your own numbers stop being anecdotes.

## Running an attack capture
Set what is true **before** capturing (ground truth), then hold the attack to the scanning phone while the scan runs.
- `print_photo`: a printed photo of a participant, held in front of the camera.
- `screen_photo`: a photo on another phone's screen.
- `screen_video`: a recorded video of a participant on another phone.
- `screen_live_video`: a live camera feed of a participant on another phone (the replay that first beat the engine).
- `mask`: a printed or 3D mask. `other`: anything else; write it in the device field.
A `BREACH` banner means an attack was accepted. Record the flags, then tune with `FLASH_*` and the passive thresholds, and re-run the same attack.

## Consent (what to say to every participant)
1. What the study is for (the purpose you wrote when creating it).
2. Their camera frames, a short video of their face, are captured and stored **encrypted** for the retention period.
3. They are known only by a code. No name, phone number or email is recorded.
4. They can stop at any time, and can ask to **withdraw**: all their images and results are then deleted.
5. Taking part has no effect on any account or service.
The operator ticks the consent box in the dashboard; the system records who confirmed it, when, and which wording version.

## What is stored, and for how long
- **Participant:** a code (P-0001), plus optional age band, gender, skin tone and country. Nothing that identifies a person.
- **Capture:** the engine's verdict and measurements, the ground-truth label, lighting, phone model, and (if "keep the frames" is ticked) the frames, encrypted with AES-256-GCM before they reach storage.
- **Retention:** images are deleted after the study's retention days (default 180) by the daily purge. The measurements stay.
- **Withdrawal:** deletes the participant's images and measurements and clears their attributes. If a file cannot be deleted, nothing is marked deleted and you are told to retry.
- **Cost:** a capture is roughly 3-4 MB of frames. 300 captures is about 1 GB. Untick "keep the frames" to store measurements only.
- **Export:** CSV with codes and measurements only. Cells that could be read as spreadsheet formulas are neutralised.

## Legal note (not legal advice)
Face images are biometric data, a sensitive category under data-protection laws such as Nigeria's NDPA, Ghana's Data Protection Act, Kenya's Data Protection Act and South Africa's POPIA. Before running studies at scale: get written advice for each country you recruit in, decide whether you must register with the regulator or run a data-protection impact assessment, and keep the consent records the dashboard produces.

## What to do with the results
1. Fix the weakest attack type first (the table names it), re-run it, and watch the interval narrow.
2. If darker skin tones are stopped noticeably more often, the dashboard says so once both groups have enough data. Treat that as a launch blocker.
3. Frames kept from consenting participants are the training data for AfriVerify's **own** anti-spoof model, trained and tested on the people it will serve. That model, plus these measured numbers, is what an independent test lab (iBeta-style PAD testing) and a serious buyer will ask to see.
