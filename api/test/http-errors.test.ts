import test from 'node:test';
import assert from 'node:assert/strict';
import { toClientError } from '../src/utils/http-errors';

test('malformed JSON is a 400, not a 500', () => {
  assert.deepEqual(toClientError(Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed' })),
    { status: 400, error: 'invalid_json', message: 'The request body is not valid JSON.' });
});
test('oversized body is 413 and unsupported encoding is 415', () => {
  assert.equal(toClientError({ type: 'entity.too.large' })?.status, 413);
  assert.equal(toClientError({ type: 'encoding.unsupported' })?.status, 415);
});
test('upload limits map to 413 / 400', () => {
  assert.equal(toClientError({ name: 'MulterError', code: 'LIMIT_FILE_SIZE' })?.status, 413);
  assert.equal(toClientError({ name: 'MulterError', code: 'LIMIT_UNEXPECTED_FILE' })?.status, 400);
});
test('a disallowed CORS origin is a 403', () => {
  assert.equal(toClientError(new Error('Origin https://evil.test not allowed'))?.status, 403);
});
test('genuine server errors are NOT swallowed', () => {
  assert.equal(toClientError(new Error('connection refused')), null);
  assert.equal(toClientError(new TypeError("Cannot read properties of undefined")), null);
  assert.equal(toClientError(null), null);
  assert.equal(toClientError(undefined), null);
});
