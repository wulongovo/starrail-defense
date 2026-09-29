import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine.js';
import { CHARACTERS, ENEMIES, MAPS, DECK, BOX, TRAILBLAZER_FORMS } from '../src/data.js';
import { getStages } from '../src/campaign.js';

function sandbox(options = {}) {
  const events = [];
  const game = new GameEngine({ seed: 42, onEvent: event => events.push(event), ...options });
  game._nextWaveTime = Infinity;
  game.events = events;
  game.jade = 10000;
  game.start();
  return game;
}

function advance(game, seconds) {
  for (let remaining = seconds; remaining > 0.00001; remaining -= 0.1) game.update(Math.min(remaining, 0.1));
}

test('roster has all requested roles, five protagonist-only forms and five distinct maps with unique bosses', () => {
  for (const id of DECK) assert.equal(CHARACTERS[id].id, id);
  assert.equal(CHARACTERS.preservation.hp, CHARACTERS.trailblazer.hp * 2);
  assert.deepEqual(TRAILBLAZER_FORMS, ['trailblazer', 'preservation', 'remembrance', 'elation', 'harmony']);
  assert.deepEqual(MAPS.map(map => [map.id, map.rows]), [['herta', 6], ['xianzhou', 6], ['penacony', 6], ['amphoreus', 6], ['planarcadia', 6]]);
  assert.deepEqual(MAPS.map(map => map.boss), ['boss_doomsday', 'boss_phantylia', 'boss_dominicus', 'boss_lycurgus', 'boss_guiji']);
  for (const map of MAPS) assert.equal(ENEMIES[map.boss].isBoss, true);
  for (const map of MAPS) assert.ok(map.story.every(line => line.speaker && line.text));
});

test('placement validates coordinates, cost, occupancy, character and cooldown atomically', () => {
  const game = new GameEngine();
  assert.equal(game.place('march', 0, 0).ok, true);
  assert.equal(game.jade, game.stage.initialJade - CHARACTERS.march.cost);
  assert.equal(game.place('march', 1, 0).ok, false);
  assert.equal(game.place('robin', 0, 0).ok, false);
  for (const [row, col] of [[-1, 0], [game.rows, 0], [0, game.cols], [0.5, 2], [NaN, 0]]) assert.equal(game.place('robin', row, col).ok, false);
  assert.equal(game.place('invented', 1, 0).ok, false);
  assert.equal(game.place('mimi', 1, 0).ok, false);
  game.jade = CHARACTERS.robin.cost - 1;
  assert.equal(game.place('robin', 1, 0).ok, false);
  assert.equal(game.jade, CHARACTERS.robin.cost - 1);
  assert.equal(game.units.length, 1);
});

test('protagonist transformation rejects other characters and shares the card cooldown', () => {
  const game = sandbox();
  assert.equal(game.place('trailblazer', 0, 0, 'himeko').ok, false);
  assert.equal(game.place('march', 0, 0, 'preservation').ok, false);
  assert.equal(game.place('trailblazer', 0, 0, 'preservation').unit.type, 'preservation');
  assert.equal(game.place('remembrance', 1, 0).ok, false);
  advance(game, 5);
  assert.equal(game.place('trailblazer', 1, 0, 'remembrance').ok, true);
});

test('ready mode permits setup but does not advance timers; start only runs once', () => {
  const game = new GameEngine();
  game.place('robin', 0, 0);
  game.update(10);
  assert.equal(game.time, 0);
  assert.equal(game.gems.length, 0);
  assert.equal(game.start(), true);
  assert.equal(game.start(), false);
});

test('sky drops 50 jade every seven seconds and Robin produces 50 every eight', () => {
  const game = sandbox();
  game.place('robin', 0, 0);
  advance(game, 6.9);
  assert.equal(game.gems.length, 0);
  advance(game, 0.1);
  assert.equal(game.gems.filter(gem => gem.source === 'sky').length, 1);
  advance(game, 1);
  assert.equal(game.gems.find(gem => gem.source === 'robin').value, 50);
  const before = game.jade;
  assert.equal(game.collectAll(), 100);
  assert.equal(game.jade, before + 100);
  assert.equal(game.collectAll(), 0);
});

