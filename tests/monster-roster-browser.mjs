import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ENEMIES} from '../src/data.js';
const runtime=join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(runtime).href);
const executablePath=join(process.env.LOCALAPPDATA,'ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe');
const browser=await chromium.launch({headless:true,...(existsSync(executablePath)?{executablePath}:{})});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
const folder=resolve('tests/evidence/monster-roster');await mkdir(folder,{recursive:true});
const report={scope:'Real model rendering with injected inventory and Kafka timing scenarios; not a natural playthrough.',models:[],checks:[],errors,passed:false};
page.on('pageerror',e=>errors.push(e.message));
const ids=Object.values(ENEMIES).filter(e=>e.isMonster||e.summon||e.isBoss).map(e=>e.id);
try {
  await page.goto('http://127.0.0.1:4178/?debug=1',{timeout:90000});
  await page.waitForFunction(()=>window.wulongGame?.scene?.renderer);
  await page.evaluate(()=>{const g=window.wulongGame;g.newGame('herta','classic','herta-01');g.startGame();g.engine._nextWaveTime=Infinity;g.engine.setPaused(true);});
  for(let offset=0;offset<ids.length;offset+=6) {
    const batch=ids.slice(offset,offset+6);
    await page.evaluate(ids=>{const e=window.wulongGame.engine;e.enemies=[];e.units=[];e.effects=[];e.projectiles=[];ids.forEach((id,i)=>e.spawnEnemy(id,i,5+(i%2)*2));},batch);
    await page.waitForFunction(ids=>{const meshes=[...window.wulongGame.scene.actorMeshes.values()];return meshes.length===ids.length&&meshes.every(m=>m.userData.officialState==='ready');},batch,{timeout:90000});
    const data=await page.evaluate(()=>{
      const s=window.wulongGame.scene;
      return {lost:s.renderer.getContext().isContextLost(),models:[...s.actorMeshes.values()].map(o=>{
        let vertices=0,textures=0,badTextures=0,finite=true,meshes=0;
        o.userData.officialModel.traverse(n=>{if(n.isMesh){meshes++;vertices+=n.geometry.attributes.position.count;for(const m of Array.isArray(n.material)?n.material:[n.material])if(m.map){textures++;if(!m.map.image?.width)badTextures++;}}if(n.isSkinnedMesh){n.updateMatrixWorld(true);n.skeleton.update();finite&&=[...n.skeleton.boneMatrices].every(Number.isFinite);}});
        return {type:o.userData.type,format:o.userData.officialModel.userData.importFormat||'pmx',vertices,meshes,textures,badTextures,finite,yaw:o.userData.body.rotation.y};
      })};
    });
    assert.equal(data.lost,false);
    for(const m of data.models){assert.ok(m.vertices>100&&m.meshes>0&&m.textures>0&&!m.badTextures&&m.finite,m.type);assert.ok(Math.abs(m.yaw+Math.PI/2)<1e-6,m.type);}
    report.models.push(...data.models);
    await page.screenshot({path:join(folder,`batch-${offset/6+1}.png`),fullPage:true});
    console.log(`PASS original monster models ${offset+batch.length}/${ids.length}`);
  }
  for(let phase=1;phase<=3;phase++) {
    await page.evaluate(phase=>{const e=window.wulongGame.engine;e.enemies=[];const boss=e.spawnEnemy('boss_guiji',3,7);boss.bossState.phase=phase;},phase);
    const expected=['boss_guiji','boss_guiji_existence','boss_guiji_decay'][phase-1];
    await page.waitForFunction(id=>{const m=[...window.wulongGame.scene.actorMeshes.values()][0];return m?.userData.modelSourceType===id&&m.userData.officialState==='ready';},expected,{timeout:60000});
  }
  report.checks.push('Guiji switches all three original combat models by phase');
  await page.evaluate(()=>{
    const g=window.wulongGame;g.newGame('herta','classic','herta-01');g.startGame();const e=g.engine;e._nextWaveTime=Infinity;
    const k=e._makeUnit('kafka',2,1);k.attackTimer=Infinity;
    e.spawnEnemy('reaver',2,7,{speed:0,hp:10000,maxHp:10000});e.spawnEnemy('trampler',2,8,{speed:0,isMiniBoss:true});
    e.setPaused(true);
  });
  await page.waitForFunction(()=>[...window.wulongGame.scene.actorMeshes.values()].length===3&&[...window.wulongGame.scene.actorMeshes.values()].every(m=>m.userData.officialState==='ready'),null,{timeout:60000});
  const charm=await page.evaluate(()=>{
    const e=window.wulongGame.engine;e.setPaused(false);e.update(4.99);const before=e.enemies[0].side;e.update(.01);e.setPaused(true);
    return{before,after:e.enemies[0].side,boss:e.enemies[1].side,effect:e.effects.some(f=>f.type==='spirit-whisper')};
  });
  assert.deepEqual(charm,{before:'enemy',after:'ally',boss:'enemy',effect:true});
  await page.waitForFunction(()=>[...window.wulongGame.scene.actorMeshes.values()].find(m=>m.userData.type==='reaver')?.userData.body.rotation.y===Math.PI/2);
  await page.screenshot({path:join(folder,'kafka-five-seconds.png'),fullPage:true});
  report.checks.push('Kafka charms at five seconds, turns monster right, renders Spirit Whisper, skips mini boss');
  assert.equal(await page.evaluate(()=>window.wulongGame.scene.renderer.getContext().isContextLost()),false);
  assert.equal(report.models.length,24);assert.deepEqual(errors,[]);report.passed=true;
}catch(error){report.failure={message:error.message,stack:error.stack};throw error;}
finally {await writeFile(join(folder,'report.json'),JSON.stringify(report,null,2));await browser.close();}
