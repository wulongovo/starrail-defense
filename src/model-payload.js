// wulong: unpack a model only when its character actually enters the battlefield.
// This keeps the offline file compact without changing any original PMX geometry.
export async function decodeModelBundle(entry) {
  if (entry?.format !== 'wulong-pmx-gzip-v1') return entry;
  if (typeof entry.payload !== 'string' || !entry.payload) throw new Error('模型压缩包缺少数据');
  if (typeof DecompressionStream !== 'function') throw new Error('当前浏览器不支持模型解压，请使用新版 Edge 或 Chrome');
  try {
    const binary = atob(entry.payload);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const bundle = JSON.parse(await new Response(stream).text());
    if (!((bundle?.format === 'wulong-pmx-bundle-v1' && typeof bundle.pmx === 'string' && bundle.pmx) || (bundle?.format === 'wulong-glb-bundle-v1' && typeof bundle.glb === 'string' && bundle.glb))) throw new Error('模型内容格式错误');
    return bundle;
  } catch (error) {
    throw new Error(`模型压缩包解码失败：${error.message}`);
  }
}
