import pytest

from app import camera as cam


@pytest.mark.parametrize("label", [
    "OBS Virtual Camera", "ManyCam Virtual Webcam", "DroidCam Video", "Snap Camera", "Iriun Webcam",
    "NVIDIA Broadcast", "Unity Video Capture", "XSplit VCam", "EpocCam Camera", "Elgato Cam Link 4K",
    "Camo", "mmhmm Virtual Camera", "v4l2loopback", "DeepFaceLive Camera", "obs",
])
def test_known_virtual_cameras_are_flagged(label):
    r = cam.assess({"label": label})
    assert r.suspicious and "virtual_camera" in r.flags and r.matched


@pytest.mark.parametrize("label", [
    "Front Camera", "camera2 1, facing front", "Integrated Webcam", "FaceTime HD Camera", "USB2.0 HD UVC WebCam",
    "Logitech C920 HD Pro Webcam", "Back Camera", "HP TrueVision HD Camera",
])
def test_real_cameras_are_not_flagged(label):
    r = cam.assess({"label": label})
    assert not r.suspicious and r.flags == []


def test_missing_or_malformed_label_is_recorded_not_blocking():
    for bad in (None, {}, {"label": ""}, {"label": 5}, "OBS Virtual Camera", {"label": None}):
        r = cam.assess(bad)
        assert not r.suspicious and r.flags == ["camera_label_missing"]


def test_policy_never_auto_approves_a_suspected_virtual_camera():
    s = cam.assess({"label": "OBS Virtual Camera"})
    assert cam.apply_policy("pass", s, "review") == "review"
    assert cam.apply_policy("review", s, "review") == "review"
    assert cam.apply_policy("fail", s, "review") == "fail"
    assert cam.apply_policy("pass", s, "fail") == "fail"
    assert cam.apply_policy("pass", s, "off") == "pass"
    ok = cam.assess({"label": "Front Camera"})
    assert cam.apply_policy("pass", ok, "fail") == "pass"


def test_very_long_label_is_truncated_not_crashing():
    r = cam.assess({"label": "x" * 5000 + "OBS Virtual Camera"})
    assert not r.suspicious  # truncated at 80 chars before matching
