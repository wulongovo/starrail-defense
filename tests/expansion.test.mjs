import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine.js';
import { CHARACTERS, ENEMIES, MAPS, BOX, DECK, LINK_SKILLS } from '../src/data.js';
import { CAMPAIGNS, STAGE_TOTALS, CAMPAIGN_STAGE_COUNT, getStage, getStages } from '../src/campaign.js';

function sandbox(options = {}) {
  const events = [];
  const game = new GameEngine({ seed: 42, onEvent: event => events.push(event), ...options });
  game.events = events;
  game._nextWaveTime = Infinity;
  game.jade = 10000;
  game.start();
  return game;
}
function advance(game, seconds) {
  while (seconds > 0.000001) { const step = Math.min(seconds, 0.05); game.update(step); seconds -= step; }
}
function targets(game, row = 2, positions = [4, 5, 6]) {
  return positions.map(x => game.spawnEnemy('reaver', row, x, { hp: 10000, maxHp: 10000, speed: 0, attackTimer: Infinity }));
}
function attack(game, unit) {
  const previous = new Set(game.projectiles.map(shot => shot.id));
  unit.attackTimer = 0;
  game._unitTick(unit, 0.01);
  const shots = game.projectiles.filter(shot => !previous.has(shot.id));
  for (const shot of shots) game._projectileTick(shot, 2);
  game.projectiles = game.projectiles.filter(shot => !shots.includes(shot));
  return shots;
}
function linkState(game, id = 'dragon_thunder') { return game.getLinkStates().find(link => link.id === id); }

test('147 stage definitions have 1–3 waves, real monster pools, every-fifth mini bosses and final regional bosses', () => {
  assert.equal(CAMPAIGN_STAGE_COUNT, 147);
  assert.deepEqual(STAGE_TOTALS, { herta: 23, xianzhou: 29, penacony: 32, amphoreus: 36, planarcadia: 27 });
  const all = Object.values(CAMPAIGNS).flat();
  assert.equal(new Set(all.map(stage => stage.id)).size, 147);
  for (const map of MAPS) {
    const stages = getStages(map.id);
    assert.equal(stages.length, STAGE_TOTALS[map.id]);
    for (const stage of stages) {
      assert.ok(stage.waves >= 1 && stage.waves <= 3);
      assert.equal(stage.waveEnemyCounts.length, stage.waves);
      assert.equal(stage.enemyCount, stage.waveEnemyCounts.reduce((a, b) => a + b, 0));
      assert.ok(stage.enemyPool.every(id => ENEMIES[id]?.isMonster));
      assert.ok(stage.spawnInterval >= 4 && stage.spawnInterval <= 6);
      assert.ok(stage.prepTime >= 18);
      assert.equal(Boolean(stage.miniBoss), stage.number % 5 === 0 && stage.number !== stages.length);
      assert.equal(stage.boss, stage.number === stages.length ? map.boss : null);
      assert.ok(stage.areaName && stage.theme && stage.title);
    }
  }
  assert.deepEqual(getStages('herta').filter(stage => stage.modifier === 'random-transform').map(stage => stage.number), [7, 13, 19]);
});

test('engine resolves number or full stage ID and exposes unlocked final stages without a progress gate', () => {
  assert.equal(new GameEngine().stage.id, 'herta-01');
  assert.equal(new GameEngine({ map: 'xianzhou', stage: 12 }).stage.id, 'xianzhou-12');
  const last = new GameEngine({ stage: 'planarcadia-27' });
  assert.equal(last.map.id, 'planarcadia');
  assert.equal(last.totalWaves, 3);
  assert.equal(last.snapshot().stageId, last.stage.id);
  assert.equal(last.jade, last.stage.initialJade);
  assert.throws(() => new GameEngine({ stage: 'herta-99' }), /未知关卡/);
  assert.throws(() => new GameEngine({ stage: 0 }), /未知关卡/);
});

