require_relative 'afriverify/client'

module AfriVerify
  def self.new(api_key, **opts)
    Client.new(api_key, **opts)
  end
end
