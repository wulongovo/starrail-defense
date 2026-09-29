import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { DECK, CHARACTERS, ENEMIES } from '../src/data.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function filesAt(folder) { try { return await readdir(folder, { withFileTypes: true }); } catch { return []; } }
const portraits = {};
const imageDir = join(root, 'public/assets/characters');
// Prefer the compact, decoded WebP copy when the original PNG is also retained.
const imageFiles = (await filesAt(imageDir)).sort((a,b)=>Number(a.name.endsWith('.webp'))-Number(b.name.endsWith('.webp'))||a.name.localeCompare(b.name));
for (const file of imageFiles) {
  const extension = extname(file.name).toLowerCase();
  if (!file.isFile() || !['.png','.jpg','.jpeg','.webp'].includes(extension)) continue;
  const type = file.name.slice(0, -extension.length);
  const mime = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : `image/${extension.slice(1)}`;
  portraits[type] = `data:${mime};base64,${(await readFile(join(imageDir, file.name))).toString('base64')}`;
}
const imports = [], models = [];
let originalModelBytes = 0, compressedModelBytes = 0;
const modelDir = join(root, 'public/assets/models');
for (const folder of await filesAt(modelDir)) {
  if (!folder.isDirectory()) continue;
  const candidates = (await filesAt(join(modelDir, folder.name))).filter(f => f.isFile() && (f.name === 'bundle.json' || f.name.endsWith('.bundle.json')));
  if (!candidates.length) continue;
  const variable = `model${models.length}`;
  const bytes = await readFile(join(modelDir, folder.name, candidates[0].name));
  const bundle = JSON.parse(bytes);
  if (!((bundle.format === 'wulong-pmx-bundle-v1' && bundle.pmx) || (bundle.format === 'wulong-glb-bundle-v1' && bundle.glb))) throw new Error(`Invalid model bundle: ${folder.name}`);
  const compressed = gzipSync(bytes, { level:9 });
  originalModelBytes += bytes.length; compressedModelBytes += compressed.length;
  imports.push(`const ${variable}=${JSON.stringify({format:'wulong-pmx-gzip-v1',payload:compressed.toString('base64')})};`);
  models.push({ id: folder.name, variable, format: bundle.format.includes('glb')?'glb':'pmx', metadata: bundle.metadata });
}
const aliases = { preservation:'trailblazer',remembrance:'trailblazer',elation:'trailblazer',harmony:'trailblazer',gepardEnemy:'gepard',voidranger:'blade',stormbringer:'sam',boss:'sunday' };
for (const [alias, source] of Object.entries(aliases)) if (!portraits[alias] && portraits[source]) portraits[alias] = portraits[source];
const modelPairs = models.map(m=>`${JSON.stringify(m.id)}:${m.variable}`);
for (const [alias, source] of Object.entries(aliases)) {
  const found=models.find(m=>m.id===source);
  if(found&&!models.some(m=>m.id===alias))modelPairs.push(`${JSON.stringify(alias)}:${found.variable}`);
}
const cardCoverage = DECK.map(id => {
  const model = models.find(m=>m.id===id) || models.find(m=>m.id===aliases[id]);
  return {id,name:CHARACTERS[id].name,representation:model?.format||'illustration',modelId:model?.id||null,source:model?.metadata?.source||null,sha256:model?.metadata?.sha256||null};
});
const coverage = {totalCards:DECK.length,cardsWith3d:cardCoverage.filter(c=>c.representation!=='illustration').length,uniqueCharacterModels:new Set(cardCoverage.map(c=>c.modelId).filter(Boolean)).size,missing:cardCoverage.filter(c=>c.representation==='illustration').map(c=>({id:c.id,name:c.name})),cards:cardCoverage};
const enemyCoverage = Object.values(ENEMIES).map(enemy => {
  const model = models.find(m=>m.id===enemy.id) || models.find(m=>m.id===aliases[enemy.id]);
  return {id:enemy.id,name:enemy.name,category:enemy.isBoss?'boss':enemy.isMonster?'monster':enemy.summon?'summon':'character-projection',representation:model?.format||'illustration',source:model?.metadata?.source||null,sha256:model?.metadata?.sha256||null};
});
const output = `${imports.join('\n')}\nexport const OFFICIAL_PORTRAITS=${JSON.stringify(portraits)};\nexport const OFFICIAL_MODELS={${modelPairs.join(',')}};\nexport const ASSET_COUNTS=${JSON.stringify({portraits:Object.keys(portraits).length,models:models.length,cardsWith3d:coverage.cardsWith3d,totalCards:DECK.length,enemiesWith3d:enemyCoverage.filter(e=>e.representation!=='illustration').length,totalEnemies:enemyCoverage.length,pompom3d:models.some(m=>m.id==='pompom')})};\n`;
await mkdir(join(root,'src'),{recursive:true});
await writeFile(join(root,'src/generated-assets.js'),output);
await writeFile(join(root,'docs/model-coverage.json'),JSON.stringify(coverage,null,2));
await writeFile(join(root,'docs/enemy-model-coverage.json'),JSON.stringify({enemies:enemyCoverage,pompom:models.find(m=>m.id==='pompom')?.metadata||null,missing:enemyCoverage.filter(e=>e.representation==='illustration').map(e=>({id:e.id,name:e.name}))},null,2));
await writeFile(join(root,'docs/model-material-repairs.json'),JSON.stringify(models.filter(m=>Object.values(m.metadata.textures||{}).some(t=>t.referenceRepair)||m.metadata.omittedTransparentMaterials?.length).map(m=>({id:m.id,source:m.metadata.source,sha256:m.metadata.sha256,textures:Object.fromEntries(Object.entries(m.metadata.textures||{}).filter(([,t])=>t.referenceRepair)),omittedTransparentMaterials:m.metadata.omittedTransparentMaterials||[]})),null,2));
console.log(`Embedded official assets: ${models.length} models, ${Object.keys(portraits).length} portrait variants.`);
console.log(`Models compressed ${(originalModelBytes/1048576).toFixed(1)} → ${(compressedModelBytes/1048576).toFixed(1)} MB; decoded on first use.`);
console.log(`Playable 3D coverage: ${coverage.cardsWith3d}/${coverage.totalCards}.`);
