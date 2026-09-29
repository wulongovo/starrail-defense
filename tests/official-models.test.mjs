import test from 'node:test';
import assert from 'node:assert/strict';
import { Texture } from 'three';
import { mkdtemp, mkdir, writeFile, readFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { parsePMX, createOfficialMesh, registerOfficialModels, loadOfficialModel, hasOfficialModel, animateOfficialModel } from '../src/official-models.js';
import { convertPMX } from '../scripts/convert-pmx.mjs';

class Writer {
  chunks = [];
  bytes(value) { this.chunks.push(Buffer.from(value)); }
  u8(value) { const b = Buffer.alloc(1); b.writeUInt8(value); this.bytes(b); }
  u16(value) { const b = Buffer.alloc(2); b.writeUInt16LE(value); this.bytes(b); }
  i32(value) { const b = Buffer.alloc(4); b.writeInt32LE(value); this.bytes(b); }
  f32(value) { const b = Buffer.alloc(4); b.writeFloatLE(value); this.bytes(b); }
  vec(...values) { values.forEach(value => this.f32(value)); }
  text(value) { const b = Buffer.from(value, 'utf8'); this.i32(b.length); this.bytes(b); }
  output() { return Buffer.concat(this.chunks); }
}

function fixture({ texture = false, cyclic = false, version = 2.1, alpha = 1 } = {}) {
  const w = new Writer();
  w.bytes('PMX '); w.f32(version); w.u8(8); w.bytes([1, 0, 4, 4, 4, 4, 4, 4]);
  for (const text of ['テスト模型', 'Test Model', 'Synthetic PMX format fixture; not official art.', '']) w.text(text);
  w.i32(15);
  for (let i = 0; i < 15; i++) {
    w.vec(i % 3, i % 3, 0.5); w.vec(0, 0, -1); w.vec((i % 3) / 2, 1);
    const weightType = Math.floor(i / 3); w.u8(weightType);
    const count = weightType === 0 ? 1 : [1, 3].includes(weightType) ? 2 : 4;
    for (let j = 0; j < count; j++) w.i32(j % 2);
    if (count === 2) w.f32(0.6);
    if (count === 4) w.vec(0.4, 0.3, 0.2, 0.1);
    if (weightType === 3) w.vec(0, 0, 0, 0, 0, 0, 0, 0, 0);
    w.f32(1);
  }
  w.i32(15); for (let i = 0; i < 15; i++) w.i32(i);
  w.i32(texture ? 1 : 0); if (texture) w.text('Tex\\body.png');
  w.i32(1); w.text('body'); w.text('body');
  w.vec(1, 1, 1, alpha); w.vec(0, 0, 0); w.f32(1); w.vec(0.5, 0.5, 0.5); w.u8(1);
  w.vec(0, 0, 0, 1); w.f32(1); w.i32(texture ? 0 : -1); w.i32(-1); w.u8(0); w.u8(1); w.u8(0); w.text(''); w.i32(15);
  w.i32(2);
  for (let i = 0; i < 2; i++) {
    w.text(i === 0 ? 'センター' : '頭'); w.text(i === 0 ? 'Hips' : 'Head');
    w.vec(0, i, 0); w.i32(i === 0 ? cyclic ? 1 : -1 : 0); w.i32(0); w.u16(0); w.vec(0, 0, 0);
  }
  return w.output();
}

test('PMX parser reads real binary layouts, five weight modes, handedness and triangle order', () => {
  const pmx = parsePMX(fixture());
  assert.equal(pmx.name, 'テスト模型');
  assert.equal(pmx.vertexCount, 15);
  assert.equal(pmx.indexCount, 15);
  assert.deepEqual(pmx.weightTypes, { BDEF1: 3, BDEF2: 3, BDEF4: 3, SDEF: 3, QDEF: 3 });
  assert.equal(pmx.positions[2], -0.5);
  assert.equal(pmx.normals[2], 1);
  assert.deepEqual([...pmx.indices.slice(0, 3)], [0, 2, 1]);
  assert.equal(pmx.bones[1].parent, 0);
  assert.equal(pmx.parsedBytes, pmx.totalBytes);
});

test('PMX parser rejects truncation, bad signatures, unsupported versions and cyclic rigs', () => {
  const pmx = fixture();
  for (const length of [0, 7, 50, pmx.length - 1]) assert.throws(() => parsePMX(pmx.subarray(0, length)));
  const bad = Buffer.from(pmx); bad[0] = 0; assert.throws(() => parsePMX(bad), /PMX/);
  assert.throws(() => parsePMX(fixture({ version: 3 })), /支持/);
  assert.throws(() => parsePMX(fixture({ cyclic: true })), /循环/);
});

test('Three mesh binds original skin weights and material textures at normalized height', async () => {
  const pmx = parsePMX(fixture({ texture: true }));
  const loaded = [];
  const texture = new Texture();
  const mesh = await createOfficialMesh(pmx, { textures: { 'tex/body.png': 'data:image/png;base64,AA==' } }, { textureLoader: async uri => { loaded.push(uri); return texture; } });
  assert.equal(mesh.isSkinnedMesh, true);
  assert.equal(mesh.skeleton.bones.length, 2);
  assert.equal(mesh.skeleton.bones[1].parent, mesh.skeleton.bones[0]);
  assert.equal(mesh.geometry.attributes.skinWeight.count, 15);
  assert.equal(mesh.material[0].map, texture);
  assert.equal(loaded.length, 1);
  assert.equal(mesh.geometry.groups[0].count, 15);
  assert.ok(Math.abs(mesh.geometry.boundingBox.max.y - 1.35) < 0.00001);
  assert.equal(mesh.geometry.boundingBox.min.y, 0);
  mesh.updateMatrixWorld(true); mesh.skeleton.update();
  assert.ok([...mesh.skeleton.boneMatrices].every(Number.isFinite));
});

test('missing referenced artwork fails explicitly instead of falling back to a placeholder', async () => {
  await assert.rejects(() => createOfficialMesh(parsePMX(fixture({ texture: true }))), /缺失贴图/);
  await assert.rejects(() => loadOfficialModel('not-registered'), /没有配置/);
});

test('source-transparent expression material stays hidden without its optional texture; visible textures remain mandatory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wulong-hidden-pmx-'));
  const input = join(directory,'hidden.pmx'), output = join(directory,'bundle.json');
  const bytes = fixture({texture:true,alpha:0});
  try {
    await writeFile(input,bytes);
    await convertPMX(input,output,{id:'transparent-expression-fixture'});
    const bundle=JSON.parse(await readFile(output,'utf8'));
    assert.deepEqual(Buffer.from(bundle.pmx,'base64'),bytes);
    assert.deepEqual(bundle.textures,{});
    assert.equal(bundle.metadata.omittedTransparentMaterials[0].texture,'Tex\\body.png');
    const mesh=await createOfficialMesh(parsePMX(bytes),bundle,{textureLoader:async()=>{throw new Error('Hidden texture should not be fetched');}});
    assert.equal(mesh.material[0].visible,false);
    assert.equal(mesh.material[0].opacity,0);
    assert.equal(mesh.geometry.index.count,15);
    await assert.rejects(createOfficialMesh(parsePMX(fixture({texture:true,alpha:.1}))),/缺失贴图/);
  } finally {
    for(const file of [input,output])await unlink(file).catch(()=>{});
    await rmdir(directory);
  }
});

