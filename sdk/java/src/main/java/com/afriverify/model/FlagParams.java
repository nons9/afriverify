package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class FlagParams {
    @JsonProperty("identity_id") public String identityId;
    @JsonProperty("reason") public String reason;
    @JsonProperty("category") public String category;

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final FlagParams p = new FlagParams();
        public Builder identityId(String v) { p.identityId = v; return this; }
        public Builder reason(String v) { p.reason = v; return this; }
        public Builder category(String v) { p.category = v; return this; }
        public FlagParams build() { return p; }
    }
}
