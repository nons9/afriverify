package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class FlagResponse {
    @JsonProperty("flag_id") public String flagId;
    @JsonProperty("identity_id") public String identityId;
    @JsonProperty("status") public String status;
    @JsonProperty("created_at") public String createdAt;
}
