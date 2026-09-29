import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {MAPS, CHARACTERS} from '../src/data.js';
import {getStages} from '../src/campaign.js';

const local=resolve('node_modules/playwright/index.mjs');
const runtime=join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||(existsSync(local)?local:runtime)).href);
const executablePath=process.env.PLAYWRIGHT_CHROMIUM||join(process.env.LOCALAPPDATA||'','ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe');
const browser=await chromium.launch({headless:true,...(existsSync(executablePath)?{executablePath}:{})});
const page=await browser.newPage({viewport:{width:1536,height:1080}});
const evidence=resolve('tests/evidence');await mkdir(evidence,{recursive:true});
const errors=[],report={version:'0.4.0',startedAt:new Date().toISOString(),kind:'Synthetic browser scenarios for asset rendering and boss UI; injected formations do not establish campaign balance.',checks:[],errors,passed:false};
page.on('pageerror',e=>errors.push(e.message));
const pass=name=>{report.checks.push(name);console.log(`PASS ${name}`);};
try{
  await page.goto((process.env.GAME_URL||'http://127.0.0.1:4178/')+'?debug=1');
  await page.waitForFunction(()=>window.wulongGame?.scene?.renderer);
  await page.evaluate(()=>{
    const g=window.wulongGame;g.newGame('herta','classic','herta-01');g.startGame();const e=g.engine;
    const allies=['robin','march','gepard','aventurine','trailblazer','herta','himeko','dan','bailu','kafka','silverWolf','firefly'];
    allies.forEach((type,i)=>e._makeUnit(type,i%e.rows,Math.floor(i/e.rows)*3));
    ['voidranger','stormbringer','sparkle','sampo','bronya','boss'].forEach((type,j)=>{const i=j+allies.length;e.spawnEnemy(type,i%e.rows,Math.floor(i/e.rows)*3,{side:'ally'});});
    e.setPaused(true);
  });
  await page.waitForFunction(()=>[...window.wulongGame.scene.actorMeshes.values()].filter(o=>o.userData.officialState==='ready').length===18,{},{timeout:60000});
  const models=await page.evaluate(()=>[...window.wulongGame.scene.actorMeshes.values()].map(o=>{
    const m=o.userData.officialModel;let textures=0,badTextures=0;
    m.traverse(n=>{for(const mat of Array.isArray(n.material)?n.material:[n.material])if(mat?.map){textures++;if(!mat.map.image?.width)badTextures++;}});
    return {type:o.userData.type,vertices:m.geometry?.attributes.position.count,textures,badTextures};
  }));
  assert.equal(models.length,18);assert.equal(models.reduce((n,m)=>n+m.badTextures,0),0);assert.equal(models.every(m=>m.textures>0),true);
  report.models=models;await page.screenshot({path:join(evidence,'official-roster.png'),fullPage:true});
  pass('18 actual character PMX meshes and all assigned textures load in WebGL');
  for(const {id:map,boss} of MAPS){
    const stage=getStages(map).at(-1);
    await page.evaluate(({map,boss,stageId})=>{
      const g=window.wulongGame;g.newGame(map,'classic',stageId);g.startGame();const e=g.engine;e._nextWaveTime=9999;e.jade=350;
      e._makeUnit('march',0,2);e._makeUnit('robin',1,0);e._makeUnit('aventurine',2,5);
      const b=e.spawnEnemy(boss,Math.floor(e.rows/2),e.cols-.2);
      b.bossState.skillTimer=0;e.update(.05);
      b.bossState.castRemaining=20;b.bossState.castDuration=20;
    },{map,boss,stageId:stage.id});
    assert.equal(await page.evaluate(()=>window.wulongGame.engine.stage.id),stage.id);
    assert.deepEqual(await page.evaluate(()=>[window.wulongGame.engine.rows,window.wulongGame.engine.cols]),[6,10]);
    await page.waitForFunction(()=>!document.querySelector('#boss-hud').hidden);
    await page.waitForTimeout(650);
    assert.equal(await page.locator('#boss-name').innerText(),await page.evaluate(()=>window.wulongGame.engine.getBossState().name));
    await page.click('#boss-action-btn');
    assert.equal(await page.evaluate(()=>window.wulongGame.engine.jade),275);
    assert.equal(await page.evaluate(()=>window.wulongGame.engine.teamBarrier>0),true);
    assert.equal(await page.locator('#boss-action-btn').isDisabled(),true);
    await page.waitForFunction(()=>[...window.wulongGame.scene.actorMeshes.values()].find(m=>m.userData.type.startsWith('boss_'))?.userData.officialState==='ready',{},{timeout:60000});
    await page.screenshot({path:join(evidence,`${boss}.png`),fullPage:true});
    pass(`${map}: correct boss, real 3D model, telegraph and functioning barrier button`);
  }
  await page.evaluate(()=>{
    const e=window.wulongGame.engine,b=e.enemies.find(b=>b.isBoss),s=b.bossState;
    s.phase=3;s.phaseName='坏';s.markedCells=[{row:0,col:2},{row:1,col:0},{row:2,col:5},{row:e.rows-1,col:e.cols-1}];
    s.warningCells=s.markedCells;s.warningRows=[0,1,2,e.rows-1];s.castRemaining=20;s.skillName='坏·爆梗狂欢';
  });
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(()=>window.wulongGame.scene.warningMeshes.size),4);
  await page.screenshot({path:join(evidence,'guiji-four-cells.png'),fullPage:true});
  await page.click('#boss-purify-btn');
  assert.equal(await page.evaluate(()=>window.wulongGame.engine.getBossState().markedCells.length),0);
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(()=>window.wulongGame.scene.warningMeshes.size),0);
  pass('Guiji marks exactly four cells and UI purification clears them');
  await page.evaluate(()=>{
    const g=window.wulongGame;g.newGame('herta','classic','herta-01');g.startGame();const e=g.engine;e._nextWaveTime=9999;
    ['trailblazer','preservation','remembrance','elation','harmony','march'].forEach((type,i)=>e._makeUnit(type,Math.floor(i/3)*2+1,(i%3)*2+1));
    ['enemy_lotus','enemy_retainer','enemy_comedian'].forEach((type,i)=>e.spawnEnemy(type,i,e.cols-1.5));
    e.update(1);e.setPaused(true);
  });
  await page.waitForFunction(()=>[...window.wulongGame.scene.actorMeshes.values()].some(o=>o.userData.type==='mimi'&&o.userData.officialState==='ready'));
  await page.waitForFunction(()=>[...window.wulongGame.scene.actorMeshes.values()].filter(o=>['trailblazer','preservation','remembrance','elation','harmony','march'].includes(o.userData.type)&&o.userData.officialState==='ready').length===6);
  await page.waitForFunction(()=>[...window.wulongGame.scene.actorMeshes.values()].filter(o=>['enemy_lotus','enemy_retainer','enemy_comedian'].includes(o.userData.type)&&o.userData.officialState==='ready').length===3,{},{timeout:60000});
  await page.waitForFunction(()=>[...window.wulongGame.scene.actorMeshes.values()].filter(o=>o.userData.officialWeapons?.length).length===3);
  const weapons=await page.evaluate(()=>[...window.wulongGame.scene.actorMeshes.values()].flatMap(o=>(o.userData.officialWeapons||[]).map(w=>{
    w.geometry.computeBoundingBox();const size=w.geometry.boundingBox.getSize(w.position.clone());
    w.updateWorldMatrix(true,false);const scale=w.getWorldScale(w.position.clone());
    return {type:o.userData.type,length:Math.max(size.x,size.y,size.z)*Math.max(scale.x,scale.y,scale.z)};
  })));
  const expectedLengths={trailblazer:.8,preservation:1.5,march:1.1};
  assert.equal(weapons.length,3);
  for(const weapon of weapons)assert.ok(Math.abs(weapon.length-expectedLengths[weapon.type])<.015,`${weapon.type}: ${weapon.length}`);
  report.weapons=weapons;
  await page.screenshot({path:join(evidence,'trailblazer-paths.png'),fullPage:true});
  pass('five Trailblazer paths, real Mimi PMX, three weapon sizes and summoned projections render');
  assert.deepEqual(errors,[]);pass('no uncaught browser exceptions');report.passed=true;
}catch(error){report.failure={message:error.message,stack:error.stack};throw error;
}finally{report.completedAt=new Date().toISOString();await writeFile(join(evidence,'boss-browser-report.json'),JSON.stringify(report,null,2));await browser.close();}