test('all cards use their reduced cooldown and 85-percent cost; every map exposes all 60 cells', () => {
  assert.ok(DECK.length >= 90);
  for (const card of [...Object.values(CHARACTERS), BOX]) {
    assert.equal(card.cooldown, Math.max(0.5, card.baseCooldown - 1), card.id);
    assert.equal(card.cost, card.baseCost === 0 ? 0 : Math.max(10, Math.round(card.baseCost * 0.85 / 5) * 5), card.id);
  }
  for (const map of MAPS) {
    const game = sandbox({ map: map.id });
    assert.equal(game.rows, 6); assert.equal(game.cols, 10);
    for (let row = 0; row < 6; row++) for (let col = 0; col < 10; col++) {
      game.cooldowns.robin = 0;
      assert.equal(game.place('robin', row, col).ok, true, `${map.id}:${row},${col}`);
    }
    assert.equal(game.units.length, 60);
    assert.equal(game.place('march', 6, 9).ok, false);
    assert.equal(game.place('march', 5, 10).ok, false);
    assert.ok(game.spawnEnemy('reaver', 5).x > 9.5);
    const boss = game.spawnEnemy(map.boss, 5);
    assert.ok(boss.x > 9 && boss.x <= game.cols);
  }
});

test('the tenth column can shoot, summon Mimi, and receive random deployment without clipping', () => {
  const game = sandbox();
  const march = game._makeUnit('march', 5, 9);
  const foe = targets(game, 5, [10.3])[0];
  attack(game, march);
  assert.equal(foe.hp, foe.maxHp - CHARACTERS.march.damage);
  game.remove(5, 9);
  const memory = game._makeUnit('remembrance', 5, 9);
  game._unitTick(memory, 1);
  const pet = game.units.find(unit => unit.isPet);
  assert.ok(pet.x > 9 && pet.x < 9.5);
  assert.equal(pet.row, 5);
  const board = sandbox();
  for (let row = 0; row < board.rows; row++) for (let col = 0; col < board.cols; col++) {
    if (row === 5 && col === 9) continue;
    board._makeUnit(row === 0 && col === 0 ? 'elation' : 'gepard', row, col);
  }
  board.random = () => 0.99;
  advance(board, 5);
  assert.ok(board.units.some(unit => unit.row === 5 && unit.col === 9));
});

test('slow waves start after preparation, space spawns, wait for cleanup, then rest exactly ten seconds', () => {
  const game = new GameEngine({ stage: 'herta-02', seed: 17 });
  game.start();
  advance(game, 17.95); assert.equal(game.wave, 0);
  advance(game, 0.05); assert.equal(game.wave, 1); assert.equal(game.enemies.length, 1);
  const nextAt = game._spawnQueue[0].at;
  assert.ok(Math.abs(nextAt - game.time - game.stage.spawnInterval) < 0.01);
  for (const foe of game.enemies) { foe.speed = 0; foe.hp = 100000; }
  advance(game, 25);
  for (const foe of game.enemies) { foe.speed = 0; foe.hp = 100000; }
  advance(game, 35);
  assert.equal(game.wave, 1); assert.equal(game._spawnQueue.length, 0);
  for (const foe of game.enemies) game._damage(foe, 999999, {});
  advance(game, 0.05);
  assert.equal(game.snapshot().waveResting, true); assert.equal(game.snapshot().nextWaveIn, 10);
  advance(game, 9.95); assert.equal(game.wave, 1);
  advance(game, 0.05); assert.equal(game.wave, 2);
  assert.equal(game.snapshot().waveResting, false);
});

test('random-transform stages spend the original card cost once and preserve one-cell occupancy deterministically', () => {
  const runs = [sandbox({ stage: 'herta-07', seed: 123 }), sandbox({ stage: 'herta-07', seed: 123 })];
  for (const game of runs) {
    for (let col = 0; col < 10; col++) {
      game.cooldowns.robin = 0;
      const before = game.jade;
      const result = game.place('robin', 5, col);
      assert.equal(result.ok, true);
      assert.equal(game.jade, before - CHARACTERS.robin.cost);
      assert.equal(game.cooldowns.robin, CHARACTERS.robin.cooldown);
      assert.equal(result.unit.col, col); assert.equal(result.unit.row, 5);
      assert.equal(result.unit.originalCard, 'robin'); assert.notEqual(result.unit.type, 'mimi');
      const seed = game.seed;
      assert.equal(game.place('march', 5, col).ok, false);
      assert.equal(game.seed, seed, 'rejected deployment must not consume random draws');
    }
    assert.equal(game.units.length, 10);
  }
  assert.deepEqual(runs[0].units, runs[1].units);
  assert.ok(new Set(runs[0].units.map(unit => unit.type)).size > 1);
});

