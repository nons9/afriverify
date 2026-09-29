package com.afriverify.exception;

public class AfriVerifyException extends RuntimeException {
    public AfriVerifyException(String message) { super(message); }
    public AfriVerifyException(String message, Throwable cause) { super(message, cause); }
}