test('gems auto collect after eight seconds and cannot be collected twice', () => {
  const game = sandbox();
  game._skyTimer = Infinity;
  const gem = game._gem(1, 1, 75);
  const before = game.jade;
  advance(game, 7.9);
  assert.equal(game.jade, before);
  advance(game, 0.1);
  assert.equal(game.jade, before + 75);
  assert.equal(game.collectGem(gem.id), 0);
});

test('Amphoreus creates the map-specific holy-flame reward', () => {
  const game = sandbox({ map: 'amphoreus' });
  advance(game, 18);
  assert.equal(game.gems.find(gem => gem.source === 'holyflame').value, 25);
});

test('all six Penacony rows including dream waterways accept characters', () => {
  const game = sandbox({ map: 'penacony' });
  for (let row = 0; row < 6; row++) {
    game.cooldowns.robin = 0;
    assert.equal(game.place('robin', row, 0).ok, true);
  }
  assert.equal(game.units.length, 6);
});

test('March arrows damage and slow enemies in her lane only', () => {
  const game = sandbox();
  game.place('march', 1, 1);
  const front = game.spawnEnemy('voidranger', 1, 4);
  const other = game.spawnEnemy('voidranger', 2, 4);
  advance(game, 1.2);
  assert.ok(front.hp < front.maxHp);
  assert.ok(front.slowTimer > 0);
  assert.equal(front.slowFactor, 0.65);
  assert.equal(other.hp, other.maxHp);
});

test('projectiles hit the first physical blocker, never friendly projections', () => {
  const game = sandbox();
  game.place('march', 1, 0);
  const friendly = game.spawnEnemy('voidranger', 1, 1.1, { side: 'ally', speed: 0 });
  const near = game.spawnEnemy('voidranger', 1, 3, { speed: 0 });
  const far = game.spawnEnemy('voidranger', 1, 5, { speed: 0 });
  advance(game, 1.3);
  assert.ok(near.hp < near.maxHp);
  assert.equal(far.hp, far.maxHp);
  assert.equal(friendly.hp, friendly.maxHp);
});

test('Dan Heng pierces three targets and does not damage one twice', () => {
  const game = sandbox();
  game.place('dan', 0, 0);
  const foes = [2, 3, 4, 5].map(x => game.spawnEnemy('voidranger', 0, x, { speed: 0 }));
  advance(game, 1.5);
  assert.deepEqual(foes.map(foe => foe.maxHp - foe.hp), [40, 40, 40, 0]);
});

test('Destruction uses repeating short-range bat swings against multiple enemies', () => {
  const game = sandbox();
  const unit = game.place('trailblazer', 1, 2).unit;
  const first = game.spawnEnemy('gepardEnemy', 1, 2.9, { speed: 0 });
  const second = game.spawnEnemy('gepardEnemy', 1, 3.1, { speed: 0 });
  const distant = game.spawnEnemy('voidranger', 1, 6, { speed: 0 });
  advance(game, 1.7);
  assert.ok(first.maxHp - first.hp > 80);
  assert.ok(second.maxHp - second.hp > 80);
  assert.equal(distant.hp, distant.maxHp);
  assert.ok(unit.attackAnim > 0);
  assert.equal(game.projectiles.length, 0);
});

test('Aventurine retaliates on each third received attack, including shield absorption', () => {
  const game = sandbox();
  const unit = game.place('aventurine', 1, 3).unit;
  const foe = game.spawnEnemy('voidranger', 1, 3.5, { hp: 2000, maxHp: 2000, speed: 0, damage: 1 });
  advance(game, 3.2);
  assert.equal(unit.hitsReceived, 3);
  assert.equal(foe.hp, 1890);
  advance(game, 3.6);
  assert.equal(unit.hitsReceived, 6);
  assert.equal(foe.hp, 1780);
});

