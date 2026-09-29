import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {convertPMX} from './convert-pmx.mjs';
const report='docs/model-expansion-legacy.json';
const records=JSON.parse(await fs.readFile(report,'utf8'));
const jobs=JSON.parse(await fs.readFile('.cache/official-models/legacy-mirror-batch.json','utf8'));
const maps={
 hsr_1009:{
  'Avatar_Asta_00_Face_Color.png':{path:'颜.png',reason:'同一角色原包：內遮为56三角头部内部封口，112/168顶点与现有臉材质共享位置；现有臉、眼、眉目等均引用颜.png。核对原包脸部图集与UV范围后修复旧命名引用，原外脸不变。'},
  'Avatar_Asta_00_Body1_Color.png':{path:'服.png',reason:'同一角色原包：上衣內襯+的全部2506顶点与上衣材质的位置和UV完全一致，上衣已经引用服.png；使用同一服装图集修复旧英文命名。'},
  'Avatar_Asta_00_Body2_Color_A.png':{path:'外套.png',reason:'同一角色原包：裙內側2+的全部130顶点与下擺材质共享位置和周期UV，下擺已经引用外套.png；核对图集与UV后修复旧英文命名。'}
 },
 hsr_1201:{'Avatar_Qingque_00_Face_Color.png':{path:'颜.png',reason:'同一角色原包：缺失引用只用于Face_Mask_Mat1的42三角内部封口，其中80/119顶点位于已有顏材质边界；顏、白目、目、眉目等均引用颜.png。此内部封口保留原包退化UV，明确以本角色现有脸图集修复错误文件名；未改外脸UV或几何。'}},
 hsr_1202:{lambert2:{path:'颜.jpg',reason:'同一角色原包：lambert2是残留材质名，缺失引用只用于顏遮的52三角内部封口，其中82/156顶点位于现有颜材质边界；颜、口齿、白目、目、眉目均引用颜.jpg。此遮挡面保留原包退化UV，以本角色现有脸图集修复不可解析引用；不声称恢复原引擎遮挡着色器。'}}
};
for(const [id,textureOverrides] of Object.entries(maps)){
 const job=jobs.find(j=>j.id===id);const pmxPath=`public/assets/models/${id}/${job.pmxRelative}`,bundlePath=`public/assets/models/${id}/bundle.json`;
 const result=await convertPMX(pmxPath,bundlePath,{id,source:job.source,maxTexture:256,textureOverrides});
 const bundle=JSON.parse(await fs.readFile(bundlePath,'utf8')),m=bundle.metadata;
 const record={...job,status:'converted',pmxPath,bundlePath,archiveSha256:createHash('sha256').update(await fs.readFile(job.archive)).digest('hex'),pmxSha256:m.sha256,vertices:m.vertices,triangles:m.triangles,bones:m.bones,textureCount:Object.keys(m.textures).length,bundleBytes:(await fs.stat(bundlePath)).size,modelName:m.modelName,originalComment:m.originalComment,rules:[`public/assets/models/${id}/使用规则.txt`],missingTextures:'No unresolved initially visible diffuse textures; explicit same-character source-package reference repairs documented',omittedTransparentMaterials:m.omittedTransparentMaterials,textureReferenceRepairs:Object.entries(m.textures).filter(([,x])=>x.referenceRepair).map(([original,x])=>({original,...x.referenceRepair})),materialEvidence:'.cache/official-models/legacy-material-evidence.json',limitations:['Internal face occlusion materials retain source degenerate UV; same-character face atlas is used as a local renderer adaptation, not a reconstruction of original game shaders.']};
 const at=records.findIndex(r=>r.id===id);if(at>=0)records[at]=record;else records.push(record);
 await fs.writeFile(report,JSON.stringify(records,null,2));console.log(JSON.stringify({id,...result}));
}
