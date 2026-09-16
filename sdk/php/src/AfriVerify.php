<?php

declare(strict_types=1);

namespace AfriVerify;

use AfriVerify\Resources\Verify;
use AfriVerify\Resources\Identity;
use AfriVerify\Resources\Webhooks;

class AfriVerify
{
    public readonly Verify   $verify;
    public readonly Identity $identity;
    public readonly Webhooks $webhooks;

    public function __construct(
        string $apiKey,
        string $baseUrl = 'https://api.afriverify.sankofaapp.com/v1',
        float  $timeout = 30.0,
    ) {
        $http = new HttpClient($apiKey, $baseUrl, $timeout);
        $this->verify   = new Verify($http);
        $this->identity = new Identity($http);
        $this->webhooks = new Webhooks();
    }
}
