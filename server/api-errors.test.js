import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiErrorHandler } from './api-errors.js';

test('malformed JSON and SDK failures never copy submitted secrets into logs or responses', async t => {
  const logs = [];
  const app = express();
  app.use(express.json({ limit: '1kb' }));
  app.post('/input', (req, res) => res.sendStatus(204));
  app.get('/sdk', (req, res, next) => next(new Error('Bearer synthetic-private-token')));
  app.get('/unavailable', (req, res, next) => next(Object.assign(new Error('private SDK details'), { status: 503 })));
  app.use(createApiErrorHandler((...args) => logs.push(args)));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [path, options, status, message] of [
    ['/input', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'secret' }, 400, 'Invalid request body.'],
    ['/input', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'secret'.repeat(200) }) }, 413, 'Request body is too large.'],
    ['/sdk', {}, 500, 'Internal server error.'],
    ['/unavailable', {}, 503, 'API read is unavailable.'],
  ]) {
    const response = await fetch(origin + path, options);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { message });
  }
  assert.deepEqual(logs, [400, 413, 500, 503].map(status => ['[api] Request failed', { status }]));
});

test('partially sent responses forward only a sanitized error', () => {
  let forwarded;
  createApiErrorHandler(() => {})(new Error('private token'), {}, { headersSent: true }, error => { forwarded = error; });
  assert.equal(forwarded.message, 'API response failed.');
  assert.doesNotMatch(forwarded.stack, /private token/);
});

test('explicit public read-coverage errors retain their user-facing explanation', () => {
  let body;
  const response = { status(code) { assert.equal(code, 503); return this; }, json(value) { body = value; } };
  createApiErrorHandler(() => {})(Object.assign(new Error('Complete historical export requires review.'), { status: 503, publicMessage: true }), {}, response, () => {});
  assert.equal(body.message, 'Complete historical export requires review.');
});
