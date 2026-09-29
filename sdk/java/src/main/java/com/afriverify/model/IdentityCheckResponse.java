package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class IdentityCheckResponse {
    @JsonProperty("exists") public Boolean exists;
    @JsonProperty("identity_id") public String identityId;
    @JsonProperty("status") public String status;
    @JsonProperty("verified") public Boolean verified;
}
