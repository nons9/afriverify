<?php

declare(strict_types=1);

namespace AfriVerify\Resources;

use AfriVerify\HttpClient;

class Verify
{
    public function __construct(private readonly HttpClient $http) {}

    /** @return array<string, mixed> */
    public function initiate(
        string  $phone,
        ?string $email           = null,
        string  $otpChannel      = 'sms',
        ?string $platformUserId  = null,
        ?string $redirectUrl     = null,
        ?string $flowId          = null,
        string  $lang            = 'en',
    ): array {
        return $this->http->post('/verify/initiate', array_filter([
            'phone'            => $phone,
            'email'            => $email,
            'otp_channel'      => $otpChannel,
            'platform_user_id' => $platformUserId,
            'redirect_url'     => $redirectUrl,
            'flow_id'          => $flowId,
            'lang'             => $lang,
        ], fn($v) => $v !== null));
    }

    /** @return array<string, mixed> */
    public function sendOtp(string $sessionToken): array
    {
        return $this->http->post('/verify/otp/send', ['session_token' => $sessionToken]);
    }

    /** @return array<string, mixed> */
    public function confirmOtp(string $sessionToken, string $code): array
    {
        return $this->http->post('/verify/otp/confirm', ['session_token' => $sessionToken, 'code' => $code]);
    }

    /** @return array<string, mixed> */
    public function uploadId(string $sessionToken, string $frontPath, ?string $backPath = null): array
    {
        $parts = [
            ['name' => 'session_token', 'contents' => $sessionToken],
            ['name' => 'front', 'contents' => fopen($frontPath, 'r'), 'filename' => 'front.jpg'],
        ];
        if ($backPath !== null) {
            $parts[] = ['name' => 'back', 'contents' => fopen($backPath, 'r'), 'filename' => 'back.jpg'];
        }
        return $this->http->postMultipart('/verify/id/upload', $parts);
    }

    /** @return array<string, mixed> */
    public function submitFace(string $sessionToken, string $selfiePath): array
    {
        return $this->http->postMultipart('/verify/face/submit', [
            ['name' => 'session_token', 'contents' => $sessionToken],
            ['name' => 'selfie', 'contents' => fopen($selfiePath, 'r'), 'filename' => 'selfie.jpg'],
        ]);
    }

    /** @return array<string, mixed> */
    public function getStatus(string $sessionToken): array
    {
        return $this->http->get("/verify/status/{$sessionToken}");
    }
}
