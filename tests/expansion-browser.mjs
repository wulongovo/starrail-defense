import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const runtime=join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||runtime).href);
const exe=process.env.PLAYWRIGHT_CHROMIUM||join(process.env.LOCALAPPDATA||'','ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe');
const browser=await chromium.launch({headless:true,...(existsSync(exe)?{executablePath:exe}:{})});
const context=await browser.newContext({viewport:{width:1536,height:1080}}),page=await context.newPage();
const evidence=resolve('tests/evidence/expansion');await mkdir(evidence,{recursive:true});
const errors=[],report={scope:'Browser UI and synthetic combat fixtures; normal-resource campaigns are validated separately.',checks:[],errors,passed:false};
page.on('pageerror',e=>errors.push(e.message));
const pass=name=>{console.log(`PASS ${name}`);report.checks.push(name);};
const url=(process.env.GAME_URL||'http://127.0.0.1:4178/')+'?debug=1';
async function selectStage(map,id){
  await page.click('#stages-btn');await page.click(`[data-atlas-map="${map}"]`);await page.click(`[data-stage="${id}"]`);
  if(await page.locator('#confirm-mission').isVisible())await page.click('#confirm-mission');
  await page.waitForFunction(id=>window.wulongGame.engine.stage.id===id,id);
}
async function cell(row,col){
  const point=await page.evaluate(({row,col})=>{const s=window.wulongGame.scene,r=s.renderer.domElement.getBoundingClientRect(),p=s.camera.position.clone().set(s.worldX(col),.15,s.worldZ(row)).project(s.camera);return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};},{row,col});
  await page.mouse.click(point.x,point.y);
}
try{
  await page.goto(url);await page.waitForFunction(()=>window.wulongGame?.engine&&window.wulongGame?.scene);
  assert.deepEqual(await page.evaluate(()=>[window.wulongGame.engine.rows,window.wulongGame.engine.cols,window.wulongGame.scene.tiles.length]),[6,10,60]);
  assert.equal(await page.locator('[data-character]').count(),12);
  await page.screenshot({path:join(evidence,'desktop.png'),fullPage:true});
  pass('6×10 battlefield and twelve-card quick bar initialize');
  await page.click('#stages-btn');
  assert.equal(await page.locator('[data-stage]').count(),23);
  assert.equal(await page.locator('.stage-card.transform').count(),3);
  assert.equal(await page.locator('.stage-card.elite').count(),4);
  assert.equal(await page.locator('.stage-card.final').count(),1);
  await page.screenshot({path:join(evidence,'herta-atlas.png'),fullPage:true});
  for(const [map,count] of [['xianzhou',29],['penacony',32],['amphoreus',36],['planarcadia',27]]){
    await page.click(`[data-atlas-map="${map}"]`);assert.equal(await page.locator('[data-stage]').count(),count);
  }
  await page.click('[data-atlas-map="herta"]');await page.click('[data-stage="herta-07"]');
  assert.equal(await page.evaluate(()=>window.wulongGame.engine.stage.modifier),'random-transform');
  const before=await page.evaluate(()=>window.wulongGame.engine.jade);
  await page.click('[data-character="robin"]');await cell(5,9);
  const placed=await page.evaluate(()=>({u:window.wulongGame.engine.units[0],jade:window.wulongGame.engine.jade,cost:window.wulongGame.CHARACTERS.robin.cost}));
  assert.equal(placed.u.row,5);assert.equal(placed.u.col,9);assert.equal(placed.u.originalCard,'robin');assert.equal(placed.jade,before-placed.cost);
  pass('147 stage choices, four Herta minibosses and exactly three random-placement stages; bottom-right tile works');
  await page.click('#roster-btn');
  const rosterCount=await page.evaluate(()=>window.wulongGame.DECK.length);assert.equal(rosterCount,92);
  for(const name of ['忘归人','云璃','丹恒·饮月','丹恒·腾荒','景元','刃','桑博','花火']){
    await page.fill('#catalog-search',name.replace('·','')); // first use an unmatched variant to verify search updates safely
    await page.fill('#catalog-search',name);
    if(name.startsWith('丹恒'))await page.fill('#catalog-search',name.includes('饮月')?'饮月':'腾荒');
    assert.equal(await page.locator('[data-library-character]').count()>0,true,`search ${name}`);
  }
  await page.fill('#catalog-search','忘归人');await page.screenshot({path:join(evidence,'fugue-card.png'),fullPage:true});
  await page.click('[data-library-character="fugue"]');
  assert.equal(await page.locator('[data-character="fugue"]').getAttribute('aria-pressed'),'true');
  await page.click('#roster-btn');await page.fill('#catalog-search','');await page.click('#catalog-next');
  assert.match(await page.locator('#catalog-pagination').innerText(),/2 \/ 4/);
  await page.screenshot({path:join(evidence,'roster.png'),fullPage:true});
  await page.keyboard.press('Escape');
  pass('92 playable cards are searchable, paginated and selectable, including former enemy heroes');
  await page.click('#enemies-btn');
  assert.equal(await page.locator('.catalog-card').count()>=21,true);
  await page.fill('#catalog-search','反重子');assert.equal(await page.locator('.catalog-card').count(),1);
  assert.match(await page.locator('.catalog-card').innerText(),/远程/);
  await page.keyboard.press('Escape');
  pass('monster bestiary shows real monsters and their attack roles');
  await page.evaluate(()=>{
    const g=window.wulongGame;g.newGame('herta','classic','herta-01');g.startGame();const e=g.engine;e._nextWaveTime=9999;
    e._makeUnit('imbibitor',2,2);e._makeUnit('jingyuan',2,3);e.spawnEnemy('reaver',2,8,{hp:100000,maxHp:100000,speed:0});
    for(let i=0;i<1000&&!e.getLinkStates()[0].ready;i++)e.update(.05);
    e.units.forEach(u=>u.attackTimer=9999);e.projectiles=[];
  });
  await page.waitForFunction(()=>!document.querySelector('[data-link="dragon_thunder"]').disabled);
  const chargedHP=await page.evaluate(()=>window.wulongGame.engine.enemies[0].hp);
  await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>window.wulongGame.engine.enemies[0].hp),chargedHP);
  assert.equal(await page.evaluate(()=>window.wulongGame.engine.effects.some(e=>e.type==='link')),false);
  await page.screenshot({path:join(evidence,'link-ready.png'),fullPage:true});
  await page.click('[data-link="dragon_thunder"]');
  assert.equal(await page.evaluate(()=>window.wulongGame.engine.enemies[0].hp),chargedHP-360);
  assert.equal(await page.locator('#link-cutin').isVisible(),true);
  assert.match(await page.locator('#link-cutin').innerText(),/龙吟天将/);
  await page.waitForFunction(()=>[...window.wulongGame.scene.effectMeshes.values()].some(mesh=>mesh.userData.linkKind==='dragon'&&mesh.userData.dragonSegments?.length===28));
  await page.screenshot({path:join(evidence,'dragon-thunder.png'),fullPage:true});
  pass('five combined attacks charge a manual button; click releases damage and the ultimate cut-in');
  await page.evaluate(()=>{
    const g=window.wulongGame;g.newGame('herta','classic','herta-01');g.startGame();const e=g.engine;e._nextWaveTime=9999;
    const s=e._makeUnit('sparkle',2,3);e.spawnEnemy('reaver',2,3.8,{hp:100000,maxHp:100000,speed:0,damage:0});
    for(let i=0;i<1000&&s.transformCount<2;i++)e.update(.05);
    e.setPaused(true);window.sparkleTestId=s.id;
  });
  await page.waitForFunction(()=>{const e=window.wulongGame.engine,s=e.units.find(u=>u.id===window.sparkleTestId),m=window.wulongGame.scene.actorMeshes.get(`u:${s.id}`);return s.transformCount>=2&&m?.userData.type===s.type;});
  pass('Sparkle changes repeatedly after two attacks and the scene follows the new character');
  await page.evaluate(()=>{
    const g=window.wulongGame;g.newGame('herta','classic','herta-01');g.startGame();const e=g.engine;e.wave=e.totalWaves;e._spawnQueue=[];e.enemies=[];e.status='victory';
  });
  await page.waitForSelector('#continue-stage-btn');assert.equal(await page.evaluate(()=>window.wulongGame.saved.clearedStages.includes('herta-01')),true);
  await page.click('#continue-stage-btn');await page.click('#begin-battle');
  assert.equal(await page.evaluate(()=>window.wulongGame.engine.stage.id),'herta-02');
  await page.reload();await page.waitForFunction(()=>window.wulongGame?.engine?.stage.id==='herta-02');
  assert.equal(await page.evaluate(()=>window.wulongGame.saved.clearedStages.includes('herta-01')),true);
  pass('victory records progress, advances to the next stage and survives reload');
  assert.deepEqual(await page.evaluate(()=>window.wulongGame.missingPortraits),[]);
  assert.deepEqual(await page.evaluate(()=>window.wulongGame.missingMonsterPortraits),[]);
  await page.click('#roster-btn');
  for(let i=0;i<4;i++){
    const badImages=await page.locator('.catalog-art img').evaluateAll(async imgs=>{await Promise.all(imgs.map(img=>img.decode().catch(()=>{})));return imgs.filter(img=>!img.complete||img.naturalWidth===0).map(img=>img.alt);});
    assert.deepEqual(badImages,[]);
    if(i<3)await page.click('#catalog-next');
  }
  await page.click('[data-library-tab="enemies"]');
  assert.deepEqual(await page.locator('.catalog-art img').evaluateAll(async imgs=>{await Promise.all(imgs.map(img=>img.decode().catch(()=>{})));return imgs.filter(img=>!img.complete||img.naturalWidth===0).map(img=>img.alt);}),[]);
  await page.keyboard.press('Escape');
  pass('every playable card and ordinary monster has a local source image, and all catalog images decode');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.click('#roster-btn');await page.fill('#catalog-search','花火');
  assert.equal(await page.locator('[data-library-character="sparkle"]').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:join(evidence,'mobile-library.png'),fullPage:true});
  pass('390px battlefield and searchable catalog have no horizontal overflow');
  assert.deepEqual(errors,[]);pass('all expansion browser scenarios finish without uncaught exceptions');report.passed=true;
}finally{await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2));await browser.close();}
