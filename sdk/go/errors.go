package afriverify

import "fmt"

// ApiError is returned when the AfriVerify API responds with a non-2xx status.
type ApiError struct {
	StatusCode int
	Code       string
	Message    string
	RequestID  string
}

func (e *ApiError) Error() string {
	if e.RequestID != "" {
		return fmt.Sprintf("afriverify: %s (status=%d code=%s request_id=%s)",
			e.Message, e.StatusCode, e.Code, e.RequestID)
	}
	return fmt.Sprintf("afriverify: %s (status=%d code=%s)", e.Message, e.StatusCode, e.Code)
}

// WebhookSignatureError is returned when a webhook signature fails verification.
type WebhookSignatureError struct {
	msg string
}

func (e *WebhookSignatureError) Error() string {
	if e.msg != "" {
		return "afriverify: webhook signature error: " + e.msg
	}
	return "afriverify: webhook signature mismatch"
}
