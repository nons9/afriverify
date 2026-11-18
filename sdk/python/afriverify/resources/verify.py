from __future__ import annotations

from pathlib import Path
from typing import Any, BinaryIO


class VerifyResource:
    def __init__(self, http: Any) -> None:
        self._http = http

    # ── Sync ────────────────────────────────────────────────────────────────

    def initiate(
        self,
        phone: str,
        *,
        email: str | None = None,
        otp_channel: str = "sms",
        platform_user_id: str | None = None,
        redirect_url: str | None = None,
        flow_id: str | None = None,
        lang: str = "en",
        require_liveness: bool = False,
    ) -> dict[str, Any]:
        return self._http.post("/verify/initiate", _compact({
            "phone": phone,
            "email": email,
            "otp_channel": otp_channel,
            "platform_user_id": platform_user_id,
            "redirect_url": redirect_url,
            "flow_id": flow_id,
            "lang": lang,
            "require_liveness": True if require_liveness else None,
        }))

    def send_otp(self, session_token: str) -> dict[str, Any]:
        return self._http.post("/verify/otp/send", {"session_token": session_token})

    def confirm_otp(self, session_token: str, code: str) -> dict[str, Any]:
        return self._http.post("/verify/otp/confirm", {"session_token": session_token, "code": code})

    def upload_id(
        self,
        session_token: str,
        front: bytes | BinaryIO | Path,
        back: bytes | BinaryIO | Path | None = None,
    ) -> dict[str, Any]:
        files = {"front": _to_bytes(front)}
        if back is not None:
            files["back"] = _to_bytes(back)
        return self._http.post_files("/verify/id/upload", files=files, data={"session_token": session_token})

    def submit_face(self, session_token: str, selfie: bytes | BinaryIO | Path) -> dict[str, Any]:
        return self._http.post_files(
            "/verify/face/submit",
            files={"selfie": _to_bytes(selfie)},
            data={"session_token": session_token},
        )

    def start_liveness(self, session_token: str, *, consent: bool, flash: bool = False) -> dict[str, Any]:
        """Start a live face scan. `consent` must be True (user agreed to biometric capture).
        Returns liveness_id and the random challenge sequence the user must perform.

        `flash=True` opts in to the screen-light check (stronger against replays): the response then carries a
        `flash` plan (colours, lead_ms, hold_ms) your UI must show full screen while capturing, and you pass the
        times each colour was really on screen to `complete_liveness(..., flash=...)`."""
        return self._http.post(
            "/verify/face/liveness/start",
            {"session_token": session_token, "consent": consent, **({"flash": True} if flash else {})},
        )

    def complete_liveness(
        self,
        session_token: str,
        liveness_id: str,
        frames: "list[bytes | BinaryIO | Path]",
        timestamps_ms: "list[float]",
        windows: "list[dict[str, float]] | None" = None,
        flash: "dict[str, Any] | None" = None,
    ) -> dict[str, Any]:
        """Submit UNMIRRORED JPEG frames (capture order) + one capture-relative ms timestamp per frame.

        `flash` (when the start call returned a plan): {"lead": {"start_ms", "end_ms"}, "windows": [...one per colour]}
        with when each colour was ACTUALLY on screen, or {"skipped": True} if the user opted out."""
        import json

        meta = _compact({"timestamps_ms": timestamps_ms, "windows": windows, "flash": flash})
        return self._http.post_files(
            "/verify/face/liveness/complete",
            files=[("frames", _to_bytes(f)) for f in frames],
            data={"session_token": session_token, "liveness_id": liveness_id, "meta": json.dumps(meta)},
        )

    def get_status(self, session_token: str) -> dict[str, Any]:
        return self._http.get(f"/verify/status/{session_token}")

    # ── Async ───────────────────────────────────────────────────────────────

    async def ainitiate(self, phone: str, **kwargs: Any) -> dict[str, Any]:
        return await self._http.apost("/verify/initiate", _compact({"phone": phone, **kwargs}))

    async def asend_otp(self, session_token: str) -> dict[str, Any]:
        return await self._http.apost("/verify/otp/send", {"session_token": session_token})

    async def aconfirm_otp(self, session_token: str, code: str) -> dict[str, Any]:
        return await self._http.apost("/verify/otp/confirm", {"session_token": session_token, "code": code})

    async def aupload_id(
        self,
        session_token: str,
        front: bytes | BinaryIO | Path,
        back: bytes | BinaryIO | Path | None = None,
    ) -> dict[str, Any]:
        files = {"front": _to_bytes(front)}
        if back is not None:
            files["back"] = _to_bytes(back)
        return await self._http.apost_files("/verify/id/upload", files=files, data={"session_token": session_token})

    async def asubmit_face(self, session_token: str, selfie: bytes | BinaryIO | Path) -> dict[str, Any]:
        return await self._http.apost_files(
            "/verify/face/submit",
            files={"selfie": _to_bytes(selfie)},
            data={"session_token": session_token},
        )

    async def aget_status(self, session_token: str) -> dict[str, Any]:
        return await self._http.aget(f"/verify/status/{session_token}")


def _compact(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}


def _to_bytes(src: bytes | BinaryIO | Path) -> bytes:
    if isinstance(src, bytes):
        return src
    if isinstance(src, Path):
        return src.read_bytes()
    return src.read()
