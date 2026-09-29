// Verified repair for one broken reference in the official 3.0 archive; original PMX stays byte-exact.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { convertPMX } from './convert-pmx.mjs';

const root = new URL('../', import.meta.url);
const input = new URL('public/assets/models/hsr_1402/original/星穹铁道—阿格莱雅2.pmx', root);
const output = new URL('public/assets/models/hsr_1402/bundle.json', root);
const reportFile = new URL('docs/model-expansion-modern.json', root);
const { fileURLToPath } = await import('node:url');
const source = 'https://activity.hdslb.com/blackboard/maxfiles/587f0b14d5bd43274c379bb869cc385d/1736826919628.7z';
const reason = '官方3.0原包齿材质164三角的112个唯一UV顶点，均落在原包顏.png的纯白牙齿区域；UV范围u=.427142–.489258,v=.012378–.093233。口与舌材质使用同图并准确对应暗红口腔、粉色舌区域。保留原PMX字节，仅修复缺失贴图引用。';
const repaired = await convertPMX(fileURLToPath(input), fileURLToPath(output), {
  id: 'hsr_1402', source, maxTexture: 256,
  textureOverrides: { 'Avatar_Aglaea_00_Face_Color.png': { path: '顏.png', reason } },
});
const bundle = JSON.parse(await readFile(output, 'utf8'));
const records = JSON.parse(await readFile(reportFile, 'utf8'));
const previous = records.find(record => record.id === 'hsr_1402');
const archive = new URL(previous.archive, root);
const archiveSha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
const record = {
  ...previous, status: 'converted', error: undefined, bundlePath: 'public/assets/models/hsr_1402/bundle.json',
  pmxPath: 'public/assets/models/hsr_1402/original/星穹铁道—阿格莱雅2.pmx',
  pmxSha256: bundle.metadata.sha256, archiveSha256,
  vertices: repaired.vertices, triangles: repaired.triangles, bones: repaired.bones,
  textureCount: repaired.textures, maxTexture: 256, originalComment: bundle.metadata.originalComment,
  referenceRepairs: [{ original: 'Avatar_Aglaea_00_Face_Color.png', source: '顏.png', reason }],
  rules: ['public/assets/models/hsr_1402/original/使用规则.txt'],
};
bundle.metadata.sourcePage = previous.page;
bundle.metadata.sourceArchiveSha256 = archiveSha256;
await writeFile(output, JSON.stringify(bundle), 'utf8');
await writeFile(reportFile, JSON.stringify(records.map(item => item.id === 'hsr_1402' ? record : item), null, 2), 'utf8');
console.log(JSON.stringify(repaired));
