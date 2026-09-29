// wulong: small renderer-only fixture, with actual source bundles and synthetic battle states.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const root=resolve('.'),folder=resolve('tests/evidence/glb-renderer',process.env.EVIDENCE_SET||'');await mkdir(folder,{recursive:true});
const requested=(process.env.MODEL_IDS||'boss_dominicus').split(',');
const ids=[...new Set(['march','trailblazer','kafka','pompom','marchBow','trailblazerBat',...(requested.includes('boss_guiji')?['boss_guiji_existence','boss_guiji_decay']:[]),...requested])];
const entry=`import {BattleScene} from './src/scene.js';import {registerOfficialModels} from './src/official-models.js';
const ids=${JSON.stringify(ids)},foes=${JSON.stringify(requested)};registerOfficialModels(Object.fromEntries(ids.map(id=>[id,'/model/'+id])));
const scene=new BattleScene(document.querySelector('#battle'));
const state={map:{id:'herta',rows:6,cols:10},status:'paused',units:[{id:1,type:'march',row:1,x:2,hp:100,maxHp:100},{id:2,type:'trailblazer',row:3,x:3,hp:100,maxHp:100},{id:3,type:'kafka',row:4,x:2,hp:100,maxHp:100}],enemies:foes.map((type,i)=>({id:20+i,type,row:foes.length===1?2:foes.length<=4?[1,4,1,4][i]:i%6,x:foes.length<=4?(i<2?5.5:8.5):7,hp:100,maxHp:100,side:'enemy'})),pompoms:Array.from({length:6},(_,row)=>({id:'pam'+row,row,x:-.82,state:'ready'})),effects:[],gems:[],projectiles:[]};
window.fixture={scene,state};let last=performance.now();function frame(now){const dt=Math.min(.04,(now-last)/1000);last=now;scene.render(state,dt);requestAnimationFrame(frame);}requestAnimationFrame(frame);`;
const built=await build({stdin:{contents:entry,resolveDir:root,sourcefile:'renderer-fixture.js'},bundle:true,write:false,format:'iife',target:'es2020',minify:true,plugins:[{name:'omit-unneeded-portraits',setup(b){b.onResolve({filter:/generated-assets\.js$/},()=>({path:'fixture-art',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const OFFICIAL_PORTRAITS={};',loader:'js'}));}}]});
const html=`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#081924;color:#deeff3;font:15px sans-serif}#caption{height:48px;display:flex;align-items:center;padding:0 24px}#battle{height:calc(100vh - 48px);width:100vw}</style><div id="caption">原始模型渲染核验 · 合成战场状态 · 程序出手/帕姆底座动作</div><div id="battle"></div><script>${built.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script>`;
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}const id=decodeURIComponent(req.url.split('/')[2]||'');if(!ids.includes(id)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','application/json');res.end(await readFile(join(root,'public/assets/models',id,'bundle.json')));}catch(error){res.writeHead(500);res.end(error.message);}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const runtime=join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||runtime).href);const exe=join(process.env.LOCALAPPDATA||'','ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe');const browser=await chromium.launch({headless:true,args:process.env.GLB_BROWSER_GPU==='default'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],...(existsSync(exe)?{executablePath:exe}:{})});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const report={scope:'Original geometry/material/bone browser fixture, not natural gameplay; source clips used where provided',models:requested,errors,console:[]};
page.on('console',message=>{if(['error','warning'].includes(message.type()))report.console.push(message.text());});
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 await page.waitForFunction(()=>window.fixture&&window.fixture.scene.actorMeshes.size>0&&[...window.fixture.scene.actorMeshes.values(),...window.fixture.scene.pompomMeshes.values()].every(o=>o.userData.officialState==='ready'),null,{timeout:120000});
 await page.waitForTimeout(100);await page.screenshot({path:join(folder,'01-original-models.png')});
 report.webgl=await page.evaluate(()=>({lost:window.fixture.scene.renderer.getContext().isContextLost(),draws:window.fixture.scene.renderer.info.render.calls,canvasCount:document.querySelectorAll('canvas').length,html:document.querySelector('#battle').innerHTML.slice(0,400)}));
 assert.equal(report.webgl.lost,false);assert.ok(report.webgl.draws>0);
 report.samples=await page.evaluate(()=>[...window.fixture.scene.actorMeshes].map(([id,o])=>{const m=o.userData.officialModel;const bones=[];m.traverse(n=>{if(n.isBone)bones.push(n);});return{id,type:o.userData.type,yaw:o.userData.body.rotation.y,format:m.userData.importFormat||'pmx',metadata:m.userData.metadata,animations:m.userData.animationSource,bonesFinite:bones.every(b=>[...b.position.toArray(),...b.quaternion.toArray()].every(Number.isFinite))};}));
 assert.ok(report.samples.every(s=>s.bonesFinite));assert.ok(report.samples.filter(s=>s.id.startsWith('e:')).every(s=>s.yaw===-Math.PI/2));
 await page.evaluate(()=>{const {state:s,scene}=window.fixture;s.status='playing';s.units[0].attackAnim=.6;s.units[0].shield=140;s.units[0].hitAnim=.18;s.units[1].attackAnim=.4;s.pompoms[3].state='running';s.pompoms[3].x=4;s.projectiles=[{id:1,x:4,row:1,side:'ally',speed:7,color:'#88d8ff'}];s.effects=[{id:1,type:'spirit-whisper',fromX:2,fromRow:4,x:7,row:2,color:'#e274c3',ttl:.7,maxTtl:1,text:'言灵·策反'}];for(let i=0;i<5;i++)scene.render(s,1/60);s.status='paused';});
 await page.screenshot({path:join(folder,'02-combat-pompom.png')});
 report.combat=await page.evaluate(()=>{const {scene:s}=window.fixture;return{pomRunning:s.pompomMeshes.get('pam3').userData.thrust.visible,slash:s.actorMeshes.get('u:2').userData.combatFx.slash.visible,shield:s.actorMeshes.get('u:1').userData.combatFx.shield.visible,whisperLength:s.effectMeshes.get(1).userData.whisperBeam.scale.y};});
 assert.ok(report.combat.pomRunning&&report.combat.slash&&report.combat.shield&&report.combat.whisperLength>3);
 await page.evaluate(()=>{const {scene:s,state}=window.fixture;state.effects=[];state.projectiles=[];for(const [id,actor]of s.actorMeshes)if(id.startsWith('e:'))actor.userData.officialModel.userData.metadata.facingYaw=Math.PI/2;s.render(state,0);});
 await page.screenshot({path:join(folder,'03-source-front-axis.png')});
 await page.evaluate(()=>{const {scene:s,state}=window.fixture;for(const [id,actor]of s.actorMeshes)if(id.startsWith('e:'))actor.userData.officialModel.userData.metadata.facingYaw=Math.PI;s.render(state,0);});
 await page.screenshot({path:join(folder,'04-source-opposite-axis.png')});
 report.gait=await page.evaluate(()=>{const {scene:s,state}=window.fixture;for(const[id,o]of s.actorMeshes)if(id.startsWith('e:'))o.userData.officialModel.userData.metadata.facingYaw=0;state.status='playing';
 const originalRender=s.renderer.render.bind(s.renderer);s.renderer.render=()=>{};
 let maxContactError=0;for(let i=0;i<100;i++){for(const foe of state.enemies)foe.x-=.2/60;s.render(state,1/60);for(const[id,o]of s.actorMeshes)if(id.startsWith('e:'))for(const leg of o.userData.officialModel.userData.importedRig?.legs||[])if(leg.contact&&leg.target)maxContactError=Math.max(maxContactError,leg.foot.getWorldPosition(o.position.clone()).distanceTo(leg.target));}
 s.renderer.render=originalRender;state.status='paused';s.render(state,0);
 return {maxContactError,models:[...s.actorMeshes].filter(([id])=>id.startsWith('e:')).map(([,o])=>({id:o.userData.type,locomotion:o.userData.officialModel.userData.metadata.locomotion,legs:o.userData.officialModel.userData.importedRig?.legs.length||0,phase:o.userData.officialModel.userData.importedRig?.phase}))};});
 await page.screenshot({path:join(folder,'05-distance-driven-gait.png')});
 assert.ok(report.gait.maxContactError<.035,JSON.stringify(report.gait));
 for(const m of report.gait.models){if(m.locomotion==='quadruped')assert.equal(m.legs,4,m.id);if(m.locomotion==='biped')assert.equal(m.legs,2,m.id);}
 if(requested.includes('boss_guiji'))for(const phase of [2,3]){
   await page.evaluate(p=>{const f=window.fixture;f.state.enemies.find(e=>e.type==='boss_guiji').bossState={phase:p};f.scene.render(f.state,0);},phase);
   await page.waitForFunction(()=>[...window.fixture.scene.actorMeshes.values()].every(o=>o.userData.officialState==='ready'),null,{timeout:60000});
   const model=await page.evaluate(()=>[...window.fixture.scene.actorMeshes.values()].find(o=>o.userData.type==='boss_guiji').userData.modelSourceType);assert.equal(model,phase===2?'boss_guiji_existence':'boss_guiji_decay');
   await page.screenshot({path:join(folder,'06-guiji-phase-'+phase+'.png')});
 }
 assert.deepEqual(errors,[]);report.passed=true;console.log(JSON.stringify({passed:true,models:report.samples.map(s=>({id:s.type,format:s.format,vertices:s.metadata.vertices,bones:s.metadata.bones})),combat:report.combat},null,2));
}finally{await writeFile(join(folder,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
