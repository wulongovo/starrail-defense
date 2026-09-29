import { CHARACTERS, ENEMIES, MAPS, BOX, TRAILBLAZER_FORMS, LINK_SKILLS, ECONOMY } from './data.js';
import { getStage, getStages } from './campaign.js';

const SPECIAL_POOL = Object.keys(CHARACTERS).filter(id => id !== 'mimi');
const ENEMY_POOL = Object.values(ENEMIES).filter(enemy => enemy.isMonster).map(enemy => enemy.id);
const EPSILON = 0.000001;
const distance = (a, b) => Math.hypot(a.x - b.x, a.row - b.row);

/** Pure, seeded simulation. No DOM, timers, network or render dependencies. */
export class GameEngine {
  constructor({ map = 'herta', stage = 1, mode = 'classic', seed = 20260928, onEvent = () => {} } = {}) {
    const requestedMap = MAPS.find(item => item.id === map) || MAPS[0];
    this.stage = typeof stage === 'string' && stage.includes('-') ? getStage(stage) : getStages(requestedMap.id).find(item => item.number === Number(stage));
    if (!this.stage) throw new Error(`未知关卡：${stage}`);
    this.map = MAPS.find(item => item.id === this.stage.mapId) || requestedMap;
    this.mode = mode === 'blindbox' ? 'blindbox' : 'classic';
    this.rows = this.map.rows;
    this.cols = this.map.cols || 10;
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.seed = (Number(seed) >>> 0) || 1;
    this.units = [];
    this.enemies = [];
    this.projectiles = [];
    this.gems = [];
    this.effects = [];
    this.time = 0;
    this.jade = this.stage.initialJade ?? ECONOMY.startingJade;
    this.wave = 0;
    this.totalWaves = this.stage.waves;
    this.kills = 0;
    this.status = 'ready';
    this.lives = 5;
    this.cooldowns = {};
    this.paused = false;
    this._id = 0;
    // wulong: one emergency conductor per lane, outside deployable cells.
    this.pompoms = Array.from({ length: this.rows }, (_, row) => ({ id: `pompom-${row}`, type: 'pompom', name: '帕姆', side: 'ally', row, x: -0.82, state: 'ready', hitIds: [] }));
    this._skyTimer = ECONOMY.skyInterval;
    this._mapTimer = ECONOMY.holyflameInterval;
    this._nextWaveTime = this.stage.prepTime ?? 18;
    this._spawnQueue = [];
    this._lastWaveComplete = false;
    this.teamBarrier = 0;
    this._waveResting = false;
    this._linkProgress = Object.fromEntries(LINK_SKILLS.map(link => [link.id, { charge: 0, signature: '' }]));
  }

  random() {
    let state = this.seed;
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    this.seed = state >>> 0;
    return this.seed / 4294967296;
  }

  _pick(items) { return items[Math.floor(this.random() * items.length)]; }
  _nextId(prefix) { return `${prefix}-${++this._id}`; }
  _event(type, text, data = {}) { this.onEvent({ type, text, time: this.time, ...data }); }
  _effect(type, x, row, color = '#c1eaff', ttl = 0.6, text = '') {
    const effect = { id: this._nextId('fx'), type, x, row, color, ttl, maxTtl: ttl, text };
    this.effects.push(effect);
    if (this.effects.length > 100) this.effects.splice(0, this.effects.length - 100);
    return effect;
  }

  start() {
    if (this.status !== 'ready') return false;
    this.status = 'playing';
    this._event('start', `${this.stage.title} · ${this.stage.prepTime ?? 18} 秒后首波来袭${this.stage.modifier === 'random-transform' ? ' · 随机变身已启用' : ''}`);
    return true;
  }

  setPaused(value) {
    if (!['playing', 'paused'].includes(this.status)) return;
    this.paused = Boolean(value);
    this.status = this.paused ? 'paused' : 'playing';
  }

  _freeCell(row, col) {
    return !this.units.some(unit => unit.hp > 0 && !unit.isPet && unit.row === row && unit.col === col);
  }

