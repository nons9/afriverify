require 'net/http'
require 'uri'
require 'json'

module AfriVerify
  class HttpClient
    USER_AGENT = "afriverify-ruby/#{VERSION}"

    def initialize(api_key:, base_url:, timeout:)
      @api_key  = api_key
      @base_url = base_url.chomp('/')
      @timeout  = timeout
    end

    def get(path, params: {})
      uri = build_uri(path, params)
      req = Net::HTTP::Get.new(uri)
      set_headers(req)
      perform(uri, req)
    end

    def post(path, body)
      uri = build_uri(path)
      req = Net::HTTP::Post.new(uri)
      set_headers(req)
      req['Content-Type'] = 'application/json'
      req.body = JSON.generate(body)
      perform(uri, req)
    end

    def post_multipart(path, fields, files)
      uri = build_uri(path)
      req = Net::HTTP::Post.new(uri)
      set_headers(req)

      boundary = SecureRandom.hex(16)
      req['Content-Type'] = "multipart/form-data; boundary=#{boundary}"
      req.body = build_multipart(boundary, fields, files)
      perform(uri, req)
    end

    private

    def build_uri(path, params = {})
      uri = URI.parse("#{@base_url}#{path}")
      unless params.empty?
        uri.query = params.map { |k, v| "#{URI.encode_www_form_component(k)}=#{URI.encode_www_form_component(v.to_s)}" if v }.compact.join('&')
      end
      uri
    end

    def set_headers(req)
      req['Authorization'] = "Bearer #{@api_key}"
      req['User-Agent']    = USER_AGENT
      req['Accept']        = 'application/json'
    end

    def perform(uri, req)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl     = uri.scheme == 'https'
      http.open_timeout = @timeout
      http.read_timeout = @timeout

      res = http.request(req)
      body = res.body.to_s

      unless res.is_a?(Net::HTTPSuccess)
        parsed = JSON.parse(body) rescue {}
        raise ApiError.new(
          res.code.to_i,
          parsed['error_code'] || parsed['error'] || 'api_error',
          parsed['message'] || res.message,
          res['X-Request-Id']
        )
      end

      JSON.parse(body)
    end

    def build_multipart(boundary, fields, files)
      body = +''
      fields.each do |name, value|
        body << "--#{boundary}\r\n"
        body << "Content-Disposition: form-data; name=\"#{name}\"\r\n\r\n"
        body << "#{value}\r\n"
      end
      files.each do |field, (filename, io, content_type)|
        data = io.read
        body << "--#{boundary}\r\n"
        body << "Content-Disposition: form-data; name=\"#{field}\"; filename=\"#{filename}\"\r\n"
        body << "Content-Type: #{content_type}\r\n\r\n"
        body << data
        body << "\r\n"
      end
      body << "--#{boundary}--\r\n"
      body
    end
  end
end
