import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { decodeModelBundle } from './model-payload.js';

// wulong: PMX data is decoded directly; no reconstructed or substitute character mesh.
// Format cross-check: takahirox/mmd-parser and Three.js r170 MMDLoader.
// SDEF/QDEF weights use ordinary linear GPU skinning. Gait uses our own two-bone
// foot-placement solver; source MMD motion/physics are not included or claimed.
const registry = new Map();
const prototypes = new Map();
const textureCache = new Map();
const normalizePath = value => String(value).replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();

// Imported PMX characters face +Z. Other genuine source meshes may declare
// their local forward axis; facingYaw is an additional correction in radians.
// Faction determines the lane direction, independently of recoil or travel.
export function getModelFacingYaw(meshOrMetadata, friendly = true) {
  const metadata = meshOrMetadata?.userData?.metadata || meshOrMetadata || {};
  const sourceBearing = { '+Z':0, '-Z':Math.PI, '+X':Math.PI/2, '-X':-Math.PI/2 }[metadata.forwardAxis] ?? 0;
  const correction = Number.isFinite(metadata.facingYaw) ? metadata.facingYaw : 0;
  return (friendly ? Math.PI/2 : -Math.PI/2) - sourceBearing + correction;
}

class Reader {
  constructor(input) {
    this.bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    this.offset = 0;
    this.decoder = new TextDecoder('utf-16le');
  }
  need(size) { if (!Number.isInteger(size) || size < 0 || this.offset + size > this.bytes.byteLength) throw new Error(`PMX 数据截断：位置 ${this.offset}，需要 ${size} 字节`); }
  skip(size) { this.need(size); this.offset += size; }
  u8() { this.need(1); return this.view.getUint8(this.offset++); }
  i8() { this.need(1); return this.view.getInt8(this.offset++); }
  u16() { this.need(2); const value = this.view.getUint16(this.offset, true); this.offset += 2; return value; }
  i16() { this.need(2); const value = this.view.getInt16(this.offset, true); this.offset += 2; return value; }
  i32() { this.need(4); const value = this.view.getInt32(this.offset, true); this.offset += 4; return value; }
  u32() { this.need(4); const value = this.view.getUint32(this.offset, true); this.offset += 4; return value; }
  f32() { this.need(4); const value = this.view.getFloat32(this.offset, true); this.offset += 4; if (!Number.isFinite(value)) throw new Error('PMX 包含非有限浮点数'); return value; }
  vector(size) { return Array.from({ length: size }, () => this.f32()); }
  count(label, maximum = 2000000) { const value = this.i32(); if (value < 0 || value > maximum) throw new Error(`PMX ${label}数量无效：${value}`); return value; }
  text() { const size = this.count('文本字节', 16000000); this.need(size); const value = this.decoder.decode(this.bytes.subarray(this.offset, this.offset + size)); this.offset += size; return value; }
  index(size, unsigned = false) {
    if (size === 1) return unsigned ? this.u8() : this.i8();
    if (size === 2) return unsigned ? this.u16() : this.i16();
    if (size === 4) return unsigned ? this.u32() : this.i32();
    throw new Error(`PMX 索引宽度无效：${size}`);
  }
}

