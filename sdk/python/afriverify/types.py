from __future__ import annotations

from typing import Any, Dict, Literal, Optional, Union
from typing import TypedDict


# ---------------------------------------------------------------------------
# Verification flow
# ---------------------------------------------------------------------------

class InitiateParams(TypedDict, total=False):
    reference: str          # required
    country: str            # required — ISO 3166-1 alpha-2
    redirect_url: str
    metadata: dict[str, Any]


class InitiateResponse(TypedDict):
    session_id: str
    verification_url: str
    expires_at: str


OtpChannel = Literal["sms", "whatsapp", "email"]

SessionStatus = Literal[
    "pending",
    "otp_sent",
    "otp_confirmed",
    "id_submitted",
    "face_submitted",
    "processing",
    "completed",
    "failed",
    "expired",
]


class SessionStatusResponse(TypedDict):
    session_id: str
    reference: str
    status: SessionStatus
    identity_id: Optional[str]
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------

VerificationLevel = Literal["none", "basic", "standard", "full"]

FlagReason = Literal["fraud", "synthetic", "duplicate", "sanctioned", "other"]


class IdentityProfile(TypedDict):
    identity_id: str
    reference: str
    trust_score: float
    verification_level: VerificationLevel
    country: str
    flagged: bool
    flag_reason: Optional[FlagReason]
    created_at: str
    updated_at: str


class VouchRecord(TypedDict):
    voucher_identity_id: str
    created_at: str


# ---------------------------------------------------------------------------
# Webhook events
# ---------------------------------------------------------------------------

class VerificationCompletedData(TypedDict):
    session_id: str
    identity_id: str
    reference: str
    country: str
    verification_level: VerificationLevel


class VerificationFailedData(TypedDict):
    session_id: str
    reference: str
    reason: str


class TrustScoreUpdatedData(TypedDict):
    identity_id: str
    reference: str
    trust_score: float
    previous_trust_score: float


class IdentityFlaggedData(TypedDict):
    identity_id: str
    reference: str
    flag_reason: FlagReason


class VerificationCompletedEvent(TypedDict):
    event: Literal["verification.completed"]
    data: VerificationCompletedData
    created_at: str


class VerificationFailedEvent(TypedDict):
    event: Literal["verification.failed"]
    data: VerificationFailedData
    created_at: str


class TrustScoreUpdatedEvent(TypedDict):
    event: Literal["trust_score.updated"]
    data: TrustScoreUpdatedData
    created_at: str


class IdentityFlaggedEvent(TypedDict):
    event: Literal["identity.flagged"]
    data: IdentityFlaggedData
    created_at: str


WebhookEvent = Union[
    VerificationCompletedEvent,
    VerificationFailedEvent,
    TrustScoreUpdatedEvent,
    IdentityFlaggedEvent,
]
