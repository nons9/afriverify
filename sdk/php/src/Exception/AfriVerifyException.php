<?php

declare(strict_types=1);

namespace AfriVerify\Exception;

class AfriVerifyException extends \RuntimeException {}

class ApiException extends AfriVerifyException
{
    public function __construct(
        public readonly int $statusCode,
        public readonly string $errorCode,
        string $message,
        public readonly ?string $requestId = null,
    ) {
        parent::__construct($message, $statusCode);
    }
}

class WebhookSignatureException extends AfriVerifyException
{
    public function __construct(string $message = 'Webhook signature verification failed')
    {
        parent::__construct($message);
    }
}

class ConfigurationException extends AfriVerifyException {}