/** Parse the official geometry, texture references, material groups and full bone hierarchy. */
export function parsePMX(input) {
  const r = new Reader(input);
  r.need(9);
  if (String.fromCharCode(...r.bytes.subarray(0, 4)) !== 'PMX ') throw new Error('不是有效的 PMX 模型');
  r.skip(4);
  const version = r.f32();
  if (Math.abs(version - 2) > 0.001 && Math.abs(version - 2.1) > 0.001) throw new Error(`暂不支持 PMX ${version}`);
  const headerLength = r.u8();
  if (headerLength < 8) throw new Error('PMX 头部长度不足');
  const encoding = r.u8(), additionalUV = r.u8();
  const sizes = { vertex: r.u8(), texture: r.u8(), material: r.u8(), bone: r.u8(), morph: r.u8(), rigid: r.u8() };
  if (encoding > 1 || additionalUV > 4 || Object.values(sizes).some(size => ![1, 2, 4].includes(size))) throw new Error('PMX 头部参数无效');
  r.skip(headerLength - 8);
  r.decoder = new TextDecoder(encoding === 0 ? 'utf-16le' : 'utf-8');
  const name = r.text(), englishName = r.text(), comment = r.text(), englishComment = r.text();
  const vertexCount = r.count('顶点');
  const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2), skinIndices = new Uint16Array(vertexCount * 4), skinWeights = new Float32Array(vertexCount * 4);
  const weightTypes = { BDEF1: 0, BDEF2: 0, BDEF4: 0, SDEF: 0, QDEF: 0 };
  for (let i = 0; i < vertexCount; i++) {
    positions.set([r.f32(), r.f32(), -r.f32()], i * 3);
    normals.set([r.f32(), r.f32(), -r.f32()], i * 3);
    uvs.set([r.f32(), r.f32()], i * 2);
    r.skip(additionalUV * 16);
    const type = r.u8();
    if (type > 4) throw new Error(`PMX 未知蒙皮类型：${type}`);
    weightTypes[['BDEF1', 'BDEF2', 'BDEF4', 'SDEF', 'QDEF'][type]]++;
    const count = type === 0 ? 1 : type === 1 || type === 3 ? 2 : 4;
    for (let j = 0; j < count; j++) {
      const index = r.index(sizes.bone);
      if (index > 65535) throw new Error('PMX 骨骼索引超出支持范围');
      skinIndices[i * 4 + j] = Math.max(0, index);
    }
    if (count === 1) skinWeights[i * 4] = 1;
    else if (count === 2) { const weight = r.f32(); skinWeights[i * 4] = weight; skinWeights[i * 4 + 1] = 1 - weight; }
    else for (let j = 0; j < 4; j++) skinWeights[i * 4 + j] = r.f32();
    if (type === 3) r.skip(36);
    r.f32(); // Edge scale is retained by the original file; geometry uses its real normals.
  }
  const indexCount = r.count('三角索引', 12000000);
  if (indexCount % 3 !== 0) throw new Error('PMX 三角索引数量不是 3 的倍数');
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  for (let i = 0; i < indexCount; i += 3) {
    const a = r.index(sizes.vertex, true), b = r.index(sizes.vertex, true), c = r.index(sizes.vertex, true);
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount) throw new Error('PMX 面引用了不存在的顶点');
    indices[i] = a; indices[i + 1] = c; indices[i + 2] = b;
  }
  const textureCount = r.count('贴图', 10000), textures = [];
  for (let i = 0; i < textureCount; i++) textures.push(r.text());
  const materialCount = r.count('材质', 10000), materials = [];
  let groupOffset = 0;
  for (let i = 0; i < materialCount; i++) {
    const material = { name: r.text(), englishName: r.text(), diffuse: r.vector(4), specular: r.vector(3), shininess: r.f32(), ambient: r.vector(3), flags: r.u8(), edgeColor: r.vector(4), edgeSize: r.f32(), textureIndex: r.index(sizes.texture), envTextureIndex: r.index(sizes.texture), envMode: r.u8() };
    material.sharedToon = r.u8();
    if (material.sharedToon > 1) throw new Error('PMX Toon 标记无效');
    material.toonIndex = material.sharedToon ? r.u8() : r.index(sizes.texture);
    material.comment = r.text(); material.count = r.count('材质面索引', indexCount); material.start = groupOffset;
    groupOffset += material.count;
    if (material.count % 3 !== 0 || groupOffset > indexCount) throw new Error('PMX 材质面分组无效');
    materials.push(material);
  }
  if (groupOffset !== indexCount) throw new Error('PMX 材质面分组与总索引不一致');
  const boneCount = r.count('骨骼', 65535), bones = [];
  for (let i = 0; i < boneCount; i++) {
    const bone = { name: r.text(), englishName: r.text(), position: [r.f32(), r.f32(), -r.f32()], parent: r.index(sizes.bone), layer: r.i32(), flags: r.u16() };
    if (bone.flags & 1) bone.tail = r.index(sizes.bone); else bone.tailOffset = r.vector(3);
    if (bone.flags & 0x300) bone.grant = { parent: r.index(sizes.bone), ratio: r.f32(), rotation: Boolean(bone.flags & 0x100), translation: Boolean(bone.flags & 0x200) };
    if (bone.flags & 0x400) bone.fixedAxis = r.vector(3);
    if (bone.flags & 0x800) { bone.localX = r.vector(3); bone.localZ = r.vector(3); }
    if (bone.flags & 0x2000) bone.externalParent = r.i32();
    if (bone.flags & 0x20) {
      bone.ik = { target: r.index(sizes.bone), iterations: r.i32(), limit: r.f32(), links: [] };
      const links = r.count('IK链', 10000);
      for (let j = 0; j < links; j++) {
        const link = { index: r.index(sizes.bone), limited: r.u8() };
        if (link.limited) { link.min = r.vector(3); link.max = r.vector(3); }
        bone.ik.links.push(link);
      }
    }
    if (bone.parent >= boneCount || bone.parent === i) throw new Error(`PMX 骨骼父级无效：${bone.name}`);
    bones.push(bone);
  }
  if (!boneCount && vertexCount) throw new Error('PMX 缺少骨骼');
  for (let i = 0; i < skinIndices.length; i++) if (skinWeights[i] > 0 && skinIndices[i] >= boneCount) throw new Error('PMX 蒙皮引用了不存在的骨骼');
  // Reject cyclic parent graphs before attaching THREE.Bone objects.
  for (let i = 0; i < bones.length; i++) {
    const visited = new Set([i]); let parent = bones[i].parent;
    while (parent >= 0) { if (visited.has(parent)) throw new Error('PMX 骨骼层级存在循环'); visited.add(parent); parent = bones[parent].parent; }
  }
  return { version, name, englishName, comment, englishComment, vertexCount, indexCount, indices, positions, normals, uvs, skinIndices, skinWeights, textures, materials, bones, weightTypes, parsedBytes: r.offset, totalBytes: r.bytes.byteLength };
}

