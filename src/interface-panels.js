import { CHARACTERS, ENEMIES, MAPS, DECK, LINK_SKILLS } from './data.js';
import { getStages, STAGE_TOTALS } from './campaign.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const groups={all:'全部',attack:'输出',defense:'防护',support:'辅助',special:'召唤 / 特殊'};
function roleGroup(c){return ['tank','counter','taunt','protector','guardian'].includes(c.kind)?'defense':['producer','healer','buffer','support'].includes(c.kind)?'support':['summoner','randomSummoner','shapeshifter','pet'].includes(c.kind)?'special':'attack';}
export const stageBadge=s=>s.boss?'终章首领':s.miniBoss?'小 Boss':s.modifier==='random-transform'?'随机变身':'常规关卡';

export function createInterfacePanels({modal,closeModal,portrait,getCurrentMap,getCurrentStage,getProgress,onStage,onCharacter}) {
  function showStages(scope=getCurrentMap()) {
    const stages=getStages(scope),map=MAPS.find(m=>m.id===scope),saved=getProgress(),cleared=new Set(saved.clearedStages),active=getCurrentStage();
    const areas=[...new Set(stages.map(s=>s.areaId))];
    modal(`<div class="eyebrow">TRAILBLAZE ATLAS / ${scope.toUpperCase()}</div><h2>开拓航线</h2><p class="modal-intro">自由选关 · 每关 1–3 波 · 通关记录自动保存</p>
      <div class="atlas-maps">${MAPS.map(m=>`<button data-atlas-map="${m.id}" class="${m.id===scope?'active':''}">${esc(m.name)}<small>${getStages(m.id).filter(s=>cleared.has(s.id)).length} / ${STAGE_TOTALS[m.id]}</small></button>`).join('')}</div>
      <div class="atlas-overview"><strong>${esc(map.name)}</strong><span>${stages.filter(s=>cleared.has(s.id)).length} / ${stages.length} 已通关</span></div>
      <div class="atlas-legend"><span>○ 常规</span><span class="violet">✦ 随机变身</span><span class="gold">◆ 小 Boss</span><span class="red">♜ 终章首领</span><span class="teal">✓ 已通关</span></div>
      ${areas.map(area=>{const list=stages.filter(s=>s.areaId===area);return `<section class="atlas-area"><div class="atlas-area-title"><span style="color:${esc(list[0].tint)}">${esc(list[0].areaName)}</span><small>${list.length} 关 · ${cleared.has(list[0].id)?'继续探索':'等待开拓'}</small></div><div class="stage-grid">${list.map(s=>`<button data-stage="${s.id}" class="stage-card ${s.boss?'final':s.miniBoss?'elite':s.modifier?'transform':''} ${active?.id===s.id?'active':''} ${cleared.has(s.id)?'cleared':''}" title="${esc(s.title)}"><b>${String(s.number).padStart(2,'0')}</b><span>${cleared.has(s.id)?'✓ ':''}${stageBadge(s)}</span><small>${s.waves} 波 · ${s.enemyCount} 敌人</small></button>`).join('')}</div></section>`;}).join('')}`,'wide-modal');
    document.querySelectorAll('[data-atlas-map]').forEach(b=>b.onclick=()=>showStages(b.dataset.atlasMap));
    document.querySelectorAll('[data-stage]').forEach(b=>b.onclick=()=>{const s=stages.find(s=>s.id===b.dataset.stage);closeModal();onStage(s);});
  }

  function showRoster(initialTab='characters') {
    let tab=initialTab,search='',group='all',page=0;const pageSize=24;
    modal(`<div class="eyebrow">ASTRAL EXPRESS / ARCHIVES</div><h2>伙伴与敌情档案</h2><div class="catalog-tabs"><button data-library-tab="characters">伙伴卡库 <small>${DECK.length}</small></button><button data-library-tab="enemies">怪物档案</button><button data-library-tab="links">连携技</button></div><div id="catalog-controls"><input id="catalog-search" type="search" placeholder="搜索角色、名称或定位…" aria-label="搜索角色或怪物"><div class="catalog-filters">${Object.entries(groups).map(([id,label])=>`<button data-role-filter="${id}" class="${id==='all'?'active':''}">${label}</button>`).join('')}</div></div><p class="catalog-tip" id="catalog-tip"></p><div id="catalog-results"></div><div id="catalog-pagination"></div>`,'wide-modal');
    function render(){
      document.querySelectorAll('[data-library-tab]').forEach(b=>b.classList.toggle('active',b.dataset.libraryTab===tab));
      document.querySelector('.catalog-filters').hidden=tab!=='characters';document.querySelector('#catalog-controls').hidden=tab==='links';
      const results=document.querySelector('#catalog-results'),pagination=document.querySelector('#catalog-pagination'),tip=document.querySelector('#catalog-tip');
      if(tab==='links'){
        tip.textContent='两位成员同时在场，每次实际攻击积累 1 点。合计 5 次后，点击战场的「释放连携」按钮；不会自动施放。';
        results.innerHTML=`<div class="link-library">${Object.values(LINK_SKILLS).map(l=>`<article><div class="link-portraits">${l.members.map(id=>portrait(id)).join('')}</div><h3>${esc(l.name)}</h3><p>${l.members.map(id=>esc(CHARACTERS[id]?.name||id)).join(' × ')}</p><span>${esc(l.description)}</span><small>合计 ${l.required||5} 次攻击 · 手动释放</small></article>`).join('')}</div>`;pagination.innerHTML='';return;
      }
      const all=tab==='characters'?DECK.map(id=>CHARACTERS[id]).filter(Boolean):Object.values(ENEMIES).filter(e=>e.isMonster||e.behavior||e.isBoss);
      const matches=all.filter(c=>(!search||`${c.name} ${c.role||''} ${c.description||''} ${c.id}`.toLowerCase().includes(search.toLowerCase()))&&(tab!=='characters'||group==='all'||roleGroup(c)===group));
      const pageCount=Math.max(1,Math.ceil(matches.length/pageSize));page=Math.min(page,pageCount-1);
      tip.textContent=tab==='characters'?`找到 ${matches.length} 张角色卡。点击选择，加入快捷栏末位；全部角色均可直接部署。所有部署 CD 已减 1 秒。`:`${matches.length} 种敌人档案。留意远程射击、冲锋、自爆读条、召唤与治疗。`;
      results.innerHTML=`<div class="catalog-grid">${matches.slice(page*pageSize,(page+1)*pageSize).map(c=>`<${tab==='characters'?'button':'article'} class="catalog-card" ${tab==='characters'?`data-library-character="${c.id}"`:''}><div class="catalog-art">${portrait(c.id)}</div><strong>${esc(c.name)}</strong><span>${esc(c.role||(c.isBoss?'地区首领':'普通怪物'))}</span><p>${esc(c.description||`${c.hp} 生命 · ${c.damage} 伤害`)}</p><small>${tab==='characters'?`◆ ${c.cost}　/　CD ${c.cooldown}s`:`♥ ${c.hp}　/　${c.isBoss?'地区首领':('攻击 '+c.damage)}`}</small></${tab==='characters'?'button':'article'}>`).join('')}</div>${!matches.length?'<div class="catalog-empty">没有找到对应条目，试试其他名称。</div>':''}`;
      pagination.innerHTML=`<button id="catalog-prev" ${page===0?'disabled':''}>← 上一页</button><span>${page+1} / ${pageCount}</span><button id="catalog-next" ${page===pageCount-1?'disabled':''}>下一页 →</button>`;
      document.querySelector('#catalog-prev').onclick=()=>{page--;render();};document.querySelector('#catalog-next').onclick=()=>{page++;render();};
      document.querySelectorAll('[data-library-character]').forEach(b=>b.onclick=()=>{const type=b.dataset.libraryCharacter;closeModal();onCharacter(type);});
    }
    document.querySelectorAll('[data-library-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.libraryTab;page=0;render();});
    document.querySelectorAll('[data-role-filter]').forEach(b=>b.onclick=()=>{group=b.dataset.roleFilter;page=0;document.querySelectorAll('[data-role-filter]').forEach(o=>o.classList.toggle('active',o===b));render();});
    document.querySelector('#catalog-search').oninput=e=>{search=e.target.value;page=0;render();};render();
  }
  return {showStages,showRoster};
}
