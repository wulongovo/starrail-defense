import { GameEngine } from './engine.js';
import { CHARACTERS, ENEMIES, MAPS, DECK, BOX, TRAILBLAZER_FORMS, LINK_SKILLS } from './data.js';
import { BattleScene } from './scene.js';
import { getStage, getStages, STAGE_TOTALS, CAMPAIGN_STAGE_COUNT } from './campaign.js';
import { normalizeProgress, completeStage, resumeStage } from './campaign-progress.js';
import { createInterfacePanels, stageBadge } from './interface-panels.js';
import { OFFICIAL_PORTRAITS, OFFICIAL_MODELS, ASSET_COUNTS } from './generated-assets.js';
import { registerOfficialModels, hasOfficialModel, officialModelTypes } from './official-models.js';
registerOfficialModels(OFFICIAL_MODELS);

const $ = (s) => document.querySelector(s);
const icon = (name, size = 20) => {
  const paths = {
    star: '<path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4Z"/>',
    play: '<path d="m9 5 11 7-11 7Z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
    book: '<path d="M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3ZM12 6v15"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/>',
    bolt: '<path d="m14 2-9 12h6l-1 8 9-12h-6Z"/>',
    sound: '<path d="M3 9h4l5-5v16l-5-5H3ZM16 8q6 4 0 8M19 4q10 8 0 16"/>',
    box: '<path d="m3 7 9-5 9 5v10l-9 5-9-5ZM3 7l9 5 9-5M12 12v10M7 4l10 6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    trash: '<path d="M4 7h16M9 7V3h6v4M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    target: '<circle cx="12" cy="12" r="7"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.star}</svg>`;
};
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const palettes = {
  robin: ['#b6b2ef','#eeebff','#8df4e2'], march: ['#f4aacd','#88cee9','#fdcee5'],
  gepard: ['#e6c184','#425998','#86c7ff'], aventurine: ['#d9b56b','#397d71','#f1d286'],
  trailblazer: ['#b4b3b5','#393a4a','#d6bf84'], preservation: ['#b4b3b5','#604744','#ffb36b'],
  remembrance: ['#b4b3b5','#ad90c7','#f1b6ec'], elation: ['#b4b3b5','#9353a9','#db91e9'],
  harmony: ['#b4b3b5','#483d66','#bd9ced'], herta: ['#917890','#7165a5','#bfaaef'],
  himeko: ['#b3444f','#efe5dd','#ffb899'], dan: ['#343c46','#3e8886','#81d9c1'],
  bailu: ['#b19cda','#e5d7f0','#bda7ff'], kafka: ['#a54d80','#574055','#f496ca'],
  silverWolf: ['#a6a6be','#665b98','#a2adff'], firefly: ['#b6bcc4','#65aba8','#a0f2db'],
  mimi: ['#eeafdc','#eebfdf','#fbe9ff'],
};
function portrait(type, big = false) {
  if (type === 'box') return `<div class="box-art">${icon('box', big ? 86 : 44)}<span>?</span></div>`;
  const src=OFFICIAL_PORTRAITS[type];
  if(src)return `<img class="portrait official-portrait" src="${src}" alt="${esc(CHARACTERS[type]?.name||ENEMIES[type]?.name||type)}官方角色图片" draggable="false">`;
  return `<div class="portrait-pending">${icon('star',big?50:27)}<small>素材接入中</small></div>`;
}

let selected = 'march', form = 'trailblazer', speed = 1, mode = 'classic', mapId = 'herta';
let stageId='herta-01',panels,linkUIKey='';
let engine, scene, preview, lastFrame = performance.now(), hudClock = 0, shownResult = false;
let soundEnabled = false, audioCtx, logEntries = [], lastSound = 0, lastAlert = 0;
let saved = {};
try { saved = JSON.parse(localStorage.getItem('wulong-starrail-defense') || '{}'); } catch {}
saved=normalizeProgress(saved);
const defaultHotbar=['robin','march','gepard','aventurine','trailblazer','fugue','yunli','imbibitor','jingyuan','permansor','sparkle','dan'];
let hotbar=Array.isArray(saved.hotbar)?[...new Set(saved.hotbar)].filter(id=>DECK.includes(id)).slice(0,12):[];
if(hotbar.length<4)hotbar=defaultHotbar.filter(id=>CHARACTERS[id]);
function persistSave(){try{localStorage.setItem('wulong-starrail-defense',JSON.stringify(saved));}catch{}}
const maps = Array.isArray(MAPS) ? MAPS : Object.values(MAPS);
const mapIcons = { herta:'✦', xianzhou:'⌁', penacony:'◷', amphoreus:'♜', planarcadia:'◈' };
const mapEnglish = {herta:'SPACE STATION',xianzhou:'THE XIANZHOU',penacony:'DREAMSCAPE',amphoreus:'ETERNAL LAND',planarcadia:'PLANARCADIA'};

$('#app').innerHTML = `
<header class="topbar"><a class="brand" href="#" aria-label="星穹防线首页"><span class="brand-mark">${icon('star',28)}</span><span>星穹防线<small>ASTRAL DEFENSE</small></span></a><div class="nav-label"><span></span>星穹列车 · 特别行动档案</div><div class="header-actions"><button class="text-button" id="guide-btn">${icon('book',17)}<span>行动指南</span></button><button class="icon-button" id="sound-btn" title="开启合成音效" aria-label="开启合成音效">${icon('sound',19)}<i class="sound-off"></i></button><div class="avatar">W</div></div></header>
<main class="workspace">
  <section class="page-title"><div><div class="eyebrow">TRAILBLAZE OPERATION <span> / EXPEDITION</span></div><h1>下一站，守住这片星海<span>✦</span></h1><p>147 关星海远征 · 6 × 10 战场 · 伙伴连携，手动决胜。</p></div><div class="edition"><span class="live-dot"></span>远征战役 <span class="version">v0.4</span></div></section>
  <section class="mission-nav" aria-label="选择目的地"><div class="map-tabs">${maps.map((m,i)=>`<button class="map-tab ${i===0?'active':''}" data-map="${m.id}" aria-pressed="${i===0}"><span class="map-symbol ${m.id}">${mapIcons[m.id]}</span><span><small>0${i+1} / ${mapEnglish[m.id]||m.id.toUpperCase()}</small><strong>${esc(m.name)}</strong></span><span class="map-check">${icon('star',14)}</span></button>`).join('')}</div><div class="mode-tabs" role="group" aria-label="游戏模式"><button data-mode="classic" class="active" aria-pressed="true">${icon('shield',16)}经典防线</button><button data-mode="blindbox" aria-pressed="false">${icon('box',16)}欢愉盲盒</button></div></section>
  <section class="campaign-strip"><div class="stage-number" id="stage-number">01</div><div class="stage-summary"><div><strong id="stage-title"></strong><span id="stage-badge"></span></div><p id="stage-description"></p></div><div class="campaign-progress"><span id="campaign-progress-text"></span><i><b id="campaign-progress-fill"></b></i></div><button id="stages-btn" class="outline-button">选择关卡 ${icon('arrow',15)}</button></section>
  <div class="game-layout"><section class="battle-panel">
    <div class="battle-toolbar"><div class="resource-block"><span class="jade-icon">◆</span><div><small>可用星琼</small><strong id="jade-count">200</strong></div><button id="collect-btn" title="收取场上全部星琼">收取 ${icon('arrow',13)}</button></div><div class="wave-status"><span id="wave-label">等待跃迁</span><div class="wave-track"><div id="wave-progress"></div></div><small id="wave-subtitle">集结你的开拓小队</small></div><div class="battle-controls"><button id="speed-btn" class="icon-button speed" title="切换演算速度">1×</button><button id="pause-btn" class="icon-button" title="暂停 / 继续（空格）" aria-label="暂停">${icon('pause',18)}</button><span class="control-divider"></span><span id="lives" title="剩余防线耐久">${icon('shield',17)}<b>5</b></span></div></div>
    <div class="battle-view" id="battle-view"><div id="scene"></div><div class="scene-top"><div class="scene-location"><span class="live-dot"></span><span id="location-name">空间站「黑塔」</span><small id="location-type">支援舱段 · 防御演算</small></div><span class="scene-coordinate">SIMULATION // LIVE</span></div><div class="boss-hud" id="boss-hud" hidden><div class="boss-title"><span>FINAL ENCOUNTER</span><strong id="boss-name"></strong><small id="boss-phase"></small></div><div class="boss-health"><i id="boss-health-fill"></i></div><div id="boss-parts" class="boss-parts" hidden></div><div class="boss-skill"><span id="boss-skill-text"></span><div><button id="boss-purify-btn" hidden>净化 ◆50</button><button id="boss-action-btn" hidden>屏障 ◆75</button></div></div></div><div class="board-hint" id="board-hint">选择一位伙伴，点击甲板格位部署</div><div class="ready-card" id="ready-card"><div class="ready-symbol">${icon('star',30)}</div><div><span>开拓者，准备好了吗？</span><small>星琼已就绪。让故事，从你的防线开始。</small></div><button id="start-btn" class="gold-button">开始演算 ${icon('play',15)}</button></div><div class="pause-cover" id="pause-cover" hidden><span>演算暂停</span><button id="resume-btn" class="gold-button">继续防守 ${icon('play',15)}</button></div><div class="link-cutin" id="link-cutin" hidden aria-live="polite"></div><div class="toast" id="toast" role="status"></div></div>
    <div class="link-bar"><span class="link-caption">伙伴连携<small>合计 5 次攻击 · 手动释放</small></span><div id="link-actions"></div><button class="text-button" id="link-guide-btn" aria-label="查看连携规则">?</button></div>
    <div class="deck-header"><span><i></i>开拓小队 <small id="deck-subtitle">选择伙伴 · 点击格位部署</small></span><div class="deck-actions"><button class="text-button library-trigger" id="roster-btn">${icon('book',14)}伙伴库 <b>${DECK.length}</b></button><button class="text-button" id="enemies-btn">怪物档案</button><button class="text-button" id="remove-btn">${icon('trash',14)}撤回</button></div></div><div class="character-deck" id="character-deck"></div>
    <div class="battle-bottom"><span>${icon('target',13)}<span id="selection-hint">已选择三月七 · 点击空格部署</span></span><span><kbd>1–9</kbd>选择 <kbd>SPACE</kbd>暂停 <kbd>ESC</kbd>取消</span></div>
  </section>
  <aside class="side-panel"><section class="character-panel"><div class="section-label"><span>角色档案</span><small>CHARACTER FILE</small></div><div id="character-detail"></div></section><section class="operation-panel"><div class="section-label"><span>行动目标</span>${icon('target',15)}</div><h3 id="objective-title">守住空间站</h3><p id="objective-description"></p><div class="objective-stats"><span>已击退 <strong id="kill-count">0</strong></span><span>演算时间 <strong id="time-count">00:00</strong></span></div><div class="operation-log" id="operation-log"></div></section><div class="rail-message"><span>✧</span><p>「愿此行，终抵群星。」<small>ASTRAL EXPRESS · wulong</small></p></div></aside></div>
  <footer><span>崩坏：星穹铁道 · 原创同人防守支线</span><span>离线可玩 <i>·</i> 官方角色素材 · 同人玩法 <i>·</i> <span id="total-clears">${saved.clearedStages.length}</span> / ${CAMPAIGN_STAGE_COUNT} 关已通关</span></footer>
</main><div class="modal-backdrop" id="modal" hidden></div>`;
// Keep the boss controls outside the playable canvas so they cannot hide the upper lanes.
$('#battle-view').before($('#boss-hud'));

function playSound(kind) {
  if (!soundEnabled) return;
  const now = performance.now(); if (now - lastSound < 100) return; lastSound = now;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    const freq = kind==='gem' ? 880 : kind==='place' ? 523 : kind==='wave' ? 220 : 660;
    osc.type='sine'; osc.frequency.setValueAtTime(freq,audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(freq*1.4,audioCtx.currentTime+.12);
    gain.gain.setValueAtTime(.055,audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.22);
    osc.connect(gain).connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+.23);
  } catch {}
}
function toast(text) {
  $('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),2400);
}
function onEvent(event) {
  if(event.type==='link')showLinkCutin(event);
  if (['gem','collect','place','wave','box','charm','pompom-launch'].includes(event.type)) playSound(event.type);
  if (event.text && !['damage','shoot','hit','gem','collect','attack'].includes(event.type)) {
    logEntries.unshift({text:event.text,time:engine?.time||0});logEntries=logEntries.slice(0,4);
    $('#operation-log').innerHTML=logEntries.map(l=>`<div><i></i><p>${esc(l.text)}</p><time>${formatTime(l.time)}</time></div>`).join('');
  }
  if (['box','blindbox','charm','wave','transform','pompom-launch'].includes(event.type) && event.text && performance.now()-lastAlert>900) {toast(event.text);lastAlert=performance.now();}
}
function formatTime(t){return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;}
function createPreview() {
  const types=['robin','march','fugue','aventurine','imbibitor','jingyuan','yunli','gepard','sparkle'];
  const cells=[[0,0],[2,0],[1,2],[5,2],[2,4],[4,4],[5,5],[4,0],[1,5]];
  const foes=engine.stage?.enemyPool||['reaver','antibaryon'];
  return {map:engine.map,stage:engine.stage,rows:engine.rows,cols:engine.cols,time:0,status:'ready',pompoms:engine.pompoms,units:types.map((type,i)=>({id:`preview-${i}`,type,x:cells[i][0],col:cells[i][0],row:cells[i][1],hp:CHARACTERS[type]?.hp||100,maxHp:CHARACTERS[type]?.hp||100,side:'ally',attackAnim:0,hitAnim:0})),enemies:[0,1,2].map((i)=>({id:`pv-e${i}`,type:foes[i%foes.length],x:8+i*.25,row:[0,3,5][i],hp:200,maxHp:200,side:'enemy'})),gems:[],projectiles:[],effects:[]};
}
function updateCampaign(){
  const stage=engine.stage||getStage(stageId),cleared=getStages(mapId).filter(s=>saved.clearedStages.includes(s.id)).length;
  $('#stage-number').textContent=String(stage.number).padStart(2,'0');
  $('#stage-title').textContent=stage.title;$('#stage-badge').textContent=stageBadge(stage);
  $('#stage-badge').className=stage.modifier?'transform':stage.boss?'final':stage.miniBoss?'elite':'';
  $('#stage-description').textContent=`${stage.areaName} ${stage.areaStage}/${stage.areaStageCount} · ${stage.waves} 波敌人 · ${engine.rows} 行 × ${engine.cols} 列${stage.modifier?' · 部署后随机变身':''}`;
  $('#campaign-progress-text').textContent=`${cleared} / ${STAGE_TOTALS[mapId]} 关已通关`;
  $('#campaign-progress-fill').style.width=`${cleared/STAGE_TOTALS[mapId]*100}%`;
  $('#total-clears').textContent=saved.clearedStages.length;
}
function newGame(id=mapId,newMode=mode,requestedStage){
  const changedMap=id!==mapId;
  mapId=id;mode=newMode;
  const stage=getStage(id,requestedStage??(changedMap?resumeStage(saved,id)?.id:stageId))||getStages(id)[0];
  stageId=stage.id;selected=mode==='blindbox'?'box':'march';shownResult=false;logEntries=[];linkUIKey='';
  const seed=globalThis.crypto?.getRandomValues?crypto.getRandomValues(new Uint32Array(1))[0]:Date.now();
  engine=new GameEngine({map:mapId,stage:stageId,mode,seed,onEvent});
  preview=createPreview();scene?.setMap(engine.map,stage);scene?.setSelected(selected);
  saved.lastStages[mapId]=stageId;persistSave();
  $('#remove-btn').classList.remove('active');$('#pause-btn').innerHTML=icon('pause',18);
  $('#ready-card').hidden=false;$('#pause-cover').hidden=true;$('#operation-log').innerHTML='';
  $('#link-cutin').hidden=true;clearTimeout(showLinkCutin.timer);
  $('#start-btn').innerHTML=`开始第 ${stage.number} 关 ${icon('play',15)}`;
  $('#location-name').textContent=stage.areaName;$('#location-type').textContent=engine.map.name;
  $('#objective-title').textContent=stage.boss?`击败${ENEMIES[stage.boss]?.name}`:stage.miniBoss?'击退精英怪物':stage.modifier?'应对随机变身':'守住这一段旅程';
  $('#objective-description').textContent=stage.modifier?'部署时随机变化为另一位伙伴。费用按选中的卡扣除，活用意外阵容守住防线。':stage.boss?engine.map.objective:`完成 ${stage.waves} 波防守。首波前有 ${stage.prepTime} 秒准备，波次之间有时间补充阵容。`;
  document.querySelectorAll('[data-map]').forEach(b=>{b.classList.toggle('active',b.dataset.map===mapId);b.setAttribute('aria-pressed',String(b.dataset.map===mapId));});
  document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
  $('#deck-subtitle').textContent=mode==='blindbox'?'随机盲盒 · 也可从伙伴库选卡':'快捷栏 · 全部角色在伙伴库';
  $('#board-hint').textContent=stage.modifier?'奇遇规则：每次部署都会随机变化为另一位伙伴':'选择伙伴，点击格位部署 · 可在伙伴库更换快捷卡';
  renderDeck();renderDetail();updateCampaign();updateHUD();
}
function characterInfo(type) {
  if(type==='box')return {...BOX,name:'欢愉盲盒',role:'随机奇遇',hp:'?',color:'#ce9ee7'};
  return CHARACTERS[type]||{name:'撤回角色',role:'战术调整',description:'点击已部署的伙伴将其撤回，腾出格位。',hp:0,cost:0,cooldown:0};
}
function renderDeck(){
  const deck=mode==='blindbox'?['box',...hotbar.filter(id=>id!=='box')].slice(0,12):hotbar;
  $('#character-deck').innerHTML=deck.map((type,i)=>{const c=characterInfo(type);return `<button class="character-card ${selected===type?'selected':''}" data-character="${type}" style="--hero-color:${c.color||'#d7b3f1'}" aria-label="${esc(c.name)}，${c.cost}星琼" aria-pressed="${selected===type}"><span class="card-number">${i<9?i+1:'✦'}</span><div class="card-art">${portrait(type)}</div><strong>${esc(c.name)}</strong><span class="card-cost">◆ ${c.cost}</span><span class="cooldown-overlay"></span></button>`;}).join('');
  document.querySelectorAll('[data-character]').forEach(b=>b.onclick=()=>selectCharacter(b.dataset.character));
}
function selectCharacter(type){
  selected=type;
  if(DECK.includes(type)&&!hotbar.includes(type)){if(hotbar.length>=12)hotbar[hotbar.length-1]=type;else hotbar.push(type);saved.hotbar=[...hotbar];persistSave();}
  scene?.setSelected(type==='remove'?null:type);renderDeck();renderDetail();$('#remove-btn').classList.toggle('active',type==='remove');playSound('select');
}
function renderDetail(){
  const c=characterInfo(selected);const actual=selected==='trailblazer'?characterInfo(form):c;
  $('#character-detail').innerHTML=`<div class="detail-art" style="--portrait-color:${palettes[selected]?.[2]||'#d6b4f1'}"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>${selected==='remove'?icon('trash',70):portrait(selected==='trailblazer'?form:selected,true)}<span class="rarity">✦ ✦ ✦ ✦ ✦</span></div><div class="character-name"><h2>${esc(actual.name)}</h2><span>${esc(actual.role||'开拓伙伴')}</span></div><p class="character-description">${esc(actual.description)}</p><div class="character-stats"><div><span>部署消耗</span><strong><i>◆</i> ${c.cost}</strong></div><div><span>生命值</span><strong>${actual.hp}</strong></div><div><span>部署 CD</span><strong>${c.cooldown}<small>s</small></strong></div></div>${selected==='trailblazer'?`<div class="form-picker"><span>选择开拓者命途</span><div>${['trailblazer','preservation','remembrance','elation','harmony'].map((id,i)=>`<button data-form="${id}" class="${form===id?'active':''}">${['毁灭','存护','记忆','欢愉','同谐'][i]}</button>`).join('')}</div><small>只会变成开拓者自身的不同命途</small></div>`:`<div class="skill-note">${icon('bolt',15)}<span>${selected==='sparkle'?'每攻击两次，随机变成另一位角色':selected==='box'?'开出怪物即为我方':c.baseCooldown?'部署冷却已减少 1 秒 · 费用已下调':'自动战斗 · 部署后即刻生效'}</span></div>`}`;
  document.querySelectorAll('[data-form]').forEach(b=>b.addEventListener('click',()=>{form=b.dataset.form;renderDetail();}));
  $('#selection-hint').textContent=selected==='remove'?'撤回模式 · 点击一个我方角色':selected?`已选择${c.name}${selected==='trailblazer'?' · '+actual.name:''} · 点击空格部署`:'已取消选择 · 点击角色卡重新选择';
}
function updateHUD(){
  $('#jade-count').textContent=Math.floor(engine.jade);$('#kill-count').textContent=engine.kills;$('#time-count').textContent=formatTime(engine.time);
  $('#wave-label').textContent=engine.status==='ready'?'等待跃迁':engine.wave===0?`部署准备 · ${Math.max(0,Math.ceil((engine.stage?.prepTime||18)-engine.time))} 秒`:`第 ${engine.wave} / ${engine.totalWaves} 波敌袭`;
  $('#wave-progress').style.width=`${Math.max(0,engine.wave/engine.totalWaves*100)}%`;
  $('#wave-subtitle').textContent=engine.status==='ready'?`集结小队 · 帕姆待命 ${engine.pompoms.filter(p=>p.state==='ready').length}/${engine.rows}`:`场上敌人 ${engine.enemies.filter(e=>e.side!=='ally'&&e.hp>0).length} · ${mode==='blindbox'?'欢愉盲盒':'经典防线'} · 帕姆 ${engine.pompoms.filter(p=>p.state==='ready').length}/${engine.rows}`;
  $('#lives b').textContent=engine.lives;
  updateLinks();
  const boss=engine.enemies.find(e=>(e.isBoss||ENEMIES[e.type]?.isBoss)&&e.hp>0&&e.side!=='ally');
  $('#boss-hud').hidden=!boss;
  if(boss){
    const state=boss.bossState||{};
    $('#boss-name').textContent=boss.name||ENEMIES[boss.type]?.name;
    $('#boss-phase').textContent=state.phaseName||'终关首领';
    $('#boss-health-fill').style.width=`${Math.max(0,boss.hp/boss.maxHp*100)}%`;
    $('#boss-health-fill').parentElement.title=`${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}`;
    const cast=state.castRemaining>0?` · ${state.castRemaining.toFixed(1)} 秒后释放`:'';
    const shield=state.shield>0?` · 护盾 ${Math.ceil(state.shield)}`:'';
    $('#boss-skill-text').textContent=`${state.skillName||'首领正在行动'}${cast}${shield}`;
    const parts=state.parts||[];
    $('#boss-parts').hidden=!parts.length;
    $('#boss-parts').innerHTML=parts.map(p=>`<span class="${p.hp<=0?'broken':''}">${esc(p.name)} <b>${p.hp>0?Math.ceil(p.hp):'已击破'}</b></span>`).join('');
    if(engine.teamBarrier>0)$('#boss-skill-text').textContent+=` · 我方屏障 ${Math.ceil(engine.teamBarrier)}s`;
    for(const [id,action,label,cost] of [['#boss-action-btn','barrier','屏障',75],['#boss-purify-btn','purify','净化',50]]){
      const button=$(id),cooldown=engine.cooldowns[`boss_${action}`]||0;
      button.hidden=false;
      button.disabled=cooldown>0||engine.jade<cost||engine.status!=='playing';
      button.textContent=cooldown>0?`${label} ${Math.ceil(cooldown)}s`:`${label} ◆${cost}`;
    }
  }

  document.querySelectorAll('[data-character]').forEach(b=>{
    const c=characterInfo(b.dataset.character);let remaining=engine.cooldowns[TRAILBLAZER_FORMS.includes(b.dataset.character)?'trailblazer':b.dataset.character]||0;
    b.classList.toggle('unaffordable',c.cost>engine.jade);b.classList.toggle('cooling',remaining>0);
    b.querySelector('.cooldown-overlay').textContent=remaining>0?`${remaining.toFixed(1)}s`:'';
  });
}
function startGame(){if(engine.status!=='ready')return;engine.start();$('#ready-card').hidden=true;$('#board-hint').textContent=engine.stage?.modifier?'本关部署后随机变化 · 花火每攻击两次继续变身':'星琼每 7 秒掉落 · 连携满 5 次攻击后请手动点击释放';playSound('wave');}
function updateLinks(){
  const states=engine.getLinkStates?.()||[];
  const key=JSON.stringify(states.map(l=>[l.id,l.charge,l.available,l.ready,engine.status]));
  if(key===linkUIKey)return;linkUIKey=key;
  $('#link-actions').innerHTML=states.map(l=>`<button data-link="${l.id}" class="link-button ${l.ready?'charged':''}" ${!l.ready||engine.status!=='playing'?'disabled':''} title="${esc(l.description)}"><span class="link-pair">${(l.members||l.actors).map(id=>`<i>${esc(CHARACTERS[id]?.name||id)}</i>`).join(' × ')}</span><strong>${l.ready?'释放连携':esc(l.name)}</strong><small>${l.available?`${l.charge} / ${l.required||5}`:'等待两位伙伴'}${l.ready?' · 点击施放':''}</small><span class="link-charge"><i style="width:${Math.min(100,l.charge/(l.required||5)*100)}%"></i></span></button>`).join('');
  document.querySelectorAll('[data-link]').forEach(b=>b.onclick=()=>{const result=engine.releaseLink(b.dataset.link);if(!result.ok)toast(result.reason);updateHUD();});
}
function showLinkCutin(event){
  const node=$('#link-cutin');if(!node)return;
  clearTimeout(showLinkCutin.timer);
  node.innerHTML=`<div class="cutin-portraits">${(event.actors||[]).map(id=>portrait(id,true)).join('')}</div><div class="cutin-title"><small>COMBINED ULTIMATE</small><strong>${esc(event.name||event.text||'伙伴连携')}</strong><span>${(event.actors||[]).map(id=>esc(CHARACTERS[id]?.name||id)).join(' × ')}</span></div>`;
  node.hidden=false;node.classList.remove('play');void node.offsetWidth;node.classList.add('play');
  showLinkCutin.timer=setTimeout(()=>{node.hidden=true;},matchMedia('(prefers-reduced-motion: reduce)').matches?900:Math.min(2600,(event.duration||2.5)*1000));
  playSound('wave');
}
function placeAt(row,col){
  if($('#modal').hidden===false||engine.status==='paused')return;
  if(!selected){toast('先点击下方角色卡，再点击格位');return;}
  if(['won','lost','victory','defeat'].includes(engine.status))return;
  if(engine.status==='ready')startGame();
  const result=selected==='remove'?engine.remove(row,col):engine.place(selected,row,col,selected==='trailblazer'?form:undefined);
  if(result===false)toast('这个格位没有可撤回的伙伴');else if(result?.ok===false)toast(result.reason||'这里暂时无法部署');else playSound('place');
  updateHUD();
}
function pauseToggle(){if(engine.status==='ready')return;const paused=engine.status!=='paused';engine.setPaused(paused);$('#pause-cover').hidden=engine.status!=='paused';$('#pause-btn').innerHTML=icon(engine.status==='paused'?'play':'pause',18);}
function modal(content,className=''){const previousResume=!$('#modal').hidden&&$('#modal').dataset.resume==='true';const wasRunning=previousResume||engine.status==='playing'||engine.status==='running';if(wasRunning)engine.setPaused(true);$('#modal').innerHTML=`<div class="modal-card ${className}" role="dialog" aria-modal="true" aria-label="行动档案"><button class="modal-close icon-button" aria-label="关闭">${icon('close')}</button>${content}</div>`;$('#modal').hidden=false;$('#modal').dataset.resume=wasRunning?'true':'false';$('.modal-close').onclick=closeModal;$('.modal-close').focus();}
function closeModal(){const resume=$('#modal').dataset.resume==='true';$('#modal').dataset.resume='false';$('#modal').hidden=true;$('#modal').innerHTML='';if(resume)engine.setPaused(false);if(shownResult){$('#ready-card').hidden=false;$('#start-btn').innerHTML=`重新演算 ${icon('play',15)}`;}}
function showStory(){
  const story=engine.map.story||[{speaker:'姬子',text:engine.map.description}];
  modal(`<div class="eyebrow">TRAILBLAZE ARCHIVE / ${mapId.toUpperCase()}</div><h2>第 ${engine.stage.number} 关 · ${esc(engine.stage.areaName)}</h2><p class="modal-intro">${esc(engine.stage.title)} · ${stageBadge(engine.stage)}<br>${engine.stage.modifier?'每次部署都将随机变为另一位伙伴，费用按选中卡扣除。':esc(engine.map.description)}</p><div class="story-dialogue">${story.map((s,i)=>`<div><span>${esc(s.speaker)}</span><p>${esc(s.text)}</p></div>`).join('')}</div><div class="story-rule">${icon('shield',18)}${engine.rows} 条防线 · ${engine.totalWaves} 波敌袭 · ${mode==='blindbox'?'随机盲盒阵容':'自由部署伙伴'}</div><button class="gold-button modal-primary" id="begin-battle">开始防守 ${icon('arrow',18)}</button>`);$('#begin-battle').onclick=()=>{closeModal();startGame();};
}
function showGuide(){
  modal(`<div class="eyebrow">POM-POM'S FIELD GUIDE</div><h2>开拓者行动指南</h2><div class="guide-grid"><div><b>01 / 147 关远征</b><p>五章自由选关，每关 1–3 波。每五关迎战小 Boss，最后一关为章节首领。黑塔空间站第 7、13、19 关部署后随机变身。</p></div><div><b>02 / 角色与星琼</b><p>伙伴库可搜索 ${DECK.length} 张卡，选择后加入快捷栏。部署 CD 全部减 1 秒，费用降低约 15%。开局 200 星琼，每 7 秒掉落星琼，知更鸟每 8 秒产出；8 秒后自动收取。</p></div><div><b>03 / 手动连携</b><p>饮月 + 景元、腾荒 + 丹恒、忘归人 + 流萤：两位同时在场，合计实际攻击 5 次蓄满。点击「释放连携」才能施放；伙伴离场则重新蓄力。</p></div><div><b>04 / 怪物与变身</b><p>怪物生命提高 35%，每波数量约增 50%。敌人会远程攻击、冲锋、爆炸、召唤和治疗。花火每攻击两次随机变身一次，变身后继续保留这个规则。</p></div><div><b>05 / 开拓者命途</b><p>毁灭挥棒；存护双倍生命、九宫嘲讽与反击；记忆召唤持续存在的迷迷；欢愉每 5 秒随机召唤；同谐支援周围队友。</p></div><div><b>06 / 帕姆与首领反制</b><p>每路左侧帕姆每关出动一次，敌人逼近时自动冲出清场；首领受到冲撞伤害。屏障 75 星琼，净化 50 星琼，可应对首领读条和危险格。</p></div></div><h3 class="guide-roster-title">章节首领</h3><div class="guide-roster">${maps.map(m=>`<div><strong>${esc(m.name)} · 第 ${STAGE_TOTALS[m.id]} 关</strong><p>${esc(ENEMIES[m.boss].name)}：${esc(ENEMIES[m.boss].description)}</p></div>`).join('')}</div><p class="guide-note">6 行 × 10 列战场。空格暂停，1–9 快捷选卡。卡芙卡每 5 秒言灵策反普通怪物。动作、数值、连携与分区关数为塔防改编；帕姆在场外待命，不占部署格；角色、怪物和首领均使用 3D 模型。</p>`);
}
function showResult(){
  shownResult=true;const won=engine.status==='victory',stage=engine.stage;
  if(won){saved=completeStage(saved,stage,engine);persistSave();updateCampaign();}
  const next=stage.nextStageId?getStage(stage.nextStageId):null;
  modal(`<div class="result-emblem ${won?'':'defeat'}">${icon(won?'star':'shield',54)}</div><div class="eyebrow">STAGE ${String(stage.number).padStart(2,'0')} / ${won?'COMPLETE':'ENDED'}</div><h2>${won?'这一程，已守住':'防线暂时失守'}</h2><p class="modal-intro">${esc(stage.title)}<br>${won?(next?`下一关：${esc(next.title)}`:'本章节已抵终点。继续前往下一颗星球。'):'先用知更鸟补给，再部署防护与输出，保留连携应对精英。'}</p><div class="result-stats"><span><b>${engine.kills}</b>击退敌人</span><span><b>${formatTime(engine.time)}</b>防守用时</span><span><b>${engine.lives}</b>剩余耐久</span></div><button id="continue-stage-btn" class="gold-button modal-primary">${won?(next?'继续下一关':'前往下一章节'):'重试本关'} ${icon('arrow',16)}</button><button id="retry-btn" class="text-button modal-secondary">${won?'重玩本关':'打开关卡地图'}</button>`);
  $('#continue-stage-btn').onclick=()=>{closeModal();if(!won)newGame(mapId,mode,stage.id);else if(next)newGame(mapId,mode,next.id);else{const nextMap=maps[(maps.findIndex(m=>m.id===mapId)+1)%maps.length].id;newGame(nextMap,mode,resumeStage(saved,nextMap)?.id);}showStory();};
  $('#retry-btn').onclick=()=>{closeModal();if(won){newGame(mapId,mode,stage.id);startGame();}else panels.showStages();};
}
function changeMission(nextMap,nextMode,nextStage){
  if(['playing','running','paused'].includes(engine.status)){
    modal(`<div class="eyebrow">NEW DESTINATION</div><h2>开启新的演算</h2><p class="modal-intro">切换关卡或模式会重新开始本局，已通关的进度会保留。</p><button class="gold-button modal-primary" id="confirm-mission">重新集结 ${icon('arrow',16)}</button>`);$('#confirm-mission').onclick=()=>{closeModal();newGame(nextMap,nextMode,nextStage);};
  }else newGame(nextMap,nextMode,nextStage);
}
panels=createInterfacePanels({modal,closeModal,portrait,getCurrentMap:()=>mapId,getCurrentStage:()=>engine?.stage,getProgress:()=>saved,onStage:s=>changeMission(s.mapId,mode,s.id),onCharacter:selectCharacter});

newGame(mapId,mode,resumeStage(saved,mapId)?.id);
try {scene=new BattleScene($('#scene'),{onCellClick:(row,col)=>placeAt(row,col),onGemClick:id=>{engine.collectGem(id);updateHUD();playSound('gem');},onCellHover:()=>{}});scene.setMap(engine.map,engine.stage);scene.setSelected(selected);}catch(error){$('#scene').innerHTML=`<div class="webgl-error"><h2>3D 场景未能初始化</h2><p>请使用支持 WebGL 的新版 Edge 或 Chrome，并开启浏览器图形加速。</p><small>${esc(error.message)}</small></div>`;console.error(error);}
$('#start-btn').onclick=()=>{if(shownResult)newGame();showStory();};$('#guide-btn').onclick=showGuide;$('#collect-btn').onclick=()=>{engine.collectAll();updateHUD();playSound('gem');};
$('#pause-btn').onclick=pauseToggle;$('#resume-btn').onclick=pauseToggle;
for(const [id,action] of [['#boss-action-btn','barrier'],['#boss-purify-btn','purify']])$(id).onclick=()=>{const result=engine.bossAction?.(action);toast(result?.text||result?.reason||'首领技能尚未就绪');updateHUD();};
$('#speed-btn').onclick=()=>{speed=speed===1?2:speed===2?3:1;$('#speed-btn').textContent=`${speed}×`;};
$('#sound-btn').onclick=()=>{soundEnabled=!soundEnabled;$('#sound-btn').classList.toggle('enabled',soundEnabled);$('#sound-btn').setAttribute('aria-label',soundEnabled?'关闭合成音效':'开启合成音效');$('#sound-btn').title=soundEnabled?'关闭合成音效':'开启合成音效';if(soundEnabled)playSound('gem');};
$('#stages-btn').onclick=()=>panels.showStages();$('#roster-btn').onclick=()=>panels.showRoster();$('#enemies-btn').onclick=()=>panels.showRoster('enemies');$('#link-guide-btn').onclick=()=>panels.showRoster('links');
$('#remove-btn').onclick=()=>selectCharacter(selected==='remove'?'march':'remove');
document.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{if(b.dataset.map!==mapId)changeMission(b.dataset.map,mode);});
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(b.dataset.mode!==mode)changeMission(mapId,b.dataset.mode);});
$('#battle-view').addEventListener('contextmenu',event=>{event.preventDefault();selected=null;scene?.setSelected(null);renderDeck();renderDetail();});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal();});
window.addEventListener('keydown',event=>{
  if(event.code==='Escape'){if(!$('#modal').hidden)closeModal();else{selected=null;scene?.setSelected(null);renderDeck();renderDetail();}return;}
  if(!$('#modal').hidden)return;
  if(event.code==='Space'){event.preventDefault();pauseToggle();}
  if(/^[1-9]$/.test(event.key)){const card=document.querySelectorAll('[data-character]')[Number(event.key)-1];if(card)selectCharacter(card.dataset.character);}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&['playing','running'].includes(engine.status)){engine.setPaused(true);$('#pause-cover').hidden=false;}});
