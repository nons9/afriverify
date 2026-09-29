package com.afriverify.resource;

import com.afriverify.internal.AfriVerifyHttpClient;
import com.afriverify.model.*;

public class IdentityResource {
    private final AfriVerifyHttpClient http;

    public IdentityResource(AfriVerifyHttpClient http) {
        this.http = http;
    }

    public IdentityCheckResponse check(IdentityCheckParams params) {
        return http.get(
                "/identity/check?phone=" + encode(params.phone) +
                        (params.country != null ? "&country=" + encode(params.country) : "") +
                        (params.idType != null ? "&id_type=" + encode(params.idType) : "") +
                        (params.idNumber != null ? "&id_number=" + encode(params.idNumber) : ""),
                IdentityCheckResponse.class);
    }

    public ConnectResponse connect(ConnectParams params) {
        return http.post("/identity/connect", params, ConnectResponse.class);
    }

    public IdentityProfile getProfile(String identityId) {
        return http.get("/identity/profile/" + identityId, IdentityProfile.class);
    }

    public FlagResponse flag(FlagParams params) {
        return http.post("/identity/flag", params, FlagResponse.class);
    }

    public VouchResponse vouch(VouchParams params) {
        return http.post("/identity/vouch", params, VouchResponse.class);
    }

    public VouchesResponse getVouches(String identityId) {
        return http.get("/identity/vouches/" + identityId, VouchesResponse.class);
    }

    private static String encode(String value) {
        if (value == null) return "";
        try {
            return java.net.URLEncoder.encode(value, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            return value;
        }
    }
}
