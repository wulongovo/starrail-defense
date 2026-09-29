import fs from 'node:fs';
const s = fs.readFileSync('docs/monster-index-source.html', 'utf8');
const names = {dragonfish:'灯昼龙鱼',bubbleHound:'气泡锂犬',domescreen:'圆幕先生',springDealer:'弹簧荷官',tideBlade:'黑潮蚀刃',tideBow:'黑潮朽弓',tideAxe:'黑潮蚀斧',tideCouncil:'黑潮参议',enemy_lotus:'破灭玄莲'};
const images = [...s.matchAll(/<img[^>]*alt="([^"]+)"[^>]*src="([^"]+)"[^>]*>/g)];
const records = Object.entries(names).map(([id,name]) => {
  const im = images.find(m => m[1].includes(name));
  if (!im) throw Error(`Missing observed image: ${name}`);
  return {id,name,sourcePage:'https://wiki.biligame.com/sr/敌人筛选',imageUrl:im[2].replace('/thumb/','/').replace(/\.png\/.*/,'.png'),sourceKind:'original-game-monster-art-community-wiki'};
});
fs.writeFileSync('docs/monster-art-sources-part2.json', JSON.stringify(records,null,2));
console.log(records);
