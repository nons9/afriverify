package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class SendOtpParams {
    @JsonProperty("token") public String token;
    @JsonProperty("channel") public String channel;

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final SendOtpParams p = new SendOtpParams();
        public Builder token(String v) { p.token = v; return this; }
        public Builder channel(String v) { p.channel = v; return this; }
        public SendOtpParams build() { return p; }
    }
}
