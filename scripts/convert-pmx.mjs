import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve, relative, sep, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parsePMX } from '../src/official-models.js';

const run = promisify(execFile);
const normalizePath = value => value.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

async function fileInventory(root, prefix = '') {
  const items = await readdir(resolve(root, prefix), { withFileTypes: true });
  const result = [];
  for (const item of items) {
    const child = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) result.push(...await fileInventory(root, child)); else if (item.isFile()) result.push(child);
  }
  return result;
}

async function convertTexture(path, maxSize, python) {
  const source = String.raw`import sys, json, base64, io
from PIL import Image
im = Image.open(sys.argv[1])
im.thumbnail((int(sys.argv[2]), int(sys.argv[2])), Image.Resampling.LANCZOS)
has_alpha = 'A' in im.getbands() or 'transparency' in im.info
im = im.convert('RGBA' if has_alpha else 'RGB')
output = io.BytesIO()
im.save(output, format='PNG' if has_alpha else 'JPEG', **({'optimize': True} if has_alpha else {'quality': 90, 'optimize': True}))
mime = 'image/png' if has_alpha else 'image/jpeg'
print(json.dumps({'uri':'data:'+mime+';base64,'+base64.b64encode(output.getvalue()).decode('ascii'),'width':im.width,'height':im.height}))`;
  try {
    const { stdout } = await run(python, ['-c', source, path, String(maxSize)], { maxBuffer: 32 * 1024 * 1024, windowsHide: true });
    return JSON.parse(stdout);
  } catch (error) {
    const format = mime[extname(path).toLowerCase()];
    if (!format) throw new Error(`贴图 ${path} 需要 Python Pillow 转为 PNG。使用 --python 指定已安装 Pillow 的解释器。${error.message}`);
    const image = await readFile(path);
    return { uri: `data:${format};base64,${image.toString('base64')}`, warning: 'Pillow 不可用，保留原始分辨率' };
  }
}

/** Bundle original PMX + referenced diffuse images; no geometry is replaced. */
export async function convertPMX(input, output, { id = basename(input, extname(input)), source = '', maxTexture = 1024, python = process.env.PYTHON || 'python', height = 1.35, textureOverrides = {} } = {}) {
  const pmxPath = resolve(input), directory = dirname(pmxPath);
  const buffer = await readFile(pmxPath), parsed = parsePMX(buffer);
  const inventory = await fileInventory(directory);
  const paths = new Map(inventory.map(path => [normalizePath(path), path]));
  // Some official archives omit textures for disabled expression overlays (alpha 0).
  // Keep their original PMX geometry/materials; this renderer does not enable morphs.
  const used = [...new Set(parsed.materials.filter(material => material.textureIndex >= 0 && material.diffuse[3] > 0).map(material => parsed.textures[material.textureIndex]))];
  const omittedTransparentMaterials = parsed.materials.filter(material=>material.diffuse[3]===0).map(material=>({name:material.name,texture:parsed.textures[material.textureIndex]||null,reason:'Source material starts fully transparent; expression morphs are not enabled'}));
  const textures = {}, textureInfo = {};
  for (const original of used) {
    if (typeof original !== 'string') throw new Error('材质引用了不存在的贴图');
    const normalized = normalizePath(original);
    let match = paths.get(normalized);
    const override = textureOverrides[original];
    if (override) {
      if (match) throw new Error(`已有精确贴图，不应覆盖：${original}`);
      if (typeof override.path !== 'string' || typeof override.reason !== 'string' || !override.reason.trim()) throw new Error(`贴图修复必须记录同角色原包文件和核验依据：${original}`);
      match = paths.get(normalizePath(override.path));
      if (!match) throw new Error(`指定修复贴图不在原模型目录：${override.path}`);
    }
    if (!match) {
      const name = normalized.split('/').pop();
      const candidates = inventory.filter(path => normalizePath(path).split('/').pop() === name);
      if (candidates.length === 1) match = candidates[0];
    }
    if (!match) {
      // A few official packages changed PNG/TGA/BMP storage without updating
      // the PMX reference. Only accept one exact basename, never a similar image.
      const stem = basename(normalized, extname(normalized));
      const candidates = inventory.filter(path => /\.(png|jpe?g|webp|bmp|tga|gif)$/i.test(path) && basename(normalizePath(path), extname(path).toLowerCase()) === stem);
      if (candidates.length === 1) match = candidates[0];
    }
    if (!match) throw new Error(`官方模型缺失引用贴图：${original}，目录：${directory}`);
    const texturePath = resolve(directory, match);
    const relativePath = relative(directory, texturePath);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) throw new Error('模型贴图引用超出了模型目录');
    const image = await convertTexture(texturePath, Math.max(128, Math.min(4096, Number(maxTexture) || 1024)), python);
    textures[original] = image.uri;
    textureInfo[original] = { width: image.width, height: image.height, source: match, ...(override ? { referenceRepair: override.reason } : {}), ...(image.warning ? { warning: image.warning } : {}) };
  }
  const bundle = {
    format: 'wulong-pmx-bundle-v1', height, pmx: buffer.toString('base64'), textures,
    metadata: { id, modelName: parsed.name, source, sourceFile: basename(pmxPath), sha256: createHash('sha256').update(buffer).digest('hex'), vertices: parsed.vertexCount, triangles: parsed.indexCount / 3, bones: parsed.bones.length, materials: parsed.materials.length, textures: textureInfo, omittedTransparentMaterials, originalComment: parsed.comment, limitations: ['PMX SDEF/QDEF 使用线性蒙皮近似', '未启用原版物理和表情动画；使用本作程序骨骼动作与脚步IK', ...(omittedTransparentMaterials.length?['原包初始透明材质保持隐藏，不加载其可选表情贴图']:[])] },
  };
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output), JSON.stringify(bundle), 'utf8');
  return { input: pmxPath, output: resolve(output), modelName: parsed.name, vertices: parsed.vertexCount, triangles: parsed.indexCount / 3, bones: parsed.bones.length, textures: used.length, bytes: Buffer.byteLength(JSON.stringify(bundle)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output, ...flags] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: node scripts/convert-pmx.mjs <model.pmx> <bundle.json> [--id robin] [--source URL] [--max-texture 1024] [--python path] [--height 1.35]');
    process.exitCode = 1;
  } else {
    const options = {};
    const keys = { '--id': 'id', '--source': 'source', '--max-texture': 'maxTexture', '--python': 'python', '--height': 'height' };
    for (let index = 0; index < flags.length; index += 2) {
      if (!keys[flags[index]] || !flags[index + 1]) throw new Error(`Unknown or incomplete option: ${flags[index]}`);
      options[keys[flags[index]]] = ['--height', '--max-texture'].includes(flags[index]) ? Number(flags[index + 1]) : flags[index + 1];
    }
    console.log(JSON.stringify(await convertPMX(input, output, options), null, 2));
  }
}
