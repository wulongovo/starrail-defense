import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProgress,completeStage,resumeStage} from '../src/campaign-progress.js';
import {getStage} from '../src/campaign.js';

test('old save migration preserves wins, ignores stale stage IDs and deduplicates clears',()=>{
  assert.equal(normalizeProgress({wins:3,herta:true}).wins,3);
  assert.deepEqual(normalizeProgress({clearedStages:['herta-01','herta-01','invalid',null]}).clearedStages,['herta-01']);
  assert.equal(normalizeProgress(null).wins,0);
});
test('victory records a unique clear, best results and next stage while defeat records nothing',()=>{
  const initial=normalizeProgress({}),stage=getStage('herta-01');
  assert.equal(completeStage(initial,stage,{status:'defeat'}),initial);
  const once=completeStage(initial,stage,{status:'victory',lives:3,time:50});
  const twice=completeStage(once,stage,{status:'victory',lives:5,time:55});
  assert.deepEqual(twice.clearedStages,['herta-01']);
  assert.equal(twice.stageRecords[stage.id].bestLives,5);
  assert.equal(twice.stageRecords[stage.id].bestTime,50);
  assert.equal(twice.wins,2);assert.equal(once.wins,1);
  assert.equal(resumeStage(twice,'herta').id,'herta-02');
  assert.equal(resumeStage(twice,'penacony').id,'penacony-01');
});
