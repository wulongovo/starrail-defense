import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await import('./build.mjs');
const { version = '0.4.0' } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const coverage = JSON.parse(await readFile(join(root, 'docs/model-coverage.json'), 'utf8'));
const enemyCoverage = JSON.parse(await readFile(join(root, 'docs/enemy-model-coverage.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)) throw new Error('Invalid release version.');
const release = join(root, 'release');
await mkdir(release, { recursive: true });
const archive = join(release, `星穹防线-${version}-local-preview.zip`);
const staging = await mkdtemp(join(tmpdir(), 'wulong-starrail-package-'));
const readme = `星穹防线 ${version} · 本地离线预览版\r\n\r\n` +
  '1. 将 ZIP 完整解压到一个文件夹。\r\n' +
  '2. 双击“星穹防线.html”，使用桌面版 Edge 或 Chrome 打开。\r\n' +
  '3. 不需要安装 Node.js，不需要登录，不需要联网。使用支持 WebGL 和 DecompressionStream 的近期桌面浏览器。\r\n\r\n' +
  '操作：点击角色卡，再点击空地部署。数字 1–9 选择前九张卡；Esc 或右键取消；空格暂停。\r\n' +
  '点击星琼领取资源；未领取资源会在 8 秒后自动收集。可通过速度按钮加速战斗。\r\n' +
  '主菜单可选择黑塔空间站、仙舟罗浮、匹诺康尼、翁法罗斯、二相乐园，以及随机角色盲盒模式。\r\n' +
  `v${version} 含 92 张角色卡、147 关、16 种普通怪物，全地图 6 行 × 10 列，每关 1–3 波。\r\n` +
  '伙伴库支持搜索和翻页选卡；关卡可自由选择，通关进度保存在当前浏览器。\r\n' +
  '角色卡冷却比基准减少 1 秒；费用为基准的 85%，四舍五入到 5 的倍数。盲盒为 105 星琼。\r\n' +
  '饮月与景元、腾荒与丹恒、忘归人与流萤：两位同时在场，共同命中攻击 5 次后手动点击释放连携。\r\n' +
  '花火每两次命中攻击随机变身，并继续保留两击变身规则；黑塔第 7、13、19 关部署后随机变身。\r\n' +
  '卡芙卡每 5 秒言灵策反同路前方最近一名怪物，包含召唤物；小 Boss 和地区 Boss 免疫。\r\n' +
  '全部关卡开局 200 星琼；天空每 7 秒掉落，知更鸟每 8 秒产出，同谐主角每 10 秒产出。\r\n' +
  '普通怪物生命提高 35%，地区首领提高 20%；每波怪物数量约增加 50%，维持每关 1–3 波和原出怪间隔。\r\n' +
  '每路防线前有一只 3D 帕姆，每关自动出动一次，清扫同路怪物、冲撞首领。\r\n' +
  '五个地区分别有末日兽、幻胧、神主日、来古士、归寂的改编首领战。\r\n\r\n' +
  `这是非官方同人原型，${coverage.cardsWith3d}/${coverage.totalCards} 张角色卡已使用 3D，覆盖 ${coverage.uniqueCharacterModels} 份独立角色 PMX；部分开拓者命途共用同一人物模型。\r\n` +
  `记忆主角和迷迷使用各自真实模型；敌军 3D 覆盖 ${enemyCoverage.enemies.length-enemyCoverage.missing.length}/${enemyCoverage.enemies.length}，帕姆也使用真实模型。\r\n` +
  '模型来自官方活动 CDN 和保存原模型的公开社区镜像，逐项来源及哈希见“模型接入清单.json”。镜像未冒充官方服务器。\r\n' +
  '怪物原 FBX 转为 GLB，保留原几何、UV 和骨骼，贴图缩小用于离线加载；游戏专用材质使用近似渲染。\r\n' +
  '角色朝右、敌军朝左，策反怪物转向右。动作由本作程序驱动；若来源包含动作则优先使用，未声称全部使用原游戏动画。\r\n' +
  '剧情、台词和塔防技能为原创同人改编；不是官方剧情或战斗系统复刻。\r\n' +
  '本归档供本地离线预览。模型原始规约包含“请勿二次配布”“请勿用于商业用途”，因此本包不能当作可自由分享的发行包。\r\n' +
  '将来对外提供游戏前，需取得相应素材授权或替换为允许分发的素材；详见随附“模型来源与使用边界.md”。\r\n' +
  '角色和怪物原图的托管来源、尺寸及哈希见随附“角色与怪物图片来源.json”。\r\n' +
  '《崩坏：星穹铁道》相关角色与世界观归其权利人所有；本项目不代表官方作品。\r\n' +
  '网页文件即完整游戏。Windows 独立 EXE 属于可另行构建的打包方式，本 ZIP 不包含 EXE。\r\n';

function packageWithPython() {
  const python = 'import pathlib,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as z:\n for name in ["星穹防线.html", "README-先读我.txt", "模型来源与使用边界.md", "角色与怪物图片来源.json", "模型接入清单.json"]:\n  z.write(pathlib.Path(sys.argv[2])/name, name)\n';
  let result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', python, archive, staging], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.error?.code === 'ENOENT') result = spawnSync(process.platform === 'win32' ? 'python3' : 'python', ['-c', python, archive, staging], { cwd: root, encoding: 'utf8', windowsHide: true });
  return result;
}

try {
  await copyFile(join(root, 'dist', '星穹防线.html'), join(staging, '星穹防线.html'));
  await copyFile(join(root, 'docs', 'official-model-research.md'), join(staging, '模型来源与使用边界.md'));
  await writeFile(join(staging, 'README-先读我.txt'), '\uFEFF' + readme, 'utf8');
  const imageSources = {};
  for (const source of ['official-art-sources.json', 'monster-image-sources-first8.json', 'monster-art-validation-part2.json', 'boss-art-sources.json', 'phantylia-image-source.json', 'mimi-image-source.json']) {
    imageSources[source] = JSON.parse((await readFile(join(root, 'docs', source), 'utf8')).replace(/^\uFEFF/, ''));
  }
  await writeFile(join(staging, '角色与怪物图片来源.json'), JSON.stringify(imageSources, null, 2), 'utf8');
  const modelSources = { coverage, enemyCoverage };
  for (const source of ['model-expansion-legacy.json', 'model-expansion-modern.json', 'model-material-repairs.json', 'model-expansion-monsters.json', 'model-conversion-monsters.json', 'model-material-evidence-monsters.json', 'model-expansion-bosses-pompom.json']) {
    modelSources[source] = JSON.parse((await readFile(join(root, 'docs', source), 'utf8')).replace(/^\uFEFF/, ''));
  }
  await writeFile(join(staging, '模型接入清单.json'), JSON.stringify(modelSources, null, 2), 'utf8');
  let result;
  if (process.platform === 'win32') {
    const powershell = '$ErrorActionPreference = "Stop"\n' +
      '$Files = @((Join-Path $env:WULONG_PACKAGE_STAGE "星穹防线.html"), (Join-Path $env:WULONG_PACKAGE_STAGE "README-先读我.txt"), (Join-Path $env:WULONG_PACKAGE_STAGE "模型来源与使用边界.md"), (Join-Path $env:WULONG_PACKAGE_STAGE "角色与怪物图片来源.json"), (Join-Path $env:WULONG_PACKAGE_STAGE "模型接入清单.json"))\n' +
      'Compress-Archive -LiteralPath $Files -DestinationPath $env:WULONG_PACKAGE_ZIP -CompressionLevel Optimal -Force\n';
    result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', powershell], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, WULONG_PACKAGE_STAGE: staging, WULONG_PACKAGE_ZIP: archive },
    });
    if (result.error || result.status !== 0) {
      console.warn('PowerShell compression unavailable; using Python standard-library ZIP fallback.');
      result = packageWithPython();
    }
  } else {
    result = packageWithPython();
  }
  if (result.error || result.status !== 0) throw new Error(`ZIP creation failed: ${result.error?.message || result.stderr || result.stdout}`);
  const bytes = (await stat(archive)).size;
  console.log(`Local offline preview ZIP: ${archive} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
} finally {
  // This exact directory was created above solely for this packaging operation.
  if (dirname(resolve(staging)) !== resolve(tmpdir()) || !basename(staging).startsWith('wulong-starrail-package-')) {
    throw new Error('Temporary packaging directory escaped its expected parent.');
  }
  await rm(staging, { recursive: true, force: true });
}
