# afriverify

Official Python SDK for the [AfriVerify](https://afriverify.sankofaapp.com) identity verification platform.

## Installation

```bash
pip install afriverify
```

Python 3.8+ required. [`httpx`](https://www.python-httpx.org/) is the only runtime dependency.

## Quick start

```python
from afriverify import AfriVerify

client = AfriVerify(api_key="sk_live_...")

# Start a verification session
session = client.verify.initiate(reference="user_123", country="GH",
                                  redirect_url="https://yourapp.com/verified")
print(session["session_id"], session["verification_url"])
```

### Async

Every method has an `a`-prefixed async twin:

```python
import asyncio
from afriverify import AfriVerify

client = AfriVerify(api_key="sk_live_...")

async def main():
    session = await client.verify.ainitiate(reference="user_123", country="NG")
    print(session["session_id"])

asyncio.run(main())
```

## Verification flow

```python
# 1 — initiate
session = client.verify.initiate(reference="user_123", country="NG")
session_id = session["session_id"]

# 2 — send OTP
client.verify.send_otp(session_id=session_id, channel="sms", phone="+2348012345678")

# 3 — confirm OTP
client.verify.confirm_otp(session_id=session_id, otp="123456")

# 4 — upload ID document (bytes, file-like, or pathlib.Path)
from pathlib import Path
client.verify.upload_id(session_id=session_id,
                        document_type="national_id",
                        front=Path("id_front.jpg"))

# 5 — submit face / selfie
client.verify.submit_face(session_id=session_id, image=Path("selfie.jpg"))

# 6 — poll status
status = client.verify.get_status(session_id)
print(status["status"])  # "completed"
```

## Identity lookup

```python
profile = client.identity.check(reference="user_123")
print(profile["trust_score"], profile["verification_level"])

# Connect a verified identity to your platform
client.identity.connect(identity_id=profile["identity_id"],
                         platform_user_id="user_123")
```

## Webhooks

Verify the HMAC-SHA512 signature and parse the event in one call:

```python
from afriverify import AfriVerify
from afriverify.errors import WebhookSignatureError

client = AfriVerify(api_key="sk_live_...")

# Flask example
@app.route("/webhooks/afriverify", methods=["POST"])
def webhook():
    try:
        event = client.webhooks.construct_event(
            payload=request.get_data(),
            signature=request.headers["X-VerifyAfrica-Signature"],
            secret=os.environ["AFRIVERIFY_WEBHOOK_SECRET"],
        )
    except WebhookSignatureError:
        return "Invalid signature", 400

    if event["event"] == "verification.completed":
        print("Verified:", event["data"]["identity_id"])
    elif event["event"] == "trust_score.updated":
        print("New score:", event["data"]["trust_score"])

    return "", 200
```

## Configuration

| Option | Description | Default |
|---|---|---|
| `api_key` | Your AfriVerify API key (required) | — |
| `base_url` | Override the API base URL | `https://api.afriverify.sankofaapp.com/v1` |
| `timeout` | Request timeout in seconds | `30.0` |

```python
client = AfriVerify(
    api_key=os.environ["AFRIVERIFY_API_KEY"],
    base_url="https://sandbox.afriverify.sankofaapp.com/v1",  # sandbox
    timeout=10.0,
)
```

## Error handling

```python
from afriverify.errors import ApiError, WebhookSignatureError

try:
    session = client.verify.initiate(reference="x", country="GH")
except ApiError as e:
    print(e.status, e.code, e.message)
```

## License

MIT
