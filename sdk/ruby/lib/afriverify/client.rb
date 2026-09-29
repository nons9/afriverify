require 'securerandom'
require_relative 'version'
require_relative 'errors'
require_relative 'http_client'
require_relative 'resources/verify'
require_relative 'resources/identity'
require_relative 'resources/webhooks'

module AfriVerify
  class Client
    DEFAULT_BASE_URL = 'https://api.afriverify.sankofaapp.com/v1'
    DEFAULT_TIMEOUT  = 30

    attr_reader :verify, :identity, :webhooks

    def initialize(api_key, base_url: DEFAULT_BASE_URL, timeout: DEFAULT_TIMEOUT, webhook_secret: '')
      raise ArgumentError, 'api_key is required' if api_key.nil? || api_key.strip.empty?

      http = HttpClient.new(api_key: api_key, base_url: base_url, timeout: timeout)

      @verify   = Resources::Verify.new(http)
      @identity = Resources::Identity.new(http)
      @webhooks = Resources::Webhooks.new(webhook_secret)
    end
  end
end
