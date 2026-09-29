package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class InitiateParams {
    @JsonProperty("phone") public String phone;
    @JsonProperty("otp_channel") public String otpChannel;
    @JsonProperty("reference") public String reference;
    @JsonProperty("country") public String country;
    @JsonProperty("redirect_url") public String redirectUrl;
    @JsonProperty("metadata") public Map<String, Object> metadata;

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final InitiateParams p = new InitiateParams();
        public Builder phone(String v) { p.phone = v; return this; }
        public Builder otpChannel(String v) { p.otpChannel = v; return this; }
        public Builder reference(String v) { p.reference = v; return this; }
        public Builder country(String v) { p.country = v; return this; }
        public Builder redirectUrl(String v) { p.redirectUrl = v; return this; }
        public Builder metadata(Map<String, Object> v) { p.metadata = v; return this; }
        public InitiateParams build() { return p; }
    }
}
