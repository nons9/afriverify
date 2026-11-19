import test from 'node:test';
import assert from 'node:assert/strict';
import { providerConfigured, verifyId, NoProviderConfigured } from '../src/services/identity-provider.service';

const KEYS = ['SMILE_IDENTITY_PARTNER_ID', 'SMILE_IDENTITY_API_KEY', 'DOJAH_APP_ID', 'DOJAH_SECRET_KEY', 'ONFIDO_API_TOKEN'];
const clear = () => KEYS.forEach((k) => delete process.env[k]);

test('a vendor counts as configured only when all its keys are present', () => {
  clear();
  assert.equal(providerConfigured('smile_identity'), false);
  process.env.SMILE_IDENTITY_PARTNER_ID = 'p';
  assert.equal(providerConfigured('smile_identity'), false, 'one key is not enough');
  process.env.SMILE_IDENTITY_API_KEY = 'k';
  assert.equal(providerConfigured('smile_identity'), true);
  process.env.DOJAH_APP_ID = 'a';
  assert.equal(providerConfigured('dojah'), false);
  process.env.ONFIDO_API_TOKEN = 't';
  assert.equal(providerConfigured('onfido'), true);
  clear();
});

test('with no vendor keys, no registry check is attempted and the caller is told so', async () => {
  clear();
  await assert.rejects(
    verifyId({ id_type: 'NIN', id_number: '12345678901', country: 'NG', first_name: 'A', last_name: 'B' }),
    (e: Error) => e instanceof NoProviderConfigured && e.message === 'no_identity_provider_configured'
  );
});
