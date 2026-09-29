import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function filesAt(path) {
  const entries=await readdir(path,{withFileTypes:true});
  return (await Promise.all(entries.map(e=>e.isDirectory()?filesAt(join(path,e.name)):join(path,e.name)))).flat();
}

test('real monster GLBs contain all geometry and textures, with verifiable original FBX and material sources',async context=>{
  const directory=join(root,'public/assets/models');let verified=0;
  if(!existsSync(directory)){context.skip('Original third-party models are local-only and absent from the source checkout.');return;}
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    if(!entry.isDirectory())continue;
    const modelDir=join(directory,entry.name);let bundle;
    try {bundle=JSON.parse(await readFile(join(modelDir,'bundle.json'),'utf8'));}
    catch(error){if(error.code==='ENOENT')continue;throw error;}
    if(bundle.format!=='wulong-glb-bundle-v1')continue;
    const tag=entry.name, meta=bundle.metadata,bytes=Buffer.from(bundle.glb,'base64');
    assert.equal(bytes.toString('ascii',0,4),'glTF',tag);
    assert.equal(bytes.readUInt32LE(4),2,tag);
    assert.equal(bytes.readUInt32LE(8),bytes.length,tag);
    assert.equal(digest(bytes),meta.sha256,`${tag}: converted GLB digest`);
    const jsonLength=bytes.readUInt32LE(12);
    assert.equal(bytes.readUInt32LE(16),0x4e4f534a,tag);
    const doc=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
    const binOffset=20+jsonLength;
    assert.equal(bytes.readUInt32LE(binOffset+4),0x004e4942,tag);
    const binaryLength=bytes.readUInt32LE(binOffset);
    assert.equal(binOffset+8+binaryLength,bytes.length,tag);
    assert.ok(doc.buffers.length===1&&!doc.buffers[0].uri,`${tag}: embedded binary`);
    assert.ok(doc.buffers[0].byteLength<=binaryLength,tag);
    for(const view of doc.bufferViews)assert.ok((view.byteOffset||0)+view.byteLength<=binaryLength&&view.buffer===0,`${tag}: bounded buffer`);
    for(const image of doc.images)assert.ok(!image.uri&&Number.isInteger(image.bufferView),`${tag}: embedded image`);
    const primitives=doc.meshes.flatMap(m=>m.primitives);
    const vertices=primitives.reduce((n,p)=>n+doc.accessors[p.attributes.POSITION].count,0);
    const triangles=primitives.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0);
    const bones=new Set((doc.skins||[]).flatMap(s=>s.joints));
    assert.equal(vertices,meta.vertices,tag);assert.equal(triangles,meta.triangles,tag);
    assert.equal(triangles,meta.sourceTriangles,`${tag}: original triangle count`);
    assert.equal(bones.size,meta.bones,tag);assert.equal(meta.validation.sourceBonesPreserved,true,tag);
    assert.ok(triangles>100,`${tag}: actual source geometry`);
    for(const primitive of primitives) {
      if(primitive.attributes.JOINTS_0!==undefined)assert.ok(Number.isInteger(primitive.attributes.WEIGHTS_0),`${tag}: weights accompany original joints`);
      const accessor=doc.accessors[primitive.attributes.POSITION];
      assert.ok([...accessor.min,...accessor.max].every(Number.isFinite),`${tag}: finite bounds`);
      const material=doc.materials[primitive.material];
      const sourceMaterial=meta.materials.find(m=>m.material===material.name);
      if(sourceMaterial?.stencilHelper||sourceMaterial?.unboundAuxiliary) {
        assert.equal(material.pbrMetallicRoughness.baseColorFactor[3],0,`${tag}: explicitly hidden helper`);
        if(sourceMaterial.unboundAuxiliary) {
          const evidence=meta.hiddenAuxiliaryMeshes.find(m=>m.material===material.name);
          assert.equal(evidence.sourceSha256,meta.sourceSha256,`${tag}: exact source of missing helper material`);
          assert.equal(evidence.geometryRetained,true,tag);
        }
      }
      else assert.ok(Number.isInteger(material.pbrMetallicRoughness?.baseColorTexture?.index),`${tag}: source color texture`);
    }
    assert.equal(meta.sourceKind,'public-community-game-asset-catalog',tag);
    assert.equal(new URL(meta.source).hostname,'assets.hoyotoon.com',tag);
    assert.equal(meta.sourceFormat,'fbx',tag);
    const files=await filesAt(modelDir);
    const sources=files.filter(p=>p.replaceAll('\\','/').endsWith(meta.sourceFile.replaceAll('\\','/')));
    const original=await Promise.all(sources.map(async path=>({path,bytes:await readFile(path)})));
    const source=original.find(item=>digest(item.bytes)===meta.sourceSha256&&Object.values(meta.textures).every(t=>existsSync(join(dirname(item.path),t.source))));
    assert.ok(source,`${tag}: original FBX retained and hash matches`);
    assert.ok(source.bytes.toString('ascii',0,23).startsWith('Kaydara FBX Binary'),tag);
    for(const texture of Object.values(meta.textures)) {
      assert.equal(digest(await readFile(join(dirname(source.path),texture.source))),texture.sha256,`${tag}: source texture digest`);
      assert.ok(texture.width>0&&texture.height>0&&Math.max(texture.width,texture.height)<=512,tag);
      assert.ok(texture.bindingEvidence,`${tag}: material binding evidence`);
    }
    for(const material of meta.materials)if(material.sourceRecord)assert.equal(digest(await readFile(join(dirname(source.path),material.sourceRecord))),material.sourceRecordSha256,`${tag}: original material digest`);
    assert.deepEqual(meta.validation.missingSourceBones,[],tag);
    verified++;
  }
  if(!verified){context.skip('No original monster GLBs are installed in this source checkout.');return;}
  context.diagnostic(`Verified ${verified} original FBX to GLB models and their embedded resources.`);
});
