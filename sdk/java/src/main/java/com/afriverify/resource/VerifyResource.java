package com.afriverify.resource;

import com.afriverify.internal.AfriVerifyHttpClient;
import com.afriverify.internal.AfriVerifyHttpClient.MultipartBody;
import com.afriverify.model.*;

import java.io.IOException;
import java.nio.file.Path;

public class VerifyResource {
    private final AfriVerifyHttpClient http;

    public VerifyResource(AfriVerifyHttpClient http) {
        this.http = http;
    }

    public InitiateResponse initiate(InitiateParams params) {
        return http.post("/verify/initiate", params, InitiateResponse.class);
    }

    public SendOtpResponse sendOtp(SendOtpParams params) {
        return http.post("/verify/otp/send", params, SendOtpResponse.class);
    }

    public ConfirmOtpResponse confirmOtp(ConfirmOtpParams params) {
        return http.post("/verify/otp/confirm", params, ConfirmOtpResponse.class);
    }

    public UploadIdResponse uploadId(String token, Path idImage, String idType) throws IOException {
        MultipartBody body = new MultipartBody()
                .addField("token", token)
                .addField("id_type", idType)
                .addFile("id_image", idImage, "image/jpeg");
        return http.postMultipart("/verify/id/upload", body, UploadIdResponse.class);
    }

    public SubmitFaceResponse submitFace(String token, Path selfie) throws IOException {
        MultipartBody body = new MultipartBody()
                .addField("token", token)
                .addFile("selfie", selfie, "image/jpeg");
        return http.postMultipart("/verify/face/submit", body, SubmitFaceResponse.class);
    }

    public SessionStatusResponse getStatus(String token) {
        return http.get("/verify/status/" + token, SessionStatusResponse.class);
    }
}
