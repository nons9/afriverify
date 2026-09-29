package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class VouchResponse {
    @JsonProperty("vouch_id") public String vouchId;
    @JsonProperty("identity_id") public String identityId;
    @JsonProperty("voucher_id") public String voucherId;
    @JsonProperty("message") public String message;
    @JsonProperty("created_at") public String createdAt;
}
