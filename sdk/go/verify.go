package afriverify

import (
	"context"
	"io"
)

// VerifyService handles identity verification sessions.
type VerifyService struct {
	h *httpClient
}

// Initiate starts a new verification session.
func (s *VerifyService) Initiate(ctx context.Context, params InitiateParams) (*InitiateResponse, error) {
	var out InitiateResponse
	return &out, s.h.post(ctx, "/verify/initiate", params, &out)
}

// SendOtp sends an OTP to the user.
func (s *VerifyService) SendOtp(ctx context.Context, params SendOtpParams) (*SendOtpResponse, error) {
	var out SendOtpResponse
	return &out, s.h.post(ctx, "/verify/otp/send", params, &out)
}

// ConfirmOtp verifies the OTP entered by the user.
func (s *VerifyService) ConfirmOtp(ctx context.Context, params ConfirmOtpParams) (*ConfirmOtpResponse, error) {
	var out ConfirmOtpResponse
	return &out, s.h.post(ctx, "/verify/otp/confirm", params, &out)
}

// UploadID uploads identity document images.
// front is required; back is optional (pass nil to omit).
// Both accept any io.Reader (os.File, bytes.Reader, etc.).
func (s *VerifyService) UploadID(ctx context.Context, sessionToken string, front, back io.Reader) (*UploadIDResponse, error) {
	files := map[string]namedReader{
		"front": {r: front, filename: "front.jpg"},
	}
	if back != nil {
		files["back"] = namedReader{r: back, filename: "back.jpg"}
	}
	var out UploadIDResponse
	return &out, s.h.postMultipart(ctx, "/verify/id/upload",
		map[string]string{"session_token": sessionToken}, files, &out)
}

// SubmitFace submits a selfie for liveness / face-match.
func (s *VerifyService) SubmitFace(ctx context.Context, sessionToken string, selfie io.Reader) (*SubmitFaceResponse, error) {
	var out SubmitFaceResponse
	return &out, s.h.postMultipart(ctx, "/verify/face/submit",
		map[string]string{"session_token": sessionToken},
		map[string]namedReader{"selfie": {r: selfie, filename: "selfie.jpg"}},
		&out)
}

// GetStatus returns the current status of a verification session.
func (s *VerifyService) GetStatus(ctx context.Context, sessionToken string) (*SessionStatusResponse, error) {
	var out SessionStatusResponse
	return &out, s.h.get(ctx, "/verify/status/"+sessionToken, &out)
}
