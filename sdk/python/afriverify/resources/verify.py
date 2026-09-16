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
    ) -> dict[str, Any]:
        return self._http.post("/verify/initiate", _compact({
            "phone": phone,
            "email": email,
            "otp_channel": otp_channel,
            "platform_user_id": platform_user_id,
            "redirect_url": redirect_url,
            "flow_id": flow_id,
            "lang": lang,
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
