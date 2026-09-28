package afriverify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
)

type httpClient struct {
	apiKey  string
	baseURL string
	hc      *http.Client
}

func (c *httpClient) get(ctx context.Context, path string, out any) error {
	return c.doURL(ctx, http.MethodGet, c.baseURL+path, nil, "", out)
}

func (c *httpClient) getQuery(ctx context.Context, path string, params map[string]string, out any) error {
	u, err := url.Parse(c.baseURL + path)
	if err != nil {
		return fmt.Errorf("afriverify: parse URL: %w", err)
	}
	q := u.Query()
	for k, v := range params {
		if v != "" {
			q.Set(k, v)
		}
	}
	u.RawQuery = q.Encode()
	return c.doURL(ctx, http.MethodGet, u.String(), nil, "", out)
}

func (c *httpClient) post(ctx context.Context, path string, body, out any) error {
	b, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("afriverify: marshal: %w", err)
	}
	return c.doURL(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(b), "application/json", out)
}

type namedReader struct {
	r        io.Reader
	filename string
}

func (c *httpClient) postMultipart(ctx context.Context, path string, fields map[string]string, files map[string]namedReader, out any) error {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	for k, v := range fields {
		if err := mw.WriteField(k, v); err != nil {
			return fmt.Errorf("afriverify: multipart field: %w", err)
		}
	}
	for field, nr := range files {
		part, err := mw.CreateFormFile(field, nr.filename)
		if err != nil {
			return fmt.Errorf("afriverify: multipart file: %w", err)
		}
		if _, err = io.Copy(part, nr.r); err != nil {
			return fmt.Errorf("afriverify: multipart copy: %w", err)
		}
	}
	if err := mw.Close(); err != nil {
		return fmt.Errorf("afriverify: multipart close: %w", err)
	}
	return c.doURL(ctx, http.MethodPost, c.baseURL+path, &buf, mw.FormDataContentType(), out)
}

func (c *httpClient) doURL(ctx context.Context, method, fullURL string, body io.Reader, contentType string, out any) error {
	req, err := http.NewRequestWithContext(ctx, method, fullURL, body)
	if err != nil {
		return fmt.Errorf("afriverify: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("User-Agent", sdkUserAgent)
	req.Header.Set("Accept", "application/json")
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}

	res, err := c.hc.Do(req)
	if err != nil {
		return fmt.Errorf("afriverify: request: %w", err)
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return fmt.Errorf("afriverify: read body: %w", err)
	}

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		var errBody struct {
			Error   string `json:"error"`
			Message string `json:"message"`
		}
		_ = json.Unmarshal(raw, &errBody)
		if errBody.Message == "" {
			errBody.Message = res.Status
		}
		if errBody.Error == "" {
			errBody.Error = "api_error"
		}
		return &ApiError{
			StatusCode: res.StatusCode,
			Code:       errBody.Error,
			Message:    errBody.Message,
			RequestID:  res.Header.Get("X-Request-Id"),
		}
	}

	if out != nil {
		if err = json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("afriverify: decode response: %w", err)
		}
	}
	return nil
}
