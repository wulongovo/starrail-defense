// CPU rig coverage complements rendered motion QA; no texture/visual quality claim.
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {Texture} from 'three';
import {parsePMX,createOfficialMesh,attachOfficialRig,animateOfficialModel} from '../src/official-models.js';
const directory=new URL('../public/assets/models/',import.meta.url),rows=[];
for(const entry of await readdir(directory,{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  let bundle;try{bundle=JSON.parse(await readFile(new URL(`${entry.name}/bundle.json`,directory),'utf8'));}catch(error){if(error.code==='ENOENT')continue;throw error;}
  const mesh=attachOfficialRig(await createOfficialMesh(parsePMX(Buffer.from(bundle.pmx,'base64')),bundle,{textureLoader:async()=>new Texture()}));
  for(let i=0;i<10;i++){mesh.position.z+=.003;animateOfficialModel(mesh,{time:i/60,dt:1/60,distance:.003,speed:.18,moving:true});}
  mesh.updateMatrixWorld(true);mesh.skeleton.update();
  const state=mesh.userData.locomotion;
  const chains=state.legs.map(leg=>({side:leg.side,bones:[leg.upper.name,leg.knee.name,leg.foot.name],connected:!!leg.upper.getObjectById(leg.knee.id)&&!!leg.knee.getObjectById(leg.foot.id)}));
  rows.push({id:entry.name,legs:state.legs.length,arms:!!mesh.userData.rig.leftArm&&!!mesh.userData.rig.rightArm,chains,mirrorPairs:state.mirrors.length,finite:[...mesh.skeleton.boneMatrices].every(Number.isFinite)});
}
const report={scope:'CPU skeleton/chain coverage on current local PMX bundles; procedural-motion compatibility, not screenshot or official-animation evidence',models:rows.length,rows,failures:rows.filter(row=>!row.finite||row.chains.some(chain=>!chain.connected))};
await mkdir(new URL('./evidence/locomotion/',import.meta.url),{recursive:true});
await writeFile(new URL('./evidence/locomotion/current-rig-audit.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({models:report.models,humanoids:rows.filter(row=>row.legs===2).length,failures:report.failures},null,2));
if(report.failures.length)process.exitCode=1;