test('Preservation draws enemies from neighboring nine-grid lanes and counters after three hits', () => {
  const game = sandbox();
  const unit = game.place('trailblazer', 2, 4, 'preservation').unit;
  const adjacent = game.spawnEnemy('voidranger', 1, 4.5, { hp: 2000, maxHp: 2000, speed: 0, damage: 1 });
  const outside = game.spawnEnemy('voidranger', 0, 4.5, { speed: 0 });
  advance(game, 3.5);
  assert.equal(adjacent.tauntTarget, unit.id);
  assert.ok(adjacent.row > 1.9);
  assert.equal(outside.row, 0);
  assert.equal(outside.tauntTarget, null);
  assert.ok(unit.hitsReceived >= 3);
  assert.ok(adjacent.hp <= 1910);
  assert.equal(unit.maxHp, 2 * CHARACTERS.trailblazer.hp);
});

test('taunted enemies resume their original lane after the defender is removed', () => {
  const game = sandbox();
  game.place('trailblazer', 2, 4, 'preservation');
  const foe = game.spawnEnemy('voidranger', 1, 5.2);
  advance(game, 0.8);
  assert.ok(foe.row > 1.5);
  game.remove(2, 4);
  advance(game, 2);
  assert.equal(foe.row, 1);
  assert.equal(foe.tauntTarget, null);
});

test('Remembrance summons persistent Mimi, who charms without disappearing', () => {
  const game = sandbox();
  const owner = game.place('trailblazer', 1, 1, 'remembrance').unit;
  const foe = game.spawnEnemy('gepardEnemy', 1, 4.5, { hp: 4000, maxHp: 4000, speed: 0 });
  advance(game, 3);
  const pet = game.units.find(unit => unit.type === 'mimi');
  assert.equal(pet.summonOwner, owner.id);
  assert.equal(pet.isPet, true);
  assert.equal(foe.side, 'ally');
  assert.ok(game.units.some(unit => unit.id === pet.id));
  assert.ok(pet.hp > 0);
  const second = game.spawnEnemy('gepardEnemy', 1, 4.9, { hp: 4000, maxHp: 4000, speed: 0 });
  advance(game, 9.2);
  assert.equal(second.side, 'ally');
  assert.equal(game.units.filter(unit => unit.type === 'mimi').length, 1);
  assert.ok(game.units.some(unit => unit.id === pet.id));
});

test('Mimi claws reach four forward cells but cannot hit behind or beyond range', () => {
  const game = sandbox();
  const pet = game._makeUnit('mimi', 2, 2, { charmTimer: 100 });
  const inside = game.spawnEnemy('gepardEnemy', 2, 5.95, { speed: 0 });
  const outside = game.spawnEnemy('voidranger', 2, 6.2, { speed: 0 });
  const behind = game.spawnEnemy('voidranger', 2, 1, { speed: 0 });
  advance(game, 1.5);
  assert.ok(inside.hp < inside.maxHp);
  assert.equal(outside.hp, outside.maxHp);
  assert.equal(behind.hp, behind.maxHp);
  assert.ok(pet.hp > 0);
});

test('Elation summons at exact five-second intervals without spending jade', () => {
  const game = sandbox();
  game._skyTimer = Infinity;
  game.place('trailblazer', 1, 0, 'elation');
  const before = game.jade;
  advance(game, 4.9);
  assert.equal(game.events.filter(event => event.type === 'elation').length, 0);
  advance(game, 0.1);
  assert.equal(game.events.filter(event => event.type === 'elation').length, 1);
  advance(game, 5);
  assert.ok(game.events.filter(event => event.type === 'elation').length >= 2);
  assert.equal(game.jade, before);
  assert.ok(game.enemies.every(foe => foe.side === 'ally'));
});

test('full boards do not crash Elation or overwrite deployed characters', () => {
  const game = sandbox();
  for (let row = 0; row < game.rows; row++) for (let col = 0; col < game.cols; col++) game._makeUnit(row === 0 && col === 0 ? 'elation' : 'gepard', row, col);
  advance(game, 10);
  assert.equal(game.units.length, game.rows * game.cols);
  assert.equal(new Set(game.units.map(unit => `${unit.row},${unit.col}`)).size, game.rows * game.cols);
});

