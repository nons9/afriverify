module AfriVerify
  module Resources
    class Verify
      def initialize(http)
        @http = http
      end

      def initiate(**params)
        @http.post('/verify/initiate', params)
      end

      def send_otp(token:, channel: nil)
        @http.post('/verify/otp/send', { token: token, channel: channel }.compact)
      end

      def confirm_otp(token:, otp:)
        @http.post('/verify/otp/confirm', { token: token, otp: otp })
      end

      # id_image: an IO object (e.g. File.open(...))
      # id_type:  e.g. "passport", "national_id"
      def upload_id(token:, id_image:, id_type:, filename: 'id.jpg', content_type: 'image/jpeg')
        @http.post_multipart(
          '/verify/id/upload',
          { 'token' => token, 'id_type' => id_type },
          { 'id_image' => [filename, id_image, content_type] }
        )
      end

      # selfie: an IO object
      def submit_face(token:, selfie:, filename: 'selfie.jpg', content_type: 'image/jpeg')
        @http.post_multipart(
          '/verify/face/submit',
          { 'token' => token },
          { 'selfie' => [filename, selfie, content_type] }
        )
      end

      def status(token)
        @http.get("/verify/status/#{token}")
      end
    end
  end
end
