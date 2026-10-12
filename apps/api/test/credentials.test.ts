import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { matchesApiKey } from '../src/credentials.js';

const adminKey = 'admin-test-key-0123456789abcdef0123456789';
const serviceKey = 'service-test-key-0123456789abcdef0123456789';

test('high entropy keys are checked and unsafe header variants fail closed', () => {
  assert.equal(matchesApiKey(serviceKey, serviceKey), true);
  assert.equal(matchesApiKey('wrong-service-key-0123456789abcdef0123456789', serviceKey), false);
  assert.equal(matchesApiKey(serviceKey.slice(0, -1), serviceKey), false);
  assert.equal(matchesApiKey(serviceKey, ''), false);
  assert.equal(matchesApiKey(serviceKey, 'short'), false);
  assert.equal(matchesApiKey(undefined, serviceKey), false);
  assert.equal(matchesApiKey([serviceKey], serviceKey), false);
});

test('admin and read-only playback credentials have separate authority', async () => {
  process.env.DATABASE_URL = 'postgres://irrelevant/test';
  process.env.REDIS_URL = 'redis://irrelevant/0';
  process.env.ADMIN_API_KEY = adminKey;
  process.env.STREAM_SIGNING_SECRET = 'untracked-test-secret';
  process.env.STREAM_SERVICE_API_KEY = serviceKey;
  const { requireAdmin, requireService } = await import('../src/auth.js');

  await assert.doesNotReject(requireService({ headers: { 'x-service-key': serviceKey } } as never));
  await assert.rejects(requireService({ headers: { 'x-service-key': adminKey } } as never), /Unauthorized/);
  await assert.rejects(requireService({ headers: { 'x-api-key': adminKey } } as never), /Unauthorized/);
  await assert.rejects(requireService({ headers: { 'x-service-key': 'wrong' } } as never), /Unauthorized/);
  await assert.rejects(requireService({ headers: { 'x-service-key': [serviceKey] } } as never), /Unauthorized/);
  await assert.doesNotReject(requireAdmin({ headers: { 'x-api-key': adminKey } } as never));
  await assert.rejects(requireAdmin({ headers: { 'x-api-key': serviceKey } } as never), /Unauthorized/);
});

test('default Compose limits Nginx to host loopback', () => {
  const compose = fs.readFileSync(path.resolve(process.cwd(), '../../docker-compose.yml'), 'utf8');
  assert.match(compose, /127\.0\.0\.1:8080:80/);
  assert.doesNotMatch(compose, /-\s*["']8080:80["']/);
  assert.match(compose, /STREAM_SERVICE_API_KEY/);
});

test('signed HLS Nginx location does not allow unbounded asset paths', () => {
  const nginx = fs.readFileSync(path.resolve(process.cwd(), '../../nginx/templates/default.conf.template'), 'utf8');
  assert.doesNotMatch(nginx, /\(\?<asset>\.\+\)/);
  assert.match(nginx, /segment_\[0-9\]/);
  assert.match(nginx, /secure_link_md5/);
});
