from __future__ import annotations

from typing import Any


class IdentityResource:
    def __init__(self, http: Any) -> None:
        self._http = http

    # ── Sync ────────────────────────────────────────────────────────────────

    def check(
        self,
        *,
        phone: str | None = None,
        email: str | None = None,
        identity_id: str | None = None,
    ) -> dict[str, Any]:
        return self._http.get("/identity/check", _compact({"phone": phone, "email": email, "identity_id": identity_id}))

    def connect(self, session_token: str, platform_user_id: str) -> dict[str, Any]:
        return self._http.post("/identity/connect", {"session_token": session_token, "platform_user_id": platform_user_id})

    def get_profile(self, identity_id: str) -> dict[str, Any]:
        return self._http.get(f"/identity/profile/{identity_id}")

    def flag(self, identity_id: str, reason: str, severity: str = "medium") -> dict[str, Any]:
        return self._http.post("/identity/flag", {"identity_id": identity_id, "reason": reason, "severity": severity})

    def vouch(self, identity_id: str, note: str | None = None) -> dict[str, Any]:
        return self._http.post("/identity/vouch", _compact({"identity_id": identity_id, "note": note}))

    def get_vouches(self, identity_id: str) -> dict[str, Any]:
        return self._http.get(f"/identity/vouches/{identity_id}")

    # ── Async ───────────────────────────────────────────────────────────────

    async def acheck(self, **kwargs: Any) -> dict[str, Any]:
        return await self._http.aget("/identity/check", _compact(kwargs))

    async def aconnect(self, session_token: str, platform_user_id: str) -> dict[str, Any]:
        return await self._http.apost("/identity/connect", {"session_token": session_token, "platform_user_id": platform_user_id})

    async def aget_profile(self, identity_id: str) -> dict[str, Any]:
        return await self._http.aget(f"/identity/profile/{identity_id}")

    async def aflag(self, identity_id: str, reason: str, severity: str = "medium") -> dict[str, Any]:
        return await self._http.apost("/identity/flag", {"identity_id": identity_id, "reason": reason, "severity": severity})

    async def avouch(self, identity_id: str, note: str | None = None) -> dict[str, Any]:
        return await self._http.apost("/identity/vouch", _compact({"identity_id": identity_id, "note": note}))

    async def aget_vouches(self, identity_id: str) -> dict[str, Any]:
        return await self._http.aget(f"/identity/vouches/{identity_id}")


def _compact(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}
