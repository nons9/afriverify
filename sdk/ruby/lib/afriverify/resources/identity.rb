module AfriVerify
  module Resources
    class Identity
      def initialize(http)
        @http = http
      end

      def check(**params)
        @http.get('/identity/check', params: params)
      end

      def connect(**params)
        @http.post('/identity/connect', params)
      end

      def profile(identity_id)
        @http.get("/identity/profile/#{identity_id}")
      end

      def flag(**params)
        @http.post('/identity/flag', params)
      end

      def vouch(**params)
        @http.post('/identity/vouch', params)
      end

      def vouches(identity_id)
        @http.get("/identity/vouches/#{identity_id}")
      end
    end
  end
end