function decodeBase64(value) {
  const raw = atob(String(value).replace(/^data:.*?;base64,/, ''));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function getTexture(uri) {
  if (!textureCache.has(uri)) textureCache.set(uri, new THREE.TextureLoader().loadAsync(uri).then(texture => {
    texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4; return texture;
  }));
  return textureCache.get(uri);
}

/** Build the actual skinned mesh. Exported for binary-parser/rig integration tests. */
export async function createOfficialMesh(parsed, bundle = {}, { textureLoader = getTexture } = {}) {
  const textures = new Map(Object.entries(bundle.textures || {}).map(([path, value]) => [normalizePath(path), value]));
  const geometry = new THREE.BufferGeometry();
  const positions = parsed.positions.slice();
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < positions.length; i += 3) { minY = Math.min(minY, positions[i]); maxY = Math.max(maxY, positions[i]); }
  const scale = (bundle.height || 1.35) / Math.max(0.01, maxY - minY);
  for (let i = 0; i < positions.length; i += 3) { positions[i] *= scale; positions[i + 1] = (positions[i + 1] - minY) * scale; positions[i + 2] *= scale; }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(parsed.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(parsed.uvs, 2));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(parsed.skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(parsed.skinWeights, 4));
  geometry.setIndex(new THREE.BufferAttribute(parsed.indices, 1));
  const materials = await Promise.all(parsed.materials.map(async (definition, index) => {
    geometry.addGroup(definition.start, definition.count, index);
    const path = parsed.textures[definition.textureIndex];
    const uri = path ? textures.get(normalizePath(path)) : null;
    const visible=definition.diffuse[3]>0;
    if (visible && path && !uri) throw new Error(`官方模型缺失贴图：${path}`);
    const material = new THREE.MeshToonMaterial({
      name: definition.name,
      color: new THREE.Color().setRGB(...definition.diffuse.slice(0, 3), THREE.SRGBColorSpace),
      opacity: definition.diffuse[3], transparent: definition.diffuse[3] < 0.999,
      side: definition.flags & 1 ? THREE.DoubleSide : THREE.FrontSide,
      alphaTest: 0.035, map: visible && uri ? await textureLoader(uri) : null,
      emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.03,
    });
    if (material.map) material.emissiveMap = material.map;
    material.visible=visible;
    material.userData.pmx = { material: definition.name, sourceTexture: path || null };
    return material;
  }));
  const mesh = new THREE.SkinnedMesh(geometry, materials);
  mesh.name = parsed.name || bundle.metadata?.id || 'official-pmx-model';
  const weightedBones = new Float32Array(parsed.bones.length);
  for (let i=0;i<parsed.skinIndices.length;i++) weightedBones[parsed.skinIndices[i]] += parsed.skinWeights[i];
  const bones = parsed.bones.map((definition, index) => {
    const bone = new THREE.Bone(); bone.name = definition.name || definition.englishName || `bone_${index}`;
    bone.userData.englishName = definition.englishName;
    bone.userData.pmxIndex = index;
    bone.userData.skinWeightSum = weightedBones[index];
    const position = new THREE.Vector3(definition.position[0] * scale, (definition.position[1] - minY) * scale, definition.position[2] * scale);
    if (definition.parent >= 0) {
      const parent = parsed.bones[definition.parent].position;
      position.sub(new THREE.Vector3(parent[0] * scale, (parent[1] - minY) * scale, parent[2] * scale));
    }
    bone.position.copy(position); return bone;
  });
  for (let i = 0; i < bones.length; i++) if (parsed.bones[i].parent >= 0) bones[parsed.bones[i].parent].add(bones[i]); else mesh.add(bones[i]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.normalizeSkinWeights();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  mesh.frustumCulled = false;
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.official = true;
  mesh.userData.metadata = { ...bundle.metadata, modelName: parsed.name, vertices: parsed.vertexCount, triangles: parsed.indexCount / 3, bones: bones.length, sourceMaterials: parsed.materials.length, weightTypes: parsed.weightTypes, normalizedHeight: bundle.height || 1.35 };
  return mesh;
}

const RIG_NAMES = {
  motionRoot: ['腰', 'グルーブ', 'センター', 'Hips', 'Pelvis'],
  hips: ['下半身', 'センター', '腰', 'Hips', 'Pelvis'], spine: ['上半身', 'Spine'], chest: ['上半身2', '上半身２', 'Chest', 'Spine1'],
  leftShoulder: ['左肩', 'LeftShoulder'], rightShoulder: ['右肩', 'RightShoulder'],
  neck: ['首', 'Neck'], head: ['頭', 'Head'], leftArm: ['左腕', '左腕D', 'LeftArm'], rightArm: ['右腕', '右腕D', 'RightArm'],
  leftElbow: ['左ひじ', '左肘', 'LeftForeArm'], rightElbow: ['右ひじ', '右肘', 'RightForeArm'],
  leftHand: ['左手首', 'LeftHand'], rightHand: ['右手首', 'RightHand'], leftLeg: ['左足', '左足D', 'LeftUpLeg'], rightLeg: ['右足', '右足D', 'RightUpLeg'],
  leftKnee: ['左ひざ', '左膝', '左ひざD', 'LeftLeg'], rightKnee: ['右ひざ', '右膝', '右ひざD', 'RightLeg'],
  leftFoot: ['左足首', '左足首D', 'LeftFoot'], rightFoot: ['右足首', '右足首D', 'RightFoot'],
};

export function attachOfficialRig(mesh) {
  const named = Object.create(null);
  for (const bone of mesh.skeleton.bones) { named[bone.name] = bone; if (bone.userData.englishName) named[bone.userData.englishName] = bone; }
  const rig = {};
  const canonicalName = name => name.toLowerCase().replace(/^mixamorig[:_]?/, '').replace(/[ _-]/g, '');
  for (const [alias, names] of Object.entries(RIG_NAMES)) {
    const candidates = names.map(name => named[name] || mesh.skeleton.bones.find(bone=>canonicalName(bone.name)===canonicalName(name))).filter(Boolean);
    // MMD control legs often have zero skin weights; their D-bone copies deform
    // the actual mesh. Driving an unweighted control alone produces skating.
    if (/Leg|Knee|Foot/.test(alias)) candidates.sort((a,b)=>(b.userData.skinWeightSum||0)-(a.userData.skinWeightSum||0));
    rig[alias] = candidates[0] || null;
  }
  // A few source rigs mix weights between control and D bones. Solve a connected
  // leg chain instead of independently choosing an unrelated weighted knee.
  const mirrors=[];
  for(const side of ['left','right']) {
    const candidates=part=>[...new Set([rig[`${side}${part}`],...RIG_NAMES[`${side}${part}`].map(name=>named[name])].filter(Boolean))].sort((a,b)=>(b.userData.skinWeightSum||0)-(a.userData.skinWeightSum||0));
    let chain=null;
    for(const upper of candidates('Leg')) {
      for(const knee of candidates('Knee').filter(bone=>upper.getObjectById(bone.id))) {
        const foot=candidates('Foot').find(bone=>knee.getObjectById(bone.id));
        if(foot){chain={upper,knee,foot};break;}
      }
      if(chain)break;
    }
    if(chain){rig[`${side}Leg`]=chain.upper;rig[`${side}Knee`]=chain.knee;rig[`${side}Foot`]=chain.foot;}
    for(const part of ['Leg','Knee','Foot']) {
      const source=rig[`${side}${part}`];if(!source)continue;
      const target=named[source.name.endsWith('D')?source.name.slice(0,-1):`${source.name}D`];
      if(target&&target!==source)mirrors.push({source,target});
    }
  }
  mesh.userData.bones = named; mesh.userData.rig = rig;
  // Circular bone references deliberately attach only after SkeletonUtils clones the prototype.
  mesh.userData.rest = Object.fromEntries(Object.entries(rig).filter(([, bone]) => bone).map(([alias, bone]) => [alias, bone.quaternion.clone()]));
  mesh.userData.restPositions = Object.fromEntries(Object.entries(rig).filter(([,bone])=>bone).map(([alias,bone])=>[alias,bone.position.clone()]));
  mesh.updateMatrixWorld(true);
  const inverse = mesh.matrixWorld.clone().invert();
  const meshRotation = mesh.getWorldQuaternion(new THREE.Quaternion()).invert();
  const legs = [];
  for (const side of ['left','right']) {
    const upper=rig[`${side}Leg`],knee=rig[`${side}Knee`],foot=rig[`${side}Foot`];
    if(!upper||!knee||!foot) continue;
    const hipPosition=upper.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
    const kneePosition=knee.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
    const footPosition=foot.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
    const upperLength=hipPosition.distanceTo(kneePosition),lowerLength=kneePosition.distanceTo(footPosition);
    if(upperLength<.015||lowerLength<.015) continue;
    legs.push({side,upper,knee,foot,upperLength,lowerLength,restFoot:footPosition,restFootRotation:meshRotation.clone().multiply(foot.getWorldQuaternion(new THREE.Quaternion())),anchor:new THREE.Vector3(),swingStart:new THREE.Vector3(),planted:false,swinging:false});
  }
  const relaxedArms={};
  for(const side of ['left','right']) {
    const arm=rig[`${side}Arm`],elbow=rig[`${side}Elbow`];
    if(!arm||!elbow)continue;
    const direction=elbow.getWorldPosition(new THREE.Vector3()).sub(arm.getWorldPosition(new THREE.Vector3())).normalize().applyQuaternion(meshRotation);
    const desired=new THREE.Vector3(side==='left'?.13:-.13,-.99,.035).normalize();
    const delta=new THREE.Quaternion().setFromUnitVectors(direction,desired);
    const parentRotation=arm.parent.getWorldQuaternion(new THREE.Quaternion());
    const worldRotation=mesh.getWorldQuaternion(new THREE.Quaternion()).multiply(delta).multiply(meshRotation).multiply(arm.getWorldQuaternion(new THREE.Quaternion()));
    relaxedArms[side]=parentRotation.invert().multiply(worldRotation);
  }
  mesh.userData.locomotion={phase:0,blend:0,speed:0,clock:0,attackBlend:0,legs,mirrors,relaxedArms,distance:0,stepLength:.12};
  // Async loading can finish after the battle was paused. Establish a relaxed
  // pose before the first render so a paused actor never exposes its bind pose.
  animateOfficialModel(mesh,{dt:0,time:0});
  // This initial pose is built before the mesh is placed on the board. Ground
  // anchors must be captured again at its eventual world position.
  for(const leg of legs)leg.planted=false;
  return mesh;
}

export function registerOfficialModels(bundles) {
  for (const [id, bundle] of Object.entries(bundles)) { registry.set(id, bundle); prototypes.delete(id); }
}

export function hasOfficialModel(type) { return registry.has(type); }
export function officialModelTypes() { return [...registry.keys()]; }

/** A failed official asset rejects visibly. It never substitutes a procedural character. */
export async function loadOfficialModel(type) {
  if (!registry.has(type)) throw new Error(`没有配置 ${type} 的官方模型`);
  const entry = registry.get(type);
  // Alias keys referencing the same bundle share geometry/materials/textures, not skeletons.
  if (!prototypes.has(entry)) prototypes.set(entry, (async () => {
    const source = typeof entry === 'string' ? await fetch(entry).then(response => { if (!response.ok) throw new Error(`模型包加载失败：${response.status}`); return response.json(); }) : await entry;
    const bundle = await decodeModelBundle(source);
    if (bundle?.format === 'wulong-glb-bundle-v1' && bundle.glb) return createImportedGLB(bundle);
    if (bundle?.format !== 'wulong-pmx-bundle-v1' || !bundle.pmx) throw new Error(`官方模型包格式无效：${type}`);
    return createOfficialMesh(parsePMX(decodeBase64(bundle.pmx)), bundle);
  })());
  const prototype = await prototypes.get(entry);
  const instance = cloneSkeleton(prototype);
  const mesh = prototype.userData.importFormat === 'glb' ? attachImportedGLBRig(instance) : attachOfficialRig(instance);
  mesh.userData.characterType = type;
  return mesh;
}

/** Load embedded original FBX exports without issuing any external asset request. */
export async function createImportedGLB(bundle) {
  const bytes=decodeBase64(bundle.glb),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.byteLength<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(16,true)!==0x4e4f534a)throw new Error('GLB 二进制格式无效');
  const jsonLength=view.getUint32(12,true);
  if(20+jsonLength>bytes.byteLength)throw new Error('GLB JSON 数据截断');
  const json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jsonLength)));
  for(const asset of [...(json.buffers||[]),...(json.images||[])])if(asset.uri&&!asset.uri.startsWith('data:'))throw new Error('离线 GLB 不允许外部资源引用');
  const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject));
  const root=new THREE.Group(),normalization=new THREE.Group();
  root.name=bundle.metadata?.modelName||bundle.metadata?.id||'original-glb-model';
  normalization.name='__source_normalization__';normalization.add(gltf.scene);root.add(normalization);
  root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  if(!Number.isFinite(size.y)||size.y<=1e-6)throw new Error('GLB 模型缺少有效的可见几何');
  const height=bundle.height||bundle.metadata?.height||1.35,scale=height/size.y;
  const anchor=gltf.scene.getObjectByName('Root_M');
  if(anchor){const point=anchor.getWorldPosition(new THREE.Vector3());center.x=point.x;center.z=point.z;}
  if(Array.isArray(bundle.metadata?.centerXZ)&&bundle.metadata.centerXZ.length===2){center.x=bundle.metadata.centerXZ[0];center.z=bundle.metadata.centerXZ[1];}
  normalization.scale.setScalar(scale);normalization.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);
  let vertices=0,triangles=0;const bones=new Set(),textures=new Set();
  root.traverse(node=>{
    if(node.isBone)bones.add(node);
    if(node.isMesh){vertices+=node.geometry.attributes.position?.count||0;triangles+=(node.geometry.index?.count||node.geometry.attributes.position?.count||0)/3;node.frustumCulled=false;
      for(const material of Array.isArray(node.material)?node.material:[node.material])for(const key of ['map','normalMap','metalnessMap','roughnessMap','emissiveMap','alphaMap'])if(material[key])textures.add(material[key]);
    }
  });
  root.animations=gltf.animations;
  root.userData.importFormat='glb';
  root.userData.metadata={...bundle.metadata,vertices,triangles,bones:bones.size,textureCount:textures.size,normalizedHeight:height,normalizationAnchor:anchor?'Root_M':'bounds',animationNames:gltf.animations.map(clip=>clip.name)};
  root.updateMatrixWorld(true);
  return root;
}

