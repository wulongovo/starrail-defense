// Synthetic visual fixtures: inspect area scenery and the three manual-link effects.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const runtime=join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||runtime).href);
const exe=join(process.env.LOCALAPPDATA||'','ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe');
const browser=await chromium.launch({headless:true,...(existsSync(exe)?{executablePath:exe}:{})});
const page=await browser.newPage({viewport:{width:1536,height:1080}});
const folder=resolve('tests/evidence/scene-expansion');await mkdir(folder,{recursive:true});
const errors=[],report={scope:'Synthetic fixed-time rendering fixtures, not natural playthrough evidence',areas:[],links:[],errors};
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto((process.env.GAME_URL||'http://127.0.0.1:4178/')+'?debug=1');
  await page.waitForFunction(()=>window.wulongGame?.scene?.renderer&&document.querySelector('canvas'));
  for(const [name,stageId] of [['harbor','xianzhou-01'],['water','xianzhou-29'],['prison','herta-23'],['arbor','amphoreus-36']]) {
    const area=await page.evaluate(({stageId})=>{
      const g=window.wulongGame,s=g.scene,stage=g.getStage(stageId);
      s._visualOriginal ||= s.render.bind(s);
      const fixture={map:{id:stage.mapId,cols:10,rows:6},stage,units:[],enemies:[],gems:[],projectiles:[],effects:[]};
      s.render=()=>s._visualOriginal(fixture,1/60);s.render();
      return {areaId:s.areaId,decoration:stage.decoration,tiles:s.tiles.length,landmarks:s.mapRoot.children.find(c=>c.name===`area:${stage.areaId}`)?.children.length};
    },{stageId});
    assert.equal(area.tiles,60);assert.ok(area.landmarks>0);report.areas.push(area);
    await page.screenshot({path:join(folder,`area-${name}.png`),fullPage:true});
  }
  for(const [linkId,actors] of [['dragon_thunder',['imbibitor','jingyuan']],['earthbound_oath',['permansor','dan']],['fox_firefly',['fugue','firefly']]]) {
    const result=await page.evaluate(({linkId,actors})=>{
      const g=window.wulongGame,s=g.scene,stage=g.getStage('xianzhou-29');
      const fixture={map:{id:'xianzhou',cols:10,rows:6},stage,units:actors.map((type,i)=>({id:i+1,type,row:2,col:i+2,hp:100,maxHp:100})),enemies:[],gems:[],projectiles:[],effects:[{id:linkId,type:'link',linkId,actors,x:4.5,row:2.5,ttl:1.15,maxTtl:2.5,color:'#a7efde'}]};
      s.render=()=>s._visualOriginal(fixture,1/60);s.render();
      const fx=s.effectMeshes.get(linkId);return {linkId,kind:fx.userData.linkKind,meshes:fx.userData.linkGroup.children.length};
    },{linkId,actors});
    assert.ok(result.meshes>20);report.links.push(result);
    await page.waitForTimeout(400);
    await page.screenshot({path:join(folder,`link-${linkId}.png`),fullPage:true});
  }
  assert.deepEqual(errors,[]);report.passed=true;console.log(JSON.stringify(report,null,2));
} finally {await writeFile(join(folder,'report.json'),JSON.stringify(report,null,2));await browser.close();}
