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
        bool    $requireLiveness = false,
    ): array {
        return $this->http->post('/verify/initiate', array_filter([
            'phone'            => $phone,
            'email'            => $email,
            'otp_channel'      => $otpChannel,
            'platform_user_id' => $platformUserId,
            'redirect_url'     => $redirectUrl,
            'flow_id'          => $flowId,
            'lang'             => $lang,
            'require_liveness' => $requireLiveness ?: null,
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

    /**
     * Start a live face scan. The server returns a random challenge sequence
     * (turn / blink / smile) the user must perform in front of a live camera.
     * `$consent` must be true: the user has agreed to biometric capture.
     *
     * @return array<string, mixed> liveness_id, challenges[], attempt, max_attempts, capture{}
     */
    public function startLiveness(string $sessionToken, bool $consent): array
    {
        return $this->http->post('/verify/face/liveness/start', [
            'session_token' => $sessionToken,
            'consent'       => $consent,
        ]);
    }

    /**
     * Submit the frames captured while the user performed the challenges.
     * Frames must be UNMIRRORED JPEGs straight from the camera, in capture order;
     * `$timestampsMs` has one capture-relative millisecond timestamp per frame.
     * `$windows` (optional) is [['start_ms' => .., 'end_ms' => ..], ...], one per challenge.
     *
     * @param  list<string> $framePaths
     * @param  list<int|float> $timestampsMs
     * @param  list<array{start_ms: int|float, end_ms: int|float}>|null $windows
     * @return array<string, mixed> decision (approved|retry|rejected|manual_review), liveness{}, attempts_remaining
     */
    public function completeLiveness(
        string $sessionToken,
        string $livenessId,
        array  $framePaths,
        array  $timestampsMs,
        ?array $windows = null,
    ): array {
        $parts = [
            ['name' => 'session_token', 'contents' => $sessionToken],
            ['name' => 'liveness_id',   'contents' => $livenessId],
            ['name' => 'meta', 'contents' => json_encode(
                array_filter(['timestamps_ms' => $timestampsMs, 'windows' => $windows], fn($v) => $v !== null),
                JSON_THROW_ON_ERROR
            )],
        ];
        foreach (array_values($framePaths) as $i => $path) {
            $parts[] = ['name' => 'frames', 'contents' => fopen($path, 'r'), 'filename' => "f{$i}.jpg"];
        }
        return $this->http->postMultipart('/verify/face/liveness/complete', $parts);
    }

    /** Optional: attach a webm/mp4 recording of the capture (within 10 min of completeLiveness). @return array<string, mixed> */
    public function uploadLivenessVideo(string $sessionToken, string $livenessId, string $videoPath): array
    {
        return $this->http->postMultipart('/verify/face/liveness/video', [
            ['name' => 'session_token', 'contents' => $sessionToken],
            ['name' => 'liveness_id',   'contents' => $livenessId],
            ['name' => 'video', 'contents' => fopen($videoPath, 'r'), 'filename' => 'capture.webm', 'headers' => ['Content-Type' => 'video/webm']],
        ]);
    }

    /** @return array<string, mixed> */
    public function getStatus(string $sessionToken): array
    {
        return $this->http->get("/verify/status/{$sessionToken}");
    }
}