function attachImportedGLBRig(root) {
  const bones=[];root.traverse(node=>{if(node.isBone)bones.push(node);});
  const normalization=root.getObjectByName('__source_normalization__');
  const sourceClips=root.animations||[],mixer=sourceClips.length?new THREE.AnimationMixer(root):null;
  const map=root.userData.metadata.animationMap||{};
  const pick=(key,pattern)=>sourceClips.find(clip=>clip.name===map[key])||sourceClips.find(clip=>pattern.test(clip.name));
  const clips={idle:pick('idle',/idle|stand|wait|rest|待机|站立/i),walk:pick('walk',/walk|run|move|locomotion|行走|跑/i),attack:pick('attack',/attack|atk|skill|攻击|普攻/i)};
  const actions=Object.fromEntries(Object.entries(clips).filter(([,clip])=>clip).map(([key,clip])=>[key,mixer.clipAction(clip)]));
  root.updateMatrixWorld(true);
  const legs=[],quadruped=root.userData.metadata.locomotion==='quadruped';
  if(quadruped||root.userData.metadata.locomotion==='biped')for(const side of ['L','R']) {
    const profiles=[{names:[`Hip_${side}`,`Knee_${side}`,`Ankle_${side}`],phase:side==='L'?0:.5,label:`hind${side}`}];
    if(quadruped)profiles.push({names:root.getObjectByName(`HipFront_${side}`)?[`HipFront_${side}`,`KneeFront_${side}`,`AnkleFront_${side}`]:[`Shoulder_${side}`,`Elbow_${side}`,`Wrist_${side}`],phase:side==='L'?.25:.75,label:`front${side}`});
    for(const profile of profiles){
      const [upper,knee,foot]=profile.names.map(name=>root.getObjectByName(name));
      if(!upper?.isBone||!knee?.isBone||!foot?.isBone||!upper.getObjectById(knee.id)||!knee.getObjectById(foot.id))continue;
      const hipPosition=root.worldToLocal(upper.getWorldPosition(new THREE.Vector3())),kneePosition=root.worldToLocal(knee.getWorldPosition(new THREE.Vector3())),footPosition=root.worldToLocal(foot.getWorldPosition(new THREE.Vector3()));
      const upperLength=hipPosition.distanceTo(kneePosition),lowerLength=kneePosition.distanceTo(footPosition);if(upperLength<.01||lowerLength<.01)continue;
      const line=footPosition.clone().sub(hipPosition).normalize(),bend=kneePosition.clone().sub(hipPosition);bend.addScaledVector(line,-bend.dot(line));
      legs.push({upper,knee,foot,upperLength,lowerLength,restFoot:footPosition,restFootRotation:root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(foot.getWorldQuaternion(new THREE.Quaternion())),bendDirection:bend.length()>1e-5?bend.normalize():null,phaseOffset:profile.phase,label:profile.label,anchor:new THREE.Vector3(),swingStart:new THREE.Vector3(),planted:false,swinging:false});
    }
  }
  root.userData.importedRig={bones,rest:bones.map(bone=>({quaternion:bone.quaternion.clone(),position:bone.position.clone()})),legs,quadruped,normalization,normalizationY:normalization.position.y,mixer,clips,actions,activeAction:null,phase:0,blend:0,clock:0,previousAttack:0,attackAge:Infinity};
  root.userData.animationSource=sourceClips.length?'source-clips':'authored-lightweight-motion';
  animateImportedGLB(root,{dt:0});
  for(const leg of legs)leg.planted=false;
  return root;
}

