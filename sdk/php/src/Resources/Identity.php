<?php

declare(strict_types=1);

namespace AfriVerify\Resources;

use AfriVerify\HttpClient;

class Identity
{
    public function __construct(private readonly HttpClient $http) {}

    /** @return array<string, mixed> */
    public function check(?string $phone = null, ?string $email = null, ?string $identityId = null): array
    {
        return $this->http->get('/identity/check', array_filter([
            'phone'       => $phone,
            'email'       => $email,
            'identity_id' => $identityId,
        ], fn($v) => $v !== null));
    }

    /** @return array<string, mixed> */
    public function connect(string $sessionToken, string $platformUserId): array
    {
        return $this->http->post('/identity/connect', [
            'session_token'    => $sessionToken,
            'platform_user_id' => $platformUserId,
        ]);
    }

    /** @return array<string, mixed> */
    public function getProfile(string $identityId): array
    {
        return $this->http->get("/identity/profile/{$identityId}");
    }

    /** @return array<string, mixed> */
    public function flag(string $identityId, string $reason, string $severity = 'medium'): array
    {
        return $this->http->post('/identity/flag', [
            'identity_id' => $identityId,
            'reason'      => $reason,
            'severity'    => $severity,
        ]);
    }

    /** @return array<string, mixed> */
    public function vouch(string $identityId, ?string $note = null): array
    {
        return $this->http->post('/identity/vouch', array_filter([
            'identity_id' => $identityId,
            'note'        => $note,
        ], fn($v) => $v !== null));
    }

    /** @return array<string, mixed> */
    public function getVouches(string $identityId): array
    {
        return $this->http->get("/identity/vouches/{$identityId}");
    }
}
