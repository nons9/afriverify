package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class ConfirmOtpResponse {
    @JsonProperty("status") public String status;
    @JsonProperty("verified") public Boolean verified;
    @JsonProperty("message") public String message;
}
