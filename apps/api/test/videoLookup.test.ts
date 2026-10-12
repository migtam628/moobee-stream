import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVideoLookup } from '../src/videoLookup.js';

const uuid = '723e68cf-cb25-45a6-8683-8db6a9144b1f';

test('UUID lookups bind UUID and text using distinct parameters', () => {
  const lookup = buildVideoLookup(uuid);
  assert.equal(
    lookup.sql,
    'SELECT * FROM videos WHERE (id = $1::uuid OR slug = $2::text) LIMIT 1'
  );
  assert.deepEqual(lookup.params, [uuid, uuid]);
});

test('slug lookups never attempt to cast arbitrary slugs as UUIDs', () => {
  const lookup = buildVideoLookup('example-movie');
  assert.equal(
    lookup.sql,
    'SELECT * FROM videos WHERE slug = $1::text LIMIT 1'
  );
  assert.deepEqual(lookup.params, ['example-movie']);
});

test('playback only matches ready videos', () => {
  const lookup = buildVideoLookup(uuid, true);
  assert.equal(
    lookup.sql,
    "SELECT * FROM videos WHERE (id = $1::uuid OR slug = $2::text) AND status = 'ready' LIMIT 1"
  );
  assert.deepEqual(lookup.params, [uuid, uuid]);
});