test('blind boxes charge their own cost and can yield special allies or charmed enemies', () => {
  assert.equal(new GameEngine().place('box', 0, 0).ok, false);
  const resultTypes = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const game = sandbox({ mode: 'blindbox', seed: seed * 7919 });
    const before = game.jade;
    const result = game.place('box', 0, 0);
    assert.equal(result.ok, true);
    assert.equal(game.jade, before - BOX.cost);
    assert.equal(result.unit.side, 'ally');
    assert.ok(CHARACTERS[result.unit.type] || ENEMIES[result.unit.type]);
    resultTypes.add(ENEMIES[result.unit.type] ? 'enemy' : 'ally');
    assert.equal(game.events.filter(event => event.type === 'blindbox').length, 1);
  }
  assert.deepEqual([...resultTypes].sort(), ['ally', 'enemy']);
});

test('charmed enemies attack hostile projections and advance right', () => {
  const game = sandbox();
  const friend = game.spawnEnemy('stormbringer', 0, 3, { side: 'ally' });
  const foe = game.spawnEnemy('voidranger', 0, 3.5, { speed: 0 });
  advance(game, 1);
  assert.ok(foe.hp < foe.maxHp);
  assert.ok(friend.hp < friend.maxHp);
  foe.hp = 0;
  const previousX = friend.x;
  advance(game, 1);
  assert.ok(friend.x > previousX);
  assert.equal(game.lives, 5);
});

test('Gepard shields absorb damage, Bailu heals and Silver Wolf increases incoming damage', () => {
  const game = sandbox();
  const tank = game.place('gepard', 1, 3).unit;
  const healer = game.place('bailu', 1, 1).unit;
  game.spawnEnemy('voidranger', 1, 3.5, { speed: 0 });
  advance(game, 0.8);
  assert.equal(tank.hp, tank.maxHp);
  assert.ok(tank.shield < 100);
  tank.hp = 500;
  advance(game, 2.2);
  assert.ok(tank.hp > 500);
  assert.equal(healer.hp, healer.maxHp);
  const weak = game.spawnEnemy('voidranger', 4, 7, { speed: 0 });
  weak.vulnerableTimer = 2;
  game._damage(weak, 100, healer);
  assert.equal(weak.hp, weak.maxHp - 140);
});

test('Herta reaches adjacent lanes and Himeko splashes nearby enemies', () => {
  const game = sandbox();
  game.place('herta', 1, 2);
  const adjacent = game.spawnEnemy('voidranger', 2, 3, { speed: 0 });
  game.place('himeko', 4, 0);
  const center = game.spawnEnemy('voidranger', 4, 3, { speed: 0 });
  const splash = game.spawnEnemy('voidranger', 4, 3.5, { speed: 0 });
  advance(game, 1.2);
  assert.ok(adjacent.hp < adjacent.maxHp);
  assert.ok(center.hp < center.maxHp);
  assert.ok(splash.hp < splash.maxHp);
});

test('pausing freezes economy, enemies, cooldowns and simulation time', () => {
  const game = sandbox();
  game.place('march', 0, 0);
  const foe = game.spawnEnemy('voidranger', 0, 8);
  game.setPaused(true);
  const before = JSON.stringify(game.snapshot());
  const x = foe.x;
  game.update(30);
  assert.equal(JSON.stringify(game.snapshot()), before);
  assert.equal(foe.x, x);
  assert.equal(game.place('robin', 1, 0).ok, false);
  game.setPaused(false);
  game.update(1);
  assert.ok(game.time > 0);
});

test('five breaches after lane conductors are spent lose the game and terminal states cannot advance or deploy', () => {
  const game = sandbox();
  game.pompoms.forEach(pam => pam.state = 'spent');
  for (let row = 0; row < 5; row++) game.spawnEnemy('voidranger', row, -0.84);
  advance(game, 1);
  assert.equal(game.lives, 0);
  assert.equal(game.status, 'defeat');
  const before = game.time;
  game.update(10);
  assert.equal(game.time, before);
  assert.equal(game.place('march', 0, 0).ok, false);
  assert.equal(game.events.filter(event => event.type === 'defeat').length, 1);
});