function animateImportedGLB(root,{dt=1/60,time=0,distance=0,speed=0,moving=false,paused=false,attack=0,hit=0,teleported=false}={}) {
  const rig=root.userData.importedRig;if(!rig||paused)return;
  dt=THREE.MathUtils.clamp(Number(dt)||0,0,.1);rig.clock+=dt;
  const travelling=Boolean(moving&&distance>1e-6);
  if(teleported){rig.blend=0;for(const leg of rig.legs)leg.planted=false;}
  rig.blend+=(Number(travelling)-rig.blend)*(1-Math.exp(-dt*12));
  const scale=root.getWorldScale(new THREE.Vector3()).y;
  const legLength=rig.legs.length?Math.min(...rig.legs.map(leg=>leg.upperLength+leg.lowerLength)):.6;
  const stepLength=THREE.MathUtils.clamp(speed/Math.max(scale,.01)*.65,legLength*.13,legLength*.42),stance=rig.quadruped?.76:.64;
  if(travelling)rig.phase=(rig.phase+distance/(stepLength*scale/stance))%1;
  if(attack>0&&attack>rig.previousAttack+1e-4)rig.attackAge=0;
  rig.previousAttack=attack;rig.attackAge+=dt;
  const desired=rig.attackAge<.48&&rig.actions.attack?'attack':travelling&&rig.actions.walk?'walk':rig.actions.idle?'idle':null;
  if(desired!==rig.activeAction){
    const old=rig.actions[rig.activeAction];if(old){old.fadeOut(.12);rig.sourceFadeRemaining=.12;}
    const next=rig.actions[desired];if(next){next.reset().setEffectiveWeight(1).fadeIn(.12);if(desired==='attack'){next.setLoop(THREE.LoopOnce,1);next.clampWhenFinished=true;}else next.setLoop(THREE.LoopRepeat,Infinity);next.play();}
    rig.activeAction=desired;
  }
  if(rig.actions.walk)rig.actions.walk.setEffectiveTimeScale(THREE.MathUtils.clamp(speed/(root.userData.metadata.animationWalkSpeed||.55),.25,2.5));
  if(rig.actions.attack)rig.actions.attack.setEffectiveTimeScale((rig.clips.attack.duration||.48)/.48);
  if(rig.mixer)rig.mixer.update(dt);
  rig.sourceFadeRemaining=Math.max(0,(rig.sourceFadeRemaining||0)-dt);
  if(!desired && rig.sourceFadeRemaining<=0) {
    const hover=root.userData.metadata.locomotion==='hover';
    const gesture=Math.max(0,1-rig.attackAge/.48);
    for(let i=0;i<rig.bones.length;i++) {
      const bone=rig.bones[i],name=bone.name;bone.quaternion.copy(rig.rest[i].quaternion);bone.position.copy(rig.rest[i].position);
      if(/^Head(_M)?$/i.test(name))rotateImportedBone(root,bone,new THREE.Vector3(0,1,0),Math.sin(time*.9)*.012);
      if(/^Spine\d*_M$/i.test(name))rotateImportedBone(root,bone,new THREE.Vector3(1,0,0),-gesture*.055-Math.min(.15,hit||0)*.15);
    }
    rig.normalization.position.y=rig.normalizationY+(hover?Math.sin(time*1.5)*.035:0);
    root.updateMatrixWorld(true);
    // Each source creature uses its own connected limbs and rest bend direction.
    // Four-legged rigs use four separate planted-foot phases, never a human gait.
    const bearing=Math.PI/2-getModelFacingYaw(root,true),forward=new THREE.Vector3(Math.sin(bearing),0,Math.cos(bearing));
    for(const leg of rig.legs){
      const phase=(rig.phase+leg.phaseOffset)%1,swing=phase>=stance;
      const neutral=root.localToWorld(leg.restFoot.clone()),landing=root.localToWorld(leg.restFoot.clone().addScaledVector(forward,stepLength*.5));
      if(!leg.planted){leg.anchor.copy(neutral);leg.swingStart.copy(neutral);leg.planted=true;leg.swinging=swing;}
      let target=neutral;
      if(travelling||rig.blend>.001){
        if(swing){if(!leg.swinging)leg.swingStart.copy(leg.anchor);const p=(phase-stance)/(1-stance);target=leg.swingStart.clone().lerp(landing,ease(p));target.y=neutral.y+Math.sin(p*Math.PI)*Math.min(.05,legLength*.10)*scale*rig.blend;}
        else{if(leg.swinging)leg.anchor.copy(landing);target=leg.anchor.clone();}
        if(!travelling)target.lerp(neutral,1-rig.blend);
      }else{leg.anchor.copy(neutral);leg.swingStart.copy(neutral);}
      leg.swinging=swing;leg.contact=!swing&&rig.blend>.05;leg.target=target;
      placeFoot(root,leg,target,scale,0);
    }
  }
  root.updateMatrixWorld(true);
}

