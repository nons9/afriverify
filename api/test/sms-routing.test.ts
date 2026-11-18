import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import * as db from '../src/db';
import redis from '../src/redis';
import { routeFor, sendSms } from '../src/services/otp.service';

// in-memory stand-ins: no real Redis, database or provider is touched
const store = new Map<string, number>();
const logged: Array<unknown[]> = [];
(redis as any).get = async (k: string) => (store.has(k) ? String(store.get(k)) : null);
(redis as any).incr = async (k: string) => { store.set(k, (store.get(k) ?? 0) + 1); return store.get(k)!; };
(redis as any).expire = async () => 1;
(redis as any).del = async (k: string) => { store.delete(k); return 1; };
(db as any).query = async (_sql: string, params: unknown[]) => { logged.push(params); return []; };

process.env.AFRICASTALKING_API_KEY = 'k';
process.env.AFRICASTALKING_USERNAME = 'u';
process.env.TERMII_API_KEY = 't';
delete process.env.TWILIO_ACCOUNT_SID;

let calls: string[] = [];
let down = new Set<string>();
(axios as any).post = async (url: string) => {
  const which = url.includes('termii') ? 'termii' : 'africastalking';
  calls.push(which);
  if (down.has(which)) throw new Error(`${which} down`);
  return which === 'termii'
    ? { data: { code: 'ok' } }
    : { data: { SMSMessageData: { Recipients: [{ status: 'Success' }] } } };
};
const reset = () => { calls = []; down = new Set(); store.clear(); logged.length = 0; };

test('routing: Nigeria goes to Termii first, others to Africa\'s Talking, Twilio always last', () => {
  assert.deepEqual(routeFor('+2348012345678'), ['termii', 'africastalking', 'twilio']);
  assert.deepEqual(routeFor('+233201234567'), ['africastalking', 'termii', 'twilio']);
  assert.deepEqual(routeFor('+254712345678'), ['africastalking', 'termii', 'twilio']);
});

test('routing: SMS_ROUTES overrides by country code and survives bad JSON', () => {
  process.env.SMS_ROUTES = '{"233":["termii"]}';
  assert.deepEqual(routeFor('+233201234567'), ['termii']);
  process.env.SMS_ROUTES = 'not json';
  assert.deepEqual(routeFor('+233201234567'), ['africastalking', 'termii', 'twilio']);
  delete process.env.SMS_ROUTES;
});

test('sends via the first provider on the route and skips unconfigured Twilio', async () => {
  reset();
  assert.equal(await sendSms('+233201234567', 'hi'), 'africastalking');
  assert.deepEqual(calls, ['africastalking']);
  assert.equal(logged.length, 1);
  assert.equal((logged[0][3] as string), 'africastalking');
  assert.equal((logged[0][4] as string), 'sent');
});

test('fails over to the next provider and records both attempts', async () => {
  reset(); down.add('africastalking');
  assert.equal(await sendSms('+233201234567', 'hi'), 'termii');
  assert.deepEqual(calls, ['africastalking', 'termii']);
  const attempts = JSON.parse(logged[0][5] as string);
  assert.deepEqual(attempts.map((a: any) => [a.provider, a.ok]), [['africastalking', false], ['termii', true]]);
});

test('circuit breaker: after 3 failures a provider is skipped, so no timeout is wasted', async () => {
  reset(); down.add('africastalking');
  for (let i = 0; i < 3; i++) await sendSms('+233201234567', 'hi');
  calls = [];
  assert.equal(await sendSms('+233201234567', 'hi'), 'termii');
  assert.deepEqual(calls, ['termii'], 'tripped provider must not be called');
});

test('a success resets the breaker', async () => {
  reset(); down.add('africastalking');
  await sendSms('+233201234567', 'hi'); await sendSms('+233201234567', 'hi');
  down.clear();
  assert.equal(await sendSms('+233201234567', 'hi'), 'africastalking');
  assert.equal(store.has('sms:fail:africastalking'), false);
});

test('when every provider is tripped they are still tried (never a hard stop)', async () => {
  reset();
  store.set('sms:fail:africastalking', 5); store.set('sms:fail:termii', 5);
  assert.equal(await sendSms('+233201234567', 'hi'), 'africastalking');
});

test('all providers failing throws a generic error and logs a failed row without leaking the phone', async () => {
  reset(); down.add('africastalking'); down.add('termii');
  await assert.rejects(() => sendSms('+233201234567', 'hi'), /OTP service unavailable/);
  assert.equal(logged[0][4], 'failed');
  assert.equal(logged[0][3], null);
  assert.ok(!JSON.stringify(logged[0]).includes('+233201234567'));
});
