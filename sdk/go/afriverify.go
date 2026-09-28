// Package afriverify is the official Go SDK for the AfriVerify identity
// verification platform.
//
//	client := afriverify.New("sk_live_...")
//	session, err := client.Verify.Initiate(ctx, afriverify.InitiateParams{
//	    Phone: "+2348012345678",
//	})
package afriverify

import (
	"net/http"
	"time"
)

const (
	DefaultBaseURL = "https://api.afriverify.sankofaapp.com/v1"
	sdkUserAgent   = "afriverify-go/0.1.0"
)

// Client is the AfriVerify API client. Create one with New.
type Client struct {
	Verify   *VerifyService
	Identity *IdentityService
	Webhooks *WebhooksService
	h        *httpClient
}

// Option configures a Client.
type Option func(*clientConfig)

type clientConfig struct {
	baseURL    string
	timeout    time.Duration
	httpClient *http.Client
}

// WithBaseURL overrides the default API base URL.
func WithBaseURL(u string) Option {
	return func(c *clientConfig) { c.baseURL = u }
}

// WithTimeout sets the per-request timeout (default 30s).
func WithTimeout(d time.Duration) Option {
	return func(c *clientConfig) { c.timeout = d }
}

// WithHTTPClient replaces the underlying *http.Client.
func WithHTTPClient(hc *http.Client) Option {
	return func(c *clientConfig) { c.httpClient = hc }
}

// New creates a new AfriVerify client.
func New(apiKey string, opts ...Option) *Client {
	cfg := &clientConfig{
		baseURL: DefaultBaseURL,
		timeout: 30 * time.Second,
	}
	for _, o := range opts {
		o(cfg)
	}
	hc := cfg.httpClient
	if hc == nil {
		hc = &http.Client{Timeout: cfg.timeout}
	}
	h := &httpClient{
		apiKey:  apiKey,
		baseURL: cfg.baseURL,
		hc:      hc,
	}
	return &Client{
		Verify:   &VerifyService{h: h},
		Identity: &IdentityService{h: h},
		Webhooks: &WebhooksService{},
		h:        h,
	}
}