function rotateImportedBone(root,bone,axis,angle) {
  const localAxis=axis.applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
  bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(localAxis,angle));
}

/** Dispose per-instance animation and skeleton state while retaining shared assets. */
export function disposeOfficialModel(root) {
  root.userData.importedRig?.mixer?.stopAllAction();
  root.userData.importedRig?.mixer?.uncacheRoot(root);
  const skeletons=new Set();root.traverse(node=>{if(node.isSkinnedMesh)skeletons.add(node.skeleton);});
  for(const skeleton of skeletons)skeleton.dispose();
}

const clamp = THREE.MathUtils.clamp;
const ease = value => value*value*(3-2*value);
const v0=new THREE.Vector3(),v1=new THREE.Vector3(),v2=new THREE.Vector3(),v3=new THREE.Vector3();
const q0=new THREE.Quaternion(),q1=new THREE.Quaternion(),q2=new THREE.Quaternion();

function aimBone(bone, child, target) {
  const origin=bone.getWorldPosition(v0);
  const from=child.getWorldPosition(v1).sub(origin).normalize();
  const to=v2.copy(target).sub(origin).normalize();
  q0.setFromUnitVectors(from,to).multiply(bone.getWorldQuaternion(q1));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(q2).invert().multiply(q0));
  bone.updateWorldMatrix(false,true);
}

