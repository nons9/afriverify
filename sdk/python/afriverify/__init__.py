from __future__ import annotations

from ._http import HttpClient, DEFAULT_BASE_URL
from .resources import VerifyResource, IdentityResource, WebhooksResource
from .errors import AfriVerifyError, ApiError, WebhookSignatureError, ConfigurationError
from . import types

__version__ = "0.1.0"
__all__ = [
    "AfriVerify",
    "AfriVerifyError", "ApiError", "WebhookSignatureError", "ConfigurationError",
    "types",
]


class AfriVerify:
    """
    AfriVerify Python SDK client.

    Usage::

        client = AfriVerify(api_key="avk_live_...")

        # Sync
        session = client.verify.initiate(phone="+2348012345678")

        # Async
        session = await client.verify.ainitiate(phone="+2348012345678")
    """

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
    ) -> None:
        http = HttpClient(api_key=api_key, base_url=base_url, timeout=timeout)
        self.verify   = VerifyResource(http)
        self.identity = IdentityResource(http)
        self.webhooks = WebhooksResource()