test('official-model clones share source artwork but retain independent real skeletons', async () => {
  const bundle = { format: 'wulong-pmx-bundle-v1', pmx: fixture().toString('base64'), textures: {}, metadata: { id: 'test' } };
  registerOfficialModels({ fixture: bundle, alias: bundle });
  assert.equal(hasOfficialModel('fixture'), true);
  const [first, second] = await Promise.all([loadOfficialModel('fixture'), loadOfficialModel('alias')]);
  assert.notEqual(first, second);
  assert.equal(first.geometry, second.geometry);
  assert.equal(first.material[0], second.material[0]);
  assert.notEqual(first.skeleton, second.skeleton);
  assert.notEqual(first.userData.rig.head, second.userData.rig.head);
  assert.equal(first.userData.bones['頭'], first.userData.rig.head);
  assert.equal(first.userData.bones.Head, first.userData.rig.head);
  animateOfficialModel(first, { time: 1, attack: 0.4 });
  assert.notEqual(first.userData.rig.head.quaternion.y, second.userData.rig.head.quaternion.y);
  assert.equal(second.userData.rig.head.quaternion.y, 0);
});

test('offline converter preserves source PMX bytes and embeds referenced image artwork', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wulong-pmx-fixture-'));
  const textureDir = join(directory, 'Tex');
  await mkdir(textureDir);
  const input = join(directory, 'test.pmx'), output = join(directory, 'bundle.json'), image = join(textureDir, 'body.png');
  const bytes = fixture({ texture: true });
  try {
    await writeFile(input, bytes);
    await writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=', 'base64'));
    const result = await convertPMX(input, output, { id: 'synthetic-parser-fixture', maxTexture: 512 });
    const bundle = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(result.vertices, 15);
    assert.equal(result.bones, 2);
    assert.deepEqual(Buffer.from(bundle.pmx, 'base64'), bytes);
    assert.match(bundle.textures['Tex\\body.png'], /^data:image\/(png|jpeg);base64,/);
    assert.equal(bundle.metadata.id, 'synthetic-parser-fixture');
    assert.match(bundle.metadata.sha256, /^[a-f0-9]{64}$/);
    assert.equal(parsePMX(Buffer.from(bundle.pmx, 'base64')).name, 'テスト模型');
    const renamed = join(textureDir, 'original-art.png');
    await writeFile(renamed, await readFile(image));
    await unlink(image);
    try {
      await assert.rejects(convertPMX(input, output), /缺失引用贴图/);
      await assert.rejects(convertPMX(input, output, { textureOverrides: { 'Tex\\body.png': { path: '../outside.png', reason: 'invalid fixture path' } } }), /不在原模型目录/);
      await assert.rejects(convertPMX(input, output, { textureOverrides: { 'Tex\\body.png': { path: 'Tex/original-art.png' } } }), /核验依据/);
      await convertPMX(input, output, { textureOverrides: { 'Tex\\body.png': { path: 'Tex/original-art.png', reason: 'Same fixture artwork renamed, original PMX unchanged.' } } });
      const repaired = JSON.parse(await readFile(output, 'utf8'));
      assert.deepEqual(Buffer.from(repaired.pmx, 'base64'), bytes);
      assert.equal(repaired.metadata.textures['Tex\\body.png'].source, 'Tex/original-art.png');
      assert.match(repaired.metadata.textures['Tex\\body.png'].referenceRepair, /original PMX unchanged/);
    } finally { await unlink(renamed); }
  } finally {
    for (const path of [input, output, image]) await unlink(path).catch(() => {});
    await rmdir(textureDir); await rmdir(directory);
  }
});

