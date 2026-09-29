// wulong: verify and encode locally downloaded original game art without redrawing it.
// Downloads are performed explicitly with PowerShell Invoke-WebRequest in this environment.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROSTER_GAME_IDS } from '../src/generated-roster.js';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(root, 'public/assets/characters');
const ids = ROSTER_GAME_IDS;
const records = [];
for (const [id, gameId] of Object.entries(ids)) {
  const original = join(directory, `${id}.png`);
  try {
    const input = await readFile(original);
    const metadata = await sharp(input).metadata();
    if (metadata.width < 128 || metadata.height < 128) throw new Error('Invalid image dimensions');
    const optimized = await sharp(input).resize({ width:768, height:768, fit:'inside', withoutEnlargement:true }).webp({ quality:85, alphaQuality:100, effort:5 }).toBuffer();
    await writeFile(join(directory, `${id}.webp`), optimized);
    records.push({ id, gameId, sourceKind:'original-game-art-community-mirror', publisher:'HoYoverse', hosting:'Mar-7th/StarRailRes via jsDelivr', sourceRepository:'https://github.com/Mar-7th/StarRailRes', sourceIndex:'https://github.com/Mar-7th/StarRailRes/blob/master/index_new/en/characters.json', imageUrl:`https://cdn.jsdelivr.net/gh/Mar-7th/StarRailRes@master/image/character_portrait/${gameId}.png`, originalPath:`public/assets/characters/${id}.png`, displayPath:`public/assets/characters/${id}.webp`, dimensions:[metadata.width,metadata.height], alpha:metadata.hasAlpha, originalBytes:input.length, displayBytes:optimized.length, sha256:createHash('sha256').update(input).digest('hex'), processing:'Resize to maximum 768 pixels; WebP quality 85; original PNG retained; no generated or redrawn content' });
    console.log(`${id}: ${metadata.width}×${metadata.height} → ${(optimized.length/1024).toFixed(0)} KiB`);
  } catch (error) { records.push({id,gameId,status:'missing-or-invalid',error:error.message}); console.error(`${id}: ${error.message}`); }
}
await writeFile(join(root,'docs/official-art-sources.json'), JSON.stringify({ note:'These are original game illustrations distributed by a community resource mirror, not direct downloads from an official HoYoverse CDN. Original artwork rights remain with HoYoverse. Model downloads are separately sourced from official creator events.', generatedAt:new Date().toISOString(), characters:records }, null, 2));
console.log(`Verified ${records.filter(record=>record.sha256).length}/${records.length} original character portraits.`);
const bossRecords = [];
for (const file of await readdir(directory)) {
  if (!/^boss_.*\.png$/.test(file)) continue;
  const input = await readFile(join(directory,file));
  const metadata = await sharp(input).metadata();
  const output = await sharp(input).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).webp({quality:90,alphaQuality:100}).toBuffer();
  await writeFile(join(directory,file.replace(/\.png$/,'.webp')),output);
  bossRecords.push({id:file.replace(/\.png$/,''),width:metadata.width,height:metadata.height,hasAlpha:metadata.hasAlpha,originalSha256:createHash('sha256').update(input).digest('hex'),displayBytes:output.length,representation:'Original game-art raster used as a 2D battlefield projection, not a 3D model'});
}
await writeFile(join(root,'docs/boss-art-verification.json'),JSON.stringify(bossRecords,null,2));
console.log(`Verified ${bossRecords.length} original boss-art projections.`);