test('victory waits for pending spawns and every hostile enemy but not friendly projections', () => {
  const game = sandbox();
  game.wave = game.totalWaves;
  game._spawnQueue.push({ at: 2, type: 'voidranger', row: 0 });
  game.spawnEnemy('sampo', 1, 3, { side: 'ally' });
  advance(game, 1);
  assert.equal(game.status, 'playing');
  advance(game, 1.1);
  assert.equal(game.status, 'playing');
  const hostile = game.enemies.find(foe => foe.side === 'enemy');
  game._damage(hostile, 9999, {});
  game.update(0.1);
  assert.equal(game.status, 'victory');
  assert.equal(game.kills, 1);
});

test('final three-wave stage completes through actual scheduled combat and its regional boss', () => {
  const events = [];
  const game = new GameEngine({ stage: 'herta-23', seed: 8234, onEvent: event => events.push(event) });
  // Prepared endgame formation tests the complete scheduler/combat integration.
  for (let row = 0; row < game.rows; row++) {
    for (const [col, type] of ['robin', 'march', 'dan', 'himeko', 'silverWolf', 'remembrance', 'firefly', 'aventurine'].entries()) game._makeUnit(type, row, col);
  }
  game.start();
  advance(game, 420);
  assert.equal(game.status, 'victory');
  assert.equal(game.wave, 3);
  assert.equal(events.filter(event => event.type === 'wave').length, 3);
  assert.ok(events.some(event => event.type === 'boss-arrive'));
  assert.ok(game.kills > 10);
  assert.ok(game.time > 60 && game.time < 420);
  assert.ok(game.lives > 0);
});

for (const map of MAPS) test(`normal-resource bot can win final stage on ${map.name}`, () => {
  const stage = getStages(map.id).at(-1);
  const game = new GameEngine({ map: map.id, stage: stage.id, seed: 8731 });
  assert.equal(game.jade, stage.initialJade);
  assert.equal(game.totalWaves, 3);
  const deploymentPlan = [];
  for (let row = 0; row < game.rows; row++) deploymentPlan.push(['robin', row, 0], ['march', row, 1]);
  for (const [type, col] of [['dan', 2], ['himeko', 3], ['gepard', 7], ['trailblazer', 5], ['aventurine', 6], ['bailu', 4]]) {
    for (let row = 0; row < game.rows; row++) deploymentPlan.push([type, row, col, type === 'trailblazer' ? 'remembrance' : undefined]);
  }
  let nextDeployment = 0;
  game.start();
  for (let frame = 0; frame < 420 * 20 && game.status === 'playing'; frame++) {
    // Uses only player actions and starting resources: no injected units, health or jade.
    game.collectAll();
    if (nextDeployment < deploymentPlan.length) {
      const placement = game.place(...deploymentPlan[nextDeployment]);
      if (placement.ok) nextDeployment++;
    }
    game.update(0.05);
  }
  assert.equal(game.status, 'victory', JSON.stringify(game.snapshot()));
  assert.equal(game.wave, 3);
  assert.ok(game.jade >= 0);
  assert.ok(game.lives > 0);
});

test('unattended empty board eventually loses against real waves', () => {
  const game = new GameEngine({ stage: 'herta-23', seed: 99 });
  game.start();
  advance(game, 900);
  assert.equal(game.status, 'defeat');
  assert.equal(game.lives, 0);
});

test('same seed and commands produce deterministic state with finite bounded effects', () => {
  const games = [new GameEngine({ seed: 2026, mode: 'blindbox' }), new GameEngine({ seed: 2026, mode: 'blindbox' })];
  for (const game of games) {
    game.place('box', 0, 0);
    game.start();
    advance(game, 30);
  }
  assert.deepEqual(games[0].snapshot(), games[1].snapshot());
  assert.deepEqual(games[0].enemies, games[1].enemies);
  for (const entity of [...games[0].units, ...games[0].enemies]) {
    for (const key of ['x', 'row', 'hp', 'maxHp', 'attackAnim', 'hitAnim']) assert.ok(Number.isFinite(entity[key]), `${entity.type}.${key}`);
  }
  assert.ok(games[0].effects.length <= 100);
  assert.ok(games[0].gems.length <= 4);
  const before = games[0].time;
  for (const dt of [NaN, Infinity, -1, 0]) games[0].update(dt);
  assert.equal(games[0].time, before);
});

