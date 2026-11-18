# Accuracy study protocol

How to run an AfriVerify liveness accuracy study so the numbers can be trusted and quoted. Use it with the Accuracy Studies tool (Dashboard > Accuracy Studies) and `docs/EVALUATION.md`.

This is our own study, not an accredited test. Say so wherever you quote results.

## 1. Objectives

1. Measure **APCER**: the share of attacks the system auto-accepts as a live person (verdict pass, no human review). Lower is better. This is the security number.
2. Measure **BPCER**: the share of real people not auto-accepted. "Strict" counts review or fail; "hard" counts fail only. Lower is better. This is the friction number.
3. Check that BPCER does not differ unfairly between skin-tone groups, lighting conditions, phones and capture modes (Standard vs Lite).
4. Find the attacks that work, so they can be fixed before a real attacker finds them.

## 2. How many people (sample size)

Rule of three: if you see 0 errors in *n* trials, the true rate could still be about 3/*n* (95% upper bound). Wilson intervals in the tool give the exact figure.

| Sample | If 0 errors, upper bound is about |
| --- | --- |
| 30 | 11% |
| 100 | 3.7% |
| 300 | 1.3% |

So 30 attacks per type can only show "no worse than about 11%". It cannot prove "1%". Quote the upper end of the range, not the point estimate.

Minimums built into the tool (the report is marked DRAFT until met):

- 100 genuine captures in total, at least 30 in each skin group (light, medium, dark).
- 30 attacks of each type: print photo, screen photo, screen video, screen live video, mask.
- At least 10 genuine captures in each lighting condition, 5 different phone models, and attacks tried in 2 lightings and on 3 phones.

The "Who to record next" panel on the study page shows what is still missing and puts the biggest gap first.

## 3. Phases

**Phase 0: process pilot (about 10 people, 1 day).** Not for numbers. Goals: the session script works, instructions are clear, devices and lighting can be controlled, labels are recorded correctly. Delete or ignore this study's data afterwards (create a fresh study for the real run).

**Phase 1: main study (100+ genuine, 150+ attacks).** Run until every quota is met. Review the coverage panel at the end of each day.

**Phase 2: repeat after any engine change.** A new engine version means a new study (or clearly separated runs). Numbers from an old version do not describe the new one.

## 3a. Who to recruit and how

- Adults only (18+). Voluntary. No pressure from employment or customer relationships.
- Recruit across skin tones on purpose. The dark skin group is the one most often missing, so recruit for it first, not last.
- Mix age bands and genders. Include people with glasses, headscarves, beards and braids: real users have them.
- Use different channels (campus, markets, community groups, colleagues' families) so the sample is not one friend group.
- Pay or reimburse fairly for time (airtime or a small cash amount). Do not make payment depend on the result.
- Give each person the printed information and consent sheet (Consent sheet button on the study page; English and French). Get legal or ethics review of the wording for your country before real use.

## 4. Session script (about 10 minutes per person)

1. Greet. Hand over the information sheet. Let them read it or read it aloud. Answer questions.
2. If they agree, tick the consent confirmation when adding them as a participant. Record age band, gender, skin tone (Monk scale, judged with the Monk card in daylight, ideally by the participant) and country. No name, phone or email.
3. Give them the code. They hold the code if they want to withdraw later.
4. Run the genuine captures (see matrix below). Choose the lighting and phone on the capture panel truthfully.
5. Thank them, pay them, remind them how to withdraw.

## 5. Building each attack (all ground truth is "attack")

Only attack with your own materials, never with someone else's face without their consent. Use the face of a consenting participant or a team member.

| Attack | How |
| --- | --- |
| Print photo | A clear colour print of the face on normal paper, held up to the camera and tilted. Try A4 and passport size. |
| Screen photo | The same photo shown full screen on a second phone, held in front of the camera. |
| Screen video | A recorded video of the person doing the head turn and blink, played on a second phone. |
| Screen live video | A live video call showing the person responding to the instructions in real time (the strongest replay). |
| Mask | A printed face mask or a cut-out with the eyes open, held in front of the attacker's face. |

Vary: second-phone brand and brightness, distance, angle, and room lighting. Record the lighting and the capturing phone for every attempt.

## 6. Matrix to cover

Genuine: every skin group x every lighting (bright indoor, dim indoor, outdoor, backlit) x at least 5 phone models including cheap Android. Do not put all the dark-skin captures in one lighting or on one phone, or a lighting or camera problem will look like a skin-tone problem.

Attacks: every attack type in at least 2 lightings and on at least 3 capturing phones.

Both Standard and Lite capture modes should appear. Lite is chosen automatically on slow networks, so test it on a throttled connection.

## 7. Keeping labels correct

Wrong labels ruin the study. Rules:

- Choose "genuine" or the attack type **before** starting the capture, never after seeing the result.
- One person runs the session; a second person spot-checks 10% of the recorded rows against the session sheet each day.
- If a capture is clearly invalid (phone fell, wrong label), note it on the sheet and tell the data owner. Do not silently re-run only the failures: that biases the result. Re-run only for a defined technical cause, and log it.
- Never tune the engine on the same captures that are then used to report accuracy. If you must tune, collect a fresh set for reporting.

## 8. Analysis plan (fixed in advance)

- Primary: APCER overall and per attack type; BPCER strict and hard overall, with 95% Wilson intervals.
- Fairness: BPCER strict per skin group. Flag if one group's *point estimate* is more than 2 times another's and the intervals do not overlap, or if any group's upper bound exceeds 10%. Investigate the cause (lighting, camera, or the model) before shipping.
- Capture mode: compare Standard and Lite. Lite must not have a materially higher APCER.
- Do not drop attack types that look bad. Report all.
- Report the worst attack type next to the average.

## 9. Reporting

Use the Report page (printable, saved as PDF). It includes methodology, tables with intervals, the period, participant and device counts, and limitations. A DRAFT banner appears until sample sizes are met. Do not share a DRAFT with customers as results.

Publish with the limits stated: own study, sample description, no independent test yet. Then commission an independent test (for example iBeta PAD) when the own-study numbers are stable.

## 10. Data protection

- Participants are pseudonymous. Images are encrypted and deleted automatically after the study's retention period.
- Withdrawal deletes the participant's images and results (Participants table > Withdraw).
- Export CSV has no personal data. Keep exports in the same protection as the study.
- Keep a paper record of consent separate from the data, and destroy it per your policy.

## 11. Budget template

| Item | Quantity | Unit cost | Total |
| --- | --- | --- | --- |
| Participant reimbursement (airtime or cash) | 120 | | |
| Test phones (5+ models, cheap Android included) | 5 | | |
| Second phones for attacks | 3 | | |
| Printing (photos, consent sheets) | | | |
| Venue / transport | | | |
| Staff time (2 people, about 10 days) | | | |
| Independent test later (quote from lab) | 1 | | |

Fill in your local costs. Typical total for the main study is mostly participant reimbursement and staff time.
