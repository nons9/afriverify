package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class SendOtpResponse {
    @JsonProperty("status") public String status;
    @JsonProperty("message") public String message;
}
