module AfriVerify
  class AfriVerifyError < StandardError; end

  class ApiError < AfriVerifyError
    attr_reader :status_code, :error_code, :request_id

    def initialize(status_code, error_code, message, request_id = nil)
      super(message)
      @status_code = status_code
      @error_code  = error_code
      @request_id  = request_id
    end

    def to_s
      base = "AfriVerify::ApiError status=#{@status_code} code=#{@error_code} message=#{super}"
      @request_id ? "#{base} request_id=#{@request_id}" : base
    end
  end

  class WebhookSignatureError < AfriVerifyError
    def initialize(msg = 'Webhook signature verification failed')
      super
    end
  end
end
