package com.afriverify.exception;

public class ApiException extends AfriVerifyException {
    private final int statusCode;
    private final String errorCode;
    private final String requestId;

    public ApiException(int statusCode, String errorCode, String message, String requestId) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.requestId = requestId;
    }

    public int getStatusCode() { return statusCode; }
    public String getErrorCode() { return errorCode; }
    public String getRequestId() { return requestId; }

    @Override
    public String toString() {
        return "ApiException{statusCode=" + statusCode + ", errorCode='" + errorCode + "', message='" + getMessage() + "', requestId='" + requestId + "'}";
    }
}