test('blind boxes and Elation draw from every playable card or the sixteen already-charmed monster types', () => {
  const game = sandbox({ mode: 'blindbox' });
  const expectedCards = new Set(Object.keys(CHARACTERS).filter(id => id !== 'mimi'));
  const expectedMonsters = new Set(Object.values(ENEMIES).filter(enemy => enemy.isMonster).map(enemy => enemy.id));
  assert.equal(expectedMonsters.size, 16);
  for (const monsterRoll of [false, true]) {
    let observed;
    game.random = () => monsterRoll ? 0.259999 : 0.26;
    game._pick = pool => { observed = new Set(pool); return pool.at(-1); };
    const unit = game._surprise(0, 0, monsterRoll ? 'blindbox' : 'elation');
    assert.deepEqual(observed, monsterRoll ? expectedMonsters : expectedCards);
    assert.equal(unit.side, 'ally');
    if (monsterRoll) { assert.equal(unit.charmed, true); assert.equal(ENEMIES[unit.type].isMonster, true); }
    else assert.ok(CHARACTERS[unit.type]);
  }
});

test('combined five real attack actions charge one link; piercing hits and Lord follow-ups cannot overcount or autorelease', () => {
  const game = sandbox();
  const dragon = game._makeUnit('imbibitor', 2, 0);
  const general = game._makeUnit('jingyuan', 2, 1);
  const foes = targets(game);
  assert.equal(linkState(game).available, true);
  attack(game, dragon);
  assert.equal(linkState(game).charge, 1);
  assert.ok(foes.every(foe => foe.hp === foe.maxHp - 80));
  attack(game, general); attack(game, general); attack(game, general);
  assert.equal(linkState(game).charge, 4);
  assert.equal(linkState(game).ready, false);
  assert.ok(game.effects.some(effect => effect.type === 'lightningLord'));
  assert.equal(game.releaseLink('dragon_thunder').ok, false);
  attack(game, dragon);
  assert.equal(linkState(game).charge, 5); assert.equal(linkState(game).ready, true);
  assert.equal(game.events.filter(event => event.type === 'link').length, 0);
  attack(game, dragon); assert.equal(linkState(game).charge, 5);
  const before = foes.map(foe => foe.hp);
  assert.equal(game.releaseLink('dragon_thunder').ok, true);
  assert.deepEqual(foes.map(foe => foe.hp), before.map(hp => hp - 360));
  assert.equal(linkState(game).charge, 0);
  const effect = game.effects.find(effect => effect.type === 'link');
  assert.deepEqual(effect.actors, ['imbibitor', 'jingyuan']);
  assert.deepEqual(effect.actorIds, [dragon.id, general.id]);
  assert.equal(effect.duration, 2.5); assert.equal(effect.x, 4.5);
  assert.equal(game.events.filter(event => event.type === 'link').length, 1);
});

test('missing partners, misses, duplicates, withdrawals and deaths do not preserve or multiply link charge', () => {
  const game = sandbox();
  const dragon = game._makeUnit('imbibitor', 2, 0);
  targets(game);
  attack(game, dragon); assert.equal(linkState(game).charge, 0);
  const general = game._makeUnit('jingyuan', 2, 1);
  const duplicate = game._makeUnit('imbibitor', 2, 2);
  attack(game, duplicate); assert.equal(linkState(game).charge, 0);
  attack(game, dragon); assert.equal(linkState(game).charge, 1);
  game.remove(2, 0);
  assert.equal(linkState(game).charge, 0); assert.equal(linkState(game).available, true);
  attack(game, duplicate); assert.equal(linkState(game).charge, 1);
  game._damage(general, 999999, {});
  assert.equal(linkState(game).charge, 0); assert.equal(linkState(game).available, false);
  game._makeUnit('jingyuan', 3, 1);
  const foes = game.enemies; game.enemies = [];
  attack(game, duplicate); assert.equal(linkState(game).charge, 0);
  game.enemies = foes;
  duplicate.attackTimer = 0; game._unitTick(duplicate, 0.01);
  const missed = game.projectiles.at(-1);
  game.enemies = []; game._projectileTick(missed, 2);
  assert.equal(linkState(game).charge, 0);
});

