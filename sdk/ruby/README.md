# afriverify

Official Ruby SDK for the [AfriVerify](https://afriverify.sankofaapp.com) identity verification platform.

## Requirements

Ruby 3.0+. No external dependencies — uses stdlib `net/http` and `openssl`.

## Installation

```ruby
# Gemfile
gem 'afriverify'
```

Or:

```bash
gem install afriverify
```

## Usage

### Initialize

```ruby
require 'afriverify'

client = AfriVerify.new('your_api_key')

# With webhook secret and custom timeout
client = AfriVerify.new(
  'your_api_key',
  webhook_secret: ENV['AFRIVERIFY_WEBHOOK_SECRET'],
  timeout: 60
)
```

### Verification Flow

```ruby
# 1. Initiate a session
session = client.verify.initiate(phone: '+2348100000000', otp_channel: 'sms', country: 'NG')
token = session['token']

# 2. Send OTP
client.verify.send_otp(token: token, channel: 'sms')

# 3. Confirm OTP
client.verify.confirm_otp(token: token, otp: '123456')

# 4. Upload ID document
File.open('id.jpg', 'rb') do |f|
  client.verify.upload_id(token: token, id_image: f, id_type: 'passport')
end

# 5. Submit selfie
File.open('selfie.jpg', 'rb') do |f|
  client.verify.submit_face(token: token, selfie: f)
end

# 6. Check status
status = client.verify.status(token)
puts status['status'] # => "completed"
```

### Identity Lookup

```ruby
# Check if an identity exists
result = client.identity.check(phone: '+2348100000000', country: 'NG')

# Get full profile
profile = client.identity.profile(result['identity_id'])

# Connect to your user
client.identity.connect(identity_id: result['identity_id'], external_id: 'user_123')

# Flag suspicious identity
client.identity.flag(identity_id: result['identity_id'], reason: 'Fraud', category: 'fraud')

# Vouch for an identity
client.identity.vouch(identity_id: result['identity_id'], message: 'Known business partner')

# List vouches
client.identity.vouches(result['identity_id'])
```

### Webhooks (Rails / Rack)

```ruby
# config/routes.rb
post '/webhooks/afriverify', to: 'webhooks#afriverify'

# app/controllers/webhooks_controller.rb
class WebhooksController < ApplicationController
  skip_before_action :verify_authenticity_token, only: :afriverify

  def afriverify
    payload   = request.body.read
    signature = request.headers['X-VerifyAfrica-Signature']

    event = $afriverify.webhooks.construct_event(payload, signature)

    case event['event']
    when 'verification.completed'
      # handle completed verification
    when 'identity.flagged'
      # handle flagged identity
    end

    head :ok
  rescue AfriVerify::WebhookSignatureError
    head :bad_request
  end
end
```

## Error Handling

```ruby
begin
  session = client.verify.initiate(phone: '+...')
rescue AfriVerify::ApiError => e
  puts e.status_code  # HTTP status
  puts e.error_code   # AfriVerify error code
  puts e.message      # Human-readable message
  puts e.request_id   # X-Request-Id from response header
rescue AfriVerify::WebhookSignatureError => e
  puts "Bad signature: #{e.message}"
end
```

## Configuration

| Option | Default | Description |
|---|---|---|
| `api_key` | (required) | Your AfriVerify API key |
| `webhook_secret` | `""` | Secret for HMAC-SHA512 webhook verification |
| `base_url` | `https://api.afriverify.sankofaapp.com/v1` | API base URL |
| `timeout` | `30` | HTTP timeout in seconds |

## License

MIT