test('each region schedules its own boss, and victory waits for that boss and its summons', () => {
  for (const map of MAPS) {
    const game = sandbox({ map: map.id, stage: getStages(map.id).at(-1).id });
    game.wave = game.totalWaves - 1;
    game._startWave();
    assert.equal(game._spawnQueue.filter(spawn => ENEMIES[spawn.type].isBoss).length, 1);
    assert.ok(game._spawnQueue.some(spawn => spawn.type === map.boss));
    game._spawnQueue = [{ at: 1, type: map.boss, row: 2 }];
    advance(game, 0.9);
    assert.equal(game.status, 'playing');
    advance(game, 0.2);
    const boss = game.enemies.find(foe => foe.isBoss);
    assert.equal(boss.type, map.boss);
    assert.equal(game.status, 'playing');
    boss.bossState.parts = [];
    boss.bossState.shield = 0;
    const minion = game.spawnEnemy('enemy_retainer', 0, 8);
    game._damage(boss, 999999, {});
    game.update(0.05);
    assert.equal(game.status, 'playing');
    game._damage(minion, 999999, {});
    game.update(0.05);
    assert.equal(game.status, 'victory');
  }
});

test('Doomsday parts protect its core, route damage by lane and interrupt on final break', () => {
  const game = sandbox();
  const boss = game.spawnEnemy('boss_doomsday', 2);
  advance(game, 2.6);
  assert.ok(boss.bossState.castRemaining > 0);
  for (const row of [0, 2, 4]) game._damage(boss, 1000, { row });
  assert.equal(boss.hp, boss.maxHp);
  assert.ok(boss.bossState.parts.every(part => part.hp === 0));
  assert.equal(boss.bossState.phaseName, '核心暴露');
  assert.equal(boss.bossState.castRemaining, 0);
  game._damage(boss, 100, { row: 0 });
  assert.ok(Math.abs(boss.maxHp - boss.hp - 119.6) < 0.001);
  assert.equal(game.events.filter(event => event.type === 'boss-part').length, 3);
  assert.equal(game.events.filter(event => event.type === 'boss-break').length, 1);
});

test('bosses are targetable from every ranged lane, cannot be charmed, and warnings precede damage', () => {
  const game = sandbox();
  const march = game._makeUnit('march', 0, 1);
  const boss = game.spawnEnemy('boss_guiji', 2);
  assert.equal(game._charm(boss, march), false);
  assert.equal(boss.side, 'enemy');
  advance(game, 2);
  assert.ok(boss.hp < boss.maxHp);
  const defender = game._makeUnit('robin', 4, 0);
  game._bossCast(boss, 'cataclysm', '测试路轰击', 3, [4]);
  const before = defender.hp;
  advance(game, 2.9);
  assert.equal(defender.hp, before);
  assert.deepEqual(game.getBossState().warningRows, [4]);
  advance(game, 0.15);
  assert.equal(defender.hp, before - 95);
  assert.ok(game.events.some(event => event.type === 'boss-cast'));
  assert.ok(game.events.some(event => event.type === 'boss-skill'));
});

