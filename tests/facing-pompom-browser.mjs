// wulong: original source meshes with synthetic states for renderer verification.
// Lane-sweeper collision/once-only behavior is verified by the engine tests.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const runtime=join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||runtime).href);
const exe=join(process.env.LOCALAPPDATA||'','ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe');
const folder=resolve('tests/evidence/facing-pompom');await mkdir(folder,{recursive:true});
const browser=await chromium.launch({headless:true,...(existsSync(exe)?{executablePath:exe}:{})});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
const report={scope:'Real PMX rendering; production preview plus synthetic paused/moving/charmed/spent states. Cart animation is authored, not an official motion.',checks:[],errors};
page.on('pageerror',e=>errors.push(e.message));
const data=()=>page.evaluate(()=>{
  const s=window.wulongGame.scene;
  return{actors:[...s.actorMeshes].map(([id,o])=>({id,type:o.userData.type,yaw:o.userData.body.rotation.y,state:o.userData.officialState})),pompoms:[...s.pompomMeshes].map(([id,o])=>({id,x:o.position.x,z:o.position.z,state:o.userData.pompomState,official:o.userData.officialState,yaw:o.userData.body.rotation.y,visible:o.userData.body.visible,hasHealth:!!o.userData.health,thrust:o.userData.thrust.visible,model:o.userData.officialModel?.name,vertices:o.userData.officialModel?.geometry.attributes.position.count}))};
});
try{
  await page.goto((process.env.GAME_URL||'http://127.0.0.1:4178/')+'?debug=1');
  await page.waitForFunction(()=>window.wulongGame?.scene?.pompomMeshes?.size===6);
  await page.waitForFunction(()=>[...window.wulongGame.scene.pompomMeshes.values()].every(o=>o.userData.officialState==='ready'),null,{timeout:60000});
  await page.screenshot({path:join(folder,'01-six-ready.png'),fullPage:true});
  const ready=await data();assert.equal(ready.pompoms.length,6);assert.ok(ready.pompoms.every(p=>p.vertices===10783&&!p.hasHealth&&p.yaw===Math.PI/2&&p.state==='ready'));report.checks.push('production preview has six independent genuine Pom-Pom meshes, facing right, without health bars');
  await page.evaluate(()=>{
    const s=window.wulongGame.scene,e=window.wulongGame.engine;
    const fixture={map:e.map,stage:e.stage,status:'paused',units:[{id:901,type:'march',row:2,x:2,hp:100,maxHp:100},{id:902,type:'trailblazer',row:4,x:3,hp:100,maxHp:100}],enemies:[{id:903,type:'sampo',row:2,x:6,hp:100,maxHp:100,side:'enemy'}],pompoms:e.pompoms.map(p=>({...p,state:'ready',x:-.82})),effects:[],gems:[],projectiles:[]};
    window.facingFixture=fixture;const original=s.render.bind(s);s.render=()=>original(fixture,1/60);s.render();
  });
  await page.waitForFunction(()=>[...window.wulongGame.scene.actorMeshes.values()].length===3&&[...window.wulongGame.scene.actorMeshes.values()].every(o=>o.userData.officialState==='ready'),null,{timeout:60000});
  await page.screenshot({path:join(folder,'02-paused-facing.png'),fullPage:true});
  let sample=await data();assert.ok(sample.actors.filter(a=>a.id.startsWith('u:')).every(a=>a.yaw===Math.PI/2));assert.equal(sample.actors.find(a=>a.id==='e:903').yaw,-Math.PI/2);report.checks.push('new models loaded while paused immediately face their faction direction');
  await page.evaluate(()=>{const f=window.facingFixture;f.enemies[0].side='ally';f.units[0].x-=.1;window.wulongGame.scene.render();});
  sample=await data();assert.ok(sample.actors.every(a=>a.yaw===Math.PI/2));report.checks.push('charmed enemy turns right even while paused; recoil never reverses an ally');
  await page.evaluate(()=>{const f=window.facingFixture;f.status='playing';f.pompoms[2].state='running';f.pompoms[2].x=4;window.wulongGame.scene.render();});
  await page.waitForTimeout(200);await page.screenshot({path:join(folder,'03-running.png'),fullPage:true});
  sample=await data();assert.equal(sample.pompoms[2].state,'running');assert.ok(sample.pompoms[2].visible&&sample.pompoms[2].thrust&&sample.pompoms[2].x>sample.pompoms[1].x);assert.equal(sample.actors.length,3);report.checks.push('running cart moves along its own row with a visible propulsion trail and occupies no actor slot');
  await page.evaluate(()=>{const f=window.facingFixture;f.pompoms[2].state='spent';window.wulongGame.scene.render();});
  sample=await data();assert.equal(sample.pompoms[2].visible,false);assert.equal(sample.pompoms[2].thrust,false);await page.screenshot({path:join(folder,'04-spent.png'),fullPage:true});report.checks.push('consumed cart hides Pom-Pom and propulsion, leaving a dark spent base');
  await page.evaluate(()=>{
    const f=window.facingFixture,s=window.wulongGame.scene;
    f.units[0].attackAnim=.6;f.units[0].hitAnim=.18;f.units[0].shield=140;
    f.units[1].attackAnim=.4;
    f.units.push({id:904,type:'kafka',row:1,x:3,hp:100,maxHp:100});
    f.projectiles=[{id:'fixture-shot',x:4,row:2,speed:7,side:'ally',color:'#9cd8f3'},{id:'fixture-enemy-shot',x:5,row:4,speed:-4.5,side:'enemy',color:'#d690db'}];
    f.effects=[{id:'fixture-whisper',type:'spirit-whisper',x:6,row:2,fromX:3,fromRow:1,color:'#e274c3',ttl:.7,maxTtl:1,text:'言灵·策反'}];
    for(let i=0;i<4;i++)s.render();f.status='paused';
  });
  await page.waitForFunction(()=>window.wulongGame.scene.actorMeshes.get('u:904')?.userData.officialState==='ready',null,{timeout:60000});
  await page.screenshot({path:join(folder,'05-attack-whisper.png'),fullPage:true});
  const combat=await page.evaluate(()=>{
    const s=window.wulongGame.scene,shot=s.projectileMeshes.get('fixture-shot'),enemyShot=s.projectileMeshes.get('fixture-enemy-shot');
    const ranged=s.actorMeshes.get('u:901').userData.combatFx,melee=s.actorMeshes.get('u:902').userData.combatFx;
    const beam=s.effectMeshes.get('fixture-whisper').userData.whisperBeam;
    const allocation=[ranged.group,melee.group,shot,enemyShot,beam];for(let i=0;i<20;i++)s.render();
    return {slash:melee.slash.visible,muzzle:ranged.muzzle.visible,shield:ranged.shield.visible,impact:ranged.impact.visible,beamLength:beam.scale.y,beamFinite:beam.quaternion.toArray().every(Number.isFinite),tailCount:shot.children.length-1,enemyYaw:enemyShot.rotation.y,stable:allocation.every((o,i)=>o===[ranged.group,melee.group,s.projectileMeshes.get('fixture-shot'),s.projectileMeshes.get('fixture-enemy-shot'),s.effectMeshes.get('fixture-whisper').userData.whisperBeam][i])};
  });
  assert.ok(combat.slash&&combat.muzzle&&combat.shield&&combat.impact&&combat.beamFinite&&combat.stable);assert.ok(combat.beamLength>3);assert.equal(combat.tailCount,3);assert.equal(combat.enemyYaw,Math.PI);report.combat=combat;report.checks.push('cached melee arc, ranged muzzle/trail, hit sparks, shield and localized Kafka whisper beam render together without per-frame object replacement');
  assert.deepEqual(errors,[]);report.passed=true;report.final=sample;console.log(JSON.stringify(report,null,2));
}finally{await writeFile(join(folder,'report.json'),JSON.stringify(report,null,2));await browser.close();}
