import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const runtime=join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||runtime).href);
const executablePath=join(process.env.LOCALAPPDATA||'','ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe');
const folder=resolve('tests/evidence/model-roster');await mkdir(folder,{recursive:true});
const coverage=JSON.parse(await readFile('docs/model-coverage.json','utf8'));
const browser=await chromium.launch({headless:true,...(existsSync(executablePath)?{executablePath}:{})});
const page=await browser.newPage({viewport:{width:1680,height:1050}}),errors=[];
const report={scope:'Rendered inventory fixtures of each available card model; not a natural playthrough or proof of official motions.',models:[],errors,missing:coverage.missing,passed:false};
page.on('pageerror',error=>errors.push(error.message));
try {
  await page.goto((process.env.GAME_URL||'http://127.0.0.1:4178/')+'?debug=1');
  await page.waitForFunction(()=>window.wulongGame?.scene?.renderer);
  assert.deepEqual(await page.evaluate(()=>window.wulongGame.missingModels),coverage.missing.map(c=>c.id));
  await page.evaluate(()=>{
    const g=window.wulongGame,s=g.scene;
    g.newGame('herta','classic','herta-01');g.startGame();g.engine._nextWaveTime=9999;g.engine.setPaused(true);
    const container=s.container;document.body.appendChild(container);
    container.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:98;background:#0b202d';
    document.body.style.overflow='hidden';
    const caption=document.createElement('div');caption.id='roster-caption';caption.style.cssText='position:fixed;top:20px;left:25px;z-index:99;background:#081a29de;color:#ddedf3;padding:12px 18px;font:18px Microsoft YaHei';document.body.appendChild(caption);s.resize();
  });
  const available=coverage.cards.filter(c=>c.representation==='pmx');
  for(let offset=0;offset<available.length;offset+=12) {
    const batch=available.slice(offset,offset+12);
    await page.evaluate(({ids,caption})=>{
      const e=window.wulongGame.engine;e.units=[];e.enemies=[];e.effects=[];e.projectiles=[];
      ids.forEach((type,i)=>e._makeUnit(type,1+Math.floor(i/4)*2,1+(i%4)*2.3));
      document.querySelector('#roster-caption').textContent=caption;
    },{ids:batch.map(c=>c.id),caption:`原版 3D 模型核验 · ${offset+1}–${offset+batch.length} / ${available.length} · 固定陈列`});
    await page.waitForFunction(ids=>{
      const meshes=[...window.wulongGame.scene.actorMeshes.values()].filter(m=>ids.includes(m.userData.type));
      return meshes.length===ids.length&&meshes.every(m=>m.userData.officialState==='ready');
    },batch.map(c=>c.id),{timeout:90000});
    await page.waitForTimeout(180);
    const models=await page.evaluate(()=>[...window.wulongGame.scene.actorMeshes.values()].map(root=>{
      const mesh=root.userData.officialModel;let visibleTextures=0,badTextures=0;
      for(const material of mesh.material)if(material.visible&&material.map){visibleTextures++;if(!material.map.image?.width)badTextures++;}
      mesh.updateMatrixWorld(true);mesh.skeleton.update();
      return {id:root.userData.type,modelName:mesh.name,state:root.userData.officialState,isSkinnedMesh:mesh.isSkinnedMesh,vertices:mesh.geometry.attributes.position.count,bones:mesh.skeleton.bones.length,visibleTextures,badTextures,finite:[...mesh.skeleton.boneMatrices].every(Number.isFinite),source:mesh.userData.metadata.source};
    }));
    assert.equal(models.length,batch.length);
    assert.ok(models.every(m=>m.isSkinnedMesh&&m.vertices>1000&&m.bones>15&&m.visibleTextures>0&&!m.badTextures&&m.finite));
    report.models.push(...models);
    await page.screenshot({path:join(folder,`batch-${String(offset/12+1).padStart(2,'0')}.png`)});
    console.log(`PASS ${offset+batch.length}/${available.length} card models: geometry, skeleton and textures`);
  }
  assert.equal(new Set(report.models.map(m=>m.id)).size,available.length);
  assert.deepEqual(errors,[]);report.passed=true;
} catch(error) {report.failure={message:error.message,stack:error.stack};throw error;}
finally {await writeFile(join(folder,'report.json'),JSON.stringify(report,null,2));await browser.close();}