test('Phantylia summons jade-draining lotuses and reversible max-health suppression', () => {
  const game = sandbox({ map: 'xianzhou' });
  game._skyTimer = Infinity;
  const defender = game._makeUnit('gepard', 0, 0);
  const boss = game.spawnEnemy('boss_phantylia', 2);
  boss.bossState.phase = 2;
  game._bossCast(boss, 'lotus', '破灭玄莲·压制', 0.1, [0]);
  advance(game, 0.1);
  assert.equal(game.enemies.filter(foe => foe.type === 'enemy_lotus').length, 2);
  assert.equal(defender.maxHp, CHARACTERS.gepard.hp * 0.7);
  assert.ok(defender.suppressionTimer > 0);
  const before = game.jade;
  advance(game, 0.8);
  assert.equal(game.jade, before - 40);
  assert.equal(game.bossAction('purify').ok, true);
  assert.equal(defender.maxHp, CHARACTERS.gepard.hp);
  assert.equal(defender.suppressionTimer, 0);
  game._bossCast(boss, 'lotus', '压制恢复测试', 0.1, [0]);
  advance(game, 0.1);
  boss.bossState.skillTimer = Infinity;
  advance(game, 8.1);
  assert.equal(defender.maxHp, CHARACTERS.gepard.hp);
});

test('Dominicus shield break absorbs damage, shields the team and interrupts seven-day countdown', () => {
  const game = sandbox({ map: 'penacony' });
  const unit = game._makeUnit('robin', 0, 0);
  const boss = game.spawnEnemy('boss_dominicus', 3);
  boss.bossState.phase = 3;
  game._bossCast(boss, 'judgment', '七日审判·七重齐响', 7, [0, 1, 2, 3, 4, 5]);
  game._damage(boss, 1500, unit);
  assert.equal(boss.bossState.shield, 0);
  assert.equal(boss.bossState.castRemaining, 0);
  assert.equal(unit.shield, 130);
  assert.ok(Math.abs(boss.maxHp - boss.hp - 40) < 0.001);
  boss.bossState.skillTimer = Infinity;
  advance(game, 7.5);
  assert.equal(unit.hp, unit.maxHp);
});

test('Dominicus seven-second cast deals seven separate hits when not interrupted', () => {
  const game = sandbox({ map: 'penacony' });
  const unit = game._makeUnit('robin', 5, 0, { hp: 1000, maxHp: 1000 });
  const boss = game.spawnEnemy('boss_dominicus', 3);
  boss.bossState.phase = 3;
  game._bossCast(boss, 'judgment', '七日审判·七重齐响', 7, [0, 1, 2, 3, 4, 5]);
  advance(game, 6.9);
  assert.equal(unit.hp, 1000);
  advance(game, 0.15);
  assert.equal(unit.hp, 825);
  assert.equal(unit.hitsReceived, 7);
});

test('Lygus four retainers and ten real deaths trigger shared First Cause damage and evolution', () => {
  const game = sandbox({ map: 'amphoreus' });
  const allies = [game._makeUnit('robin', 0, 0, { hp: 2000, maxHp: 2000 }), game._makeUnit('robin', 4, 0, { hp: 2000, maxHp: 2000 })];
  const boss = game.spawnEnemy('boss_lycurgus', 2);
  advance(game, 5.6);
  assert.equal(game.enemies.filter(foe => foe.type === 'enemy_retainer').length, 4);
  assert.equal(boss.bossState.phaseName, '论证');
  for (const foe of [...game.enemies].filter(foe => !foe.isBoss)) game._damage(foe, 9999, allies[0]);
  for (let index = 0; index < 6; index++) game._damage(game.spawnEnemy('voidranger', 1, 8), 9999, allies[0]);
  assert.equal(boss.bossState.deaths, 10);
  game.update(0.05);
  assert.equal(boss.bossState.castKey, 'firstCause');
  advance(game, 4);
  assert.equal(boss.bossState.phaseName, '演化');
  assert.deepEqual(allies.map(ally => ally.hp), [1450, 1450]);
  game._bossCast(boss, 'evolution', '演化冲击', 0.1, []);
  advance(game, 0.1);
  assert.equal(boss.bossState.phaseName, '演化');
  assert.equal(boss.bossState.formSummons, 2);
  game._bossCast(boss, 'evolution', '演化冲击', 0.1, []);
  advance(game, 0.1);
  assert.equal(boss.bossState.phaseName, '论证');
  assert.equal(boss.bossState.deaths, 0);
  for (let index = 0; index < 10; index++) game._damage(game.spawnEnemy('voidranger', 1, 8), 9999, allies[0]);
  game.update(0.05);
  assert.equal(boss.bossState.castKey, 'firstCause');
});

