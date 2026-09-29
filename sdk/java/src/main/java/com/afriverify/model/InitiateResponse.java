package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class InitiateResponse {
    @JsonProperty("token") public String token;
    @JsonProperty("status") public String status;
    @JsonProperty("reference") public String reference;
    @JsonProperty("redirect_url") public String redirectUrl;
    @JsonProperty("expires_at") public String expiresAt;
}
