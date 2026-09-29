import { getStage, getStages } from './campaign.js';

export function normalizeProgress(raw) {
  const value=raw && typeof raw==='object' && !Array.isArray(raw)?raw:{};
  const clearedStages=[...new Set((Array.isArray(value.clearedStages)?value.clearedStages:[]).filter(id=>typeof id==='string'&&getStage(id)))];
  return {...value,wins:Number.isFinite(value.wins)?Math.max(0,Math.floor(value.wins)):0,clearedStages,
    stageRecords:value.stageRecords&&typeof value.stageRecords==='object'?value.stageRecords:{},
    lastStages:value.lastStages&&typeof value.lastStages==='object'?value.lastStages:{}};
}

export function completeStage(progress,stage,stats) {
  if(!stage || !getStage(stage.id) || stats.status!=='victory')return progress;
  const next=normalizeProgress(progress),old=next.stageRecords[stage.id];
  next.wins++;
  next.clearedStages=[...new Set([...next.clearedStages,stage.id])];
  next.stageRecords={...next.stageRecords,[stage.id]:{
    clears:(Number(old?.clears)||0)+1,bestLives:Math.max(Number(old?.bestLives)||0,stats.lives),
    bestTime:Math.min(Number(old?.bestTime)||Infinity,Math.round(stats.time*100)/100),
  }};
  next.lastStages={...next.lastStages,[stage.mapId]:stage.nextStageId||stage.id};
  return next;
}

export function resumeStage(progress,mapId) {
  const stages=getStages(mapId),saved=getStage(progress?.lastStages?.[mapId]);
  return saved?.mapId===mapId?saved:stages.find(s=>!progress?.clearedStages?.includes(s.id))||stages[0];
}
