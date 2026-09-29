// wulong · Visual motion QA uses real imported meshes and a synthetic trajectory.
// The procedural motions in this recording are not official game animations.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const runtime=join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||runtime).href);
const exe=join(process.env.LOCALAPPDATA||'','ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe');
const folder=resolve('tests/evidence/locomotion');await mkdir(folder,{recursive:true});
const browser=await chromium.launch({headless:true,...(existsSync(exe)?{executablePath:exe}:{})});
const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:folder,size:{width:1280,height:800}}});
const page=await context.newPage(),errors=[];
const report={scope:'Original character meshes; authored procedural animation on a synthetic path, not an official motion clip or natural gameplay',errors,checks:[],samples:[]};
page.on('pageerror',error=>errors.push(error.message));
const sample=()=>page.evaluate(()=>[...window.wulongGame.scene.actorMeshes.values()].map(root=>{
  const m=root.userData.officialModel,s=m?.userData.locomotion;
  return{type:root.userData.type,state:root.userData.officialState,phase:s?.phase,blend:s?.blend,speed:s?.speed,distance:s?.distance,legBones:s?.legs.map(l=>l.upper.name),legQuaternions:s?.legs.map(l=>l.upper.quaternion.toArray()),contacts:s?.legs.map(l=>({side:l.side,planted:l.contact,foot:l.foot.getWorldPosition(root.position.clone()).toArray(),target:l.target?.toArray()}))};
}));
async function capture(name){await page.screenshot({path:join(folder,`${name}.png`)});const samples=await sample();report.samples.push({name,models:samples});return samples;}
async function mode(name){await page.evaluate(name=>{window.motionFixture.mode=name;window.motionFixture.lastTime=performance.now();document.querySelector('#motion-caption').textContent=`程序骨骼动画核验 · ${name} · 原模型 / 合成运动轨迹`;},name);}
try{
  await page.goto((process.env.GAME_URL||'http://127.0.0.1:4178/')+'?debug=1');
  await page.waitForFunction(()=>window.wulongGame?.scene?.renderer);
  await page.evaluate(()=>{
    const g=window.wulongGame,s=g.scene;
    const fixture={map:g.engine.map,stage:g.engine.stage,status:'playing',units:['dan','march','trailblazer'].map((type,i)=>({id:501+i,type,row:3,x:2.9+i*1.5,hp:100,maxHp:100,attackAnim:0})),enemies:[],effects:[],gems:[],projectiles:[],mode:'idle',lastTime:performance.now()};
    window.motionFixture=fixture;
    const original=s.render.bind(s);
    s.render=()=>{
      const now=performance.now(),dt=Math.min(.05,(now-fixture.lastTime)/1000);fixture.lastTime=now;
      for(const unit of fixture.units){
        if(fixture.mode==='walking')unit.x+=.18*dt;
        unit.attackAnim=fixture.mode==='attack'?1:0;
      }
      fixture.status=fixture.mode==='paused'?'paused':'playing';
      original(fixture,dt);
    };
    const container=s.container;for(const child of [...container.children])if(child!==s.renderer.domElement)child.style.display='none';
    // Keep HUD nodes connected because the production loop updates their text.
    document.body.appendChild(container);container.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;background:#10202b;z-index:98;';
    document.body.style.cssText='margin:0;overflow:hidden;';
    const caption=document.createElement('div');caption.id='motion-caption';caption.textContent='程序骨骼动画核验 · idle · 原模型 / 合成运动轨迹';caption.style.cssText='position:fixed;top:24px;left:28px;color:#ddedee;font:18px Microsoft YaHei;z-index:99;padding:10px 16px;background:#0a1b29dc;border:1px solid #487383;';document.body.appendChild(caption);
    s.resize();s.camera.zoom=2.15;s.camera.updateProjectionMatrix();s.render();
  });
  await page.waitForFunction(()=>[...window.wulongGame.scene.actorMeshes.values()].filter(o=>[501,502,503].some(id=>o===window.wulongGame.scene.actorMeshes.get(`u:${id}`))).every(o=>o.userData.officialState==='ready'),{timeout:30000});
  await page.waitForTimeout(500);const idle=await capture('01-idle');assert.equal(idle.length,3);assert.ok(idle.every(m=>m.phase===0&&m.blend===0));report.checks.push('standing original models do not step in place');
  await mode('walking');await page.waitForTimeout(500);await capture('02-heel-contact');await page.waitForTimeout(400);await capture('03-swing-clearance');await page.waitForTimeout(400);const walking=await capture('04-weight-transfer');assert.ok(walking.every(m=>m.distance>.1&&m.blend>.95));report.checks.push('actual positional travel advances gait and weighted D legs');
  await mode('paused');const paused=await sample();await page.waitForTimeout(500);const pausedAfter=await capture('05-paused');assert.deepEqual(pausedAfter.map(m=>m.legQuaternions),paused.map(m=>m.legQuaternions));report.checks.push('pause freezes real skeleton pose');
  await mode('idle');await page.waitForTimeout(900);const stopped=await capture('06-settled');assert.ok(stopped.every(m=>m.blend<.001));report.checks.push('stop eases into a planted idle pose');
  await mode('attack');await page.waitForTimeout(250);await capture('07-attack');await page.waitForTimeout(500);
  assert.deepEqual(errors,[]);report.passed=true;console.log(JSON.stringify({passed:true,checks:report.checks,errors},null,2));
}finally{
  await writeFile(join(folder,'report.json'),JSON.stringify(report,null,2));const video=page.video();await context.close();if(video){const p=await video.path();await rename(p,join(folder,'procedural-walk-review.webm')).catch(()=>{});}await browser.close();
}