test('an allied memosprite can start Lygus argument but removing a character does not count as death', () => {
  const game = sandbox({ map: 'amphoreus' });
  game._makeUnit('mimi', 0, 0, { isPet: true });
  game._makeUnit('robin', 4, 0);
  const boss = game.spawnEnemy('boss_lycurgus', 2);
  game.update(0.05);
  assert.equal(boss.bossState.phaseName, '论证');
  game.remove(4, 0);
  assert.equal(boss.bossState.deaths, 0);
});

test('Guiji cycles three faces, summons comedians and marks four unique cells before detonation', () => {
  const game = sandbox({ map: 'planarcadia' });
  for (let row = 0; row < 4; row++) game._makeUnit('robin', row, 0, { hp: 2000, maxHp: 2000 });
  const boss = game.spawnEnemy('boss_guiji', 2);
  boss.hp = 8000;
  advance(game, 8.6);
  assert.equal(game.enemies.filter(foe => foe.type === 'enemy_comedian').length, 2);
  assert.equal(boss.bossState.phaseName, '坏');
  assert.equal(boss.bossState.markedCells.length, 4);
  assert.equal(new Set(boss.bossState.markedCells.map(cell => `${cell.row},${cell.col}`)).size, 4);
  assert.equal(boss.bossState.warningCells.length, 4);
  advance(game, 5);
  assert.equal(boss.bossState.phaseName, '成');
  assert.equal(boss.bossState.markedCells.length, 0);
  assert.deepEqual(game.units.map(ally => ally.hp), [1820, 1820, 1820, 1820]);
  assert.equal(boss.hp, 8280);
});

test('purify clears Guiji bombs during their countdown and barrier blocks lifedrain', () => {
  for (const action of ['purify', 'barrier']) {
    const game = sandbox({ map: 'planarcadia' });
    const ally = game._makeUnit('robin', 0, 0);
    const boss = game.spawnEnemy('boss_guiji', 2);
    boss.hp = 8000; boss.bossState.phase = 3; boss.bossState.markedCells = [{ row: 0, col: 0 }];
    game._bossCast(boss, 'detonate', '坏·爆梗狂欢', 3, [0], boss.bossState.markedCells);
    const before = game.jade;
    assert.equal(game.bossAction(action).ok, true);
    assert.equal(game.jade, before - (action === 'purify' ? 50 : 75));
    assert.equal(game.bossAction(action).ok, false);
    advance(game, 3.1);
    assert.equal(ally.hp, ally.maxHp);
    assert.equal(boss.hp, 8000);
    assert.equal(boss.bossState.markedCells.length, 0);
  }
});

test('boss support validates status, cost, target and cooldown without spending on failure', () => {
  const game = new GameEngine();
  assert.equal(game.bossAction('barrier').ok, false);
  game.start();
  assert.equal(game.bossAction('barrier').ok, false);
  game.spawnEnemy('boss_guiji', 2);
  assert.equal(game.bossAction('unknown').ok, false);
  assert.equal(game.bossAction('purify').ok, false);
  const boss = game.enemies.find(foe => foe.isBoss);
  game._bossCast(boss, 'mark', '住·埋梗时刻', 2, [0], [{ row: 0, col: 0 }]);
  assert.match(game.bossAction('purify').reason, /尚在形成/);
  game.jade = 74;
  assert.equal(game.bossAction('barrier').ok, false);
  assert.equal(game.jade, 74);
  game.jade = 100;
  assert.equal(game.bossAction('barrier').ok, true);
  assert.equal(game.jade, 25);
  game.setPaused(true);
  const before = game.getBossState();
  game.update(3);
  assert.deepEqual(game.getBossState(), before);
  assert.equal(game.bossAction('barrier').ok, false);
});

test('unopposed stationary boss eventually breaks the core instead of stalling forever', () => {
  const game = sandbox();
  game.spawnEnemy('boss_doomsday', 2);
  advance(game, 180);
  assert.equal(game.lives, 0);
  assert.equal(game.status, 'defeat');
});
