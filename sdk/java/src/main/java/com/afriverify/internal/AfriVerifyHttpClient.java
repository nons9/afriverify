package com.afriverify.internal;

import com.afriverify.exception.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.UUID;

public class AfriVerifyHttpClient {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String USER_AGENT = "afriverify-java/0.1.0";

    private final String baseUrl;
    private final String apiKey;
    private final HttpClient http;

    public AfriVerifyHttpClient(String baseUrl, String apiKey, Duration timeout) {
        this.baseUrl = baseUrl.replaceAll("/$", "");
        this.apiKey = apiKey;
        this.http = HttpClient.newBuilder()
                .connectTimeout(timeout)
                .build();
    }

    public <T> T get(String path, Class<T> responseType) {
        HttpRequest req = baseRequest(path)
                .GET()
                .build();
        return send(req, responseType);
    }

    public <T> T post(String path, Object body, Class<T> responseType) {
        try {
            byte[] json = MAPPER.writeValueAsBytes(body);
            HttpRequest req = baseRequest(path)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(json))
                    .build();
            return send(req, responseType);
        } catch (IOException e) {
            throw new RuntimeException("Failed to serialize request body", e);
        }
    }

    public <T> T postMultipart(String path, MultipartBody multipart, Class<T> responseType) {
        HttpRequest req = baseRequest(path)
                .header("Content-Type", "multipart/form-data; boundary=" + multipart.boundary())
                .POST(HttpRequest.BodyPublishers.ofByteArray(multipart.toBytes()))
                .build();
        return send(req, responseType);
    }

    private HttpRequest.Builder baseRequest(String path) {
        return HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .header("Authorization", "Bearer " + apiKey)
                .header("User-Agent", USER_AGENT)
                .header("Accept", "application/json");
    }

    private <T> T send(HttpRequest req, Class<T> responseType) {
        try {
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            String body = res.body();
            int status = res.statusCode();
            if (status >= 200 && status < 300) {
                return MAPPER.readValue(body, responseType);
            }
            JsonNode err = MAPPER.readTree(body);
            String errorCode = err.path("error_code").asText(null);
            String message = err.path("message").asText("Request failed with status " + status);
            String requestId = res.headers().firstValue("X-Request-Id").orElse(null);
            throw new ApiException(status, errorCode, message, requestId);
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("HTTP request failed", e);
        }
    }

    public static class MultipartBody {
        private final String boundary = UUID.randomUUID().toString().replace("-", "");
        private final ByteArrayOutputStream out = new ByteArrayOutputStream();

        public String boundary() { return boundary; }

        public MultipartBody addField(String name, String value) {
            try {
                String part = "--" + boundary + "\r\n" +
                        "Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" +
                        value + "\r\n";
                out.write(part.getBytes(StandardCharsets.UTF_8));
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
            return this;
        }

        public MultipartBody addFile(String name, String filename, byte[] data, String contentType) {
            try {
                String header = "--" + boundary + "\r\n" +
                        "Content-Disposition: form-data; name=\"" + name + "\"; filename=\"" + filename + "\"\r\n" +
                        "Content-Type: " + contentType + "\r\n\r\n";
                out.write(header.getBytes(StandardCharsets.UTF_8));
                out.write(data);
                out.write("\r\n".getBytes(StandardCharsets.UTF_8));
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
            return this;
        }

        public MultipartBody addFile(String name, Path path, String contentType) throws IOException {
            return addFile(name, path.getFileName().toString(), Files.readAllBytes(path), contentType);
        }

        public byte[] toBytes() {
            try {
                out.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
            return out.toByteArray();
        }
    }
}
