package com.afriverify;

import com.afriverify.internal.AfriVerifyHttpClient;
import com.afriverify.resource.IdentityResource;
import com.afriverify.resource.VerifyResource;
import com.afriverify.resource.WebhooksResource;

import java.time.Duration;

public class AfriVerify {
    private static final String DEFAULT_BASE_URL = "https://api.afriverify.sankofaapp.com/v1";
    private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(30);

    public final VerifyResource verify;
    public final IdentityResource identity;
    public final WebhooksResource webhooks;

    private AfriVerify(Builder b) {
        AfriVerifyHttpClient http = new AfriVerifyHttpClient(b.baseUrl, b.apiKey, b.timeout);
        this.verify = new VerifyResource(http);
        this.identity = new IdentityResource(http);
        this.webhooks = new WebhooksResource(b.webhookSecret != null ? b.webhookSecret : "");
    }

    public static AfriVerify create(String apiKey) {
        return builder().apiKey(apiKey).build();
    }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private String apiKey;
        private String baseUrl = DEFAULT_BASE_URL;
        private Duration timeout = DEFAULT_TIMEOUT;
        private String webhookSecret;

        public Builder apiKey(String v) { this.apiKey = v; return this; }
        public Builder baseUrl(String v) { this.baseUrl = v; return this; }
        public Builder timeout(Duration v) { this.timeout = v; return this; }
        public Builder webhookSecret(String v) { this.webhookSecret = v; return this; }

        public AfriVerify build() {
            if (apiKey == null || apiKey.isBlank()) {
                throw new IllegalArgumentException("apiKey is required");
            }
            return new AfriVerify(this);
        }
    }
}