  place(type, row, col, form) {
    if (!['ready', 'playing'].includes(this.status)) return { ok: false, reason: '当前不能部署角色' };
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= this.rows || col < 0 || col >= this.cols) return { ok: false, reason: '请选择棋盘内的格子' };
    if (!this._freeCell(row, col)) return { ok: false, reason: '这里已经有伙伴了' };
    if (type === 'box' && this.mode !== 'blindbox') return { ok: false, reason: '盲盒仅在奇遇模式开放' };
    if (type !== 'box' && (!CHARACTERS[type] || type === 'mimi')) return { ok: false, reason: '未知角色' };
    if (form !== undefined && (type !== 'trailblazer' || !TRAILBLAZER_FORMS.includes(form))) return { ok: false, reason: '开拓者只能切换为其他开拓者命途' };
    const chosen = form || type;
    const definition = type === 'box' ? BOX : CHARACTERS[type];
    const cooldownKey = TRAILBLAZER_FORMS.includes(type) ? 'trailblazer' : type;
    if ((this.cooldowns[cooldownKey] || 0) > EPSILON) return { ok: false, reason: '角色尚在冷却中' };
    if (this.jade < definition.cost) return { ok: false, reason: `星琼不足，需要 ${definition.cost}` };
    this.jade -= definition.cost;
    this.cooldowns[cooldownKey] = definition.cooldown;
    let unit;
    if (this.stage.modifier === 'random-transform') {
      const result = this._pick(Object.keys(CHARACTERS).filter(id => id !== 'mimi'));
      unit = this._makeUnit(result, row, col, { originalCard: type });
      this._effect('surprise', col, row, unit.color, 1.1, '随机变身');
      this._event('transform', `${definition.name}随机变为${unit.name}，消耗原卡费用 ${definition.cost}`, { unitId: unit.id, originalType: type, character: result, row, col });
    } else unit = type === 'box' ? this._surprise(row, col, 'blindbox') : this._makeUnit(chosen, row, col);
    this._effect('deploy', col, row, unit.color || '#b6dbff', 0.7);
    this._event('place', `${unit.name}加入防线`, { unitId: unit.id, character: unit.type, row, col });
    return { ok: true, unit };
  }

  remove(row, col) {
    if (!['ready', 'playing'].includes(this.status)) return false;
    const index = this.units.findIndex(unit => !unit.isPet && unit.row === row && unit.col === col && unit.hp > 0);
    if (index === -1) return false;
    const [unit] = this.units.splice(index, 1);
    this._effect('remove', col, row, '#bfd2de', 0.5);
    this._event('remove', `已撤回${unit.name}`, { unitId: unit.id });
    this._syncLinks();
    return true;
  }

  _makeUnit(type, row, col, extra = {}) {
    const definition = CHARACTERS[type];
    const unit = {
      id: this._nextId('ally'), type, name: definition.name, side: 'ally',
      x: col, col, row, hp: definition.hp, maxHp: definition.hp, baseMaxHp: definition.hp,
      color: definition.color, attackAnim: 0, hitAnim: 0, shield: definition.shield || 0,
      attackTimer: Math.min(definition.interval || 0.6, 0.6),
      abilityTimer: definition.interval || 5, charmTimer: definition.charmInterval || 0,
      summonTimer: 0.8, shieldTimer: definition.shieldInterval || 8, hitsReceived: 0, attacksMade: 0,
      shapeshifter: type === 'sparkle', shapeAttackCount: 0, transformCount: 0, ...extra,
    };
    this.units.push(unit);
    this._syncLinks();
    return unit;
  }

  spawnEnemy(type = 'voidranger', row = 0, x = this.cols + 0.4, options = {}) {
    if (!ENEMIES[type]) throw new Error(`Unknown enemy type: ${type}`);
    if (!Number.isFinite(row) || row < 0 || row >= this.rows || !Number.isFinite(x)) throw new Error('Enemy coordinates must be finite and on a valid row');
    const definition = ENEMIES[type];
    const scale = options.scale ?? 1;
    const foe = {
      id: this._nextId('foe'), type, name: definition.name, side: options.side === 'ally' ? 'ally' : 'enemy',
      x, col: x, row, homeRow: row, hp: definition.hp * scale, maxHp: definition.hp * scale,
      color: definition.color, speed: definition.speed, damage: definition.damage,
      attackTimer: 0.7, attackAnim: 0, hitAnim: 0, slowTimer: 0, slowFactor: 1,
      vulnerableTimer: 0, tauntTarget: null, isBoss: Boolean(definition.isBoss), isEnemyEntity: true,
      shield: definition.shield || 0, abilityTimer: definition.skillInterval || 5,
      chargeRemaining: 0, leapRemaining: definition.behavior === 'leap' ? 1 : 0,
      behaviorState: { castRemaining: 0, castDuration: 0, skillName: '', key: null }, ...options,
    };
    if (foe.isBoss) {
      foe.x = options.x ?? Math.min(x, this.cols - 0.2);
      foe.bossState = { phase: 1, phaseName: '初始形态', skillName: '', castRemaining: 0, castDuration: 0, warningRows: [], warningCells: [], shield: 0, maxShield: 0, parts: [], cycles: 0, skillTimer: 2.5, age: 0, breachTimer: 15, deaths: 0, markedCells: [], barrierRemaining: 0 };
      if (type === 'boss_doomsday') {
        foe.bossState.phaseName = '部位装甲';
        foe.bossState.parts = ['灾虐的右手', '反物质引擎', '黎明的左手'].map((name, index) => ({ id: `part-${index}`, name, row: Math.round(index * (this.rows - 1) / 2), hp: 550, maxHp: 550 }));
      }
      if (type === 'boss_phantylia') foe.bossState.phaseName = '丰饶玄莲';
      if (type === 'boss_dominicus') { foe.bossState.phaseName = '同谐屏障'; foe.bossState.shield = 1400; foe.bossState.maxShield = 1400; }
      if (type === 'boss_lycurgus') foe.bossState.phaseName = '眷属召集';
      if (type === 'boss_guiji') foe.bossState.phaseName = '成';
      this._event('boss-arrive', `区域首领：${foe.name}。技能机制已转为塔防演算。`, { enemyId: foe.id, bossType: type });
    }
    this.enemies.push(foe);
    if (foe.isMiniBoss) { foe.name = `${definition.name}·精英`; this._event('miniboss', `小首领出现：${foe.name}`, { enemyId: foe.id, enemyType: type }); }
    return foe;
  }

  _surprise(row, col, source) {
    const enemyRoll = this.random() < 0.26;
    const type = this._pick(enemyRoll ? ENEMY_POOL : SPECIAL_POOL);
    const unit = enemyRoll ? this.spawnEnemy(type, row, col + 0.15, { side: 'ally', charmed: true }) : this._makeUnit(type, row, col);
    this._effect('surprise', col, row, '#f3bbef', 1.2, enemyRoll ? '友方投影' : '奇遇！');
    this._event(source, `${source === 'blindbox' ? '盲盒揭晓' : '欢愉惊喜'}：${unit.name}${enemyRoll ? ' · 已策反' : ''}`, { character: type, charmed: enemyRoll, row, col, unitId: unit.id });
    return unit;
  }

  _gem(x, row, value = 50, source = 'sky') {
    const gem = { id: this._nextId('gem'), x, row, value, age: 0, source, ttl: 18 };
    this.gems.push(gem);
    return gem;
  }

  collectGem(id) {
    const index = this.gems.findIndex(gem => gem.id === id);
    if (index < 0) return 0;
    const [gem] = this.gems.splice(index, 1);
    this.jade += gem.value;
    this._effect('collect', gem.x, gem.row, '#e4c589', 0.55, `+${gem.value}`);
    return gem.value;
  }

  collectAll() {
    const ids = this.gems.map(gem => gem.id);
    return ids.reduce((sum, id) => sum + this.collectGem(id), 0);
  }

  _startWave() {
    this.wave++;
    const count = this.stage.waveEnemyCounts?.[this.wave - 1] ?? this.stage.enemyCount ?? 5;
    const pool = this.stage.enemyPool?.length ? this.stage.enemyPool : ['voidranger', 'sampo'];
    const interval = this.stage.spawnInterval ?? 5;
    const scale = this.stage.difficulty ?? 1;
    for (let index = 0; index < count; index++) {
      this._spawnQueue.push({ at: this.time + index * interval, type: this._pick(pool), row: Math.floor(this.random() * this.rows), scale });
    }
    const finalWave = this.wave === this.totalWaves;
    const encounter = finalWave && (this.stage.boss || this.stage.miniBoss);
    if (encounter) this._spawnQueue.push({ at: this.time + Math.max(0, count - 1) * interval + 5, type: encounter, row: Math.floor(this.rows / 2), scale: this.stage.boss ? scale : scale * 2.6, isMiniBoss: !this.stage.boss });
    this._spawnQueue.sort((a, b) => a.at - b.at);
    this._nextWaveTime = Infinity;
    this._waveResting = false;
    this._event('wave', `第 ${this.wave} / ${this.totalWaves} 波${encounter ? ` · ${ENEMIES[encounter].name}即将出现` : ' · 敌军来袭'}`, { wave: this.wave, stageId: this.stage.id });
  }

  _targets(unit, range, adjacent = false) {
    return this.enemies.filter(foe => foe.side === 'enemy' && foe.hp > 0 &&
      (adjacent ? (foe.isBoss || Math.abs(foe.row - unit.row) <= 1.05) && Math.abs(foe.x - unit.x) <= range :
        (foe.isBoss || Math.abs(foe.row - unit.row) < 0.38) && foe.x >= unit.x - 0.2 && foe.x - unit.x <= range))
      .sort((a, b) => distance(unit, a) - distance(unit, b));
  }

  _syncLinks() {
    for (const link of LINK_SKILLS) {
      const actors = link.members.map(type => this.units.find(unit => unit.type === type && unit.hp > 0 && !unit.isPet));
      const signature = actors.every(Boolean) ? actors.map(unit => unit.id).join('|') : '';
      const state = this._linkProgress[link.id];
      if (state.signature !== signature) { state.charge = 0; state.signature = signature; }
    }
  }

  getLinkStates() {
    this._syncLinks();
    return LINK_SKILLS.map(link => {
      const state = this._linkProgress[link.id];
      const required = link.chargeRequired || 5;
      return { id: link.id, name: link.name, members: [...link.members], actors: [...link.members], actorIds: state.signature ? state.signature.split('|') : [], description: link.description,
        charge: state.charge, required, available: Boolean(state.signature), ready: Boolean(state.signature) && state.charge >= required };
    });
  }

  _recordAttack(unit, shapeVersion = unit?.transformCount) {
    if (!unit || unit.hp <= 0 || !this.units.some(ally => ally.id === unit.id)) return;
    if (unit.shapeshifter && shapeVersion !== unit.transformCount) return;
    unit.attacksMade++;
    this._syncLinks();
    for (const link of LINK_SKILLS) {
      const state = this._linkProgress[link.id];
      const required = link.chargeRequired || 5;
      // One designated living unit per member: duplicate cards do not multiply charge.
      if (!state.signature.split('|').includes(unit.id) || state.charge >= required) continue;
      state.charge++;
      this._event('link-charge', `${link.name}：${state.charge}/${required}`, { linkId: link.id, charge: state.charge, required, sourceId: unit.id });
      if (state.charge === required) this._event('link-ready', `${link.name}已就绪，点击联动按钮释放`, { linkId: link.id, actors: [...link.members] });
    }
    const definition = CHARACTERS[unit.type];
    if (definition.kind === 'accountant' && unit.attacksMade % (definition.jadeEvery || 3) === 0) this._gem(unit.x, unit.row, definition.jadeAmount || 10, unit.type);
    if (definition.kind === 'lightningLord' && unit.attacksMade % (definition.lordEvery || 3) === 0) {
      const targets = this._targets(unit, definition.range, true);
      for (const target of targets) this._damage(target, this._outgoingDamage(unit, definition.lordDamage || 110), unit);
      if (targets.length) this._effect('lightningLord', targets[0].x, targets[0].row, '#ffe0a2', 0.9, '神君');
    }
    if (unit.shapeshifter) {
      unit.shapeAttackCount++;
      if (unit.shapeAttackCount >= 2) this._transformShapeshifter(unit);
    }
  }

  _transformShapeshifter(unit) {
    const fromType = unit.type;
    const type = this._pick(Object.keys(CHARACTERS).filter(id => id !== 'mimi' && id !== fromType));
    const definition = CHARACTERS[type];
    const ratio = unit.hp / unit.maxHp;
    unit.type = type; unit.name = definition.name; unit.color = definition.color;
    unit.maxHp = definition.hp; unit.baseMaxHp = definition.hp; unit.hp = Math.max(1, ratio * definition.hp);
    unit.suppressionTimer = 0; unit.shapeAttackCount = 0; unit.transformCount++;
    unit.attackTimer = Math.min(definition.interval || 1.4, 1.4); unit.abilityTimer = definition.interval || 5;
    unit.charmTimer = definition.charmInterval || 0; unit.shieldTimer = definition.shieldInterval || 8;
    this._syncLinks();
    this._effect('surprise', unit.x, unit.row, definition.color, 1, '花火变身');
    this._event('shapeshift', `花火的虚影从${CHARACTERS[fromType].name}变为${unit.name}`, { unitId: unit.id, fromType, character: type, transformCount: unit.transformCount });
  }

  releaseLink(id) {
    if (this.status !== 'playing') return { ok: false, reason: '战斗进行时才能释放联动' };
    const link = LINK_SKILLS.find(skill => skill.id === id);
    if (!link) return { ok: false, reason: '未知联动技能' };
    const state = this.getLinkStates().find(item => item.id === id);
    if (!state.available) return { ok: false, reason: '联动伙伴需要同时存活在场' };
    if (!state.ready) return { ok: false, reason: `联动尚未蓄满：${state.charge}/${state.required}` };
    const targets = this.enemies.filter(foe => foe.hp > 0 && foe.side === 'enemy');
    if (!targets.length && link.effect.kind !== 'shield') return { ok: false, reason: '等待敌人入场后释放联动' };
    const actors = state.actorIds.map(actorId => this.units.find(unit => unit.id === actorId));
    this._linkProgress[id].charge = 0;
    const effect = link.effect;
    for (const target of targets) {
      if (effect.vulnerableSeconds) target.vulnerableTimer = Math.max(target.vulnerableTimer || 0, effect.vulnerableSeconds);
      if (effect.slowSeconds) { target.slowTimer = Math.max(target.slowTimer || 0, effect.slowSeconds); target.slowFactor = 0.5; }
      this._damage(target, effect.damage || 0, { id, type: 'link', x: (this.cols - 1) / 2, row: target.row });
    }
    if (effect.shield) for (const ally of [...this.units, ...this.enemies.filter(foe => foe.side === 'ally')]) if (ally.hp > 0) ally.shield = (ally.shield || 0) + effect.shield;
    for (const actor of actors) actor.attackAnim = 1;
    const duration = 2.5;
    const color = link.color || CHARACTERS[link.members[0]].color;
    Object.assign(this._effect('link', (this.cols - 1) / 2, (this.rows - 1) / 2, color, duration, link.name), { linkId: id, name: link.name, actors: [...link.members], actorIds: [...state.actorIds], duration });
    const text = `${link.name}！${link.members.map(member => CHARACTERS[member].name).join(' × ')}释放联动`;
    this._event('link', text, { linkId: id, name: link.name, actors: [...link.members], actorIds: [...state.actorIds], duration });
    return { ok: true, text };
  }

  _supportFor(unit) {
    return this.units.find(ally => ally.hp > 0 && CHARACTERS[ally.type].kind === 'support' && ally.id !== unit.id && distance(ally, unit) <= CHARACTERS[ally.type].range);
  }

  _outgoingDamage(unit, damage) {
    const support = this._supportFor(unit);
    return damage * (support ? CHARACTERS[support.type].supportDamage || 1.2 : 1);
  }

  _charm(foe, source) {
    if (!foe || foe.hp <= 0 || foe.side !== 'enemy') return false;
    if (foe.isBoss || foe.type === 'boss' || (source?.type === 'kafka' && foe.isMiniBoss)) return false;
    foe.side = 'ally'; foe.charmed = true; foe.tauntTarget = null; foe.attackTimer = 0.4;
    this._effect('charm', foe.x, foe.row, '#f1a9e4', 1.2, '策反！');
    if (source.type === 'kafka') Object.assign(this._effect('spirit-whisper', foe.x, foe.row, '#e274c3', 1, '言灵·策反'), { fromX: source.x, fromRow: source.row });
    this._event('charm', `${source.name}策反了${foe.name}`, { enemyId: foe.id, sourceId: source.id });
    return true;
  }

  _damage(target, amount, source, enemyHit = false) {
    if (!target || target.hp <= 0) return;
    let damage = amount;
    if (target.vulnerableTimer > 0) damage *= 1.4;
    if (target.isEnemyEntity) damage *= 1 - (ENEMIES[target.type].armor || 0);
    if (target.isBoss && target.bossState) {
      const state = target.bossState;
      const parts = state.parts.filter(part => part.hp > 0);
      if (parts.length) {
        const part = parts.sort((a, b) => Math.abs(a.row - (source?.row ?? target.row)) - Math.abs(b.row - (source?.row ?? target.row)))[0];
        part.hp = Math.max(0, part.hp - damage);
        target.hitAnim = 0.2;
        if (part.hp === 0) this._event('boss-part', `${part.name}已击破`, { bossId: target.id, partId: part.id });
        if (state.parts.every(item => item.hp <= 0)) { state.phase = 2; state.phaseName = '核心暴露'; this._interruptBoss(target, '三部位全部击破：核心暴露，受到伤害提高'); }
        return;
      }
      if (target.type === 'boss_doomsday') damage *= 1.3;
      if (state.shield > 0) {
        const absorbed = Math.min(state.shield, damage); state.shield -= absorbed; damage -= absorbed;
        if (state.shield <= EPSILON) {
          state.shield = 0;
          for (const ally of this.units) ally.shield = (ally.shield || 0) + 130;
          this._interruptBoss(target, '同谐屏障击破！全体伙伴获得 130 护盾，首领读条中断');
        }
      }
    }
    const absorbed = Math.min(target.shield || 0, damage);
    target.shield = Math.max(0, (target.shield || 0) - absorbed);
    target.hp = Math.max(0, target.hp - (damage - absorbed));
    target.hitAnim = 0.18;
    if (enemyHit && !target.isEnemyEntity && CHARACTERS[target.type]) {
      target.hitsReceived++;
      if (target.hp > 0 && ['counter', 'taunt'].includes(CHARACTERS[target.type].kind) && target.hitsReceived % (CHARACTERS[target.type].counterEvery || 3) === 0) {
        target.attackAnim = 0.5;
        this._effect('counter', target.x, target.row, target.color, 0.65, '反击');
        const definition = CHARACTERS[target.type];
        const targets = this._targets(target, definition.range, true);
        if (source && source.hp > 0 && source.side === 'enemy' && !targets.includes(source)) targets.push(source);
        for (const foe of targets) this._damage(foe, this._outgoingDamage(target, definition.damage), target);
        if (targets.length) this._recordAttack(target);
        this._event('counter', `${target.name}发动反击`, { unitId: target.id });
      }
    }
    if (target.hp <= 0 && !target._deathHandled) {
      target._deathHandled = true;
      if (target.side === 'enemy') { this.kills++; this.jade += target.isBoss || target.type === 'boss' ? 100 : 10; }
      for (const boss of this.enemies) if (boss.type === 'boss_lycurgus' && boss.hp > 0 && boss.id !== target.id && boss.bossState.phase === 2) boss.bossState.deaths++;
      this._effect('defeat', target.x, target.row, target.color, 0.55);
      if (target.side === 'ally') this._syncLinks();
    }
  }

  _unitTick(unit, dt) {
    let definition = CHARACTERS[unit.type];
    // A shapeshift keeps the same one-cell actor. Passive/summoning appearances
    // receive an illusion shot, so two attacks always permit the next change.
    if (unit.shapeshifter && (!definition.damage || ['producer', 'healer', 'tank', 'counter', 'taunt', 'support', 'buffer', 'summoner', 'randomSummoner'].includes(definition.kind))) definition = { ...definition, kind: 'ranged', damage: 30, interval: 1.4, range: 10, charmInterval: 0 };
    if (unit.silenceTimer > 0) return;
    const buffed = this.units.some(other => other.type === 'harmony' && other.hp > 0 && other.id !== unit.id && Math.abs(other.x - unit.x) <= 1.1 && Math.abs(other.row - unit.row) <= 1.1);
    const support = this._supportFor(unit);
    unit.attackTimer -= dt * (buffed ? 1.25 : 1) * (support ? CHARACTERS[support.type].supportSpeed || 1.15 : 1);
    unit.abilityTimer -= dt;
    if (definition.kind === 'support') return;
    if (definition.kind === 'guardian') {
      unit.shieldTimer -= dt;
      if (unit.shieldTimer <= EPSILON) {
        unit.shieldTimer += definition.shieldInterval || 6;
        for (const ally of this.units) if (ally.hp > 0 && Math.abs(ally.x - unit.x) <= 1.1 && Math.abs(ally.row - unit.row) <= 1.1) { ally.shield = (ally.shield || 0) + (definition.shield || 100); this._effect('shield', ally.x, ally.row, unit.color, 0.7); }
      }
    }
    if (definition.kind === 'producer' || definition.kind === 'buffer') {
      if (unit.abilityTimer <= EPSILON) { this._gem(unit.x, unit.row, definition.kind === 'producer' ? 50 : 25, unit.type); unit.abilityTimer += definition.interval; unit.attackAnim = 0.55; }
      return;
    }
    if (definition.kind === 'tank') {
      unit.shieldTimer -= dt;
      if (unit.shieldTimer <= EPSILON) { unit.shield = Math.max(unit.shield, Math.min(300, unit.shield + 100)); unit.shieldTimer += 8; this._effect('shield', unit.x, unit.row, '#9bcfff'); }
      return;
    }
    if (definition.kind === 'randomSummoner') {
      if (unit.abilityTimer <= EPSILON) {
        unit.abilityTimer += 5;
        const free = [];
        for (let row = 0; row < this.rows; row++) for (let col = 0; col < this.cols; col++) if (this._freeCell(row, col)) free.push({ row, col });
        if (free.length) { const cell = this._pick(free); this._surprise(cell.row, cell.col, 'elation'); unit.attackAnim = 0.8; }
        else this._effect('surprise', unit.x, unit.row, '#f3bbef', 0.6, '防线已满');
      }
      return;
    }
    if (definition.kind === 'summoner') {
      unit.summonTimer -= dt;
      if (unit.summonTimer <= EPSILON && !this.units.some(pet => pet.summonOwner === unit.id && pet.hp > 0)) {
        this._makeUnit('mimi', unit.row, Math.min(this.cols - 0.55, unit.col + 0.42), { summonOwner: unit.id, isPet: true, charmTimer: 2 });
        unit.summonTimer = 8;
        this._effect('summon', unit.x + 0.42, unit.row, '#edbaf3', 0.8);
        this._event('summon', '记忆开拓者召唤了迷迷', { unitId: unit.id });
      }
      return;
    }
    if (definition.kind === 'healer') {
      if (unit.abilityTimer <= EPSILON) {
        for (const ally of [...this.units, ...this.enemies.filter(foe => foe.side === 'ally')]) {
          if (ally.hp > 0 && distance(unit, ally) <= definition.range + 0.01 && ally.hp < ally.maxHp) {
            ally.hp = Math.min(ally.maxHp, ally.hp + 75); this._effect('heal', ally.x, ally.row, '#9cecce', 0.6, '+75');
          }
        }
        unit.abilityTimer += definition.interval; unit.attackAnim = 0.55;
      }
      return;
    }
    if (definition.charmInterval) {
      unit.charmTimer -= dt;
      if (unit.charmTimer <= EPSILON) {
        const target = this._targets(unit, definition.range).find(foe => !foe.isBoss && foe.type !== 'boss' && (unit.type !== 'kafka' || !foe.isMiniBoss));
        if (target && this._charm(target, unit)) { unit.charmTimer = definition.charmInterval; unit.attackAnim = 0.7; }
      }
    }
    if (['counter', 'taunt'].includes(definition.kind)) return;
    if (unit.attackTimer > EPSILON) return;
    const targets = this._targets(unit, definition.range, definition.kind === 'spin');
    if (!targets.length) return;
    unit.attackTimer = definition.interval;
    unit.attackAnim = definition.kind === 'melee' || definition.kind === 'pet' ? 0.4 : 0.6;
    if (['melee', 'pet', 'spin'].includes(definition.kind)) {
      const victims = definition.kind === 'spin' || definition.kind === 'melee' ? targets : targets.slice(0, 2);
      for (const target of victims) this._damage(target, this._outgoingDamage(unit, definition.damage), unit);
      this._recordAttack(unit);
      this._effect(definition.kind === 'spin' ? 'spin' : 'slash', unit.x, unit.row, definition.color, 0.32);
    } else {
      this.projectiles.push({ id: this._nextId('shot'), x: unit.x + 0.25, row: unit.row, fromId: unit.id, type: unit.type, targetId: targets[0].id, side: 'ally', color: definition.color, damage: this._outgoingDamage(unit, definition.damage), speed: 7, ttl: 3, pierce: definition.pierce || 1, hitIds: [], slow: definition.slow, splash: definition.splash, vulnerable: definition.vulnerable, attackCredited: false, shapeVersion: unit.transformCount });
    }
  }

  getBossState() {
    const boss = this.enemies.find(foe => foe.isBoss && foe.side === 'enemy' && foe.hp > 0);
    if (!boss) return null;
    const state = boss.bossState;
    return { id: boss.id, type: boss.type, name: boss.name, hp: boss.hp, maxHp: boss.maxHp, ...state,
      warningRows: [...state.warningRows], warningCells: state.warningCells.map(cell => ({ ...cell })),
      markedCells: state.markedCells.map(cell => ({ ...cell })), parts: state.parts.map(part => ({ ...part })),
      barrierRemaining: this.teamBarrier };
  }

  bossAction(action) {
    if (this.status !== 'playing') return { ok: false, reason: '战斗进行时才能使用支援' };
    const boss = this.enemies.find(foe => foe.isBoss && foe.side === 'enemy' && foe.hp > 0);
    if (!boss) return { ok: false, reason: '当前没有区域首领' };
    const actions = { barrier: { cost: 75, cooldown: 12 }, purify: { cost: 50, cooldown: 8 } };
    const actionData = actions[action];
    if (!actionData) return { ok: false, reason: '未知支援行动' };
    if ((this.cooldowns[`boss_${action}`] || 0) > EPSILON) return { ok: false, reason: '列车支援仍在冷却中' };
    if (this.jade < actionData.cost) return { ok: false, reason: `星琼不足，需要 ${actionData.cost}` };
    const allies = [...this.units, ...this.enemies.filter(foe => foe.side === 'ally')].filter(ally => ally.hp > 0);
    if (action === 'purify' && !boss.bossState.markedCells.length && !allies.some(ally => ally.suppressionTimer > 0 || ally.silenceTimer > 0)) return { ok: false, reason: boss.bossState.castKey === 'mark' ? '爆梗标记尚在形成，读条结束后即可净化' : '目前没有可净化的标记或压制' };
    this.jade -= actionData.cost;
    this.cooldowns[`boss_${action}`] = actionData.cooldown;
    let text;
    if (action === 'barrier') {
      this.teamBarrier = 12;
      for (const ally of allies) { ally.shield = (ally.shield || 0) + 130; this._effect('shield', ally.x, ally.row, '#84d9fa', 0.8, '+130'); }
      text = '列车屏障：全体获得 130 护盾，12 秒内首领伤害减半并阻止归寂噬命';
    } else {
      boss.bossState.markedCells = [];
      if (boss.type === 'boss_guiji') { boss.bossState.warningCells = []; boss.bossState.warningRows = []; }
      for (const ally of allies) { if (ally.suppressionTimer > 0) ally.maxHp = ally.baseMaxHp || ally.maxHp; ally.suppressionTimer = 0; ally.silenceTimer = 0; }
      text = '列车净化：爆梗标记与生命压制已解除';
      this._effect('purify', 4, (this.rows - 1) / 2, '#c5ffde', 1, '净化');
    }
    this._event('boss-action', text, { action, bossId: boss.id });
    return { ok: true, text };
  }

  _interruptBoss(boss, text) {
    const state = boss.bossState;
    state.castRemaining = 0; state.castDuration = 0; state.skillName = '';
    state.warningRows = []; state.warningCells = []; state.skillTimer = 3;
    state.castKey = null;
    this._effect('break', boss.x, boss.row, '#f5d884', 1, '击破');
    this._event('boss-break', text, { bossId: boss.id });
  }

  _bossCast(boss, key, name, duration, rows = [], cells = []) {
    const state = boss.bossState;
    state.castKey = key; state.skillName = name; state.castRemaining = duration; state.castDuration = duration;
    state.warningRows = [...new Set(rows)]; state.warningCells = cells.map(cell => ({ ...cell }));
    this._event('boss-cast', `${boss.name}蓄势「${name}」：${duration} 秒。${cells.length ? '注意标记格，净化可清除。' : rows.length ? `危险路：${state.warningRows.map(row => row + 1).join('、')}。` : '准备应对召唤。'}`, { bossId: boss.id, skill: key, duration, warningRows: [...state.warningRows], warningCells: cells });
  }

  _bossDamage(boss, amount, rows = null, cells = null, hits = 1) {
    const targets = [...this.units, ...this.enemies.filter(foe => foe.side === 'ally')].filter(ally => ally.hp > 0 &&
      (!rows || rows.includes(Math.round(ally.row))) && (!cells || cells.some(cell => Math.round(ally.row) === cell.row && Math.abs(ally.x - cell.col) < 0.65)));
    const preventedDrain = this.teamBarrier > 0;
    for (let hit = 0; hit < hits; hit++) {
      for (const ally of targets) if (ally.hp > 0 && boss.hp > 0) {
        this._damage(ally, amount * (preventedDrain ? 0.5 : 1), boss, true);
        this._effect('boss-hit', ally.x, ally.row, boss.color, 0.55);
      }
    }
    return { targets, preventedDrain };
  }

  _bossSummon(boss, type, count) {
    const existing = this.enemies.filter(foe => foe.hp > 0 && foe.summonOwner === boss.id && foe.side === 'enemy').length;
    const startRow = Math.floor(this.random() * this.rows);
    const summoned = Math.max(0, Math.min(count, 12 - existing));
    for (let index = 0; index < summoned; index++) {
      const row = (startRow + index) % this.rows;
      this.spawnEnemy(type, row, type === 'enemy_lotus' ? this.cols - 1.1 : this.cols - 0.3 + index * 0.08, { summonOwner: boss.id });
      this._effect('summon', 8, row, boss.color, 0.7);
    }
    return summoned;
  }

  _resolveBossCast(boss) {
    const state = boss.bossState;
    const key = state.castKey;
    const skillName = state.skillName;
    state.cycles++;
    boss.attackAnim = 0.9;
    if (key === 'cataclysm') this._bossDamage(boss, state.phase === 1 ? 95 : 135, state.warningRows);
    if (key === 'lotus') {
      this._bossSummon(boss, 'enemy_lotus', state.phase === 3 ? 3 : 2);
      if (state.phase >= 2) {
        for (const ally of this.units.filter(ally => ally.hp > 0 && !ally.isPet && state.warningRows.includes(ally.row))) {
          ally.maxHp = (ally.baseMaxHp || ally.maxHp) * 0.7;
          ally.hp = Math.min(ally.hp, ally.maxHp); ally.suppressionTimer = 8;
          this._effect('drain', ally.x, ally.row, '#bb89d1', 1, '生命压制');
        }
      }
      if (state.phase === 3) this._bossDamage(boss, 80, state.warningRows);
    }
    if (key === 'judgment') this._bossDamage(boss, state.phase === 3 ? 25 : 90, state.warningRows, null, state.phase === 3 ? 7 : 1);
    if (key === 'retainers') {
      this._bossSummon(boss, 'enemy_retainer', 4);
      if (state.phase < 2) { state.phase = 2; state.phaseName = '论证'; this._event('boss-phase', '四名眷属加入论证：记录战场退场次数，十次后求解第一因', { bossId: boss.id }); }
    }
    if (key === 'firstCause') {
      const allies = [...this.units, ...this.enemies.filter(foe => foe.side === 'ally')].filter(ally => ally.hp > 0);
      if (allies.length) this._bossDamage(boss, 1100 / allies.length);
      state.phase = 3; state.phaseName = '演化'; state.deaths = 0; state.formSummons = 0;
      this._event('boss-phase', `第一因冲击由 ${allies.length} 位伙伴分摊，来古士进入演化`, { bossId: boss.id });
    }
    if (key === 'evolution') {
      this._bossDamage(boss, 105, state.warningRows);
      state.formSummons = (state.formSummons || 0) + this._bossSummon(boss, 'enemy_retainer', 2);
      if (state.formSummons >= 4) { state.phase = 2; state.phaseName = '论证'; state.deaths = 0; this._event('boss-phase', '四名新眷属使演化转入下一轮论证', { bossId: boss.id }); }
    }
    if (key === 'guests') {
      this._bossSummon(boss, 'enemy_comedian', 2);
      state.phase = 2; state.phaseName = '住';
    }
    if (key === 'mark') {
      state.markedCells = state.warningCells.map(cell => ({ ...cell }));
      for (const cell of state.markedCells) this._effect('mark', cell.col, cell.row, '#e785bb', 1, '爆梗');
      state.phase = 3; state.phaseName = '坏';
      this._event('boss-mark', '四格爆梗标记已埋下。净化清除标记；屏障阻止噬命。', { bossId: boss.id, cells: state.markedCells });
    }
    if (key === 'detonate') {
      const { targets, preventedDrain } = this._bossDamage(boss, 180, null, state.markedCells);
      if (!preventedDrain && targets.length && boss.hp > 0) { boss.hp = Math.min(boss.maxHp, boss.hp + targets.length * 70); this._effect('heal', boss.x, boss.row, '#df96e8', 0.8, '噬命'); }
      state.markedCells = []; state.phase = 1; state.phaseName = '成';
    }
    this._event('boss-skill', `${boss.name}释放了「${skillName}」`, { bossId: boss.id, skill: key });
    state.castKey = null; state.castRemaining = 0; state.castDuration = 0; state.skillName = '';
    state.warningRows = state.markedCells.map(cell => cell.row); state.warningCells = state.markedCells.map(cell => ({ ...cell }));
    state.skillTimer = boss.type === 'boss_guiji' ? 2 : boss.type === 'boss_lycurgus' ? 4 : 5;
  }

  _bossTick(boss, dt) {
    const state = boss.bossState;
    state.age += dt;
    state.barrierRemaining = this.teamBarrier;
    boss.vulnerableTimer = Math.max(0, boss.vulnerableTimer - dt);
    // An unopposed stationary boss must eventually end the battle rather than stall it forever.
    if (state.age > 90) {
      state.breachTimer -= dt;
      if (state.breachTimer <= EPSILON) { state.breachTimer += 15; this.lives = Math.max(0, this.lives - 1); this._event('breach', `${boss.name}持续侵蚀核心，防线耐久 -1`, { lives: this.lives, enemyId: boss.id }); }
    }
    if (state.castRemaining > 0) {
      state.castRemaining = Math.max(0, state.castRemaining - dt);
      if (state.castRemaining <= EPSILON) this._resolveBossCast(boss);
      return;
    }
    const ratio = boss.hp / boss.maxHp;
    if (['boss_phantylia', 'boss_dominicus'].includes(boss.type)) {
      const phase = ratio < 0.34 ? 3 : ratio < 0.68 ? 2 : 1;
      if (phase > state.phase) {
        state.phase = phase;
        state.phaseName = boss.type === 'boss_phantylia' ? ['丰饶玄莲', '破灭玄莲', '丰饶与毁灭'][phase - 1] : ['同谐屏障', '众音协律', '七日审判'][phase - 1];
        if (boss.type === 'boss_dominicus') { state.shield = phase === 3 ? 950 : 650; state.maxShield = state.shield; }
        state.skillTimer = 0;
        this._event('boss-phase', `${boss.name}进入「${state.phaseName}」`, { bossId: boss.id, phase });
      }
    }
    if (boss.type === 'boss_lycurgus') {
      const mimiCount = this.units.filter(ally => ally.type === 'mimi' && ally.hp > 0).length;
      if (state.phase !== 2 && mimiCount > (state.lastMimiCount || 0)) { state.phase = 2; state.phaseName = '论证'; state.deaths = 0; this._event('boss-phase', '忆灵出现在战场，来古士开始论证', { bossId: boss.id }); }
      state.lastMimiCount = mimiCount;
      if (state.phase === 2 && state.deaths >= 10) { this._bossCast(boss, 'firstCause', '求解第一因之果', 4, Array.from({ length: this.rows }, (_, row) => row)); return; }
    }
    state.skillTimer -= dt;
    if (state.skillTimer > EPSILON) return;
    const row = Math.floor(this.random() * this.rows);
    const allRows = Array.from({ length: this.rows }, (_, index) => index);
    if (boss.type === 'boss_doomsday') this._bossCast(boss, 'cataclysm', state.phase === 1 ? '末日蓄能·部位轰击' : '末日临空·核心轰击', 3, [row, (row + 1) % this.rows]);
    if (boss.type === 'boss_phantylia') this._bossCast(boss, 'lotus', state.phase === 1 ? '丰饶玄莲·汲取' : state.phase === 2 ? '破灭玄莲·压制' : '丰饶与毁灭', 3, state.phase === 3 ? allRows : [row, (row + 1) % this.rows]);
    if (boss.type === 'boss_dominicus') this._bossCast(boss, 'judgment', state.phase === 3 ? '七日审判·七重齐响' : '齐响轰击', state.phase === 3 ? 7 : 3, state.phase === 3 ? allRows : [row, (row + 2) % this.rows]);
    if (boss.type === 'boss_lycurgus') this._bossCast(boss, state.phase === 3 ? 'evolution' : 'retainers', state.phase === 3 ? '演化冲击' : '眷属召集', 3, state.phase === 3 ? [row, (row + 1) % this.rows] : []);
    if (boss.type === 'boss_guiji') {
      if (state.phase === 1) this._bossCast(boss, 'guests', '成·热场嘉宾', 2);
      else if (state.phase === 2) {
        const occupied = this.units.filter(ally => ally.hp > 0 && !ally.isPet).map(ally => ({ row: ally.row, col: ally.col }));
        const cells = [];
        while (cells.length < 4 && occupied.length) cells.push(occupied.splice(Math.floor(this.random() * occupied.length), 1)[0]);
        while (cells.length < 4) { const cell = { row: Math.floor(this.random() * this.rows), col: Math.floor(this.random() * this.cols) }; if (!cells.some(other => cell.row === other.row && cell.col === other.col)) cells.push(cell); }
        this._bossCast(boss, 'mark', '住·埋梗时刻', 2, cells.map(cell => cell.row), cells);
      } else this._bossCast(boss, 'detonate', '坏·爆梗狂欢', 3, state.markedCells.map(cell => cell.row), state.markedCells);
    }
  }

  _monsterCast(foe, key, name, duration) {
    foe.behaviorState = { key, skillName: name, castRemaining: duration, castDuration: duration };
    Object.assign(this._effect('warning', foe.x, foe.row, '#ff958a', duration, name), { radius: ENEMIES[foe.type].explosionRadius || 1, enemyId: foe.id });
    this._event('monster-cast', `${foe.name}准备${name}（${duration} 秒）`, { enemyId: foe.id, behavior: key, duration });
  }

  _monsterAbilityTick(foe, dt) {
    const definition = ENEMIES[foe.type];
    const behavior = definition.behavior;
    if (!behavior || ['melee', 'ranged'].includes(behavior)) return false;
    const friends = foe.side === 'enemy' ? this.enemies.filter(other => other.side === 'enemy' && other.hp > 0) : [...this.units, ...this.enemies.filter(other => other.side === 'ally')].filter(other => other.hp > 0);
    const opponents = foe.side === 'enemy' ? [...this.units, ...this.enemies.filter(other => other.side === 'ally')].filter(other => other.hp > 0) : this.enemies.filter(other => other.side === 'enemy' && other.hp > 0);
    const ahead = opponents.filter(other => Math.abs(other.row - foe.row) < 0.4 && (foe.side === 'enemy' ? other.x <= foe.x + 0.3 : other.x >= foe.x - 0.3)).sort((a, b) => distance(foe, a) - distance(foe, b));
    foe.abilityTimer -= dt;
    foe.chargeRemaining = Math.max(0, foe.chargeRemaining - dt);
    const cast = foe.behaviorState;
    if (cast.castRemaining > 0) {
      cast.castRemaining = Math.max(0, cast.castRemaining - dt);
      if (cast.castRemaining <= EPSILON) {
        if (cast.key === 'explode') {
          for (const target of opponents) if (foe.hp > 0 && distance(foe, target) <= (definition.explosionRadius || 1.5)) this._damage(target, definition.explosionDamage || 110, foe, foe.side === 'enemy');
          this._effect('blast', foe.x, foe.row, '#ffc290', 0.8);
          if (foe.hp > 0) this._damage(foe, foe.maxHp * 10 + (foe.shield || 0), foe);
        }
        if (cast.key === 'charge') foe.chargeRemaining = 3;
        if (cast.key === 'leap') {
          const wall = ahead[0];
          const stopped = wall && ((wall.shield || 0) > 0 || ['gepard', 'aventurine', 'preservation', 'permansor'].includes(wall.type));
          if (!stopped) { foe.x += (foe.side === 'enemy' ? -1 : 1) * (definition.leapDistance || 2.3); foe.x = Math.max(-0.5, Math.min(this.cols + 1, foe.x)); this._effect('leap', foe.x, foe.row, foe.color, 0.7, '跃过'); }
          else { this._effect('shield', wall.x, wall.row, '#8cc9ef', 0.7, '拦截飞跃'); this._event('leap-blocked', `${wall.name}拦住了${foe.name}的飞跃`, { enemyId: foe.id, unitId: wall.id }); }
          foe.leapRemaining = 0;
        }
        this._event('monster-skill', `${foe.name}施放${cast.skillName}`, { enemyId: foe.id, behavior: cast.key });
        cast.key = null; cast.skillName = ''; cast.castDuration = 0;
      }
      return true;
    }
    if (behavior === 'explode' && ahead[0] && distance(foe, ahead[0]) <= 1.2) { this._monsterCast(foe, 'explode', '自爆', definition.explosionDelay || 1.5); return true; }
    if (foe.abilityTimer > EPSILON) return false;
    if (behavior === 'charge' && ahead[0] && distance(foe, ahead[0]) <= 3.5) { foe.abilityTimer = definition.skillInterval || 9; this._monsterCast(foe, 'charge', '冲锋', 0.8); return true; }
    if (behavior === 'leap' && ahead[0] && distance(foe, ahead[0]) <= 1.5) { foe.abilityTimer = definition.skillInterval || 10; this._monsterCast(foe, 'leap', '飞跃', 0.8); return true; }
    if (behavior === 'shield') {
      for (const friend of friends) if (distance(friend, foe) <= (definition.radius || 1.8)) { const current = friend.shield || 0; friend.shield = Math.max(current, Math.min((definition.shield || 90) * 2, current + (definition.shield || 90))); this._effect('shield', friend.x, friend.row, '#8cc9ef', 0.8); }
    }
    if (behavior === 'regenerate') { const healed = Math.min(definition.heal || 55, foe.maxHp - foe.hp); foe.hp += healed; if (healed > 0) this._effect('heal', foe.x, foe.row, '#9adebe', 0.7, `+${Math.round(healed)}`); }
    if (behavior === 'heal') {
      for (const friend of friends) if (distance(friend, foe) <= (definition.radius || definition.healRadius || 1.8)) {
        const healed = Math.min(definition.heal || 60, friend.maxHp - friend.hp); friend.hp += healed;
        if (healed > 0) this._effect('heal', friend.x, friend.row, '#9adebe', 0.7, `+${Math.round(healed)}`);
      }
    }
    if (behavior === 'summon' && definition.summonId && ENEMIES[definition.summonId]?.behavior !== 'summon') {
      const owned = this.enemies.filter(other => other.hp > 0 && other.summonOwner === foe.id).length;
      if (owned < (definition.summonLimit || 3)) {
        this.spawnEnemy(definition.summonId, Math.round(foe.row), Math.min(this.cols + 0.7, foe.x + 0.3), { side: foe.side, charmed: foe.side === 'ally', summonOwner: foe.id });
        this._effect('summon', foe.x, foe.row, foe.color, 0.8);
        this._event('monster-summon', `${foe.name}召来${ENEMIES[definition.summonId].name}`, { enemyId: foe.id, summonedType: definition.summonId });
      }
    }
    foe.abilityTimer = definition.skillInterval || 7;
    return false;
  }

  _enemyTick(foe, dt) {
    if (foe.isBoss) { this._bossTick(foe, dt); return; }
    if (foe.type === 'enemy_lotus' && foe.side === 'enemy') {
      foe.attackTimer -= dt;
      if (foe.attackTimer <= EPSILON) { const drained = Math.min(this.jade, 20); this.jade -= drained; foe.attackTimer = 5; foe.attackAnim = 0.5; this._effect('drain', foe.x, foe.row, '#bf86d1', 0.8, `-${drained}`); }
      return;
    }
    const definition = ENEMIES[foe.type];
    foe.attackTimer -= dt;
    foe.slowTimer = Math.max(0, foe.slowTimer - dt);
    foe.vulnerableTimer = Math.max(0, foe.vulnerableTimer - dt);
    if (this._monsterAbilityTick(foe, dt)) return;
    const step = foe.speed * dt * (foe.slowTimer > 0 ? foe.slowFactor : 1) * (foe.chargeRemaining > 0 ? definition.chargeMultiplier || 1.8 : 1);
    let target;
    if (foe.side === 'ally') {
      target = this.enemies.filter(other => other.side === 'enemy' && other.hp > 0 && (other.isBoss || Math.abs(other.row - foe.row) < 0.4) && other.x >= foe.x - 0.4).sort((a, b) => a.x - b.x)[0];
      if (definition.behavior === 'ranged' && target && target.x - foe.x <= (definition.range || 3)) {
        if (foe.attackTimer <= EPSILON) { this.projectiles.push({ id: this._nextId('friendly-shot'), x: foe.x + 0.25, row: foe.row, fromId: foe.id, type: foe.type, targetId: target.id, side: 'ally', color: foe.color, damage: foe.damage, speed: 4.5, ttl: 3, pierce: 1, hitIds: [] }); foe.attackTimer = definition.interval; foe.attackAnim = 0.5; }
      } else if (target && target.x - foe.x <= 0.68) {
        if (foe.attackTimer <= EPSILON) { this._damage(target, foe.damage, foe); foe.attackTimer = definition.interval; foe.attackAnim = 0.5; }
      } else foe.x += step * 1.5;
      if (foe.x > this.cols + 1.4) foe.hp = 0;
      return;
    }
    const taunter = this.units.filter(unit => unit.hp > 0 && unit.type === 'preservation' && Math.abs(unit.row - foe.row) <= 1.05 && Math.abs(unit.x - foe.x) <= 1.5).sort((a, b) => distance(a, foe) - distance(b, foe))[0];
    foe.tauntTarget = taunter?.id || null;
    if (definition.behavior === 'ranged' && !taunter) {
      const rangedTarget = [...this.units, ...this.enemies.filter(other => other.side === 'ally')].filter(ally => ally.hp > 0 && Math.abs(ally.row - foe.row) < 0.4 && foe.x - ally.x >= -0.2 && foe.x - ally.x <= (definition.range || 3)).sort((a, b) => b.x - a.x)[0];
      if (rangedTarget) {
        if (foe.attackTimer <= EPSILON) {
          this.projectiles.push({ id: this._nextId('enemy-shot'), x: foe.x - 0.25, row: foe.row, fromId: foe.id, type: foe.type, targetId: rangedTarget.id, side: 'enemy', color: foe.color, damage: foe.damage, speed: -4.5, ttl: 3, pierce: 1, hitIds: [] });
          foe.attackTimer = definition.rangedInterval || definition.interval; foe.attackAnim = 0.5;
          this._event('monster-shot', `${foe.name}发射远程攻击`, { enemyId: foe.id, targetId: rangedTarget.id });
        }
        return;
      }
    }
    if (taunter) {
      target = taunter;
      const rowDifference = target.row - foe.row;
      foe.row += Math.sign(rowDifference) * Math.min(Math.abs(rowDifference), dt * 0.9);
      if (Math.abs(target.x - foe.x) > 0.6) foe.x += Math.sign(target.x - foe.x) * step;
    } else {
      const blockers = [...this.units, ...this.enemies.filter(other => other.side === 'ally')].filter(unit => unit.hp > 0 && Math.abs(unit.row - foe.row) < 0.4 && unit.x <= foe.x + 0.42 && foe.x - unit.x <= 0.68);
      target = blockers.sort((a, b) => b.x - a.x)[0];
      if (!target) {
        // Return smoothly to the original lane when a taunting defender falls.
        const rowDifference = foe.homeRow - foe.row;
        foe.row += Math.sign(rowDifference) * Math.min(Math.abs(rowDifference), dt * 0.6);
        foe.x -= step;
      }
    }
    if (target && Math.abs(foe.row - target.row) < 0.4 && Math.abs(foe.x - target.x) <= 0.72 && foe.attackTimer <= EPSILON) {
      this._damage(target, foe.damage, foe, true); foe.attackTimer = definition.interval; foe.attackAnim = 0.45;
    }
  }

  _pompomTick(dt) {
    for (const pam of this.pompoms) {
      if (pam.state === 'ready' && this.enemies.some(foe => foe.hp > 0 && foe.side === 'enemy' && !foe.isBoss && Math.round(foe.row) === pam.row && foe.x <= -0.45)) {
        pam.state = 'running';
        this._event('pompom-launch', `第 ${pam.row + 1} 路帕姆出发！本路紧急清场机会已使用`, { row: pam.row, pompomId: pam.id });
        this._effect('surprise', pam.x, pam.row, '#f4c977', 0.85, '帕姆出发！');
      }
      if (pam.state !== 'running') continue;
      const previousX = pam.x;
      pam.x += 7 * dt;
      // Sweep the entire segment so a fast-moving conductor cannot skip enemies.
      for (const foe of this.enemies) {
        if (foe.hp <= 0 || foe.side !== 'enemy' || pam.hitIds.includes(foe.id)) continue;
        if (!foe.isBoss && Math.round(foe.row) !== pam.row) continue;
        if (foe.x < previousX - 0.48 || foe.x > pam.x + 0.48) continue;
        pam.hitIds.push(foe.id);
        if (foe.isBoss) {
          this._damage(foe, 1800, pam);
          this._effect('hit', foe.x, pam.row, '#f4c977', 0.5, '帕姆冲撞');
        } else {
          const armor = ENEMIES[foe.type].armor || 0;
          this._damage(foe, (foe.hp + (foe.shield || 0) + 1) / Math.max(0.01, 1 - armor), pam);
        }
      }
      if (pam.x > this.cols + 0.9) {
        pam.state = 'spent';
        this._event('pompom-return', `第 ${pam.row + 1} 路帕姆已离场，本关不再补充`, { row: pam.row });
      }
    }
    // Resolve loss only after the emergency sweep had a chance to intercept.
    for (const foe of this.enemies) {
      if (foe.hp <= 0 || foe.side !== 'enemy' || foe.isBoss || foe.x >= -0.85) continue;
      foe.hp = 0; foe.escaped = true;
      this.lives = Math.max(0, this.lives - (ENEMIES[foe.type].breachDamage || 1));
      this._event('breach', `${foe.name}突破了防线！`, { lives: this.lives, enemyId: foe.id });
      this._effect('breach', -0.5, foe.row, '#f17f8d', 1);
    }
  }

  _projectileTick(projectile, dt) {
    const previousX = projectile.x;
    projectile.x += projectile.speed * dt;
    projectile.ttl -= dt;
    if (projectile.side === 'enemy') {
      const targets = [...this.units, ...this.enemies.filter(foe => foe.side === 'ally')].filter(ally => ally.hp > 0 && Math.abs(ally.row - projectile.row) < 0.4 && ally.x <= previousX + 0.22 && ally.x >= projectile.x - 0.22).sort((a, b) => b.x - a.x);
      if (targets[0]) { this._damage(targets[0], projectile.damage, this.enemies.find(foe => foe.id === projectile.fromId) || projectile, true); this._effect('hit', targets[0].x, targets[0].row, projectile.color, 0.3); projectile.ttl = 0; }
      if (projectile.x < -1) projectile.ttl = 0;
      return;
    }
    const hits = this.enemies.filter(foe => foe.hp > 0 && foe.side === 'enemy' && (foe.isBoss || Math.abs(foe.row - projectile.row) < 0.4) && foe.x >= previousX - 0.22 && foe.x <= projectile.x + 0.22 && !projectile.hitIds.includes(foe.id)).sort((a, b) => a.x - b.x);
    for (const target of hits) {
      if (projectile.pierce <= 0) break;
      projectile.hitIds.push(target.id); projectile.pierce--;
      this._damage(target, projectile.damage, projectile);
      if (!projectile.attackCredited) { projectile.attackCredited = true; this._recordAttack(this.units.find(unit => unit.id === projectile.fromId), projectile.shapeVersion); }
      if (projectile.slow) { target.slowTimer = 2; target.slowFactor = projectile.slow; }
      if (projectile.vulnerable) target.vulnerableTimer = 5;
      if (projectile.splash) {
        for (const nearby of this.enemies) if (nearby.id !== target.id && nearby.side === 'enemy' && nearby.hp > 0 && distance(nearby, target) <= projectile.splash) this._damage(nearby, projectile.damage * 0.65, projectile);
        this._effect('blast', target.x, target.row, projectile.color, 0.65);
      } else this._effect('hit', target.x, target.row, projectile.color, 0.23);
    }
    if (projectile.pierce <= 0 || projectile.x > this.cols + 1.5) projectile.ttl = 0;
  }

  update(dt) {
    if (this.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    // Substeps avoid missed collisions. A stalled browser cannot fast-forward hours.
    let remaining = Math.min(dt, 30);
    while (remaining > EPSILON && this.status === 'playing') {
      const step = Math.min(0.05, remaining);
      this._tick(step); remaining -= step;
    }
  }

  _tick(dt) {
    this.time += dt;
    this.teamBarrier = Math.max(0, this.teamBarrier - dt);
    for (const key of Object.keys(this.cooldowns)) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    for (const entity of [...this.units, ...this.enemies]) {
      entity.attackAnim = Math.max(0, entity.attackAnim - dt); entity.hitAnim = Math.max(0, entity.hitAnim - dt);
      if (entity.silenceTimer > 0) entity.silenceTimer = Math.max(0, entity.silenceTimer - dt);
      if (entity.suppressionTimer > 0) { entity.suppressionTimer = Math.max(0, entity.suppressionTimer - dt); if (entity.suppressionTimer <= EPSILON) entity.maxHp = entity.baseMaxHp || entity.maxHp; }
    }
    this._skyTimer -= dt;
    if (this._skyTimer <= EPSILON) { this._gem(0.25 + this.random() * (this.cols - 1.5), Math.floor(this.random() * this.rows)); this._skyTimer += ECONOMY.skyInterval; }
    if (this.map.id === 'amphoreus') {
      this._mapTimer -= dt;
      if (this._mapTimer <= EPSILON) { this._gem((this.cols - 1) / 2, 0, 25, 'holyflame'); this._mapTimer += ECONOMY.holyflameInterval; }
    }
    if (this.wave < this.totalWaves && this.time + EPSILON >= this._nextWaveTime) this._startWave();
    while (this._spawnQueue.length && this._spawnQueue[0].at <= this.time + EPSILON) {
      const spawn = this._spawnQueue.shift();
      this.spawnEnemy(spawn.type, spawn.row, this.cols + 0.25 + this.random() * 0.35, { scale: spawn.scale ?? this.stage.difficulty ?? 1, isMiniBoss: Boolean(spawn.isMiniBoss) });
    }
    for (const unit of [...this.units]) if (unit.hp > 0) this._unitTick(unit, dt);
    for (const foe of [...this.enemies]) if (foe.hp > 0) this._enemyTick(foe, dt);
    this._pompomTick(dt);
    for (const projectile of this.projectiles) this._projectileTick(projectile, dt);
    for (const gem of [...this.gems]) { gem.age += dt; gem.ttl -= dt; if (gem.age >= 8 - EPSILON) this.collectGem(gem.id); }
    for (const effect of this.effects) effect.ttl -= dt;
    this.units = this.units.filter(unit => unit.hp > 0);
    this.enemies = this.enemies.filter(foe => foe.hp > 0);
    this.projectiles = this.projectiles.filter(projectile => projectile.ttl > 0);
    this.effects = this.effects.filter(effect => effect.ttl > 0);
    this.gems = this.gems.filter(gem => gem.ttl > 0);
    this._syncLinks();
    if (this.lives <= 0) { this.status = 'defeat'; this._event('defeat', '防线失守。重新集结，继续开拓！'); }
    else if (this.wave > 0 && !this._spawnQueue.length && !this.enemies.some(foe => foe.side === 'enemy')) {
      if (this.wave === this.totalWaves) {
        if (!this.pompoms.some(pam => pam.state === 'running')) { this.status = 'victory'; this._event('victory', `${this.stage.title}通关！`, { stageId: this.stage.id, mapId: this.map.id, stageNumber: this.stage.number }); }
      }
      else if (!this._waveResting) { this._waveResting = true; this._nextWaveTime = this.time + 10; this._event('wave-clear', '本波已清空，10 秒后下一波来袭', { wave: this.wave, nextWaveIn: 10 }); }
    }
  }

  snapshot() {
    return {
      map: this.map.id, mode: this.mode, time: Math.round(this.time * 100) / 100,
      stageId: this.stage.id, stageNumber: this.stage.number, stageTitle: this.stage.title, stageModifier: this.stage.modifier,
      status: this.status, jade: this.jade, wave: this.wave, totalWaves: this.totalWaves,
      lives: this.lives, kills: this.kills, units: this.units.length,
      pompoms: this.pompoms.map(({ row, x, state }) => ({ row, x, state })),
      enemies: this.enemies.filter(foe => foe.side === 'enemy').length,
      charmed: this.enemies.filter(foe => foe.side === 'ally').length,
      nextWaveIn: this.wave < this.totalWaves && Number.isFinite(this._nextWaveTime) ? Math.max(0, Math.ceil(this._nextWaveTime - this.time)) : 0,
      waveResting: this._waveResting,
      cooldowns: { ...this.cooldowns }, seed: this.seed,
      boss: this.getBossState(),
      links: this.getLinkStates(),
    };
  }
}
