import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3} from 'three';
import {createImportedGLB,registerOfficialModels,loadOfficialModel,animateOfficialModel,disposeOfficialModel} from '../src/official-models.js';

// A tiny skinned triangle tests loader contracts; it is never a product asset.
function glbFixture({external=false}={}) {
  const parts=[],views=[];let length=0;
  const append=(values)=>{const bytes=Buffer.from(values.buffer,values.byteOffset,values.byteLength);const index=views.length;views.push({buffer:0,byteOffset:length,byteLength:bytes.length});const padded=Buffer.alloc(Math.ceil(bytes.length/4)*4);bytes.copy(padded);parts.push(padded);length+=padded.length;return index;};
  const positions=append(new Float32Array([0,0,0,1,0,0,0,2,0]));
  const joints=append(new Uint16Array(12)),weights=append(new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0]));
  const inverse=append(new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]));
  const times=append(new Float32Array([0,1])),rotations=append(new Float32Array([0,0,0,1,Math.sin(.25),0,0,Math.cos(.25)]));
  const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],nodes:[{name:'Triangle',mesh:0,skin:0},{name:'Bone'}],skins:[{joints:[1],inverseBindMatrices:3}],meshes:[{primitives:[{attributes:{POSITION:0,JOINTS_0:1,WEIGHTS_0:2}}]}],buffers:[{byteLength:length,...(external?{uri:'https://invalid.example/model.bin'}:{})}],bufferViews:views,accessors:[{bufferView:positions,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,2,0]},{bufferView:joints,componentType:5123,count:3,type:'VEC4'},{bufferView:weights,componentType:5126,count:3,type:'VEC4'},{bufferView:inverse,componentType:5126,count:1,type:'MAT4'},{bufferView:times,componentType:5126,count:2,type:'SCALAR',min:[0],max:[1]},{bufferView:rotations,componentType:5126,count:2,type:'VEC4'}],animations:[{name:'Walk',samplers:[{input:4,output:5,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:1,path:'rotation'}}]}]};
  const raw=Buffer.from(JSON.stringify(json)),text=Buffer.alloc(Math.ceil(raw.length/4)*4,0x20);raw.copy(text);const binary=Buffer.concat(parts);
  const file=Buffer.alloc(12+8+text.length+8+binary.length);file.writeUInt32LE(0x46546c67,0);file.writeUInt32LE(2,4);file.writeUInt32LE(file.length,8);file.writeUInt32LE(text.length,12);file.writeUInt32LE(0x4e4f534a,16);text.copy(file,20);file.writeUInt32LE(binary.length,20+text.length);file.writeUInt32LE(0x004e4942,24+text.length);binary.copy(file,28+text.length);
  return{format:'wulong-glb-bundle-v1',glb:file.toString('base64'),height:1.5,metadata:{id:'loader-fixture',sourceFormat:'fbx',forwardAxis:'+Z'}};
}

test('embedded GLB groups retain their geometry and normalize their feet onto the board',async()=>{
  const group=await createImportedGLB(glbFixture());
  assert.ok(group.isGroup);assert.equal(group.userData.metadata.vertices,3);assert.equal(group.userData.metadata.bones,1);
  const box=new Box3().setFromObject(group);assert.ok(Math.abs(box.min.y)<1e-8);assert.ok(Math.abs(box.getSize(new Vector3()).y-1.5)<1e-8);
  assert.deepEqual(group.userData.metadata.animationNames,['Walk']);
});

test('GLB clones have independent original skeletons; source walking obeys movement and pause',async()=>{
  registerOfficialModels({'test-glb':glbFixture()});
  const a=await loadOfficialModel('test-glb'),b=await loadOfficialModel('test-glb');
  const boneA=a.userData.importedRig.bones[0],boneB=b.userData.importedRig.bones[0];
  assert.notEqual(boneA,boneB);
  animateOfficialModel(a,{dt:.1,moving:false,distance:0});assert.equal(a.userData.importedRig.activeAction,null);
  for(let i=0;i<4;i++)animateOfficialModel(a,{dt:.1,moving:true,distance:.055,speed:.55});
  assert.equal(a.userData.importedRig.activeAction,'walk');assert.ok(boneA.quaternion.angleTo(boneB.quaternion)>.05);
  const pose=boneA.quaternion.clone();animateOfficialModel(a,{dt:.1,moving:true,distance:.055,speed:.55,paused:true});assert.equal(boneA.quaternion.angleTo(pose),0);
  for(let i=0;i<3;i++)animateOfficialModel(a,{dt:.1,moving:false,distance:0});assert.equal(a.userData.importedRig.activeAction,null);assert.ok(boneA.quaternion.angleTo(boneB.quaternion)<1e-6);
  assert.doesNotThrow(()=>{disposeOfficialModel(a);disposeOfficialModel(b);});
});

test('GLB loader rejects external binary/image dependencies before any network fetch',async()=>{
  await assert.rejects(createImportedGLB(glbFixture({external:true})),/外部资源/);
});
