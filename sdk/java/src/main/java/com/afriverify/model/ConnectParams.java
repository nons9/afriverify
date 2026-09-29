package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ConnectParams {
    @JsonProperty("identity_id") public String identityId;
    @JsonProperty("external_id") public String externalId;
    @JsonProperty("metadata") public Map<String, Object> metadata;

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final ConnectParams p = new ConnectParams();
        public Builder identityId(String v) { p.identityId = v; return this; }
        public Builder externalId(String v) { p.externalId = v; return this; }
        public Builder metadata(Map<String, Object> v) { p.metadata = v; return this; }
        public ConnectParams build() { return p; }
    }
}
