from __future__ import annotations

from typing import Any

import httpx

from .errors import ApiError, ConfigurationError

DEFAULT_BASE_URL = "https://api.afriverify.sankofaapp.com/v1"
SDK_USER_AGENT   = "afriverify-python/0.1.0"


class HttpClient:
    def __init__(self, api_key: str, base_url: str, timeout: float) -> None:
        if not api_key:
            raise ConfigurationError("api_key is required")
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "X-SDK": SDK_USER_AGENT,
        }
        self._base_url = base_url.rstrip("/")
        self._timeout  = timeout

    # ── Sync ────────────────────────────────────────────────────────────────

    def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        with httpx.Client(timeout=self._timeout) as client:
            res = client.get(self._url(path), params=params, headers=self._headers)
        return self._parse(res)

    def post(self, path: str, json: Any) -> Any:
        with httpx.Client(timeout=self._timeout) as client:
            res = client.post(self._url(path), json=json, headers=self._headers)
        return self._parse(res)

    def post_files(self, path: str, files: dict[str, Any], data: dict[str, Any]) -> Any:
        with httpx.Client(timeout=self._timeout) as client:
            res = client.post(self._url(path), files=files, data=data, headers=self._headers)
        return self._parse(res)

    # ── Async ───────────────────────────────────────────────────────────────

    async def aget(self, path: str, params: dict[str, Any] | None = None) -> Any:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.get(self._url(path), params=params, headers=self._headers)
        return self._parse(res)

    async def apost(self, path: str, json: Any) -> Any:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(self._url(path), json=json, headers=self._headers)
        return self._parse(res)

    async def apost_files(self, path: str, files: dict[str, Any], data: dict[str, Any]) -> Any:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(self._url(path), files=files, data=data, headers=self._headers)
        return self._parse(res)

    # ── Internal ────────────────────────────────────────────────────────────

    def _url(self, path: str) -> str:
        return f"{self._base_url}{path}"

    @staticmethod
    def _parse(res: httpx.Response) -> Any:
        request_id = res.headers.get("x-request-id")
        try:
            body = res.json()
        except Exception:
            raise ApiError(res.status_code, "parse_error", res.text[:200])

        if not res.is_success:
            raise ApiError(
                res.status_code,
                body.get("error", "api_error"),
                body.get("message", res.reason_phrase or "Unknown error"),
                request_id,
            )
        return body
