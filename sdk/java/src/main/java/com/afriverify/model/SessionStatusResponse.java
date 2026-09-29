package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = true)
public class SessionStatusResponse {
    @JsonProperty("token") public String token;
    @JsonProperty("status") public String status;
    @JsonProperty("reference") public String reference;
    @JsonProperty("phone") public String phone;
    @JsonProperty("country") public String country;
    @JsonProperty("steps") public Map<String, String> steps;
    @JsonProperty("created_at") public String createdAt;
    @JsonProperty("updated_at") public String updatedAt;
    @JsonProperty("metadata") public Map<String, Object> metadata;
}
