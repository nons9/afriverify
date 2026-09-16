<?php

declare(strict_types=1);

namespace AfriVerify\Resources;

use AfriVerify\Exception\WebhookSignatureException;

class Webhooks
{
    /**
     * Verify an incoming webhook and return the parsed event array.
     *
     * @param  string $payload   Raw request body — do NOT json_decode first
     * @param  string $signature Value of the X-VerifyAfrica-Signature header
     * @param  string $secret    Your webhook signing secret
     * @return array<string, mixed>
     */
    public function constructEvent(string $payload, string $signature, string $secret): array
    {
        $this->verifySignature($payload, $signature, $secret);
        $data = json_decode($payload, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new WebhookSignatureException('Payload is not valid JSON');
        }
        return $data;
    }

    /**
     * Verify only the signature without parsing the payload.
     * Throws WebhookSignatureException if invalid.
     */
    public function verifySignature(string $payload, string $signature, string $secret): void
    {
        $parts = explode('=', $signature, 2);
        if (count($parts) !== 2 || $parts[0] !== 'sha512') {
            throw new WebhookSignatureException("Unexpected signature format — expected 'sha512=<hex>'");
        }

        $expected = hash_hmac('sha512', $payload, $secret);
        if (!hash_equals($expected, $parts[1])) {
            throw new WebhookSignatureException();
        }
    }
}
