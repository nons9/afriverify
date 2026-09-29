package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class ConnectResponse {
    @JsonProperty("connection_id") public String connectionId;
    @JsonProperty("identity_id") public String identityId;
    @JsonProperty("external_id") public String externalId;
    @JsonProperty("status") public String status;
    @JsonProperty("created_at") public String createdAt;
}
