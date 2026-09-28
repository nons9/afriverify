# afriverify-php

Official PHP SDK for the [AfriVerify](https://afriverify.sankofaapp.com) identity verification platform.

## Requirements

- PHP 8.1+
- [Guzzle](https://docs.guzzlephp.org/) 7.x (installed automatically via Composer)

## Installation

```bash
composer require afriverify/afriverify-php
```

## Quick start

```php
use AfriVerify\AfriVerify;

$client = new AfriVerify('sk_live_...');

$session = $client->verify->initiate(['phone' => '+2348012345678']);
echo $session['session_token'];
```

## Verification flow

```php
use AfriVerify\AfriVerify;

$client = new AfriVerify('sk_live_...');

// 1 — initiate
$session = $client->verify->initiate([
    'phone'       => '+2348012345678',
    'otp_channel' => 'sms',
]);
$token = $session['session_token'];

// 2 — send OTP
$client->verify->sendOtp(['session_token' => $token]);

// 3 — confirm OTP
$client->verify->confirmOtp(['session_token' => $token, 'code' => '123456']);

// 4 — upload ID document
$client->verify->uploadId($token, '/path/to/id_front.jpg', '/path/to/id_back.jpg');

// 5 — submit selfie
$client->verify->submitFace($token, '/path/to/selfie.jpg');

// 6 — poll status
$status = $client->verify->getStatus($token);
echo $status['status']; // "completed"
```

## Identity lookup

```php
$result = $client->identity->check(['phone' => '+2348012345678']);
echo $result['trust_score'];
echo $result['identity_id'];

// Connect a verified identity to your platform user
$client->identity->connect([
    'session_token'   => $token,
    'platform_user_id' => 'user_123',
]);
```

## Webhooks

```php
// Laravel / plain PHP handler example
$payload   = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_VERIFYAFRICA_SIGNATURE'] ?? '';

try {
    $event = $client->webhooks->constructEvent(
        $payload,
        $signature,
        $_ENV['AFRIVERIFY_WEBHOOK_SECRET']
    );
} catch (\AfriVerify\Exception\WebhookSignatureException $e) {
    http_response_code(400);
    exit('invalid signature');
}

switch ($event['event']) {
    case 'verification.completed':
        echo 'verified: ' . $event['identity_id'] . ' score: ' . $event['trust_score'];
        break;
    case 'trust.score_updated':
        echo 'new score: ' . $event['trust_score'];
        break;
}

http_response_code(200);
```

## Configuration

```php
use AfriVerify\AfriVerify;

$client = new AfriVerify(
    apiKey:  $_ENV['AFRIVERIFY_API_KEY'],
    baseUrl: 'https://sandbox.afriverify.sankofaapp.com/v1',
    timeout: 10,
);
```

| Parameter | Default |
|---|---|
| `$apiKey` | _(required)_ |
| `$baseUrl` | `https://api.afriverify.sankofaapp.com/v1` |
| `$timeout` | `30` (seconds) |

## Error handling

```php
use AfriVerify\Exception\ApiException;
use AfriVerify\Exception\WebhookSignatureException;

try {
    $session = $client->verify->initiate(['phone' => '+...']);
} catch (ApiException $e) {
    echo $e->getStatusCode();  // HTTP status
    echo $e->getErrorCode();   // AfriVerify error code
    echo $e->getMessage();
    echo $e->getRequestId();   // X-Request-Id from the response
} catch (WebhookSignatureException $e) {
    echo 'bad webhook: ' . $e->getMessage();
}
```

## License

MIT
