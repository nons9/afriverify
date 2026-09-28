# afriverify-go

Official Go SDK for the [AfriVerify](https://afriverify.sankofaapp.com) identity verification platform.

## Installation

```bash
go get github.com/nons9/afriverify/sdk/go
```

Go 1.21+ required. No external dependencies — pure standard library.

## Quick start

```go
import afriverify "github.com/nons9/afriverify/sdk/go"

client := afriverify.New("sk_live_...")

session, err := client.Verify.Initiate(ctx, afriverify.InitiateParams{
    Phone: "+2348012345678",
})
if err != nil {
    log.Fatal(err)
}
fmt.Println(session.SessionToken)
```

## Verification flow

```go
ctx := context.Background()

// 1 — initiate
session, _ := client.Verify.Initiate(ctx, afriverify.InitiateParams{
    Phone:      "+2348012345678",
    OtpChannel: "sms",
})
token := session.SessionToken

// 2 — send OTP
client.Verify.SendOtp(ctx, afriverify.SendOtpParams{SessionToken: token})

// 3 — confirm OTP
client.Verify.ConfirmOtp(ctx, afriverify.ConfirmOtpParams{SessionToken: token, Code: "123456"})

// 4 — upload ID document (any io.Reader)
front, _ := os.Open("id_front.jpg")
defer front.Close()
client.Verify.UploadID(ctx, token, front, nil)

// 5 — submit selfie
selfie, _ := os.Open("selfie.jpg")
defer selfie.Close()
client.Verify.SubmitFace(ctx, token, selfie)

// 6 — poll status
status, _ := client.Verify.GetStatus(ctx, token)
fmt.Println(status.Status) // "completed"
```

## Identity lookup

```go
result, err := client.Identity.Check(ctx, afriverify.IdentityCheckParams{
    Phone: "+2348012345678",
})
fmt.Println(result.TrustScore, result.IdentityID)

// Connect a verified identity to your platform user
client.Identity.Connect(ctx, afriverify.ConnectParams{
    SessionToken:   token,
    PlatformUserID: "user_123",
})
```

## Webhooks

```go
// net/http handler example
http.HandleFunc("/webhooks/afriverify", func(w http.ResponseWriter, r *http.Request) {
    body, _ := io.ReadAll(r.Body)

    event, err := client.Webhooks.ConstructEvent(
        body,
        r.Header.Get("X-VerifyAfrica-Signature"),
        os.Getenv("AFRIVERIFY_WEBHOOK_SECRET"),
    )
    if err != nil {
        http.Error(w, "invalid signature", http.StatusBadRequest)
        return
    }

    switch event.Event {
    case "verification.completed":
        var e afriverify.VerificationCompletedEvent
        json.Unmarshal(event.Raw, &e)
        fmt.Println("verified:", e.IdentityID, "score:", e.TrustScore)
    case "trust.score_updated":
        var e afriverify.TrustScoreUpdatedEvent
        json.Unmarshal(event.Raw, &e)
        fmt.Println("new score:", e.TrustScore)
    }

    w.WriteHeader(http.StatusOK)
})
```

## Configuration

```go
client := afriverify.New(
    os.Getenv("AFRIVERIFY_API_KEY"),
    afriverify.WithBaseURL("https://sandbox.afriverify.sankofaapp.com/v1"),
    afriverify.WithTimeout(10*time.Second),
)
```

| Option | Default |
|---|---|
| `WithBaseURL(u string)` | `https://api.afriverify.sankofaapp.com/v1` |
| `WithTimeout(d time.Duration)` | `30s` |
| `WithHTTPClient(*http.Client)` | default client with the configured timeout |

## Error handling

```go
import afriverify "github.com/nons9/afriverify/sdk/go"
import "errors"

_, err := client.Verify.Initiate(ctx, afriverify.InitiateParams{Phone: "+..."})
var apiErr *afriverify.ApiError
if errors.As(err, &apiErr) {
    fmt.Println(apiErr.StatusCode, apiErr.Code, apiErr.Message)
}

var sigErr *afriverify.WebhookSignatureError
if errors.As(err, &sigErr) {
    fmt.Println("bad webhook:", sigErr)
}
```

## License

MIT
