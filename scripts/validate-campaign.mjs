import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {GameEngine} from '../src/engine.js';
import {MAPS,DECK,ECONOMY} from '../src/data.js';
import {getStages} from '../src/campaign.js';

// wulong: this records real scheduled combat using only legal player actions.
const campaigns=[];
for(const map of MAPS) {
  const stages=getStages(map.id);
  for(const stage of [stages[0],stages[Math.ceil(stages.length/2)-1],stages.at(-1)]) {
    const game=new GameEngine({map:map.id,stage:stage.id,seed:8731}),plan=[];
    for(let row=0;row<game.rows;row++)plan.push(['robin',row,0],['march',row,1]);
    for(const [type,col] of [['dan',2],['himeko',3],['gepard',7],['trailblazer',5],['aventurine',6],['bailu',4]]) {
      for(let row=0;row<game.rows;row++)plan.push([type,row,col,type==='trailblazer'?'remembrance':undefined]);
    }
    let next=0;game.start();
    for(let frame=0;frame<420*20&&game.status==='playing';frame++) {
      game.collectAll();
      if(next<plan.length&&game.place(...plan[next]).ok)next++;
      game.update(.05);
    }
    const snapshot=game.snapshot();
    assert.equal(snapshot.status,'victory',JSON.stringify(snapshot));
    assert.ok(snapshot.lives>0&&snapshot.jade>=0);
    campaigns.push({...snapshot,initialJade:stage.initialJade,waveEnemyCounts:stage.waveEnemyCounts,deployments:next});
    console.log(`${stage.id}: victory in ${game.time.toFixed(1)}s, ${game.kills} defeats, ${game.lives} lives`);
  }
}
await writeFile(new URL('../docs/boss-validation.json',import.meta.url),JSON.stringify({
  version:'0.4.0',verifiedAt:new Date().toISOString(),testCommand:'node scripts/validate-campaign.mjs',
  passed:campaigns.length,failed:0,stageCount:MAPS.reduce((n,m)=>n+getStages(m.id).length,0),deckSize:DECK.length,economy:ECONOMY,
  scope:'15 deterministic initial/middle/final-stage campaigns using legal placements, card cooldowns, normal starting resources and scheduled waves. No injected units, jade or enemy-health reductions. Engine simulation; not an exhaustive balance study or browser playthrough.',campaigns,
},null,2));
