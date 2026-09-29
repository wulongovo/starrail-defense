import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine.js';
import { ENEMIES, CHARACTERS } from '../src/data.js';
import { CAMPAIGNS, getStage } from '../src/campaign.js';

function arena() {
  const game = new GameEngine(); game._nextWaveTime = Infinity; game.start();
  return game;
}

test('every one of the 147 stages starts with 200 jade including final and elite encounters', () => {
  const stages = Object.values(CAMPAIGNS).flat();
  assert.equal(stages.length, 147);
  for (const stage of stages) {
    assert.equal(stage.initialJade, 200, stage.id);
    assert.equal(new GameEngine({ stage: stage.id }).jade, 200, stage.id);
    assert.ok(stage.waves >= 1 && stage.waves <= 3);
    assert.ok(stage.waveEnemyCounts.every(n => n >= 5));
  }
  assert.deepEqual(getStage('herta-01').waveEnemyCounts, [5]);
  assert.deepEqual(getStage('herta-23').waveEnemyCounts, [9, 11, 12]);
});

test('ordinary monsters gain 35 percent health and regional bosses gain 20 percent', () => {
  assert.equal(ENEMIES.reaver.hp, 297);
  assert.equal(ENEMIES.trampler.hp, 1026);
  assert.equal(ENEMIES.boss_doomsday.hp, 10560);
  assert.equal(ENEMIES.boss_guiji.hp, 11520);
  const game = arena();
  const elite = game.spawnEnemy('trampler', 0, 8, { scale: 2.6, isMiniBoss: true });
  assert.equal(elite.maxHp, 1026 * 2.6);
});

test('passive jade production uses the slower recurring cadence, not just a delayed first drop', () => {
  const game = arena(); game._makeUnit('robin', 0, 0); game._makeUnit('harmony', 1, 0);
  const drops = [];
  const create = game._gem.bind(game);
  game._gem = (...args) => { const gem = create(...args); drops.push({ source: gem.source, at: game.time }); return gem; };
  game.update(24);
  for (const [source, times] of [['sky', [7, 14, 21]], ['robin', [8, 16, 24]], ['harmony', [10, 20]]]) {
    assert.deepEqual(drops.filter(d => d.source === source).map(d => Math.round(d.at * 100) / 100), times, source);
  }
});

test('Kafka charms the nearest eligible monster at five-second intervals and keeps her ranged attack', () => {
  const game = arena();
  const kafka = game._makeUnit('kafka', 0, 0);
  const near = game.spawnEnemy('reaver', 0, 7, { speed: 0, hp: 10000, maxHp: 10000 });
  const far = game.spawnEnemy('reaver', 0, 9, { speed: 0, hp: 10000, maxHp: 10000 });
  game.update(4.99);
  assert.equal(near.side, 'enemy');
  assert.ok(near.hp < near.maxHp, 'normal shots still land before Spirit Whisper');
  game.update(0.01);
  assert.equal(near.side, 'ally');
  assert.equal(far.side, 'enemy');
  assert.ok(Math.abs(kafka.charmTimer - 5) < 0.001);
  assert.ok(game.effects.some(e => e.type === 'spirit-whisper' && e.fromX === kafka.x && e.x === near.x));
  game.update(4.99); assert.equal(far.side, 'enemy');
  game.update(0.01); assert.equal(far.side, 'ally');
});

test('Kafka can charm every normal monster and every non-boss summon', () => {
  for (const definition of Object.values(ENEMIES).filter(e => e.isMonster || e.summon)) {
    const game = arena(), kafka = game._makeUnit('kafka', 2, 0);
    const target = game.spawnEnemy(definition.id, 2, 6, { speed: 0 });
    kafka.charmTimer = 0; kafka.attackTimer = Infinity;
    game._unitTick(kafka, 0.01);
    assert.equal(target.side, 'ally', definition.name);
    assert.equal(target.charmed, true, definition.name);
  }
});

test('Kafka skips mini bosses and all regional bosses without consuming a ready whisper', () => {
  const game = arena(), kafka = game._makeUnit('kafka', 2, 0);
  kafka.attackTimer = Infinity;
  const bosses = Object.values(ENEMIES).filter(e => e.isBoss).map(e => game.spawnEnemy(e.id, 2, 4));
  const elite = game.spawnEnemy('trampler', 2, 3, { isMiniBoss: true });
  const legacyBoss = game.spawnEnemy('boss', 2, 2);
  game._unitTick(kafka, 5);
  for (const foe of [...bosses, elite, legacyBoss]) assert.equal(foe.side, 'enemy');
  assert.ok(kafka.charmTimer <= 0);
  const normal = game.spawnEnemy('enemy_retainer', 2, 8);
  game._unitTick(kafka, 0.01);
  assert.equal(normal.side, 'ally');
  assert.equal(kafka.charmTimer, CHARACTERS.kafka.charmInterval);
  assert.equal(game._charm(elite, kafka), false);
});

test('Kafka does not charm allies, targets behind her, or monsters on another lane', () => {
  const game = arena(), kafka = game._makeUnit('kafka', 2, 3);
  kafka.charmTimer = 0; kafka.attackTimer = Infinity;
  const behind = game.spawnEnemy('reaver', 2, 1);
  const otherLane = game.spawnEnemy('reaver', 1, 5);
  const ally = game.spawnEnemy('reaver', 2, 4, { side: 'ally' });
  game._unitTick(kafka, 0.1);
  assert.equal(behind.side, 'enemy'); assert.equal(otherLane.side, 'enemy');
  assert.equal(ally.side, 'ally'); assert.ok(kafka.charmTimer < 0);
});
