package com.afriverify.resource;

import com.afriverify.exception.WebhookSignatureException;
import com.afriverify.model.WebhookEvent;
import com.fasterxml.jackson.databind.ObjectMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public class WebhooksResource {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String HMAC_ALGORITHM = "HmacSHA512";

    private final String secret;

    public WebhooksResource(String secret) {
        this.secret = secret;
    }

    /**
     * Verifies the X-VerifyAfrica-Signature header and parses the event body.
     *
     * @param payload   raw request body bytes
     * @param signature value of the X-VerifyAfrica-Signature header (e.g. "sha512=abc...")
     * @return parsed WebhookEvent
     * @throws WebhookSignatureException if the signature is missing, malformed, or does not match
     */
    public WebhookEvent constructEvent(byte[] payload, String signature) {
        if (signature == null || !signature.startsWith("sha512=")) {
            throw new WebhookSignatureException("Missing or malformed X-VerifyAfrica-Signature header");
        }
        String provided = signature.substring(7);
        String computed = hmacHex(payload);
        if (!MessageDigest.isEqual(
                provided.getBytes(StandardCharsets.UTF_8),
                computed.getBytes(StandardCharsets.UTF_8))) {
            throw new WebhookSignatureException("Webhook signature verification failed");
        }
        try {
            return MAPPER.readValue(payload, WebhookEvent.class);
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse webhook payload", e);
        }
    }

    private String hmacHex(byte[] data) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            byte[] raw = mac.doFinal(data);
            StringBuilder sb = new StringBuilder(raw.length * 2);
            for (byte b : raw) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new RuntimeException("HMAC-SHA512 unavailable", e);
        }
    }
}