test('two other links independently grant real shields, damage, vulnerability and slowdown after manual release', () => {
  for (const id of ['earthbound_oath', 'foxflame_meteor']) {
    const game = sandbox();
    const definition = LINK_SKILLS.find(link => link.id === id);
    const first = game._makeUnit(definition.members[0], 2, 0);
    const second = game._makeUnit(definition.members[1], 2, 2);
    const foe = targets(game, 2, [3])[0];
    for (const unit of [first, second, first, second, first]) attack(game, unit);
    assert.equal(linkState(game, id).charge, 5);
    const before = foe.hp; const shield = second.shield;
    assert.equal(game.releaseLink(id).ok, true);
    assert.ok(foe.hp < before);
    assert.equal(linkState(game, id).charge, 0);
    if (definition.effect.shield) assert.equal(second.shield, shield + 300);
    else { assert.equal(foe.vulnerableTimer, 8); assert.equal(foe.slowTimer, 5); assert.equal(foe.slowFactor, 0.5); }
    assert.equal(linkState(game, 'dragon_thunder').charge, 0);
  }
});

test('Sparkle transforms on every second real attack, retaining identity, HP proportion, shields and the next two-hit cycle', () => {
  const game = sandbox();
  const unit = game._makeUnit('sparkle', 2, 0);
  unit.hp /= 2; unit.shield = 73;
  targets(game);
  const id = unit.id;
  game._pick = pool => { assert.ok(pool.includes('robin')); assert.ok(!pool.includes(unit.type)); return 'robin'; };
  attack(game, unit); assert.equal(unit.type, 'sparkle'); assert.equal(unit.shapeAttackCount, 1);
  attack(game, unit);
  assert.equal(unit.type, 'robin'); assert.equal(unit.shapeshifter, true);
  assert.equal(unit.transformCount, 1); assert.equal(unit.shapeAttackCount, 0);
  assert.equal(unit.hp / unit.maxHp, 0.5); assert.equal(unit.shield, 73);
  game._pick = pool => { assert.ok(!pool.includes('robin')); return 'remembrance'; };
  attack(game, unit); assert.equal(unit.type, 'robin');
  attack(game, unit); assert.equal(unit.type, 'remembrance'); assert.equal(unit.transformCount, 2);
  assert.equal(unit.id, id); assert.equal(unit.col, 0); assert.equal(unit.row, 2);
  assert.equal(game.units.length, 1); assert.equal(game.gems.length, 0);
  game._pick = () => 'bailu';
  attack(game, unit); attack(game, unit);
  assert.equal(unit.type, 'bailu'); assert.equal(game.units.length, 1, 'summoner appearance cannot recursively produce pets');
  assert.equal(game.events.filter(event => event.type === 'shapeshift').length, 3);
});

test('Sparkle misses and stale pre-transform projectiles do not count toward a later form', () => {
  const game = sandbox();
  const unit = game._makeUnit('sparkle', 2, 0);
  const foe = targets(game)[0];
  unit.attackTimer = 0; game._unitTick(unit, 0.01);
  const stale = game.projectiles.at(-1);
  game._pick = () => 'march';
  attack(game, unit); attack(game, unit);
  assert.equal(unit.type, 'march'); assert.equal(unit.shapeAttackCount, 0);
  game._projectileTick(stale, 2);
  assert.equal(unit.shapeAttackCount, 0);
  const before = unit.shapeAttackCount;
  foe.hp = 0; game.enemies = [];
  attack(game, unit); assert.equal(unit.shapeAttackCount, before);
});

test('shield monsters protect neighbors, consume shields before HP and refresh within a bounded cap', () => {
  const game = sandbox();
  const tank = game.spawnEnemy('baryon', 2, 5, { speed: 0 });
  const near = game.spawnEnemy('reaver', 2, 6, { speed: 0 });
  const far = game.spawnEnemy('reaver', 5, 8, { speed: 0 });
  game._damage(tank, 50, {}); assert.equal(tank.hp, tank.maxHp); assert.equal(tank.shield, 40);
  tank.abilityTimer = 0; game._monsterAbilityTick(tank, 0.01);
  assert.equal(tank.shield, 130); assert.equal(near.shield, 90); assert.equal(far.shield, 0);
  tank.abilityTimer = 0; game._monsterAbilityTick(tank, 0.01);
  assert.equal(tank.shield, 180); assert.equal(near.shield, 180);
});

