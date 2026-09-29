import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {Texture,Vector3} from 'three';
import {parsePMX,createOfficialMesh,attachOfficialRig,animateOfficialModel,getModelFacingYaw} from '../src/official-models.js';

async function model(id='march') {
  const bundle=JSON.parse(await readFile(new URL(`../public/assets/models/${id}/bundle.json`,import.meta.url),'utf8'));
  return attachOfficialRig(await createOfficialMesh(parsePMX(Buffer.from(bundle.pmx,'base64')),bundle,{textureLoader:async()=>new Texture()}));
}
function frame(mesh,frame,speed=0,options={}) {
  const dt=options.dt??1/60;
  mesh.position.z+=speed*dt;
  animateOfficialModel(mesh,{time:frame*dt,dt,distance:speed*dt,speed,moving:speed>0,...options});
  mesh.updateMatrixWorld(true);mesh.skeleton.update();
}
const bonePose=mesh=>mesh.skeleton.bones.flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray()]);
const sourceTest=(name,ids,fn)=>test(name,{skip:ids.some(id=>!existsSync(new URL(`../public/assets/models/${id}/bundle.json`,import.meta.url)))?'Original third-party models are not included in the source-only checkout.':false},fn);

test('source forward axes rotate to the correct lane faction without depending on travel',()=>{
  for(const [axis,vector] of [['+Z',[0,0,1]],['-Z',[0,0,-1]],['+X',[1,0,0]],['-X',[-1,0,0]]]) {
    for(const friendly of [true,false]) {
      const forward=new Vector3(...vector).applyAxisAngle(new Vector3(0,1,0),getModelFacingYaw({forwardAxis:axis},friendly));
      assert.ok(forward.distanceTo(new Vector3(friendly?1:-1,0,0))<1e-10,`${axis} ${friendly}: lane facing`);
    }
  }
  assert.equal(getModelFacingYaw(null,true),Math.PI/2);
  assert.equal(getModelFacingYaw({userData:{metadata:{facingYaw:.25}}},false),-Math.PI/2+.25);
});

sourceTest('real MMD skeletons select skinned deformation legs and settle their arms below shoulder level',['march','dan','trailblazer','aventurine','himeko'],async()=>{
  for(const id of ['march','dan','trailblazer','aventurine','himeko']) {
    const mesh=await model(id);frame(mesh,0);
    for(const side of ['left','right']) {
      const leg=mesh.userData.rig[`${side}Leg`];
      assert.ok(leg.userData.skinWeightSum>0,`${id} ${side}: actual weighted leg`);
      assert.match(leg.name,/D$/,`${id}: existing source uses D deformation chain`);
      const arm=mesh.userData.rig[`${side}Arm`],elbow=mesh.userData.rig[`${side}Elbow`];
      const direction=elbow.getWorldPosition(new Vector3()).sub(arm.getWorldPosition(new Vector3())).normalize();
      assert.ok(direction.y<-.85,`${id} ${side}: arm relaxed, not T/A pose (${direction.y})`);
    }
    assert.equal(mesh.userData.locomotion.legs.length,2);
  }
});

sourceTest('zero displacement never walks even if an external moving hint remains true; pause freezes pose',['march'],async()=>{
  const mesh=await model();frame(mesh,0);
  const before=mesh.userData.rig.leftLeg.quaternion.clone();
  for(let i=1;i<240;i++)frame(mesh,i,0,{moving:true});
  assert.equal(mesh.userData.locomotion.phase,0);
  assert.equal(mesh.userData.locomotion.blend,0);
  assert.ok(before.angleTo(mesh.userData.rig.leftLeg.quaternion)<1e-6);
  const snapshot=bonePose(mesh);
  for(let i=0;i<30;i++)animateOfficialModel(mesh,{time:i+99,dt:1/60,distance:.01,speed:.6,moving:true,paused:true,attack:1});
  assert.deepEqual(bonePose(mesh),snapshot);
});

sourceTest('an asynchronously loaded rig already has a relaxed pose when its first frame is paused',['march'],async()=>{
  const mesh=await model('march');
  const {leftArm,leftElbow}=mesh.userData.rig;
  const direction=leftElbow.getWorldPosition(new Vector3()).sub(leftArm.getWorldPosition(new Vector3())).normalize();
  assert.ok(direction.y<-.85,'initial pose established before any active frame');
  const initial=bonePose(mesh);
  animateOfficialModel(mesh,{time:100,dt:1/60,paused:true,moving:true,distance:.01,attack:1});
  assert.deepEqual(bonePose(mesh),initial);
  assert.equal(mesh.userData.locomotion.clock,0);
});

