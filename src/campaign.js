import { MAPS, ECONOMY, WAVE_COUNT_SCALE } from './data.js';

// wulong · 地名取自游戏，分区关数、波次与战役顺序均为塔防设计。
export const STAGE_TOTALS = Object.freeze({ herta: 23, xianzhou: 29, penacony: 32, amphoreus: 36, planarcadia: 27 });
const area = (id, name, count, tint, decoration) => ({ id, name, count, tint, decoration });
export const CAMPAIGN_AREAS = {
  herta: [area('master', '主控舱段', 2, '#6bd4ef', 'station'), area('base', '基座舱段', 3, '#8ed8c1', 'station'), area('storage', '收容舱段', 4, '#a6a0f0', 'station'), area('supply', '支援舱段', 6, '#e1b37e', 'harbor'), area('seclusion', '禁闭舱段', 8, '#879dcc', 'prison')],
  xianzhou: [area('starskiff', '星槎海中枢', 3, '#9cd5bc', 'harbor'), area('cloudford', '流云渡', 4, '#a4cbbb', 'harbor'), area('stargazer', '迴星港', 5, '#aabacb', 'harbor'), area('divination', '太卜司', 7, '#dd94c7', 'temple'), area('scalegorge', '鳞渊境', 10, '#7cc7cd', 'water')],
  penacony: [area('reverie', '白日梦酒店（现实）', 3, '#dabd91', 'city'), area('golden', '黄金的时刻', 4, '#f1bd74', 'city'), area('dreamedge', '筑梦边境', 6, '#b7a1dd', 'dream'), area('childdream', '稚子的梦', 8, '#87bacc', 'dream'), area('grandtheater', '匹诺康尼大剧院', 11, '#d4b0e8', 'temple')],
  amphoreus: [area('okhema', '永恒圣城·奥赫玛', 4, '#e7c775', 'city'), area('kremnos', '浴血战端·悬锋城', 5, '#cd967a', 'temple'), area('janusopolis', '命运重渊·雅努萨波利斯', 6, '#ada0d3', 'temple'), area('dawnshore', '穹顶关塞·晨昏之眼', 9, '#eca571', 'temple'), area('grove', '呓语密林·神悟树庭', 12, '#a1ca8d', 'arbor')],
  planarcadia: [area('dovebrook', '鸽川区', 5, '#da8dbc', 'city'), area('graphia', '绘世学院', 9, '#86c7dd', 'carnival'), area('worldsend', '「世界尽头」酒馆', 13, '#c19ce3', 'carnival')],
};
export const TRANSFORM_STAGES = Object.freeze({ herta: [7, 13, 19], xianzhou: [8, 17, 23], penacony: [7, 18, 27], amphoreus: [8, 17, 26, 33], planarcadia: [6, 14, 22] });
const POOLS = {
  herta: ['reaver', 'antibaryon', 'baryon', 'distorter', 'trampler'],
  xianzhou: ['maraSoldier', 'goldenHound', 'dragonfish', 'woodLupus', 'distorter'],
  penacony: ['bubbleHound', 'domescreen', 'springDealer', 'antibaryon', 'trampler'],
  amphoreus: ['tideBlade', 'tideBow', 'tideAxe', 'tideCouncil', 'baryon'],
  planarcadia: ['domescreen', 'bubbleHound', 'springDealer', 'tideBow', 'tideCouncil'],
};
const MINI_BOSSES = { herta: ['trampler', 'baryon'], xianzhou: ['woodLupus', 'goldenHound'], penacony: ['springDealer', 'domescreen'], amphoreus: ['tideAxe', 'tideCouncil'], planarcadia: ['springDealer', 'tideCouncil'] };
const MISSION_NAMES = ['初探防线', '侧翼警戒', '稳固补给', '交叉火力', '前沿推进', '守望回响', '会合信号', '漫长一夜'];

function makeCampaign(map) {
  let number = 0;
  const stages = [];
  for (const region of CAMPAIGN_AREAS[map.id]) {
    for (let local = 1; local <= region.count; local++) {
      number++;
      const final = number === STAGE_TOTALS[map.id];
      const mini = !final && number % 5 === 0;
      const transform = TRANSFORM_STAGES[map.id].includes(number);
      const progress = (number - 1) / (STAGE_TOTALS[map.id] - 1);
      const waves = final ? 3 : mini ? 2 : 1 + (number - 1) % 3;
      const waveEnemyCounts = Array.from({ length: waves }, (_, wave) => Math.ceil((3 + Math.floor(progress * 3) + wave) * WAVE_COUNT_SCALE));
      const suffix = final ? '终章决战' : mini ? '精英拦截' : transform ? '奇遇变身' : MISSION_NAMES[(number - 1) % MISSION_NAMES.length];
      stages.push(Object.freeze({
        id: `${map.id}-${String(number).padStart(2, '0')}`, mapId: map.id, number,
        title: `${region.name} · ${suffix}`, name: `${region.name} · ${suffix}`, isFinal: final, isMiniBoss: mini, areaId: `${map.id}_${region.id}`, areaName: region.name,
        areaStage: local, areaStageCount: region.count, theme: region.decoration, tint: region.tint, decoration: region.decoration,
        waves, waveEnemyCounts, enemyCount: waveEnemyCounts.reduce((sum, value) => sum + value, 0),
        modifier: transform ? 'random-transform' : null,
        miniBoss: mini ? MINI_BOSSES[map.id][Math.floor(number / 5 - 1) % MINI_BOSSES[map.id].length] : null,
        boss: final ? map.boss : null,
        initialJade: ECONOMY.startingJade,
        difficulty: Number((1 + progress * 0.32).toFixed(3)),
        enemyPool: POOLS[map.id].slice(0, Math.min(POOLS[map.id].length, 2 + Math.floor(number / 4))),
        spawnInterval: Number((5.8 - progress * 1.3).toFixed(2)), prepTime: final ? 22 : 18,
        nextStageId: final ? null : `${map.id}-${String(number + 1).padStart(2, '0')}`,
      }));
    }
  }
  if (number !== STAGE_TOTALS[map.id]) throw new Error(`Campaign area count mismatch: ${map.id}`);
  return Object.freeze(stages);
}

export const CAMPAIGNS = Object.freeze(Object.fromEntries(MAPS.map(map => [map.id, makeCampaign(map)])));
const ALL_STAGES = Object.values(CAMPAIGNS).flat();
const STAGE_INDEX = new Map(ALL_STAGES.map(stage => [stage.id, stage]));
export function getStage(idOrMapId, stageIdOrNumber = 1) {
  if (CAMPAIGNS[idOrMapId]) {
    return typeof stageIdOrNumber === 'number'
      ? CAMPAIGNS[idOrMapId][stageIdOrNumber - 1] ?? null
      : STAGE_INDEX.get(stageIdOrNumber) ?? null;
  }
  return STAGE_INDEX.get(idOrMapId) ?? null;
}
export function getStages(mapId) { return CAMPAIGNS[mapId] ?? []; }
export const CAMPAIGN_STAGE_COUNT = ALL_STAGES.length;
