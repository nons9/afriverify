package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class VouchesResponse {
    @JsonProperty("identity_id") public String identityId;
    @JsonProperty("vouches") public List<Vouch> vouches;
    @JsonProperty("total") public Integer total;
}