test('all included PMX bundles construct valid geometry and preserve individually verified provenance', async context => {
  // These four are community mirrors, not an official CDN. Pin the exact observed
  // bytes and URLs; embedded credits establish provenance evidence, not authorization.
  const mirrors = {
    gepard: ['https://drive.google.com/drive/folders/16GcwWJW741Nq9pvZYKQhAvQUewMJmOq3', 'cd2fe217f436a65fb88e05130c30d2d8a3311d76168d66316d6864e933d08aed'],
    himeko: ['https://drive.google.com/drive/folders/1Z0nnz5ATSU3ED3nynoa1Le1Nt_Y6uIge', '05fa86abee25e883927d696e4f4242c14ef56292c36f5db3e1d564082f79abd4'],
    sampo: ['https://drive.google.com/drive/folders/1j5ocYy1VV65iDNPBKiVFuX8O5-HxuNIB', 'b25f15e08efc91098a7a2cfec1a0ffa5f1ecd25da94439471fe1051cf6e7eae1'],
    sunday: ['https://drive.google.com/drive/folders/161UQnJP1oiN8epVs24DFlt0g2UHCT4W3', '6809e0af090315e1bb28d7a03f4818ed6b06620fdd616754991a9e696f6c10be'],
  };
  const directory = new URL('../public/assets/models/', import.meta.url);
  const expandedSources=[];
  for(const name of ['model-expansion-legacy.json','model-expansion-modern.json','model-expansion-monsters.json','model-expansion-bosses-pompom.json']) {
    try { expandedSources.push(...JSON.parse(await readFile(new URL(`../docs/${name}`,import.meta.url),'utf8'))); }
    catch(error) { if(error.code!=='ENOENT')throw error; }
  }
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { context.skip('Local official artwork is not present in this checkout.'); return; }
  let verified = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let bundle;
    try { bundle = JSON.parse(await readFile(new URL(`${entry.name}/bundle.json`, directory), 'utf8')); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (bundle.format === 'wulong-glb-bundle-v1') continue; // FBX/GLB geometry and provenance have their own verifier.
    const sourceBytes = Buffer.from(bundle.pmx, 'base64');
    const parsed = parsePMX(sourceBytes);
    const mesh = await createOfficialMesh(parsed, bundle, { textureLoader: async () => new Texture() });
    mesh.updateMatrixWorld(true); mesh.skeleton.update();
    assert.equal(mesh.geometry.attributes.position.count, bundle.metadata.vertices, entry.name);
    assert.equal(mesh.geometry.index.count / 3, bundle.metadata.triangles, entry.name);
    assert.equal(mesh.skeleton.bones.length, bundle.metadata.bones, entry.name);
    assert.ok([...mesh.skeleton.boneMatrices].every(Number.isFinite), entry.name);
    const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
    assert.equal(bundle.metadata.sha256, sourceSha256, `${entry.name}: unchanged source PMX digest`);
    assert.equal(bundle.metadata.originalComment, parsed.comment, `${entry.name}: source credits preserved`);
    assert.equal(bundle.metadata.modelName, parsed.name, `${entry.name}: original model title preserved`);
    if (mirrors[entry.name]) {
      assert.equal(bundle.metadata.source, mirrors[entry.name][0], `${entry.name}: exact community mirror URL`);
      assert.equal(sourceSha256, mirrors[entry.name][1], `${entry.name}: inspected community mirror PMX`);
      assert.match(parsed.comment, /模型版权所属miHoYo/);
      assert.match(parsed.comment, /请勿二次配布/);
      assert.match(parsed.comment, /模型编辑：(神帝宇|流云景)/);
    } else if(bundle.metadata.source.startsWith('https://activity.hdslb.com/') || bundle.metadata.source.startsWith('https://i0.hdslb.com/bfs/activity-plat/')) {
      assert.equal(new URL(bundle.metadata.source).protocol,'https:');
    } else {
      const record=expandedSources.find(r=>r.id===entry.name&&r.status==='converted'&&r.source===bundle.metadata.source);
      assert.ok(record,`${entry.name}: separately recorded community source is required`);
      assert.equal(sourceSha256,record.pmxSha256,`${entry.name}: recorded community file digest`);
      assert.match(parsed.comment,/miHoYo|HoYoverse|TYPE-MOON|米哈游/i,`${entry.name}: preserved original attribution`);
    }
    for (const dimensions of Object.values(bundle.metadata.textures)) assert.ok(Math.max(dimensions.width, dimensions.height) <= 512, `${entry.name}: texture dimensions`);
    verified++;
  }
  if (!verified) context.skip('No converted official model bundles are available.');
});