test('Gepard regeneration and charmed shield supports never erase stronger shields from team abilities', () => {
  const game = sandbox();
  const ally = game._makeUnit('gepard', 2, 2);
  ally.shield = 1000; ally.shieldTimer = 0;
  game._unitTick(ally, 0.01);
  assert.equal(ally.shield, 1000);
  const support = game.spawnEnemy('baryon', 2, 3, { side: 'ally', charmed: true, abilityTimer: 0 });
  game._monsterAbilityTick(support, 0.01);
  assert.equal(ally.shield, 1000);
  assert.equal(support.shield, 180);
  ally.shield = 20; support.abilityTimer = 0;
  game._monsterAbilityTick(support, 0.01);
  assert.equal(ally.shield, 110);
});

test('charm skills skip immune bosses and use their cooldown only when a valid ordinary enemy is charmed', () => {
  for (const type of ['kafka', 'mimi']) {
    const game = sandbox();
    const unit = game._makeUnit(type, 2, 1, { charmTimer: 0, attackTimer: Infinity });
    const boss = game.spawnEnemy('boss_guiji', 2, 2.5);
    game._unitTick(unit, 0.01);
    assert.equal(boss.side, 'enemy'); assert.ok(unit.charmTimer <= 0);
    const ordinary = game.spawnEnemy('reaver', 2, 3.5, { speed: 0 });
    game._unitTick(unit, 0.01);
    assert.equal(ordinary.side, 'ally', type);
    assert.equal(boss.side, 'enemy');
    assert.equal(unit.charmTimer, CHARACTERS[type].charmInterval);
  }
});

test('remote monsters fire actual directional projectiles and charmed shooters retain their ranged attack', () => {
  const game = sandbox();
  const ally = game._makeUnit('robin', 2, 2);
  const foe = game.spawnEnemy('antibaryon', 2, 5, { speed: 0, attackTimer: 0 });
  const before = ally.hp;
  game._enemyTick(foe, 0.01);
  const shot = game.projectiles.at(-1); assert.equal(shot.side, 'enemy'); assert.ok(shot.speed < 0);
  assert.equal(ally.hp, before);
  game._projectileTick(shot, 1); assert.equal(ally.hp, before - foe.damage);
  const charmed = game.spawnEnemy('tideBow', 4, 2, { side: 'ally', charmed: true, speed: 0, attackTimer: 0 });
  const target = targets(game, 4, [5])[0];
  game._enemyTick(charmed, 0.01);
  const friendlyShot = game.projectiles.at(-1); assert.equal(friendlyShot.side, 'ally');
  game._projectileTick(friendlyShot, 1); assert.equal(target.hp, target.maxHp - charmed.damage);
});

test('regeneration and heal monsters restore actual health only to their living side in range', () => {
  const game = sandbox();
  const soldier = game.spawnEnemy('maraSoldier', 2, 5, { hp: 100, speed: 0, abilityTimer: 0 });
  game._monsterAbilityTick(soldier, 0.01); assert.equal(soldier.hp, 155);
  const hound = game.spawnEnemy('goldenHound', 2, 6, { speed: 0, abilityTimer: 0 });
  const far = game.spawnEnemy('reaver', 5, 2, { hp: 50, speed: 0 });
  const ally = game._makeUnit('robin', 2, 6.5); ally.hp = 50;
  game._monsterAbilityTick(hound, 0.01);
  assert.equal(soldier.hp, 215); assert.equal(far.hp, 50); assert.equal(ally.hp, 50);
  hound.side = 'ally'; hound.abilityTimer = 0;
  game._monsterAbilityTick(hound, 0.01); assert.equal(ally.hp, 110); assert.equal(soldier.hp, 215);
});

