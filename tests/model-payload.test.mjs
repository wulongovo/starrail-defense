import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { decodeModelBundle } from '../src/model-payload.js';

test('compressed offline model preserves original geometry, textures and provenance byte-for-byte', async () => {
  const original = { format:'wulong-pmx-bundle-v1', pmx:Buffer.from([80,77,88,32,255,0,17]).toString('base64'), textures:{'身体.png':'data:image/png;base64,abcd'}, metadata:{id:'wulong-fixture',source:'https://example.test/original',sha256:'source-hash'} };
  const compressed = {format:'wulong-pmx-gzip-v1',payload:gzipSync(JSON.stringify(original)).toString('base64')};
  assert.deepEqual(await decodeModelBundle(compressed), original);
  assert.equal(await decodeModelBundle(original), original);
});

test('corrupt or wrong compressed models fail instead of silently substituting a different character', async () => {
  for (const payload of ['', 'not-valid-base64@', Buffer.from('not gzip').toString('base64'), gzipSync('{}').toString('base64')]) {
    await assert.rejects(decodeModelBundle({format:'wulong-pmx-gzip-v1',payload}), /模型/);
  }
});

test('compressed GLB bundles retain embedded binary and distinct original-FBX provenance', async () => {
  const original = {format:'wulong-glb-bundle-v1',glb:Buffer.from('glTF embedded fixture').toString('base64'),metadata:{sourceFormat:'fbx',sourceSha256:'original-fbx-hash',sha256:'converted-glb-hash'}};
  const compressed = {format:'wulong-pmx-gzip-v1',payload:gzipSync(JSON.stringify(original)).toString('base64')};
  assert.deepEqual(await decodeModelBundle(compressed), original);
});
