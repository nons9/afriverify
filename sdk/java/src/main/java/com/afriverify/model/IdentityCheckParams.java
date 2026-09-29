package com.afriverify.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class IdentityCheckParams {
    @JsonProperty("phone") public String phone;
    @JsonProperty("country") public String country;
    @JsonProperty("id_type") public String idType;
    @JsonProperty("id_number") public String idNumber;

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final IdentityCheckParams p = new IdentityCheckParams();
        public Builder phone(String v) { p.phone = v; return this; }
        public Builder country(String v) { p.country = v; return this; }
        public Builder idType(String v) { p.idType = v; return this; }
        public Builder idNumber(String v) { p.idNumber = v; return this; }
        public IdentityCheckParams build() { return p; }
    }
}
