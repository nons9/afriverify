package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ConfirmOtpParams {
    @JsonProperty("token") public String token;
    @JsonProperty("otp") public String otp;

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final ConfirmOtpParams p = new ConfirmOtpParams();
        public Builder token(String v) { p.token = v; return this; }
        public Builder otp(String v) { p.otp = v; return this; }
        public ConfirmOtpParams build() { return p; }
    }
}
