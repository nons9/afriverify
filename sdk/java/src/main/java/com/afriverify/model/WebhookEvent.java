package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = true)
public class WebhookEvent {
    @JsonProperty("event") public String event;
    @JsonProperty("data") public Map<String, Object> data;
    @JsonProperty("timestamp") public String timestamp;
    @JsonProperty("request_id") public String requestId;
}
