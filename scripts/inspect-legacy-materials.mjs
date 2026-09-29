import fs from 'node:fs';
import { parsePMX } from '../src/official-models.js';
const items=[['hsr_1009','星穹铁道—艾丝妲160.pmx'],['hsr_1201','青雀（分桦）.pmx'],['hsr_1202','停云.pmx']];
const out=[];
for(const [id,file] of items){
 const p=parsePMX(fs.readFileSync(`public/assets/models/${id}/${file}`));
 const mats=p.materials.map(m=>{const verts=[...new Set(p.indices.slice(m.start,m.start+m.count))];const pos=verts.map(i=>Array.from(p.positions.slice(i*3,i*3+3)));const uv=verts.map(i=>Array.from(p.uvs.slice(i*2,i*2+2)));return {name:m.name,texture:p.textures[m.textureIndex],diffuse:m.diffuse,count:m.count,start:m.start,positionMin:[0,1,2].map(j=>Math.min(...pos.map(x=>x[j]))),positionMax:[0,1,2].map(j=>Math.max(...pos.map(x=>x[j]))),uvMin:[0,1].map(j=>Math.min(...uv.map(x=>x[j]))),uvMax:[0,1].map(j=>Math.max(...uv.map(x=>x[j]))),uvTriangles:Array.from(p.indices.slice(m.start,m.start+m.count)).map(i=>Array.from(p.uvs.slice(i*2,i*2+2)))};});
 out.push({id,file,model:p.name,textures:p.textures,materials:mats});
}
fs.writeFileSync('.cache/official-models/legacy-material-inspection.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out.map(x=>({...x,materials:x.materials.map(({uvTriangles,...m})=>m)})),null,2));
