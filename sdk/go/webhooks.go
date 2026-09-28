package afriverify

import (
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
)

// WebhooksService verifies and parses incoming AfriVerify webhook payloads.
type WebhooksService struct{}

// ConstructEvent verifies the HMAC-SHA512 signature and returns the parsed event.
//
//   - payload   is the raw request body — do NOT json.Unmarshal it first.
//   - signature is the X-VerifyAfrica-Signature header value.
//   - secret    is your webhook signing secret from the AfriVerify dashboard.
//
// The returned *WebhookEvent has its Raw field set to the original payload for
// callers that want to unmarshal into a concrete event type.
func (s *WebhooksService) ConstructEvent(payload []byte, signature, secret string) (*WebhookEvent, error) {
	if err := s.VerifySignature(payload, signature, secret); err != nil {
		return nil, err
	}
	var ev WebhookEvent
	if err := json.Unmarshal(payload, &ev); err != nil {
		return nil, fmt.Errorf("afriverify: decode webhook: %w", err)
	}
	ev.Raw = json.RawMessage(payload)
	return &ev, nil
}

// VerifySignature checks the HMAC-SHA512 signature without parsing the payload.
// Returns *WebhookSignatureError if the signature is missing, malformed, or wrong.
func (s *WebhooksService) VerifySignature(payload []byte, signature, secret string) error {
	parts := strings.SplitN(signature, "=", 2)
	if len(parts) != 2 || parts[0] != "sha512" {
		return &WebhookSignatureError{msg: `expected "sha512=<hex>"`}
	}
	received, err := hex.DecodeString(parts[1])
	if err != nil {
		return &WebhookSignatureError{msg: "signature is not valid hex"}
	}
	mac := hmac.New(sha512.New, []byte(secret))
	mac.Write(payload)
	expected := mac.Sum(nil)
	if !hmac.Equal(received, expected) {
		return &WebhookSignatureError{}
	}
	return nil
}
