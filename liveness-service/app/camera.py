"""Camera integrity: is the video coming from a real camera, or from software that can feed any video
(virtual camera, screen capture, capture card)?

This is ADVISORY. The label is whatever the browser reports, and software can rename itself, so a determined
attacker gets past it. What it does: stops the common, off-the-shelf tools (OBS Virtual Camera, ManyCam, DroidCam,
Snap Camera and similar) from auto-approving, and makes the rest pay for a harder attack. The screen-light
challenge is the real defence against injected video, because injected video does not react to the colours the
server picked for this attempt.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List

# Case-insensitive fragments of well known virtual-camera and capture software.
VIRTUAL_CAMERA_PATTERNS = [
    r"\bobs\b", r"obs[- ]?virtual", r"virtual", r"manycam", r"xsplit", r"splitcam", r"droidcam", r"iriun", r"epoccam",
    r"camo\b", r"snap camera", r"mmhmm", r"nvidia broadcast", r"webcamoid", r"unity video capture", r"v4l2loopback",
    r"e2esoft", r"vcam", r"dummy", r"fake", r"screen capture", r"capture card", r"cam link", r"elgato", r"loopback",
    r"deepfacelive", r"deep ?live ?cam", r"facerig", r"altcam", r"yawcam", r"ivcam", r"kinoni",
]
_RE = re.compile("|".join(VIRTUAL_CAMERA_PATTERNS), re.IGNORECASE)


@dataclass
class CameraResult:
    flags: List[str] = field(default_factory=list)
    suspicious: bool = False
    matched: str | None = None

    def to_dict(self) -> dict:
        return {"suspicious": self.suspicious, "flags": self.flags, "matched": self.matched}


def assess(camera: object) -> CameraResult:
    """camera is the browser-reported {"label": "..."}; anything malformed is treated as 'not reported'."""
    label = ""
    if isinstance(camera, dict) and isinstance(camera.get("label"), str):
        label = camera["label"].strip()[:80]
    res = CameraResult()
    if not label:
        # Browsers show a label once permission is granted. A missing one is common (privacy modes), so it is
        # recorded for study but does not stop an approval by itself.
        res.flags.append("camera_label_missing")
        return res
    m = _RE.search(label)
    if m:
        res.suspicious = True
        res.matched = m.group(0).lower()
        res.flags.append("virtual_camera")
    return res


def apply_policy(verdict: str, res: CameraResult, action: str) -> str:
    """off: ignore. review (default): a suspected virtual camera never auto-approves. fail: reject it."""
    if action == "off" or not res.suspicious:
        return verdict
    if action == "fail":
        return "fail"
    return "review" if verdict == "pass" else verdict
