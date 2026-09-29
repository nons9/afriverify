package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class VouchParams {
    @JsonProperty("identity_id") public String identityId;
    @JsonProperty("message") public String message;

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final VouchParams p = new VouchParams();
        public Builder identityId(String v) { p.identityId = v; return this; }
        public Builder message(String v) { p.message = v; return this; }
        public VouchParams build() { return p; }
    }
}