sourceTest('mixed control/deformation weighting uses a connected knee chain and synchronizes both source chains',['hsr_1214'],async()=>{
  const mesh=await model('hsr_1214');
  const {leftLeg,leftKnee,leftFoot}=mesh.userData.rig;
  assert.ok(leftLeg.getObjectById(leftKnee.id));
  assert.ok(leftKnee.getObjectById(leftFoot.id));
  for(let i=0;i<45;i++)frame(mesh,i,.2);
  for(const {source,target} of mesh.userData.locomotion.mirrors)assert.ok(source.quaternion.angleTo(target.quaternion)<1e-6);
  assert.ok([...mesh.skeleton.boneMatrices].every(Number.isFinite));
});

sourceTest('distance-driven walking visibly deforms weighted legs and holds each stance foot against the floor',['dan'],async()=>{
  const mesh=await model('dan');frame(mesh,0);
  const neutral=mesh.userData.rig.leftLeg.quaternion.clone();
  let maxError=0,contacts=0,maxLegRotation=0,maxLift=0;
  for(let i=1;i<=300;i++){
    frame(mesh,i,.22);
    maxLegRotation=Math.max(maxLegRotation,neutral.angleTo(mesh.userData.rig.leftLeg.quaternion));
    for(const leg of mesh.userData.locomotion.legs){
      const actual=leg.foot.getWorldPosition(new Vector3());
      maxLift=Math.max(maxLift,actual.y-leg.restFoot.y);
      if(leg.contact&&i>30){maxError=Math.max(maxError,actual.distanceTo(leg.anchor));contacts++;}
    }
  }
  assert.ok(contacts>200);
  assert.ok(maxError<.012,`planted ankle error ${maxError}`);
  assert.ok(maxLegRotation>.12,`actual leg rotation ${maxLegRotation}`);
  assert.ok(maxLift>.035,`swing foot clearance ${maxLift}`);
  assert.ok([...mesh.skeleton.boneMatrices].every(Number.isFinite));
});

sourceTest('start and stop are blended, attacks remain active, and a teleport resets old floor anchors',['trailblazer'],async()=>{
  const mesh=await model('trailblazer');frame(mesh,0);
  frame(mesh,1,.2);assert.ok(mesh.userData.locomotion.blend>0&&mesh.userData.locomotion.blend<.25);
  for(let i=2;i<80;i++)frame(mesh,i,.2);
  assert.ok(mesh.userData.locomotion.blend>.99);
  const phase=mesh.userData.locomotion.phase;
  frame(mesh,80,0);assert.ok(mesh.userData.locomotion.blend>.5);
  for(let i=81;i<140;i++)frame(mesh,i,0);
  assert.equal(mesh.userData.locomotion.phase,phase);
  assert.equal(mesh.userData.locomotion.blend,0);
  const arm=mesh.userData.rig.rightArm.quaternion.clone();
  for(let i=140;i<152;i++)frame(mesh,i,0,{attack:1,kind:'melee'});
  assert.ok(arm.angleTo(mesh.userData.rig.rightArm.quaternion)>.25);
  mesh.position.z+=4;frame(mesh,153,0,{teleported:true});
  for(const leg of mesh.userData.locomotion.legs) assert.ok(leg.anchor.distanceTo(mesh.localToWorld(leg.restFoot.clone()))<.001);
});

sourceTest('each attack impulse has one release and recovery, remains frozen on pause, and can retrigger',['trailblazer'],async()=>{
  const mesh=await model('trailblazer');
  for(let i=0;i<7;i++)frame(mesh,i,0,{attack:.4,kind:'melee'});
  assert.ok(mesh.userData.locomotion.attackBlend>.8,'visible release after anticipation');
  const snapshot=bonePose(mesh),age=mesh.userData.locomotion.attackAge;
  frame(mesh,8,0,{attack:.4,kind:'melee',paused:true});
  assert.deepEqual(bonePose(mesh),snapshot);assert.equal(mesh.userData.locomotion.attackAge,age);
  for(let i=8;i<55;i++)frame(mesh,i,0,{attack:.4,kind:'melee'});
  assert.equal(mesh.userData.locomotion.attackBlend,0,'held attack never produces repeated windmill swings');
  frame(mesh,56,0,{attack:0,kind:'melee'});
  for(let i=57;i<63;i++)frame(mesh,i,0,{attack:.4,kind:'melee'});
  assert.ok(mesh.userData.locomotion.attackBlend>.8,'new engine impulse produces another release');
});