test('summoners cap living children, replace casualties and preserve allegiance without recursive summons', () => {
  for (const type of ['woodLupus', 'tideCouncil']) {
    const game = sandbox();
    const summoner = game.spawnEnemy(type, 5, 10, { abilityTimer: 0 });
    for (let index = 0; index < 5; index++) { summoner.abilityTimer = 0; game._monsterAbilityTick(summoner, 0.01); }
    const children = game.enemies.filter(foe => foe.summonOwner === summoner.id);
    assert.equal(children.length, 3);
    assert.ok(children.every(child => ENEMIES[child.type].behavior !== 'summon' && child.x <= game.cols + 0.7));
    game._damage(children[0], 999999, {});
    summoner.side = 'ally'; summoner.abilityTimer = 0;
    game._monsterAbilityTick(summoner, 0.01);
    assert.equal(game.enemies.filter(foe => foe.summonOwner === summoner.id && foe.hp > 0).length, 3);
    assert.equal(game.enemies.at(-1).side, 'ally');
  }
});

test('charging warns before acceleration and remains blockable by defenders', () => {
  const game = sandbox();
  game._makeUnit('gepard', 2, 2);
  const foe = game.spawnEnemy('trampler', 2, 5, { abilityTimer: 0, attackTimer: Infinity });
  game._enemyTick(foe, 0.01); assert.equal(foe.x, 5); assert.equal(foe.behaviorState.key, 'charge');
  game._enemyTick(foe, 0.8); assert.equal(foe.x, 5); assert.equal(foe.chargeRemaining, 3);
  game._enemyTick(foe, 0.5);
  assert.ok(Math.abs(foe.x - (5 - foe.speed * 0.5 * 1.8)) < 1e-9);
  foe.x = 2.6; const x = foe.x; game._enemyTick(foe, 0.5); assert.equal(foe.x, x);
});

test('leap monsters jump a loose defense after a warning but a shield defender intercepts them', () => {
  for (const type of ['robin', 'gepard']) {
    const game = sandbox(); game._makeUnit(type, 2, 4);
    const foe = game.spawnEnemy('bubbleHound', 2, 5, { abilityTimer: 0, speed: 0 });
    game._enemyTick(foe, 0.01); assert.equal(foe.behaviorState.key, 'leap'); assert.equal(foe.x, 5);
    game._enemyTick(foe, 0.8);
    assert.equal(foe.x, type === 'robin' ? 2.7 : 5);
    assert.equal(game.events.some(event => event.type === 'leap-blocked'), type === 'gepard');
  }
});

test('self-destruct has a visible delay, damages a nearby area, and killing it during cast prevents damage', () => {
  for (const interrupted of [false, true]) {
    const game = sandbox();
    const ally = game._makeUnit('robin', 2, 4);
    const nearby = game._makeUnit('robin', 3, 4);
    const far = game._makeUnit('robin', 5, 4);
    const foe = game.spawnEnemy('dragonfish', 2, 4.5, { speed: 0 });
    game._enemyTick(foe, 0.01);
    assert.equal(foe.behaviorState.key, 'explode'); assert.ok(game.effects.some(effect => effect.type === 'warning'));
    advance(game, 1.4); assert.equal(ally.hp, ally.maxHp);
    if (interrupted) game._damage(foe, 999999, {});
    advance(game, 0.15);
    assert.equal(ally.hp, ally.maxHp - (interrupted ? 0 : 110));
    assert.equal(nearby.hp, nearby.maxHp - (interrupted ? 0 : 110));
    assert.equal(far.hp, far.maxHp);
    assert.equal(foe.hp, 0);
  }
});

test('new ally archetypes actually counter, shield, amplify damage, strike with Lord, and return jade', () => {
  const game = sandbox();
  const yunli = game._makeUnit('yunli', 2, 2);
  const foe = targets(game, 2, [3])[0];
  game._damage(yunli, 10, foe, true); assert.equal(foe.hp, foe.maxHp - 120);
  const guardian = game._makeUnit('permansor', 4, 1);
  const ally = game._makeUnit('march', 5, 2);
  guardian.shieldTimer = 0; game._unitTick(guardian, 0.01); assert.equal(ally.shield, 100);
  const support = game._makeUnit('ruanmei', 5, 0);
  assert.equal(game._outgoingDamage(ally, 100), 120);
  game._damage(support, 999999, {}); assert.equal(game._outgoingDamage(ally, 100), 100);
  const topaz = game._makeUnit('topaz', 2, 0);
  attack(game, topaz); attack(game, topaz); assert.equal(game.gems.length, 0);
  attack(game, topaz); assert.equal(game.gems[0].value, 10); assert.equal(game.gems[0].source, 'topaz');
});

