require_relative 'lib/afriverify/version'

Gem::Specification.new do |s|
  s.name        = 'afriverify'
  s.version     = AfriVerify::VERSION
  s.summary     = 'Official Ruby SDK for the AfriVerify identity verification platform'
  s.description = 'Integrate AfriVerify KYC, identity lookup, and webhook verification into your Ruby application.'
  s.authors     = ['AfriVerify']
  s.email       = ['dev@sankofaapp.com']
  s.homepage    = 'https://afriverify.sankofaapp.com'
  s.license     = 'MIT'

  s.required_ruby_version = '>= 3.0'

  s.files = Dir['lib/**/*.rb', 'README.md', 'LICENSE']

  s.metadata = {
    'source_code_uri'   => 'https://github.com/nons9/afriverify/tree/main/sdk/ruby',
    'changelog_uri'     => 'https://github.com/nons9/afriverify/releases',
    'homepage_uri'      => s.homepage,
  }
end
