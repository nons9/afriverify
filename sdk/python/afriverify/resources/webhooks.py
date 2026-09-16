from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

from ..errors import WebhookSignatureError


class WebhooksResource:
    def construct_event(
        self,
        payload: str | bytes,
        signature: str,
        secret: str,
    ) -> dict[str, Any]:
        """
        Verify an incoming webhook and return the parsed event dict.

        ``payload``   — the raw request body (do NOT decode/parse first)
        ``signature`` — value of the ``X-VerifyAfrica-Signature`` header
        ``secret``    — your webhook signing secret from the AfriVerify dashboard
        """
        self.verify_signature(payload, signature, secret)
        body = payload if isinstance(payload, str) else payload.decode("utf-8")
        return json.loads(body)

    def verify_signature(self, payload: str | bytes, signature: str, secret: str) -> None:
        """
        Raises ``WebhookSignatureError`` if the signature is invalid.
        """
        if isinstance(payload, str):
            payload = payload.encode("utf-8")

        parts = signature.split("=", 1)
        if len(parts) != 2 or parts[0] != "sha512":
            raise WebhookSignatureError("Unexpected signature format — expected 'sha512=<hex>'")

        received = parts[1]
        expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha512).hexdigest()

        if not hmac.compare_digest(received, expected):
            raise WebhookSignatureError()
