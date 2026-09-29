# afriverify-java

Official Java SDK for the [AfriVerify](https://afriverify.sankofaapp.com) identity verification platform.

## Requirements

- Java 17+
- Maven 3.6+

## Installation

Add to your `pom.xml`:

```xml
<dependency>
    <groupId>com.afriverify</groupId>
    <artifactId>afriverify-java</artifactId>
    <version>0.1.0</version>
</dependency>
```

## Usage

### Initialize

```java
import com.afriverify.AfriVerify;

AfriVerify client = AfriVerify.create("your_api_key");

// With webhook secret and custom timeout
AfriVerify client = AfriVerify.builder()
    .apiKey("your_api_key")
    .webhookSecret("your_webhook_secret")
    .timeout(Duration.ofSeconds(60))
    .build();
```

### Verification Flow

```java
import com.afriverify.model.*;

// 1. Initiate a session
InitiateResponse session = client.verify.initiate(
    InitiateParams.builder()
        .phone("+2348100000000")
        .otpChannel("sms")
        .country("NG")
        .reference("txn_001")
        .build()
);
String token = session.token;

// 2. Send OTP
client.verify.sendOtp(
    SendOtpParams.builder()
        .token(token)
        .channel("sms")
        .build()
);

// 3. Confirm OTP
ConfirmOtpResponse otp = client.verify.confirmOtp(
    ConfirmOtpParams.builder()
        .token(token)
        .otp("123456")
        .build()
);

// 4. Upload ID document
import java.nio.file.Path;
UploadIdResponse idResult = client.verify.uploadId(token, Path.of("id.jpg"), "passport");

// 5. Submit selfie
SubmitFaceResponse faceResult = client.verify.submitFace(token, Path.of("selfie.jpg"));

// 6. Check status
SessionStatusResponse status = client.verify.getStatus(token);
System.out.println(status.status); // "completed"
```

### Identity Lookup

```java
// Check if identity exists
IdentityCheckResponse check = client.identity.check(
    IdentityCheckParams.builder()
        .phone("+2348100000000")
        .country("NG")
        .build()
);

// Get full profile
IdentityProfile profile = client.identity.getProfile(check.identityId);

// Connect to your user
ConnectResponse conn = client.identity.connect(
    ConnectParams.builder()
        .identityId(check.identityId)
        .externalId("user_123")
        .build()
);

// Flag suspicious identity
client.identity.flag(
    FlagParams.builder()
        .identityId(check.identityId)
        .reason("Suspicious activity")
        .category("fraud")
        .build()
);

// Vouch for an identity
client.identity.vouch(
    VouchParams.builder()
        .identityId(check.identityId)
        .message("Known business partner")
        .build()
);

// List vouches
VouchesResponse vouches = client.identity.getVouches(check.identityId);
```

### Webhooks

```java
import com.afriverify.model.WebhookEvent;
import com.afriverify.exception.WebhookSignatureException;

// In your servlet / Spring controller:
byte[] payload = request.getInputStream().readAllBytes();
String signature = request.getHeader("X-VerifyAfrica-Signature");

try {
    WebhookEvent event = client.webhooks.constructEvent(payload, signature);
    System.out.println(event.event); // e.g. "verification.completed"
} catch (WebhookSignatureException e) {
    // Invalid signature — return 400
}
```

## Error Handling

```java
import com.afriverify.exception.ApiException;
import com.afriverify.exception.WebhookSignatureException;

try {
    InitiateResponse session = client.verify.initiate(params);
} catch (ApiException e) {
    System.out.println(e.getStatusCode());  // HTTP status
    System.out.println(e.getErrorCode());   // AfriVerify error code
    System.out.println(e.getMessage());     // Human-readable message
    System.out.println(e.getRequestId());   // X-Request-Id from response
}
```

## Configuration

| Option | Default | Description |
|---|---|---|
| `apiKey` | (required) | Your AfriVerify API key |
| `webhookSecret` | `""` | Secret for HMAC-SHA512 webhook verification |
| `baseUrl` | `https://api.afriverify.sankofaapp.com/v1` | API base URL |
| `timeout` | `30s` | HTTP connect timeout |

## License

MIT