function frame(now){
  const dt=Math.min((now-lastFrame)/1000,.075);lastFrame=now;
  if(engine.status==='ready'){preview.time+=dt;scene?.render(preview,dt);}else{let step=dt*speed;while(step>0){const tick=Math.min(.05,step);engine.update(tick);step-=tick;}scene?.render(engine,dt);}
  hudClock+=dt;if(hudClock>.12){updateHUD();hudClock=0;}
  if(!shownResult&&['won','lost','victory','defeat'].includes(engine.status))showResult();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Opt-in development hook; absent from normal offline play.
if(new URLSearchParams(location.search).has('debug'))window.wulongGame={get engine(){return engine;},get scene(){return scene;},assets:ASSET_COUNTS,get modelTypes(){return officialModelTypes();},get missingModels(){return DECK.filter(id=>!hasOfficialModel(id));},get missingPortraits(){return DECK.filter(id=>!OFFICIAL_PORTRAITS[id]);},get missingMonsterPortraits(){return Object.values(ENEMIES).filter(e=>e.isMonster&&!OFFICIAL_PORTRAITS[e.id]).map(e=>e.id);},get saved(){return saved;},newGame,startGame,selectCharacter,placeAt,showStages:()=>panels.showStages(),showRoster:()=>panels.showRoster(),getStage,DECK,CHARACTERS};
