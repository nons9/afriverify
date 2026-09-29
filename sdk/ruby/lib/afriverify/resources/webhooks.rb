require 'openssl'
require 'json'

module AfriVerify
  module Resources
    class Webhooks
      def initialize(secret)
        @secret = secret
      end

      # Verifies the X-VerifyAfrica-Signature header and returns the parsed event hash.
      #
      #   event = client.webhooks.construct_event(request.body.read, request.headers['X-VerifyAfrica-Signature'])
      def construct_event(payload, signature)
        verify_signature(payload, signature)
        JSON.parse(payload)
      end

      def verify_signature(payload, signature)
        unless signature.to_s.start_with?('sha512=')
          raise WebhookSignatureError, 'Missing or malformed X-VerifyAfrica-Signature header'
        end

        provided = signature.sub('sha512=', '')
        expected = OpenSSL::HMAC.hexdigest('SHA512', @secret, payload)

        unless OpenSSL.fixed_length_secure_compare(provided, expected)
          raise WebhookSignatureError
        end
      end
    end
  end
end
