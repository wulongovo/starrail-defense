import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine.js';

function arena() {
  const events = [];
  const game = new GameEngine({ seed: 52, onEvent: event => events.push(event) });
  game._nextWaveTime = Infinity;
  game.events = events;
  game.start();
  return game;
}

test('six lane conductors wait outside the board without spending jade or occupying cells', () => {
  const game = arena();
  assert.equal(game.pompoms.length, 6);
  assert.equal(new Set(game.pompoms.map(p => p.id)).size, 6);
  assert.ok(game.pompoms.every(p => p.type === 'pompom' && p.state === 'ready' && p.x < 0));
  assert.equal(game.units.length, 0);
  const jade = game.jade;
  game.update(1);
  assert.equal(game.jade, jade);
  for (let row = 0; row < 6; row++) for (let col = 0; col < 10; col++) assert.equal(game._freeCell(row, col), true);
});

test('conductor intercepts before a breach and sweeps armored enemies along its own lane', () => {
  const game = arena();
  const first = game.spawnEnemy('reaver', 2, -0.84);
  const armored = game.spawnEnemy('trampler', 2, 4, { speed: 0, shield: 9000 });
  const far = game.spawnEnemy('reaver', 2, 9.8, { speed: 0 });
  const neighbor = game.spawnEnemy('reaver', 3, 6, { speed: 0 });
  game.update(0.05);
  assert.equal(first.hp, 0);
  assert.equal(game.lives, 5);
  assert.equal(game.pompoms[2].state, 'running');
  game.update(2);
  assert.equal(armored.hp, 0);
  assert.equal(far.hp, 0);
  assert.equal(neighbor.hp, neighbor.maxHp);
  assert.equal(game.kills, 3);
  assert.equal(game.pompoms[2].state, 'spent');
  assert.equal(game.events.filter(e => e.type === 'pompom-launch').length, 1);
  assert.equal(game.events.filter(e => e.type === 'breach').length, 0);
});

test('a spent lane cannot reload until a new stage and later breaches still cost lives', () => {
  const game = arena();
  game.spawnEnemy('reaver', 0, -0.5);
  game.update(2);
  const late = game.spawnEnemy('reaver', 0, -0.9);
  game.update(0.05);
  assert.equal(late.escaped, true);
  assert.equal(game.lives, 4);
  assert.equal(game.pompoms[0].state, 'spent');
  assert.equal(game.events.filter(e => e.type === 'pompom-launch').length, 1);
  assert.ok(new GameEngine().pompoms.every(p => p.state === 'ready'));
});

test('friendly charmed enemies neither trigger nor take damage from the emergency sweep', () => {
  const game = arena();
  const friend = game.spawnEnemy('reaver', 1, -0.6, { side: 'ally', speed: 0 });
  const unit = game._makeUnit('robin', 1, 4);
  game.update(0.1);
  assert.equal(game.pompoms[1].state, 'ready');
  const threat = game.spawnEnemy('reaver', 1, -0.5, { damage: 0 });
  game.update(2);
  assert.equal(threat.hp, 0);
  assert.equal(friend.hp, friend.maxHp);
  assert.equal(unit.hp, unit.maxHp);
  assert.equal(game.lives, 5);
});

test('simultaneous threats activate only their nearest lanes including fractional taunt positions', () => {
  const game = arena();
  for (const row of [0, 1.5, 5]) game.spawnEnemy('reaver', row, -0.5, { speed: 0 });
  game.update(0.05);
  assert.deepEqual(game.pompoms.filter(p => p.state === 'running').map(p => p.row), [0, 2, 5]);
  assert.equal(game.lives, 5);
  assert.equal(game.kills, 3);
});

test('pause freezes ready and running conductors and resumes their sweep', () => {
  const game = arena();
  game.spawnEnemy('reaver', 4, -0.5);
  game.setPaused(true);
  game.update(1);
  assert.equal(game.pompoms[4].state, 'ready');
  game.setPaused(false);
  game.update(0.05);
  game.setPaused(true);
  const before = JSON.stringify(game.snapshot());
  game.update(30);
  assert.equal(JSON.stringify(game.snapshot()), before);
  game.setPaused(false);
  game.update(2);
  assert.equal(game.pompoms[4].state, 'spent');
});

test('each conductor strikes a boss once through its normal defense mechanics', () => {
  const game = arena();
  const boss = game.spawnEnemy('boss_guiji', 3, 5);
  boss.bossState.skillTimer = 999;
  game.spawnEnemy('reaver', 0, -0.5);
  game.update(1);
  const health = boss.hp;
  assert.ok(health < boss.maxHp && health > 0);
  assert.deepEqual(game.pompoms[0].hitIds.filter(id => id === boss.id), [boss.id]);
  game.update(2);
  assert.equal(boss.hp, health);
});

test('last-wave victory waits for the conductor to leave the battlefield', () => {
  const game = arena();
  game.wave = game.totalWaves;
  game.spawnEnemy('reaver', 5, -0.5);
  game.update(0.05);
  assert.equal(game.status, 'playing');
  assert.equal(game.pompoms[5].state, 'running');
  game.update(2);
  assert.equal(game.status, 'victory');
  assert.equal(game.pompoms[5].state, 'spent');
});
