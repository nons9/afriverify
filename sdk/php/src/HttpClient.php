<?php

declare(strict_types=1);

namespace AfriVerify;

use AfriVerify\Exception\ApiException;
use AfriVerify\Exception\ConfigurationException;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;

class HttpClient
{
    private Client $client;

    public function __construct(
        private readonly string $apiKey,
        private readonly string $baseUrl,
        private readonly float  $timeout,
    ) {
        if (empty($apiKey)) {
            throw new ConfigurationException('apiKey is required');
        }

        $this->client = new Client([
            'base_uri' => rtrim($baseUrl, '/') . '/',
            'timeout'  => $timeout,
            'headers'  => [
                'Authorization' => "Bearer {$apiKey}",
                'X-SDK'         => 'afriverify-php/0.1.0',
                'Accept'        => 'application/json',
            ],
        ]);
    }

    /** @return array<string, mixed> */
    public function get(string $path, array $query = []): array
    {
        return $this->send('GET', $path, ['query' => array_filter($query, fn($v) => $v !== null)]);
    }

    /** @return array<string, mixed> */
    public function post(string $path, array $json): array
    {
        return $this->send('POST', $path, ['json' => $json]);
    }

    /** @return array<string, mixed> */
    public function postMultipart(string $path, array $multipart): array
    {
        return $this->send('POST', $path, ['multipart' => $multipart]);
    }

    /** @return array<string, mixed> */
    private function send(string $method, string $path, array $options): array
    {
        $path = ltrim($path, '/');
        try {
            $response = $this->client->request($method, $path, $options);
        } catch (GuzzleException $e) {
            throw new ApiException(0, 'network_error', $e->getMessage());
        }

        $requestId = $response->getHeaderLine('x-request-id') ?: null;
        $body = (string) $response->getBody();
        $data = json_decode($body, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new ApiException($response->getStatusCode(), 'parse_error', substr($body, 0, 200));
        }

        $status = $response->getStatusCode();
        if ($status >= 400) {
            throw new ApiException(
                $status,
                $data['error']   ?? 'api_error',
                $data['message'] ?? 'Unknown error',
                $requestId,
            );
        }

        return $data;
    }
}