function placeFoot(mesh,leg,target,scale,roll=0) {
  const origin=leg.upper.getWorldPosition(new THREE.Vector3());
  const delta=target.clone().sub(origin);
  const lengthA=leg.upperLength*scale,lengthB=leg.lowerLength*scale;
  const distance=clamp(delta.length(),Math.abs(lengthA-lengthB)+.001,(lengthA+lengthB)*.998);
  const direction=delta.normalize();
  const sourceBearing=Math.PI/2-getModelFacingYaw(mesh,true);
  const forward=(leg.bendDirection?.clone()||new THREE.Vector3(Math.sin(sourceBearing),0,Math.cos(sourceBearing))).transformDirection(mesh.matrixWorld);
  forward.addScaledVector(direction,-forward.dot(direction)).normalize();
  const along=(lengthA*lengthA+distance*distance-lengthB*lengthB)/(2*distance);
  const bend=Math.sqrt(Math.max(0,lengthA*lengthA-along*along));
  const kneeTarget=origin.clone().addScaledVector(direction,along).addScaledVector(forward,bend);
  aimBone(leg.upper,leg.knee,kneeTarget);
  aimBone(leg.knee,leg.foot,target);
  const flat=mesh.getWorldQuaternion(new THREE.Quaternion()).multiply(leg.restFootRotation);
  if(roll)flat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),roll));
  leg.foot.quaternion.copy(leg.foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(flat));
  leg.foot.updateWorldMatrix(false,true);
}

/** Procedural gait on original bones, with distance-driven steps and planted feet.
 * This is authored runtime animation, not imported official motion or MMD physics.
 * `distance` is measured world displacement this frame; zero never advances gait.
 */
