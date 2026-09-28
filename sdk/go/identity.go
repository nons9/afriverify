package afriverify

import "context"

// IdentityService handles identity lookup and management.
type IdentityService struct {
	h *httpClient
}

// Check looks up an identity by phone, email, or identity ID.
// At least one field in params must be non-empty.
func (s *IdentityService) Check(ctx context.Context, params IdentityCheckParams) (*IdentityCheckResponse, error) {
	var out IdentityCheckResponse
	return &out, s.h.getQuery(ctx, "/identity/check", map[string]string{
		"phone":       params.Phone,
		"email":       params.Email,
		"identity_id": params.IdentityID,
	}, &out)
}

// Connect links a verified identity to a platform user ID.
func (s *IdentityService) Connect(ctx context.Context, params ConnectParams) (*ConnectResponse, error) {
	var out ConnectResponse
	return &out, s.h.post(ctx, "/identity/connect", params, &out)
}

// GetProfile fetches the full identity profile for the given identity ID.
func (s *IdentityService) GetProfile(ctx context.Context, identityID string) (*IdentityProfile, error) {
	var out IdentityProfile
	return &out, s.h.get(ctx, "/identity/profile/"+identityID, &out)
}

// Flag marks an identity as suspicious.
// params.Severity defaults to "medium" if empty.
func (s *IdentityService) Flag(ctx context.Context, params FlagParams) (*FlagResponse, error) {
	if params.Severity == "" {
		params.Severity = "medium"
	}
	var out FlagResponse
	return &out, s.h.post(ctx, "/identity/flag", params, &out)
}

// Vouch endorses an identity on behalf of your platform.
func (s *IdentityService) Vouch(ctx context.Context, params VouchParams) (*VouchResponse, error) {
	var out VouchResponse
	return &out, s.h.post(ctx, "/identity/vouch", params, &out)
}

// GetVouches returns all vouches associated with the given identity.
func (s *IdentityService) GetVouches(ctx context.Context, identityID string) (*VouchesResponse, error) {
	var out VouchesResponse
	return &out, s.h.get(ctx, "/identity/vouches/"+identityID, &out)
}