test('every card in the 92-card roster produces its configured combat, economy, healing or support effect', () => {
  const knownKinds = new Set(['producer', 'buffer', 'healer', 'tank', 'counter', 'taunt', 'summoner', 'randomSummoner', 'support', 'ranged', 'melee', 'spin', 'guardian', 'accountant', 'lightningLord', 'shapeshifter']);
  for (const id of DECK) {
    const game = sandbox(); const definition = CHARACTERS[id];
    assert.ok(knownKinds.has(definition.kind), `${id}: unsupported kind ${definition.kind}`);
    const unit = game._makeUnit(id, 2, 2);
    const foe = targets(game, 2, [2.8])[0];
    const ally = game._makeUnit('march', 3, 2);
    if (definition.kind === 'support') {
      assert.ok(game._outgoingDamage(ally, 100) > 100, id);
      ally.attackTimer = 10; game._unitTick(ally, 1); assert.ok(ally.attackTimer < 9, id);
    } else if (['producer', 'buffer'].includes(definition.kind)) {
      unit.abilityTimer = 0; game._unitTick(unit, 0.01); assert.ok(game.gems.some(gem => gem.value > 0), id);
    } else if (definition.kind === 'healer') {
      ally.hp = 1; unit.abilityTimer = 0; game._unitTick(unit, 0.01); assert.ok(ally.hp > 1, id);
    } else if (definition.kind === 'tank') {
      unit.shield = 0; unit.shieldTimer = 0; game._unitTick(unit, 0.01); assert.ok(unit.shield > 0, id);
    } else if (['counter', 'taunt'].includes(definition.kind)) {
      for (let hit = 0; hit < (definition.counterEvery || 3); hit++) game._damage(unit, 1, foe, true);
      assert.ok(foe.hp < foe.maxHp, id);
    } else if (definition.kind === 'summoner') {
      unit.summonTimer = 0; game._unitTick(unit, 0.01); assert.ok(game.units.some(pet => pet.isPet && pet.summonOwner === unit.id), id);
    } else if (definition.kind === 'randomSummoner') {
      unit.abilityTimer = 0; game._unitTick(unit, 0.01); assert.ok(game.events.some(event => event.type === 'elation'), id);
    } else {
      attack(game, unit); assert.ok(foe.hp < foe.maxHp, id);
      if (definition.kind === 'guardian') { unit.shieldTimer = 0; game._unitTick(unit, 0.01); assert.ok(ally.shield > 0, id); }
    }
  }
});

for (const map of MAPS) for (const stageNumber of [1, Math.ceil(STAGE_TOTALS[map.id] / 2)]) {
  test(`normal starting resources clear ${map.id} stage ${stageNumber} through player actions only`, () => {
    const game = new GameEngine({ map: map.id, stage: stageNumber, seed: 8731 });
    const plan = [];
    for (let row = 0; row < game.rows; row++) plan.push(['robin', row, 0], ['march', row, 1]);
    for (const [type, col] of [['dan', 2], ['himeko', 3], ['gepard', 7], ['trailblazer', 5], ['aventurine', 6], ['bailu', 4]]) {
      for (let row = 0; row < game.rows; row++) plan.push([type, row, col, type === 'trailblazer' ? 'remembrance' : undefined]);
    }
    let next = 0; game.start();
    for (let frame = 0; frame < 420 * 20 && game.status === 'playing'; frame++) {
      game.collectAll();
      if (next < plan.length && game.place(...plan[next]).ok) next++;
      game.update(0.05);
    }
    assert.equal(game.status, 'victory', JSON.stringify(game.snapshot()));
    assert.ok(game.jade >= 0 && game.lives > 0 && game.time <= 420);
    assert.equal(game.wave, getStage(map.id, stageNumber).waves);
  });
}