export function animateOfficialModel(mesh, { time = 0, dt = 1/60, distance = 0, speed = 0, attack = 0, hit = 0, moving = false, paused = false, teleported = false, kind = '' } = {}) {
  if(mesh.userData.importFormat==='glb')return animateImportedGLB(mesh,{time,dt,distance,speed,attack,hit,moving,paused,teleported,kind});
  const { rig, rest, restPositions, locomotion:state }=mesh.userData;
  if(!rig||!state)return;
  if(paused)return;
  if(teleported){state.blend=0;state.speed=0;state.phase=0;for(const leg of state.legs)leg.planted=false;}
  dt=clamp(Number(dt)||0,0,.1);
  distance=Math.max(0,Number(distance)||0);
  const travelling=Boolean(moving&&distance>1e-6&&dt>0);
  state.clock+=dt;
  const alpha=1-Math.exp(-dt*(travelling?10:14));
  state.blend+=(Number(travelling)-state.blend)*alpha;
  state.speed+=(travelling?Math.max(0,speed||distance/Math.max(dt,.001))-state.speed:-state.speed)*(1-Math.exp(-dt*9));
  // One clear wind-up, release and recovery per engine attack impulse.
  // A held flag does not turn into an unrelated repeating windmill gesture.
  if (attack>0 && attack>(state.previousAttack||0)+1e-4) state.attackAge=0;
  state.previousAttack=attack;
  state.attackAge=(state.attackAge??Infinity)+dt;
  const closeAttack=['melee','pet','spin','counter','taunt'].includes(kind);
  const supportAttack=['producer','producerHybrid','support','healer','summoner'].includes(kind);
  const attackDuration=closeAttack?.42:supportAttack?.58:.48;
  const attackPhase=clamp(state.attackAge/attackDuration,0,1);
  const attackEnvelope=attackPhase<.22?ease(attackPhase/.22):1-ease((attackPhase-.22)/.78);
  state.attackBlend=attackEnvelope;
  const scale=mesh.getWorldScale(v3).y;
  const legLength=state.legs.length?Math.min(...state.legs.map(leg=>leg.upperLength+leg.lowerLength)):.65;
  state.stepLength=clamp(state.speed/Math.max(.01,scale)*.65,legLength*.16,legLength*.48);
  if(travelling){state.phase=(state.phase+distance/(state.stepLength*scale/.62))%1;state.distance+=distance;}
  if(state.blend<.001)state.blend=0;
  // Reset each actual bone once, including translation; aliases can share a bone.
  const reset=new Set();
  for(const [alias,bone] of Object.entries(rig))if(bone&&!reset.has(bone)){
    bone.quaternion.copy(rest[alias]);bone.position.copy(restPositions[alias]);reset.add(bone);
  }
  const phase=state.phase*Math.PI*2,weight=state.blend;
  const breath=Math.sin(time*1.8)*.007;
  for(const side of ['left','right']) {
    const arm=rig[`${side}Arm`],elbow=rig[`${side}Elbow`],shoulder=rig[`${side}Shoulder`];
    const sign=side==='left'?1:-1;
    if(arm&&state.relaxedArms[side]){arm.quaternion.copy(state.relaxedArms[side]);arm.rotation.x+=sign*Math.sin(phase)*.23*weight;}
    if(elbow){elbow.rotation.x-=.12+weight*.1;elbow.rotation.y+=sign*.055;}
    if(shoulder)shoulder.rotation.y-=sign*Math.sin(phase)*.035*weight;
  }
  if(rig.motionRoot){
    rig.motionRoot.position.y-=weight*(.012+Math.pow(Math.cos(phase),2)*.014);
    rig.motionRoot.position.x+=Math.sin(phase)*.009*weight;
    rig.motionRoot.rotation.z+=Math.sin(phase)*.025*weight;
    rig.motionRoot.rotation.y+=Math.sin(phase)*.03*weight;
  }
  if(rig.spine){rig.spine.rotation.x+=breath+weight*.04;rig.spine.rotation.y-=Math.sin(phase)*.045*weight;rig.spine.rotation.z-=Math.sin(phase)*.018*weight;}
  if(rig.head){rig.head.rotation.y+=Math.sin(time*.8)*.025+Math.sin(phase)*.015*weight;rig.head.rotation.x-=breath+weight*.035;rig.head.rotation.z-=Math.sin(phase)*.007*weight;}
  const strength=state.attackBlend;
  if(strength>.001){
    const release=ease(clamp((attackPhase-.12)/.30,0,1));
    if (closeAttack) {
      if(rig.rightArm){rig.rightArm.rotation.z-=(.22+release*.28)*strength;rig.rightArm.rotation.x-=(.3+release*1.12)*strength;}
      if(rig.rightElbow)rig.rightElbow.rotation.y+=(.58-release*.3)*strength;
      if(rig.leftArm)rig.leftArm.rotation.x-=.38*strength;
      if(rig.spine){rig.spine.rotation.y+=(-.3+release*.7)*strength;rig.spine.rotation.x+=.075*release*strength;}
    } else if (supportAttack) {
      for(const side of ['left','right'])if(rig[`${side}Arm`]){rig[`${side}Arm`].rotation.x-=.65*strength;rig[`${side}Arm`].rotation.z+=(side==='left'?1:-1)*.25*strength;}
      if(rig.spine)rig.spine.rotation.x-=.035*strength;
    } else {
      if(rig.rightArm){rig.rightArm.rotation.x-=1.15*strength;rig.rightArm.rotation.y-=.22*strength;}
      if(rig.rightElbow)rig.rightElbow.rotation.y+=(.42-release*.2)*strength;
      if(rig.leftArm)rig.leftArm.rotation.x-=(mesh.userData.characterType==='march'?1.15:.65)*strength;
      if(rig.spine){rig.spine.rotation.y-=.12*strength;rig.spine.rotation.x-=.045*release*strength;}
    }
  }
  if(hit>0&&hit>(state.previousHit||0)+1e-4)state.hitAge=0;
  state.previousHit=hit;state.hitAge=(state.hitAge??Infinity)+dt;
  if(state.hitAge<.22&&rig.spine)rig.spine.rotation.x-=Math.sin(state.hitAge/.22*Math.PI)*.075;
  mesh.updateWorldMatrix(true,true);
  for(const leg of state.legs){
    const footPhase=(state.phase+(leg.side==='right'?.5:0))%1;
    const swing=footPhase>=.62;
    const neutral=mesh.localToWorld(leg.restFoot.clone());
    const sourceBearing=Math.PI/2-getModelFacingYaw(mesh,true);
    const landing=mesh.localToWorld(leg.restFoot.clone().add(new THREE.Vector3(Math.sin(sourceBearing),0,Math.cos(sourceBearing)).multiplyScalar(state.stepLength*.5)));
    if(!leg.planted){leg.anchor.copy(neutral);leg.swingStart.copy(neutral);leg.planted=true;leg.swinging=swing;}
    let target;
    if(travelling||weight>.001){
      if(swing){
        if(!leg.swinging)leg.swingStart.copy(leg.anchor);
        const p=(footPhase-.62)/.38;
        target=leg.swingStart.clone().lerp(landing,ease(p));
        // Short, slow steps need only a little toe clearance; a fixed high lift
        // otherwise reads like marching when tower-defense movement is slow.
        const clearance=clamp(state.stepLength*.32,.026,Math.min(.07,legLength*.12));
        target.y=neutral.y+Math.sin(p*Math.PI)*clearance*scale;
      }else{
        if(leg.swinging)leg.anchor.copy(landing);
        target=leg.anchor.clone();
      }
      leg.swinging=swing;
      // Return to a settled stance after stopping without restarting a clock gait.
      if(!travelling){target.lerp(neutral,1-weight);if(weight<.025){leg.anchor.copy(neutral);leg.swingStart.copy(neutral);}}
    }else{target=neutral;leg.anchor.copy(neutral);leg.swingStart.copy(neutral);leg.swinging=false;}
    placeFoot(mesh,leg,target,scale,swing?Math.sin((footPhase-.62)/.38*Math.PI)*.12*weight:0);
    leg.contact=!swing&&weight>.05;
    leg.target=target;
  }
  // Keep both exact source chains coherent when either is referenced by skin.
  for(const {source,target} of state.mirrors)target.quaternion.copy(source.quaternion);
  if(state.mirrors.length)mesh.updateWorldMatrix(true,true);
}
