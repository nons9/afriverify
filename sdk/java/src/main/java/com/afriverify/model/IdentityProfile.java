package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = true)
public class IdentityProfile {
    @JsonProperty("identity_id") public String identityId;
    @JsonProperty("status") public String status;
    @JsonProperty("verified") public Boolean verified;
    @JsonProperty("phone") public String phone;
    @JsonProperty("country") public String country;
    @JsonProperty("name") public String name;
    @JsonProperty("trust_score") public Integer trustScore;
    @JsonProperty("flags") public List<String> flags;
    @JsonProperty("vouches") public Integer vouches;
    @JsonProperty("metadata") public Map<String, Object> metadata;
    @JsonProperty("created_at") public String createdAt;
    @JsonProperty("updated_at") public String updatedAt;
}
