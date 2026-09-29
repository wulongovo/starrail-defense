import * as THREE from 'three';
import { CHARACTERS, ENEMIES } from './data.js';
import { hasOfficialModel, loadOfficialModel, animateOfficialModel, getModelFacingYaw, disposeOfficialModel } from './official-models.js';
import { OFFICIAL_PORTRAITS } from './generated-assets.js';

// wulong · Official creator-event PMX meshes and original game-art projections.
const PALETTES = {
  herta: { bg: 0x07131f, floor: 0x182f43, tile: 0x213e51, alt: 0x1c3547, edge: 0x65d5e3, accent: 0xdbc88e, fog: 0x0b1929 },
  penacony: { bg: 0x151125, floor: 0x302943, tile: 0x423653, alt: 0x352b48, edge: 0xdfb8ef, accent: 0xe8c77c, fog: 0x20182e },
  amphoreus: { bg: 0x15292d, floor: 0x5b7678, tile: 0x899c96, alt: 0x788f8b, edge: 0xf0dba3, accent: 0xf3d488, fog: 0x21393e },
  xianzhou: { bg: 0x10252b, floor: 0x345255, tile: 0x4b706d, alt: 0x3d625f, edge: 0xa2e7d6, accent: 0xddc88f, fog: 0x22383c },
  planarcadia: { bg: 0x141329, floor: 0x343558, tile: 0x404269, alt: 0x333657, edge: 0x91e0e6, accent: 0xe798c9, fog: 0x1c1b33 },
};
const PITCH_X = 1.24;
const PITCH_Z = 1.12;
const TYPES = {
  robin: ['robin', '知更鸟'], march: ['march', 'march7', 'march7th', '三月七'], aventurine: ['aventurine', '砂金'],
  gepard: ['gepard', '杰帕德'], destruction: ['trailblazer', 'destruction', 'trailblazerDestruction', 'trailblazer_destruction', '毁灭主角', '毁灭开拓者'],
  preservation: ['preservation', 'trailblazerPreservation', 'trailblazer_preservation', '存护主角', '存护开拓者'],
  remembrance: ['remembrance', 'trailblazerRemembrance', 'trailblazer_remembrance', '记忆主角', '记忆开拓者'],
  elation: ['elation', 'trailblazerElation', 'trailblazer_elation', '欢愉主角', '欢愉开拓者'],
  harmony: ['harmony', 'trailblazerHarmony', 'trailblazer_harmony', '同谐主角', '同谐开拓者'],
  herta: ['herta', '黑塔'], himeko: ['himeko', '姬子'], danheng: ['dan', 'danheng', 'danHeng', '丹恒'], bailu: ['bailu', '白露'],
  kafka: ['kafka', '卡芙卡'], silverwolf: ['silverWolf', 'silverwolf', 'silver_wolf', '银狼'], firefly: ['firefly', '流萤'], mimi: ['mimi', 'mem', '迷迷', '咪咪'],
  voidranger: ['voidranger', 'void', 'ranger', '虚卒'], stormbringer: ['stormbringer', 'storm', '风暴'], sparkle: ['sparkle', '花火'],
  sampo: ['sampo', '桑博'], bronya: ['bronya', '布洛妮娅'], gepardEnemy: ['gepardEnemy', 'gepard_enemy'], boss: ['boss', 'cocolia', '可可利亚'],
};

function canonical(type, def) {
  const text = String(type || 'destruction');
  for (const [key, names] of Object.entries(TYPES)) if (names.includes(text) || names.includes(def?.name)) return key;
  if (/preserv|存护/i.test(text)) return 'preservation';
  if (/remem|记忆/i.test(text)) return 'remembrance';
  if (/elation|欢愉/i.test(text)) return 'elation';
  if (/harmony|同谐/i.test(text)) return 'harmony';
  if (/trail|destr|主角/i.test(text)) return 'destruction';
  if (/march/i.test(text)) return 'march';
  if (/storm|mech/i.test(text)) return 'stormbringer';
  if (/boss|cocolia/i.test(text)) return 'boss';
  return text;
}

function lookup(source, type) {
  return Array.isArray(source) ? source.find((v) => v.id === type || v.type === type) : source?.[type];
}

export class BattleScene {
  constructor(container, { onCellClick, onGemClick, onCellHover } = {}) {
    this.container = container;
    this.callbacks = { onCellClick, onGemClick, onCellHover };
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-7.5, 7.5, 4.4, -4.4, 0.1, 100);
    this.camera.position.set(0, 12.5, 11.5);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.domElement.className = 'battle-canvas';
    this.renderer.domElement.setAttribute('aria-label', '星穹防线三维战场，点击棋格部署角色，点击星琼收集资源');
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:manipulation;outline:none;';
    container.appendChild(this.renderer.domElement);
    this.geometries = new Map();
    this.materials = new Map();
    this.textures = new Set();
    this.actorMeshes = new Map();
    this.pompomMeshes = new Map();
    this.gemMeshes = new Map();
    this.projectileMeshes = new Map();
    this.effectMeshes = new Map();
    this.warningMeshes = new Map();
    this.scene.add(new THREE.HemisphereLight(0xf0f7ff, 0x4b4063, .9));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(-4, 8, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x84c6ff, .5);
    rim.position.set(6, 5, -6);
    this.scene.add(rim);
    this.mapRoot = new THREE.Group();
    this.actorRoot = new THREE.Group();
    this.fxRoot = new THREE.Group();
    this.warningRoot = new THREE.Group();
    this.scene.add(this.mapRoot, this.actorRoot, this.fxRoot, this.warningRoot);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.tiles = [];
    this.time = 0;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    this.selected = null;
    this.hoverCell = null;
    this.floaters = [];
    this.hover = this.mesh('box', [1.15, .025, 1.03], 0x9df2ee, { transparent: true, opacity: .22, emissive: 0x5cd5d0, emissiveIntensity: .5 });
    this.hover.visible = false;
    this.scene.add(this.hover);
    this.boundMove = (event) => this.pointerMove(event);
    this.boundClick = (event) => this.pointerClick(event);
    this.boundLeave = () => { this.hover.visible = false; this.hoverCell = null; this.container.style.cursor = 'default'; this.callbacks.onCellHover?.(null); };
    this.renderer.domElement.addEventListener('pointermove', this.boundMove);
    this.renderer.domElement.addEventListener('pointerup', this.boundClick);
    this.renderer.domElement.addEventListener('pointerleave', this.boundLeave);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.setMap({ id: 'herta', rows: 6, cols: 10 });
    this.resize();
  }

  geometry(kind, args) {
    const cacheKey = `${kind}:${args.join(',')}`;
    if (this.geometries.has(cacheKey)) return this.geometries.get(cacheKey);
    let geometry;
    if (kind === 'box') geometry = new THREE.BoxGeometry(...args);
    else if (kind === 'sphere') geometry = new THREE.SphereGeometry(args[0] || 1, 14, 10);
    else if (kind === 'cap') geometry = new THREE.SphereGeometry(args[0] || 1, 16, 10, 0, Math.PI * 2, 0, Math.PI * .56);
    else if (kind === 'cylinder') geometry = new THREE.CylinderGeometry(...args);
    else if (kind === 'cone') geometry = new THREE.ConeGeometry(...args);
    else if (kind === 'torus') geometry = new THREE.TorusGeometry(...args);
    else if (kind === 'octa') geometry = new THREE.OctahedronGeometry(...args);
    else geometry = new THREE.SphereGeometry(.1, 8, 6);
    this.geometries.set(cacheKey, geometry);
    return geometry;
  }

  material(color, extras = {}) {
    const cacheKey = `${color}:${JSON.stringify(extras)}`;
    if (!this.materials.has(cacheKey)) this.materials.set(cacheKey, new THREE.MeshStandardMaterial({ color, roughness: .64, metalness: .1, ...extras }));
    return this.materials.get(cacheKey);
  }

  mesh(kind, args, color, extras) {
    return new THREE.Mesh(this.geometry(kind, args), this.material(color, extras));
  }

  part(parent, kind, args, color, position = [0, 0, 0], scale, extras) {
    const mesh = this.mesh(kind, args, color, extras);
    mesh.position.set(...position);
    if (scale) mesh.scale.set(...scale);
    parent.add(mesh);
    return mesh;
  }

  worldX(col) { return (Number(col) - (this.map.cols - 1) / 2) * PITCH_X; }
  worldZ(row) { return (Number(row) - (this.map.rows - 1) / 2) * PITCH_Z; }

  setMap(map, stage = null) {
    if (typeof map === 'string') map = { id: map };
    this.map = { id: 'herta', rows: 6, cols: 10, ...map };
    this.stage = stage;
    this.areaId = stage?.areaId || '';
    const p = { ...(PALETTES[this.map.id] || PALETTES.herta) };
    if (stage?.tint) {
      const tint = new THREE.Color(stage.tint);
      for (const key of ['tile', 'alt', 'floor']) p[key] = new THREE.Color(p[key]).lerp(tint, .19).getHex();
      p.edge = tint.getHex();
      p.bg = new THREE.Color(p.bg).lerp(tint, .045).getHex();
    }
    this.palette = p;
    this.scene.background = new THREE.Color(p.bg);
    this.scene.fog = new THREE.FogExp2(p.fog, .012);
    this.mapRoot.traverse((obj) => { if (obj.isPoints) { obj.geometry.dispose(); obj.material.dispose(); } });
    this.mapRoot.clear();
    this.tiles = [];
    this.floaters = [];
    const w = this.map.cols * PITCH_X;
    const d = this.map.rows * PITCH_Z;
    this.part(this.mapRoot, 'box', [w + .62, .35, d + .62], p.floor, [0, -.23, 0], null, { metalness: .4 });
    this.part(this.mapRoot, 'box', [w + .72, .05, d + .72], p.accent, [0, -.37, 0], null, { metalness: .55 });
    this.part(this.mapRoot, 'box', [w + .79, .2, d + .79], 0x101b29, [0, -.49, 0]);
    for (let row = 0; row < this.map.rows; row++) {
      for (let col = 0; col < this.map.cols; col++) {
        const water = (this.map.id === 'penacony' && (row === 2 || row === 3)) || stage?.decoration === 'water';
        const color = water ? ((row + col) % 2 ? 0x226475 : 0x2b7584) : ((row + col) % 2 ? p.tile : p.alt);
        const tile = this.part(this.mapRoot, 'box', [1.19, .1, 1.07], color, [this.worldX(col), -.005, this.worldZ(row)], null, { roughness: water ? .16 : .76, metalness: water ? .58 : .24 });
        tile.userData = { kind: 'tile', row, col };
        this.tiles.push(tile);
        if (col % 2 === 0) {
          const line = this.part(this.mapRoot, 'box', [.29, .008, .016], p.edge, [this.worldX(col), .052, this.worldZ(row) + .46], null, { emissive: p.edge, emissiveIntensity: .35 });
          line.userData.decoration = true;
        }
        if (water) {
          for (let a = 0; a < 2; a++) this.part(this.mapRoot, 'box', [.2 + a * .12, .007, .009], 0x7be1e4, [this.worldX(col) + .14 * (a ? -1 : 1), .06, this.worldZ(row) - .27 + a * .17], null, { transparent: true, opacity: .34 });
        }
      }
      const z = this.worldZ(row);
      this.part(this.mapRoot, 'box', [.13, .06, .55], p.edge, [-w / 2 - .16, .02, z], null, { emissive: p.edge, emissiveIntensity: .75 });
      this.part(this.mapRoot, 'box', [.13, .06, .55], 0xf17d98, [w / 2 + .16, .02, z], null, { emissive: 0xe04772, emissiveIntensity: .5 });
    }
    // Delicate perimeter lights keep the play grid legible against the architecture.
    for (const z of [-d / 2 - .17, d / 2 + .17]) {
      this.part(this.mapRoot, 'box', [w + .15, .025, .025], p.edge, [0, -.01, z], null, { emissive: p.edge, emissiveIntensity: .8 });
      for (let x = -w / 2; x <= w / 2; x += 1.5) this.part(this.mapRoot, 'box', [.07, .3, .08], p.accent, [x, -.03, z]);
    }
    const sceneryStart = this.mapRoot.children.length;
    if (this.map.id === 'penacony') this.buildDream(w, d, p);
    else if (this.map.id === 'amphoreus') this.buildTemple(w, d, p);
    else if (this.map.id === 'xianzhou') this.buildXianzhou(w, d, p);
    else if (this.map.id === 'planarcadia') this.buildPlanarcadia(w, d, p);
    else this.buildStation(w, d, p);
    if (stage && typeof this.buildArea === 'function') this.buildArea(w, d, p, stage);
    // Leave the six cart bays clear; landmarks stay beyond their left edge.
    const clearCartBays = (object) => {
      if (object.position.x < -w/2+.05) object.position.x -= .95;
      else if (object.isGroup) for (const child of object.children) clearCartBays(child);
    };
    for (const object of this.mapRoot.children.slice(sceneryStart)) clearCartBays(object);
    this.part(this.mapRoot,'box',[.86,.16,d+.12],p.floor,[this.worldX(-.82),-.055,0],null,{metalness:.45});
    for(let row=0;row<this.map.rows;row++) this.part(this.mapRoot,'box',[.75,.015,.88],p.accent,[this.worldX(-.82),.035,this.worldZ(row)],null,{metalness:.4,transparent:true,opacity:.35});
    this.makeStars();
    this.resize();
  }

  buildStation(w, d, p) {
    const orbit = this.part(this.mapRoot, 'torus', [8.5, .08, 8, 90, Math.PI * 1.14], 0x315366, [0, -1.3, -1.5], null, { metalness: .5, emissive: 0x153244, emissiveIntensity: .3 });
    orbit.rotation.set(Math.PI / 2.25, 0, .16);
    const orbit2 = this.part(this.mapRoot, 'torus', [8.65, .025, 6, 90, Math.PI * 1.14], p.edge, [0, -1.3, -1.5], null, { emissive: p.edge, emissiveIntensity: .5 });
    orbit2.rotation.copy(orbit.rotation);
    const planet = this.part(this.mapRoot, 'sphere', [1.6], 0x1c6a85, [-5.9, .8, -d / 2 - 2.6], null, { roughness: .82 });
    this.part(planet, 'torus', [2.05, .09, 8, 60], 0x789fac, [0, 0, 0]).rotation.set(1.15, .35, 0);
    this.part(planet, 'torus', [2.28, .035, 6, 60], 0xbaceb2, [0, 0, 0]).rotation.set(1.15, .35, 0);
    for (const x of [-w / 2 - .57, w / 2 + .57]) {
      for (const z of [-d / 2 - .1, d / 2 - .15]) {
        this.part(this.mapRoot, 'box', [.35, .58, .42], 0x294353, [x, .07, z]);
        this.part(this.mapRoot, 'box', [.24, .08, .32], 0x78d7df, [x, .41, z], null, { emissive: 0x77d9ed, emissiveIntensity: 1.2 });
      }
    }
    const mast = new THREE.Group();
    mast.position.set(w / 2 + 1.1, .1, -d / 2 - .3);
    this.mapRoot.add(mast);
    this.part(mast, 'cylinder', [.13, .24, 1.7, 6], 0x456173, [0, .6, 0]);
    const holo = this.part(mast, 'octa', [.5], p.edge, [0, 1.8, 0], null, { emissive: p.edge, emissiveIntensity: .3, wireframe: true });
    this.floaters.push(holo);
    this.part(this.mapRoot, 'box', [4.8, .08, .6], 0x1b3c50, [2, -.2, -d / 2 - 1.3]);
    for (let i = 0; i < 10; i++) this.part(this.mapRoot, 'box', [.19, .035, .37], 0x41677a, [i * .43, -.14, -d / 2 - 1.3]);
  }

  buildArea(w, d, p, stage) {
    // Subarea landmarks are stage scenery; character art remains original source imagery.
    const decor = stage.decoration || stage.theme;
    const area = new THREE.Group();
    area.name = `area:${stage.areaId}`;
    area.userData.areaId = stage.areaId;
    area.userData.decoration = decor;
    this.mapRoot.add(area);
    const back = -d / 2 - .75;
    const glow = { emissive:p.edge, emissiveIntensity:.55, transparent:true, opacity:.72, depthWrite:false };
    if (decor === 'water') {
      for (let i=0;i<7;i++) {
        const ring = this.part(area,'torus',[.45+i*.12,.014,5,48],p.edge,[-4.3+i*1.42,.073,this.worldZ(i%this.map.rows)],null,{...glow,opacity:.28});
        ring.rotation.x = Math.PI/2;
        ring.userData.ripple = i;
      }
      for (const side of [-1,1]) {
        this.part(area,'box',[.15,1.6,.4],0x749b98,[side*(w/2+.4),.65,back]);
        this.part(area,'cone',[.3,.75,5],p.edge,[side*(w/2+.4),1.8,back],null,glow);
      }
    } else if (decor === 'harbor') {
      for (let i=0;i<4;i++) {
        const ship=new THREE.Group(); ship.position.set((i%2?1:-1)*(w/2+.52),.35,-1.1+Math.floor(i/2)*2.2); ship.scale.setScalar(.45); ship.rotation.y=Math.PI/2; area.add(ship);
        this.part(ship,'sphere',[.62],p.accent,[0,0,0],[1.8,.32,.7]);
        this.part(ship,'cone',[.24,.65,4],p.edge,[.3,.31,0]).rotation.z=-.24;
        this.part(ship,'box',[1.8,.05,.12],p.edge,[0,.05,0],null,glow);
        this.floaters.push(ship); ship.userData.spinAxis='y';
      }
      for(const side of [-1,1]) for(let j=0;j<3;j++) this.part(area,'box',[.3,.4,.4],j%2?p.edge:p.accent,[side*(w/2+.5),.12,j*.62+.5]);
    } else if (decor === 'prison') {
      for(let i=0;i<13;i++) this.part(area,'box',[.055,1.75,.07],p.edge,[-w/2+i*w/12,.6,back],null,glow);
      this.part(area,'box',[w+.2,.13,.3],0x263548,[0,1.43,back]);
      for(const side of [-1,1]) this.part(area,'octa',[.35],0xbb7aee,[side*(w/2+.45),.8,0],null,{emissive:0x8954bd,emissiveIntensity:.7,wireframe:true});
    } else if (decor === 'arbor') {
      for(const side of [-1,1]) {
        const tree=new THREE.Group(); tree.position.set(side*(w/2+.66),0,-.25); tree.scale.setScalar(.68); area.add(tree);
        this.part(tree,'cylinder',[.12,.26,2,7],0x87734e,[0,.75,0]);
        for(let i=0;i<5;i++) this.part(tree,'sphere',[.64],i%2?0x83ac69:0xa7c97a,[Math.sin(i*2.3)*.6,1.6+i*.17,Math.cos(i*2.3)*.3],[1,.6,.8]);
        this.part(tree,'octa',[.18],p.accent,[.2,1.25,.35],null,{emissive:p.accent,emissiveIntensity:.8});
      }
      for(let i=0;i<5;i++) this.part(area,'torus',[.35+i*.1,.035,5,22,Math.PI],0x9db782,[-3+i*1.5,.03,back+.32]).rotation.x=Math.PI/2;
    } else if (decor === 'city') {
      for(let i=0;i<7;i++) {
        const height=.55+(i%3)*.28;
        this.part(area,'box',[.6,height,.55],i%2?p.floor:p.tile,[-4.5+i*1.5,height/2-.12,back]);
        for(let j=0;j<3;j++) this.part(area,'box',[.07,.13,.02],p.accent,[-4.68+i*1.5+j*.17,height*.55,back+.285],null,{emissive:p.accent,emissiveIntensity:.45});
      }
    } else if (decor === 'temple') {
      for(let i=0;i<3;i++) {
        const sigil=this.part(area,'torus',[.46+i*.11,.018,6,36],p.edge,[-3+i*3,1.2,back],null,glow);
        this.part(sigil,'octa',[.19],p.accent,[0,0,0],null,{wireframe:true,emissive:p.accent,emissiveIntensity:.3});
        this.floaters.push(sigil);
      }
    } else if (decor === 'dream') {
      for(let i=0;i<9;i++) {
        const fragment=this.part(area,'box',[.34,.5,.04],i%2?p.accent:p.edge,[-4+i, .6+(i%3)*.36,back],null,{metalness:.6});
        fragment.rotation.z=(i%3-1)*.35; this.floaters.push(fragment);
      }
    } else if (decor === 'carnival') {
      for(let i=0;i<11;i++) {
        const flag=this.part(area,'cone',[.16,.4,3],i%2?p.accent:p.edge,[-5+i,1.25+Math.sin(i*.31)*.26,back],null,glow);
        flag.rotation.z=Math.PI;
      }
    } else {
      for(let i=0;i<5;i++) {
        this.part(area,'box',[.9,.07,.53],p.floor,[-4+i*2,.28,back]);
        this.part(area,'box',[.69,.045,.32],p.edge,[-4+i*2,.33,back],null,glow);
      }
    }
  }

  buildDream(w, d, p) {
    for (const x of [-w / 2 - .7, w / 2 + .7]) {
      for (let j = 0; j < 3; j++) {
        const z = -d / 2 + j * 2.5;
        this.part(this.mapRoot, 'cylinder', [.18, .22, .16, 8], p.accent, [x, -.04, z]);
        this.part(this.mapRoot, 'cylinder', [.038, .065, 1.5, 8], p.accent, [x, .7, z]);
        this.part(this.mapRoot, 'sphere', [.14], 0xffe9ba, [x, 1.49, z], [1, 1.3, 1], { emissive: 0xffc76c, emissiveIntensity: .8 });
      }
    }
    const arch = this.part(this.mapRoot, 'torus', [2.1, .075, 8, 56, Math.PI], p.accent, [0, .15, -d / 2 - 1.2]);
    arch.rotation.z = 0;
    const clock = this.part(this.mapRoot, 'cylinder', [.75, .75, .14, 40], 0x263950, [0, 1.5, -d / 2 - 1.26]);
    clock.rotation.x = Math.PI / 2;
    const rim = this.part(this.mapRoot, 'torus', [.76, .06, 8, 40], p.accent, [0, 1.5, -d / 2 - 1.16]);
    this.part(rim, 'box', [.045, .56, .035], p.accent, [0, .17, .03]).rotation.z = -.5;
    this.part(rim, 'box', [.36, .035, .035], p.accent, [.16, 0, .04]);
    for (const x of [-4.8, 4.8]) {
      this.part(this.mapRoot, 'cylinder', [.3, .45, .55, 8], 0x61416c, [x, .1, -d / 2 - 1.1]);
      const bottle = this.part(this.mapRoot, 'sphere', [.47], 0xaa79bd, [x, .77, -d / 2 - 1.1], [1, 1.3, 1], { transparent: true, opacity: .75, metalness: .4 });
      this.part(bottle, 'cylinder', [.12, .14, .3, 12], p.accent, [0, .65, 0]);
    }
  }

  buildTemple(w, d, p) {
    for (const x of [-w / 2 - .65, w / 2 + .65]) {
      for (const z of [-d / 2 - .2, d / 2 - .5]) {
        const column = new THREE.Group();
        column.position.set(x, -.12, z);
        this.mapRoot.add(column);
        this.part(column, 'box', [.6, .17, .6], 0xd7dcc2, [0, 0, 0]);
        this.part(column, 'cylinder', [.18, .23, 1.6, 12], 0xe9e5cd, [0, .84, 0]);
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4;
          this.part(column, 'cylinder', [.018, .018, 1.4, 5], 0xa6b6a8, [Math.cos(a) * .191, .87, Math.sin(a) * .191]);
        }
        this.part(column, 'box', [.5, .16, .5], 0xf1e6bf, [0, 1.69, 0]);
        this.part(column, 'cylinder', [.27, .2, .11, 12], p.accent, [0, 1.8, 0]);
      }
    }
    this.part(this.mapRoot, 'box', [w + 2.2, .26, .7], 0xbbc9b7, [0, -.2, -d / 2 - .9]);
    for (let i = -3; i <= 3; i++) {
      this.part(this.mapRoot, 'box', [.33, .66 + Math.abs(i) * .1, .3], 0xd2d9c0, [i * 1.3, .08, -d / 2 - 1.05]);
      this.part(this.mapRoot, 'box', [.47, .09, .44], p.accent, [i * 1.3, .46 + Math.abs(i) * .05, -d / 2 - 1.05]);
    }
    const sun = this.part(this.mapRoot, 'torus', [1.05, .045, 8, 60], p.accent, [0, 1.95, -d / 2 - 2.1], null, { emissive: 0xeab768, emissiveIntensity: .75 });
    this.part(sun, 'octa', [.42], p.accent, [0, 0, 0], null, { emissive: 0xeab768, emissiveIntensity: .4 });
    this.floaters.push(sun);
    for (const x of [-w / 2 - .4, w / 2 + .4]) for (let k = 0; k < 3; k++) {
      this.part(this.mapRoot, 'sphere', [.24], 0x42675a, [x + .18 * Math.sin(k * 2), .1, k - .5], [1, .65, 1]);
    }
  }

  makeStars() {
    const geometry = new THREE.BufferGeometry();
    const points = [];
    for (let i = 0; i < 150; i++) {
      const a = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      const b = Math.sin(i * 269.5 + 183.3) * 43758.5453;
      const c = Math.sin(i * 91.7 + 73.9) * 43758.5453;
      points.push((a - Math.floor(a) - .5) * 36, (b - Math.floor(b)) * 8 - 2, (c - Math.floor(c)) * -19 - 4);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xd5eff6, size: .025, transparent: true, opacity: .6 }));
    this.mapRoot.add(stars);
  }

  buildXianzhou(w, d, p) {
    for (const side of [-1, 1]) {
      const pavilion = new THREE.Group();
      pavilion.position.set(side * (w / 2 + .73), -.05, -d / 2 + .8);
      this.mapRoot.add(pavilion);
      for (let level = 0; level < 3; level++) {
        const y = level * .64;
        const size = 1.0 - level * .16;
        this.part(pavilion, 'box', [size * .65, .48, size * .65], 0x8f735a, [0, y + .18, 0]);
        this.part(pavilion, 'cone', [size * .82, .34, 4], 0x548b83, [0, y + .51, 0]).rotation.y = Math.PI / 4;
        this.part(pavilion, 'box', [size * 1.1, .04, size * 1.1], p.accent, [0, y + .35, 0]);
        this.part(pavilion, 'box', [.13, .24, size * .69], 0xe2d79b, [0, y + .19, .012], null, { emissive: 0x9a855b, emissiveIntensity: .3 });
      }
      this.part(pavilion, 'cone', [.06, .42, 8], p.accent, [0, 2.01, 0]);
      for (let j = 0; j < 4; j++) {
        const z = -d / 2 + 1.6 + j * 1.12;
        this.part(this.mapRoot, 'cylinder', [.045, .055, .65, 8], 0xb5986b, [side * (w / 2 + .25), .29, z]);
        this.part(this.mapRoot, 'sphere', [.13], 0xffd89d, [side * (w / 2 + .25), .7, z], [.7, 1.1, .7], { emissive: 0xcb946a, emissiveIntensity: .5 });
      }
    }
    for (let i = 0; i < 8; i++) {
      const x = i * 1.8 - 6.3;
      this.part(this.mapRoot, 'sphere', [.8], 0x71928f, [x, -.5 + Math.sin(i) * .2, -d / 2 - 1.3], [1.5, .35, 1], { transparent: true, opacity: .38, depthWrite: false });
    }
    const moon = this.part(this.mapRoot, 'sphere', [.9], 0xd1e8d0, [3.9, 1.6, -d / 2 - 3], null, { emissive: 0x7c9d91, emissiveIntensity: .3 });
    this.part(moon, 'torus', [1.15, .035, 6, 40], p.accent, [0, 0, 0]).rotation.set(.75, .2, .3);
  }

  buildPlanarcadia(w, d, p) {
    const wheel = new THREE.Group();
    wheel.position.set(0, 1.18, -d / 2 - 1.2);
    this.mapRoot.add(wheel);
    this.part(wheel, 'torus', [1.48, .04, 6, 56], 0xe9a4d9, [0, 0, 0], null, { emissive: 0xbf6db1, emissiveIntensity: .7 });
    this.part(wheel, 'torus', [1.27, .016, 6, 56], 0x9bdfe9, [0, 0, 0], null, { emissive: 0x62c0ce, emissiveIntensity: .7 });
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      this.part(wheel, 'box', [.022, 2.88, .035], 0x7f80ba, [0, 0, 0]).rotation.z = angle;
      this.part(wheel, 'sphere', [.13], i % 2 ? 0x8ddfda : 0xe8a2cd, [Math.sin(angle) * 1.48, Math.cos(angle) * 1.48, .04], [1, 1.1, .6], { emissive: i % 2 ? 0x6baeb3 : 0x995b92, emissiveIntensity: .45 });
    }
    for (const side of [-1, 1]) {
      this.part(this.mapRoot, 'cylinder', [.12, .17, 1.45, 8], 0x4d4572, [side * (w / 2 + .55), .59, -.2]);
      this.part(this.mapRoot, 'cone', [.45, .4, 8], side === -1 ? 0xb075af : 0x70bfca, [side * (w / 2 + .55), 1.48, -.2]);
      for (let i = 0; i < 3; i++) {
        const x = side * (w / 2 + .4 + i * .14);
        const z = -d / 2 - .3 + i * .34;
        this.part(this.mapRoot, 'cylinder', [.009, .009, .7, 5], 0xd3bedc, [x, .43 + i * .13, z]);
        this.part(this.mapRoot, 'sphere', [.17], [0xe899c1, 0x85dbe0, 0xe8ce95][i], [x, .91 + i * .13, z], [1, 1.23, 1], { metalness: .35, roughness: .2 });
      }
    }
    this.floaters.push(wheel);
    wheel.userData.spinAxis = 'z';
  }

  buildActor(type, enemy = false, modelOverride = null) {
    const def = lookup(enemy ? ENEMIES : CHARACTERS, type) || lookup(CHARACTERS, type) || lookup(ENEMIES, type) || {};
    const key = canonical(def.model || type, def);
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    root.userData.body = body;
    root.userData.type = type;
    root.userData.key = key;
    root.userData.friendly = !enemy;
    body.rotation.y = getModelFacingYaw(null, !enemy);
    const base = this.part(root, 'cylinder', [.35, .38, .06, 28], enemy ? 0xad526c : 0x59b7c6, [0, .055, 0], null, { metalness: .4 });
    root.userData.base = base;
    const baseRing = this.part(root, 'torus', [.32, .018, 5, 24], enemy ? 0xff89a7 : 0x9ff8ef, [0, .09, 0], null, { emissive: enemy ? 0xc03465 : 0x45d3d2, emissiveIntensity: .7 });
    baseRing.rotation.x = Math.PI / 2;
    root.userData.baseRing = baseRing;
    const summonArt = { enemy_retainer:'tideBlade', enemy_comedian:'domescreen' }[type];
    const modelType = modelOverride || type;
    if (hasOfficialModel(modelType)) {
      root.userData.officialState = 'loading';
      root.userData.modelSourceType = modelType;
      if (type !== 'pompom') {
        this.makeHealth(root);
        if(type==='mimi')root.userData.health.group.position.y=.92;
        this.makeName(root, String(def.name || type).split('·')[0].replace(/开拓者/g, '主角'));
      }
      loadOfficialModel(modelType).then((model) => {
        if (root.userData.disposed) { disposeOfficialModel(model); return; }
        model.scale.setScalar(type==='mimi'?.6:type==='pompom'?.68:1.0);
        body.add(model);
        body.rotation.y = getModelFacingYaw(model, root.userData.friendly);
        root.userData.officialModel = model;
        root.userData.officialState = 'ready';
        if(root.userData.health)root.userData.health.group.position.y=(model.userData.metadata?.normalizedHeight||1.35)*model.scale.y+.14;
        if(model.userData.importFormat==='glb')root.userData.representation='原始 FBX 导出的真实 3D 模型';
        this.attachOfficialAccessory(root, model, type);
      }).catch((error) => {
        if (root.userData.disposed) return;
        root.userData.officialState = 'error';
        root.userData.officialError = error.message;
        this.container.dataset.modelError = `${def.name || type}: ${error.message}`;
        console.error(`官方模型加载失败 ${type}:`, error);
      });
      if (['preservation', 'remembrance', 'elation', 'harmony'].includes(type)) {
        const color = { preservation:0xee9d52, remembrance:0xd4b0f5, elation:0xe9a1cf, harmony:0xd9bf79 }[type];
        const radius = type === 'preservation' ? 1.38 : .41;
        const aura = this.part(root, 'torus', [radius, .014, 5, 48], color, [0, .068, 0], null, { emissive: color, emissiveIntensity: .5, transparent: true, opacity: type === 'preservation' ? .28 : .5, depthWrite: false });
        aura.rotation.x = Math.PI / 2;
        if (type === 'remembrance') {
          if (!hasOfficialModel('mimi') && OFFICIAL_PORTRAITS.mimi) {
            const texture = new THREE.TextureLoader().load(OFFICIAL_PORTRAITS.mimi); texture.colorSpace = THREE.SRGBColorSpace;
            const pet = new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));
            pet.position.set(-.3,.34,.15); pet.scale.set(.25,.34,1); body.add(pet); root.userData.companionArt = pet;
          }
        } else if (type === 'elation') {
          for (let i=0;i<3;i++) this.part(body, 'octa', [.055], color, [Math.cos(i*2.09)*.32, .7+i*.11, -.14], [1,.45,.2], { emissive: color, emissiveIntensity: .4 });
        }
      }
      return root;
    }
    const portraitType = summonArt || type;
    if (OFFICIAL_PORTRAITS[portraitType]) {
      const bossArt = String(type).startsWith('boss_');
      const monsterArt = def.isMonster || type.startsWith('enemy_');
      root.userData.officialState = 'illustration';
      root.userData.modelSourceType = portraitType;
      root.userData.representation = type === 'mimi' ? '迷迷原画投影（二维平面，活动装）' : `${summonArt ? (lookup(ENEMIES, portraitType)?.name || portraitType) + '·' : ''}原版立绘投影（二维平面）`;
      const texture = new THREE.TextureLoader().load(OFFICIAL_PORTRAITS[portraitType]);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
      const standee = new THREE.Sprite(material);
      standee.center.set(.5, 0);
      standee.renderOrder = 2;
      standee.position.set(0, .05, 0);
      const size = bossArt ? 2.25 : type === 'mimi' ? .84 : monsterArt ? 1.1 : 1.7;
      standee.scale.set(type === 'mimi' ? .65 : size, size, 1);
      body.add(standee);
      root.userData.standee = standee;
      this.makeHealth(root);
      root.userData.health.group.position.y = bossArt ? 2.35 : type === 'mimi' ? .95 : 1.48;
      this.makeName(root, `${def.name || type}·投影`);
      return root;
    }
    if (key !== 'mimi' || !OFFICIAL_PORTRAITS.mimi) {
      // Missing source assets remain explicit; never replace official characters with lookalikes.
      root.userData.officialState = 'missing';
      if(type!=='pompom')this.makeHealth(root);
      this.makeName(root, `${type==='pompom'?'帕姆':String(def.name || type).split('·')[0]}·待导入`);
      return root;
    }
    if (key === 'mimi') {
      root.userData.parts = this.makeMimi(body);
      this.makeHealth(root);
      return root;
    }
    if (key === 'preservation') {
      const aura = this.part(root, 'torus', [1.38, .012, 5, 48], 0xe8a265, [0, .065, 0], null, { emissive: 0xd88742, emissiveIntensity: .4, transparent: true, opacity: .3, depthWrite: false });
      aura.rotation.x = Math.PI / 2;
    }
    const colors = {
      robin: [0xc7b4ed, 0xf3f1fd, 0x8976cc], march: [0xf4b5ce, 0xaddcec, 0x3e71a1], aventurine: [0xe9d59a, 0x2c655c, 0xe9c76d],
      gepard: [0xe0cc8d, 0xdddfe9, 0x305b99], destruction: [0x9fa4b3, 0x333b4d, 0xd3b34d], preservation: [0x9fa4b3, 0x393942, 0xd48a42],
      remembrance: [0xb4b1c6, 0xf1e6f4, 0xbd89bc], harmony: [0xabaec0, 0x323548, 0xd7b565], elation: [0xaeacc0, 0x413658, 0xc786d0],
      herta: [0x8b6a5e, 0x715d9e, 0xe8dcee], himeko: [0xbd5155, 0xf7ebda, 0x433746], danheng: [0x243c45, 0x416662, 0xd2e7df],
      bailu: [0xb8a7e9, 0xc5eee9, 0x735c9b], kafka: [0x844965, 0x403143, 0xa86d89], silverwolf: [0xc2c3db, 0x4b496b, 0x93d9fa],
      firefly: [0xd4e0da, 0xf0f2df, 0x438c86], sparkle: [0x403a45, 0xc63f56, 0xf3d8cd], sampo: [0x527a9f, 0x47675d, 0xc0a26c],
      bronya: [0xd2dbe2, 0xc2d4e4, 0x46527b], gepardEnemy: [0xe0cc8d, 0xdddfe9, 0x305b99],
      voidranger: [0x554373, 0x37384d, 0xbfa46d], stormbringer: [0x655279, 0x61536e, 0xcb9ce9], boss: [0xdbcb92, 0x624d83, 0xc9b16e],
      blade: [0x2c3549, 0x263749, 0xa64651], sam: [0xdbe9e2, 0xdae4dc, 0x69c7b6], sunday: [0xb9c9df, 0xe6e6ed, 0x6d739a],
    };
    const [hair, outfit, accent] = colors[key] || [0xa8b2c5, 0x46566e, enemy ? 0xc77c97 : 0x8bdbdc];
    const skin = ['voidranger', 'stormbringer', 'sam'].includes(key) ? 0x6c6680 : 0xffdece;
    const dress = ['robin', 'herta', 'himeko', 'bailu', 'sparkle', 'remembrance', 'firefly', 'boss', 'bronya'].includes(key);
    const leftLeg = this.part(body, 'cylinder', [.075, .065, .25, 8], 0x35394c, [-.12, .24, 0]);
    const rightLeg = this.part(body, 'cylinder', [.075, .065, .25, 8], 0x35394c, [.12, .24, 0]);
    this.part(body, 'sphere', [.1], 0x303748, [-.12, .13, .04], [1, .7, 1.4]);
    this.part(body, 'sphere', [.1], 0x303748, [.12, .13, .04], [1, .7, 1.4]);
    this.part(body, dress ? 'cone' : 'cylinder', dress ? [.27, .41, 12] : [.19, .23, .39, 10], outfit, [0, .5, 0]);
    this.part(body, 'box', [.08, .31, .06], accent, [0, .54, .18]);
    this.part(body, 'sphere', [.19], outfit, [0, .69, 0], [1.08, .55, .8]);
    this.part(body, 'box', [.24, .035, .035], accent, [0, .39, .19]);
    const armL = new THREE.Group();
    const armR = new THREE.Group();
    armL.position.set(-.22, .65, 0);
    armR.position.set(.22, .65, 0);
    body.add(armL, armR);
    this.part(armL, 'cylinder', [.073, .062, .25, 8], outfit, [-.035, -.09, 0]).rotation.z = -.2;
    this.part(armR, 'cylinder', [.073, .062, .25, 8], outfit, [.035, -.09, 0]).rotation.z = .2;
    this.part(armL, 'sphere', [.075], skin, [-.065, -.23, .02]);
    this.part(armR, 'sphere', [.075], skin, [.065, -.23, .02]);
    const head = new THREE.Group();
    head.position.set(0, .96, .01);
    body.add(head);
    this.part(head, 'sphere', [.276], skin, [0, 0, 0], [1, 1.02, .94]);
    this.part(head, 'cap', [.292], hair, [0, .015, -.018], [1.04, 1.01, 1.03]);
    for (let i = 0; i < 5; i++) {
      const lock = this.part(head, 'cone', [.084, .2 + (i % 2) * .03, 6], hair, [(i - 2) * .085, .12 - Math.abs(i - 2) * .021, .226]);
      lock.rotation.z = Math.PI + (i - 2) * -.13;
      lock.scale.z = .6;
    }
    for (const side of [-1, 1]) {
      this.part(head, 'sphere', [.06], skin, [side * .269, -.025, -.005], [.45, 1.0, .75]);
      this.part(head, 'sphere', [.039], accent, [side * .11, -.017, .241], [.78, 1.5, .32]);
      this.part(head, 'sphere', [.018], 0x24243e, [side * .11, -.012, .252], [.8, 1.6, .35]);
      this.part(head, 'sphere', [.01], 0xffffff, [side * .11 - .006, .008, .264]);
      this.part(head, 'sphere', [.032], 0xf3aaae, [side * .17, -.085, .207], [1, .4, .3]);
    }
    this.part(head, 'sphere', [.021], 0xc8888d, [0, -.107, .25], [1, .33, .24]);
    if (['robin', 'herta', 'himeko', 'bailu', 'kafka', 'bronya', 'boss', 'remembrance', 'blade', 'sunday'].includes(key)) {
      for (const side of [-1, 1]) this.part(head, 'sphere', [.12], hair, [side * .231, -.12, -.075], [.8, 2.0, .92]);
      this.part(head, 'sphere', [.23], hair, [0, -.15, -.17], [1, 1.7, .65]);
    } else {
      for (const side of [-1, 1]) this.part(head, 'cone', [.095, .26, 6], hair, [side * .245, -.015, .045], [.85, 1, .8]).rotation.z = Math.PI + side * -.17;
    }
    this.addAccessories(key, body, head, armL, armR, hair, accent);
    root.userData.parts = { leftLeg, rightLeg, armL, armR, head };
    this.makeHealth(root);
    const name = def.shortName || def.name;
    if (name) this.makeName(root, String(name).split('·')[0].replace(/开拓者/g, '主角'));
    return root;
  }

  attachOfficialAccessory(root, model, type) {
    const config = type === 'trailblazer' ? { id: 'trailblazerBat', hand: 'rightHand', y: 0, z: -.25, length:.8, x:-Math.PI/2 }
      : type === 'preservation' ? { id: 'preservationLance', hand: 'rightHand', y: -.6, z: -.1, length:1.5, x:0 }
        : type === 'march' ? { id: 'marchBow', hand: 'leftHand', y: -.53, z: .1, length:1.1, x:0 } : null;
    if (!config || !hasOfficialModel(config.id)) return;
    const hand = model.userData.rig?.[config.hand];
    if (!hand) return;
    loadOfficialModel(config.id).then((weapon) => {
      if (root.userData.disposed) { weapon.skeleton.dispose(); return; }
      weapon.geometry.computeBoundingBox();
      const extent = weapon.geometry.boundingBox.getSize(new THREE.Vector3());
      model.updateMatrixWorld(true);
      const parentScale = hand.getWorldScale(new THREE.Vector3());
      const longest = Math.max(extent.x, extent.y, extent.z);
      weapon.scale.setScalar(config.length / Math.max(.001, longest * Math.max(parentScale.x, parentScale.y, parentScale.z)));
      weapon.position.set(0, config.y, .02);
      weapon.rotation.x = config.x;
      weapon.rotation.z = config.z;
      hand.add(weapon);
      root.userData.officialWeapons ||= [];
      root.userData.officialWeapons.push(weapon);
    }).catch((error) => console.error(`官方配件加载失败 ${config.id}:`, error));
  }

  addAccessories(key, body, head, armL, armR, hair, accent) {
    const gold = 0xd8be76;
    const rod = (parent, color, length, x, y, angle = 0, radius = .028) => {
      const result = this.part(parent, 'cylinder', [radius, radius * 1.1, length, 8], color, [x, y, .06]);
      result.rotation.z = angle;
      return result;
    };
    const shield = (parent, color, trim, x = -.12) => {
      this.part(parent, 'box', [.34, .52, .09], trim, [x, -.12, .16]);
      this.part(parent, 'box', [.28, .44, .105], color, [x, -.12, .175]);
      this.part(parent, 'octa', [.09], 0xdbeeff, [x, -.1, .247], [1, 1.4, .35], { emissive: 0x5aa6e8, emissiveIntensity: .3 });
    };
    const hat = (color, band) => {
      this.part(head, 'cylinder', [.29, .32, .055, 18], color, [0, .215, -.015], [1.18, 1, .85]);
      this.part(head, 'cylinder', [.2, .235, .2, 10], color, [0, .325, -.035], [1, 1, .87]);
      this.part(head, 'cylinder', [.237, .24, .06, 10], band, [0, .258, -.035], [1, 1, .87]);
    };
    if (key === 'robin') {
      const halo = this.part(head, 'torus', [.24, .016, 6, 28], gold, [0, .43, 0], null, { emissive: gold, emissiveIntensity: .3 });
      halo.rotation.x = Math.PI / 2.3;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) this.part(body, 'sphere', [.145], 0xe9e6fb, [side * (.25 + i * .075), .63 + i * .075, -.13], [.4, 1.8 - i * .2, .5]).rotation.z = side * -.7;
        this.part(head, 'sphere', [.08], 0xf7f0ff, [side * .295, -.05, .07], [.5, 1.8, .5]).rotation.z = side * -.45;
      }
      rod(armR, 0x60637d, .24, .085, -.14, -.4, .02);
      this.part(armR, 'sphere', [.051], 0xd1b276, [.13, -.015, .06]);
    } else if (key === 'march') {
      const bow = this.part(armR, 'torus', [.3, .028, 6, 24, Math.PI * 1.45], 0xa6f3ff, [.13, -.14, .1], [1, 1.25, 1], { emissive: 0x65c8e6, emissiveIntensity: .4 });
      bow.rotation.y = -.25;
      bow.rotation.z = -Math.PI / 1.5;
      rod(armR, 0xe3fbff, .7, .2, -.1, -.15, .007);
      this.part(head, 'box', [.08, .16, .07], 0x478daf, [-.2, .2, .13]).rotation.z = -.45;
      this.part(body, 'box', [.18, .13, .11], 0xefe5e4, [-.05, .53, .225]);
      this.part(body, 'cylinder', [.045, .045, .06, 12], 0x486a82, [-.05, .53, .30]).rotation.x = Math.PI / 2;
    } else if (key === 'aventurine') {
      hat(0x26453e, gold);
      this.part(head, 'sphere', [.05], 0x469f84, [.19, .31, .15]);
      this.part(head, 'box', [.24, .035, .035], gold, [0, -.025, .266]);
      this.part(body, 'cone', [.13, .35, 6], 0xeae0b8, [0, .59, .17], [1, 1, .28]).rotation.z = Math.PI;
      const dice = this.part(armL, 'box', [.26, .26, .26], 0x79c5b2, [-.18, -.05, .13], null, { metalness: .5 });
      dice.rotation.set(.12, .35, .15);
      for (const [x, y] of [[-.065, -.065], [.065, .065], [0, 0]]) this.part(dice, 'sphere', [.018], 0xffe3a1, [x, y, .139], [1, 1, .4]);
    } else if (key === 'gepard' || key === 'gepardEnemy') {
      shield(armL, 0x335a91, gold, -.13);
      this.part(body, 'box', [.18, .13, .25], 0xc2cfdb, [.22, .72, 0]);
      this.part(body, 'box', [.18, .13, .25], 0xc2cfdb, [-.22, .72, 0]);
    } else if (key === 'destruction') {
      const bat = rod(armR, 0xa9b9ce, .73, .23, -.025, -.68, .06);
      this.part(bat, 'cylinder', [.068, .048, .35, 10], 0xd3dce7, [0, .19, 0]);
      this.part(body, 'box', [.15, .45, .06], 0x252d3e, [-.16, .5, .17]).rotation.z = -.15;
      this.part(body, 'box', [.025, .39, .07], gold, [-.13, .5, .18]).rotation.z = -.15;
    } else if (key === 'preservation') {
      const spear = rod(armR, 0x4d4451, 1.18, .17, .12, -.18, .036);
      this.part(spear, 'cone', [.11, .38, 5], 0xf4a564, [0, .71, 0], null, { emissive: 0xe25a28, emissiveIntensity: .55 });
      this.part(spear, 'octa', [.1], 0xfbd884, [0, .53, 0], [1.4, .5, .6]);
      shield(armL, 0x735450, gold, -.05);
    } else if (key === 'remembrance') {
      const pet = new THREE.Group();
      pet.position.set(-.32, .15, .19);
      pet.scale.setScalar(.42);
      body.add(pet);
      this.makeMimi(pet);
      this.part(head, 'torus', [.065, .018, 5, 12], 0xf0c8e5, [.23, .16, .17]).rotation.y = -.4;
      rod(armR, 0xcc9fc5, .65, .15, .0, -.24, .025);
      this.part(armR, 'octa', [.1], 0xf4d4ec, [.22, .33, .06], null, { emissive: 0xb877b3, emissiveIntensity: .4 });
    } else if (key === 'elation') {
      this.part(armR, 'sphere', [.14], 0xe6d7ef, [.18, -.08, .12], [1, 1.15, .28]);
      for (const side of [-1, 1]) this.part(armR, 'sphere', [.026], 0x6b416f, [.18 + side * .05, -.06, .165], [1, .5, .4]);
      for (let i = 0; i < 3; i++) this.part(body, 'box', [.12, .18, .025], i % 2 ? 0xe1c794 : 0xb7a4da, [-.37 + i * .065, .71 + i * .09, .04]).rotation.z = -.3 + i * .4;
    } else if (key === 'harmony') {
      hat(0x303442, gold);
      this.part(head, 'sphere', [.1], 0xb65464, [.21, .43, .0], [.3, 1.7, .4]).rotation.z = -.35;
      rod(armR, gold, .68, .14, -.02, -.18, .02);
    } else if (key === 'herta') {
      const hammer = rod(armR, 0x7e668c, .8, .22, .02, -.4, .036);
      this.part(hammer, 'box', [.56, .3, .26], 0xb59cce, [0, .43, 0]);
      this.part(hammer, 'box', [.1, .34, .3], 0xe0cbdc, [-.24, .43, 0]);
      this.part(hammer, 'box', [.1, .34, .3], 0xe0cbdc, [.24, .43, 0]);
      this.part(head, 'torus', [.24, .03, 6, 20, Math.PI], 0xf0e4e7, [0, .04, .08]);
      this.part(head, 'octa', [.09], 0x9a79b5, [.22, .14, .13]);
    } else if (key === 'himeko') {
      this.part(body, 'sphere', [.18], 0xe9cfc4, [-.12, .59, .06], [.5, 1.8, 1.1]).rotation.z = .2;
      const cup = this.part(armR, 'cylinder', [.083, .06, .12, 12], 0xfff4df, [.095, -.17, .08]);
      this.part(cup, 'torus', [.053, .015, 6, 12], gold, [.09, .02, 0]);
      this.part(head, 'sphere', [.05], gold, [-.25, -.15, .08]);
    } else if (key === 'danheng') {
      const spear = rod(armR, 0x749b94, 1.25, .17, .13, -.18, .023);
      this.part(spear, 'cone', [.085, .34, 4], 0xa0eee1, [0, .75, 0], [.75, 1, .45], { emissive: 0x6cac9e, emissiveIntensity: .3 });
      this.part(body, 'box', [.16, .5, .06], 0x9bbeb2, [-.13, .48, .16]).rotation.z = -.14;
    } else if (key === 'bailu') {
      for (const side of [-1, 1]) {
        this.part(head, 'sphere', [.12], hair, [side * .28, .12, -.03]);
        this.part(head, 'cone', [.055, .19, 7], 0xbcebe0, [side * .17, .32, .02]).rotation.z = side * -.32;
      }
      this.part(body, 'sphere', [.15], 0xcbbdec, [0, .3, -.28], [1, .7, 1.8]);
      this.part(armR, 'sphere', [.12], 0xead6cf, [.11, -.08, .14], [.8, 1.1, .8]);
    } else if (key === 'kafka') {
      this.part(head, 'box', [.3, .065, .04], 0x392d48, [0, .18, .23]).rotation.z = -.1;
      this.part(armR, 'box', [.24, .08, .09], 0x6b5769, [.18, -.14, .1]);
      this.part(armR, 'box', [.07, .15, .07], 0x302d41, [.095, -.21, .1]);
      this.part(body, 'box', [.2, .44, .04], 0x743b59, [-.17, .5, -.08]).rotation.z = -.15;
    } else if (key === 'silverwolf') {
      this.part(head, 'sphere', [.14], hair, [0, .08, -.26], [.8, 1.7, 1.1]);
      for (const side of [-1, 1]) this.part(head, 'box', [.11, .085, .07], 0x565879, [side * .095, .2, .205]);
      const pad = this.part(armL, 'box', [.23, .29, .03], 0x76d6ee, [-.1, -.05, .22], null, { transparent: true, opacity: .74, emissive: 0x3fafd3, emissiveIntensity: .5 });
      pad.rotation.z = .18;
    } else if (key === 'firefly') {
      this.part(head, 'box', [.35, .045, .06], 0x404c55, [0, .14, .235]);
      for (const side of [-1, 1]) {
        this.part(body, 'sphere', [.2], 0x8ddecf, [side * .24, .56, -.18], [.3, 1.6, .75], { transparent: true, opacity: .72 }).rotation.z = side * -.55;
        this.part(head, 'octa', [.075], 0x6dc4ae, [side * .25, .16, .1], [.45, 1.3, .5]);
      }
      rod(armR, 0x75d3c2, .53, .18, -.04, -.5, .028);
    } else if (key === 'sparkle') {
      for (const side of [-1, 1]) this.part(head, 'sphere', [.105], hair, [side * .27, .0, -.04], [1, 1.6, .9]);
      const mask = this.part(head, 'sphere', [.15], 0xffead5, [.23, .2, .05], [.72, 1.0, .33]);
      mask.rotation.z = -.35;
      this.part(mask, 'box', [.08, .025, .02], 0xc24b59, [0, .015, .047]);
      this.part(body, 'box', [.36, .12, .08], gold, [0, .47, .19]);
      for (const side of [-1, 1]) this.part(body, 'box', [.2, .32, .17], 0xb94258, [side * .31, .51, 0]).rotation.z = side * .15;
    } else if (key === 'sampo') {
      this.part(body, 'box', [.23, .15, .05], 0xbd7d69, [0, .69, .14]).rotation.z = .15;
      rod(armR, 0xa8c5d0, .34, .13, -.14, -.5, .037);
    } else if (key === 'bronya') {
      this.part(head, 'sphere', [.14], hair, [.22, -.22, -.11], [.7, 1.8, .7]);
      rod(armR, 0x8394af, .88, .22, -.02, -.35, .04);
      this.part(body, 'box', [.15, .42, .06], 0xf1e7dc, [-.2, .5, -.05]);
    } else if (key === 'blade') {
      const blade = rod(armR, 0x45475a, .84, .22, .06, -.46, .041);
      this.part(blade, 'box', [.10, .56, .047], 0x708494, [0, .24, 0]);
      this.part(blade, 'box', [.026, .5, .054], 0xbd5a65, [.035, .26, 0]);
      this.part(blade, 'box', [.25, .042, .085], gold, [0, -.06, 0]);
      this.part(body, 'box', [.16, .45, .07], 0x692f46, [-.14, .5, .13]).rotation.z = -.12;
      this.part(head, 'box', [.03, .13, .055], 0xaa4851, [.24, -.11, .1]);
    } else if (key === 'sam') {
      this.part(head, 'sphere', [.286], 0xd1e0dc, [0, -.01, .015], [1, .89, 1.02]);
      this.part(head, 'box', [.3, .07, .1], 0x304c52, [0, -.01, .247]);
      this.part(head, 'box', [.24, .024, .11], 0x83eddc, [0, -.015, .257], null, { emissive: 0x55d9c4, emissiveIntensity: 1.2 });
      for (const side of [-1, 1]) {
        this.part(head, 'cone', [.07, .3, 4], 0x5e998f, [side * .2, .31, -.04]).rotation.z = side * -.27;
        this.part(body, 'box', [.24, .22, .26], 0xe1e9df, [side * .28, .72, -.02]).rotation.z = side * -.2;
        this.part(body, 'octa', [.14], 0x84d4c0, [side * .34, .53, .14], [.65, 1.5, .55], { emissive: 0x4fa28d, emissiveIntensity: .35 });
        this.part(body, 'sphere', [.15], 0x8cdfd2, [side * .28, .53, -.22], [.34, 1.7, .8], { transparent: true, opacity: .72 }).rotation.z = side * -.4;
      }
      this.part(body, 'octa', [.11], 0x6ff1d2, [0, .65, .23], [.65, 1.2, .4], { emissive: 0x3cb99c, emissiveIntensity: .7 });
      body.scale.set(1.14, 1.14, 1.1);
    } else if (key === 'sunday') {
      const halo = this.part(head, 'torus', [.28, .02, 6, 32], gold, [0, .34, -.09], null, { emissive: gold, emissiveIntensity: .35 });
      halo.rotation.x = Math.PI / 2.4;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) this.part(head, 'sphere', [.075], 0xd9e3ef, [side * (.29 + i * .034), -.07 + i * .042, -.015], [.45, 1.8, .6]).rotation.z = side * -.5;
        this.part(body, 'box', [.17, .5, .075], 0x687695, [side * .16, .49, -.04]).rotation.z = side * -.1;
      }
      this.part(body, 'box', [.055, .35, .06], gold, [0, .54, .195]);
      const staff = rod(armR, gold, .95, .2, .1, -.15, .023);
      this.part(staff, 'torus', [.13, .024, 6, 20], gold, [0, .56, 0]);
      body.scale.setScalar(1.13);
    } else if (key === 'voidranger' || key === 'stormbringer') {
      this.part(head, 'sphere', [.278], 0x40405a, [0, -.01, .015], [1, .88, 1]);
      this.part(head, 'box', [.3, .045, .08], 0xeab4f3, [0, .005, .254], null, { emissive: 0xb160d8, emissiveIntensity: .9 });
      for (const side of [-1, 1]) {
        this.part(head, 'cone', [.085, .32, 5], 0xaa90bd, [side * .21, .3, 0]).rotation.z = side * -.5;
        this.part(body, 'octa', [.17], 0x7a648d, [side * .27, .74, 0]);
      }
      const blade = rod(armR, 0x9e7daf, .69, .17, -.04, -.45, .04);
      this.part(blade, 'cone', [.08, .26, 4], 0xd5a0ea, [0, .44, 0]);
      if (key === 'stormbringer') {
        body.scale.set(1.2, 1.18, 1.1);
        for (const side of [-1, 1]) this.part(body, 'octa', [.2], 0x665473, [side * .33, .5, -.1], [1, 1.7, 1]);
      }
    } else if (key === 'boss') {
      for (let i = -2; i <= 2; i++) this.part(head, 'cone', [.055, .17 + (2 - Math.abs(i)) * .04, 5], gold, [i * .09, .31, .03]);
      for (const side of [-1, 1]) this.part(body, 'sphere', [.16], 0x6c4d88, [side * .23, .56, -.18], [.65, 2.0, 1]);
      const staff = rod(armR, gold, 1.0, .19, .1, -.2, .029);
      this.part(staff, 'octa', [.18], 0xbea2f5, [0, .61, 0], [1, 1.5, 1], { emissive: 0x9674da, emissiveIntensity: .6 });
      body.scale.setScalar(1.14);
    }
  }

  makeMimi(parent) {
    this.part(parent, 'sphere', [.25], 0xf6d7eb, [0, .36, 0], [1.1, 1.0, .9]);
    this.part(parent, 'sphere', [.17], 0xffe9f5, [0, .26, .15], [1.0, .8, .45]);
    const paws = [];
    const feet = [];
    for (const side of [-1, 1]) {
      this.part(parent, 'sphere', [.1], 0xe6bee8, [side * .2, .6, -.01], [.6, 1.75, .65]).rotation.z = side * -.45;
      this.part(parent, 'sphere', [.04], 0x795484, [side * .085, .4, .212], [.75, 1.1, .3]);
      this.part(parent, 'sphere', [.012], 0xffffff, [side * .085 - .007, .41, .224]);
      feet.push(this.part(parent, 'sphere', [.065], 0xeeb6d9, [side * .14, .17, .08], [1, .55, 1.2]));
      const paw = new THREE.Group();
      paw.position.set(side * .24, .33, .03);
      parent.add(paw);
      this.part(paw, 'sphere', [.089], 0xeeb6d9, [side * .01, -.045, .1], [.7, 1, 1.15]);
      paws.push(paw);
    }
    this.part(parent, 'octa', [.065], 0xd5acdd, [0, .59, .18], [1, 1.4, .5]);
    return { armL: paws[0], armR: paws[1], leftLeg: feet[0], rightLeg: feet[1] };
  }

  makeHealth(root) {
    const group = new THREE.Group();
    group.position.set(0, 1.49, 0);
    group.quaternion.copy(this.camera.quaternion);
    const back = this.part(group, 'box', [.48, .046, .009], 0x14212d, [0, 0, 0]);
    const fill = this.part(group, 'box', [.44, .026, .012], 0x97ead7, [0, 0, .01], null, { emissive: 0x529b85, emissiveIntensity: .3 });
    group.visible = false;
    root.add(group);
    root.userData.health = { group, fill, back };
  }

  makeName(root, name) {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(9, 21, 33, .77)';
    ctx.beginPath();
    ctx.roundRect(9, 3, 174, 39, 13);
    ctx.fill();
    ctx.fillStyle = '#e7ecf1';
    ctx.font = '500 26px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 7), 96, 23);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(texture);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
    sprite.scale.set(.86, .215, 1);
    sprite.position.set(0, .13, .41);
    sprite.renderOrder = 3;
    root.add(sprite);
    root.userData.nameSprite = sprite;
  }

  makeGem() {
    const root = new THREE.Group();
    const crystal = this.part(root, 'octa', [.15], 0xa5e8f1, [0, 0, 0], [.8, 1.5, .8], { metalness: .55, roughness: .2, emissive: 0x558fca, emissiveIntensity: .6 });
    const crown = this.part(root, 'torus', [.19, .011, 5, 20], 0xe2c48b, [0, 0, 0], null, { emissive: 0xc29a60, emissiveIntensity: .5 });
    crown.rotation.x = Math.PI / 2;
    const hit = this.part(root, 'sphere', [.33], 0xffffff, [0, 0, 0], null, { transparent: true, opacity: 0, depthWrite: false });
    root.userData.crystal = crystal;
    root.userData.hit = hit;
    return root;
  }

  makeEffect(effect) {
    const root = new THREE.Group();
    const color = effect.color || '#b1eaf3';
    const large = ['blast', 'charm', 'counter', 'spin', 'surprise'].includes(effect.type);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, depthWrite: false });
    const ring = new THREE.Mesh(this.geometry('torus', [large ? .43 : .23, .023, 5, 24]), material);
    ring.rotation.x = -Math.PI / 2;
    root.add(ring);
    for (let i = 0; i < (large ? 8 : 4); i++) {
      const spark = new THREE.Mesh(this.geometry('octa', [.045]), material);
      const angle = i * Math.PI * 2 / (large ? 8 : 4);
      spark.userData.direction = new THREE.Vector3(Math.cos(angle), .5 + (i % 3) * .15, Math.sin(angle));
      root.add(spark);
    }
    if (effect.text) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 80;
      const context = canvas.getContext('2d');
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = 'bold 38px "Microsoft YaHei", sans-serif';
      context.strokeStyle = 'rgba(8,17,29,.9)';
      context.lineWidth = 8;
      context.strokeText(effect.text, 128, 40);
      context.fillStyle = color;
      context.fillText(effect.text, 128, 40);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
      sprite.scale.set(1.15, .36, 1);
      sprite.position.y = 1.32;
      sprite.renderOrder = 6;
      root.add(sprite);
      root.userData.label = sprite;
    }
    root.userData.ring = ring;
    root.userData.material = material;
    if (effect.type==='hit') { ring.position.y=.58;ring.quaternion.copy(this.camera.quaternion); }
    if (effect.type==='shield') { ring.position.y=.6;ring.quaternion.copy(this.camera.quaternion); }
    if(effect.type==='spirit-whisper') {
      const start = new THREE.Vector3(this.worldX(effect.fromX??effect.x)-this.worldX(effect.x),.67,this.worldZ(effect.fromRow??effect.row)-this.worldZ(effect.row));
      const end = new THREE.Vector3(0,.67,0);
      const beam = new THREE.Mesh(this.geometry('cylinder',[.018,.018,1,6]),material);
      beam.position.copy(start).add(end).multiplyScalar(.5);
      beam.scale.y=start.distanceTo(end);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.clone().sub(start).normalize());
      root.add(beam);root.userData.whisperBeam=beam;
      ring.position.y=.5;ring.rotation.x=-Math.PI/2;ring.scale.setScalar(1.25);
      const crown = new THREE.Mesh(this.geometry('torus',[.32,.016,5,24]),material);crown.position.y=1.05;crown.rotation.x=Math.PI/2;root.add(crown);root.userData.whisperCrown=crown;
    }
    if (effect.type === 'link') this.makeLinkEffect(root, effect);
    return root;
  }

  makeLinkEffect(root, effect) {
    const actors = effect.actors || [];
    const kind = actors.includes('imbibitor') ? 'dragon' : actors.includes('permansor') ? 'shield' : 'flame';
    const colors = kind === 'dragon' ? [0x80eee3,0xffdf85] : kind === 'shield' ? [0x8cedb5,0xd5eb9d] : [0xff9b75,0x89f4d5];
    const materials = colors.map(color => new THREE.MeshBasicMaterial({color,transparent:true,opacity:.82,depthWrite:false,blending:THREE.AdditiveBlending}));
    root.userData.linkKind=kind;
    root.userData.linkMaterials=materials;
    const group=new THREE.Group(); root.add(group); root.userData.linkGroup=group;
    const part=(kind,args,material,position,scale)=>{
      const mesh=new THREE.Mesh(this.geometry(kind,args),material); mesh.position.set(...position); if(scale)mesh.scale.set(...scale); group.add(mesh); return mesh;
    };
    if(kind === 'dragon') {
      const segments=[];
      for(let i=0;i<28;i++) {
        const scale=.08+Math.sin((i+1)/29*Math.PI)*.21;
        segments.push(part('sphere',[scale],materials[0],[0,0,0],[1.3,.7,.85]));
      }
      const head=new THREE.Group(); group.add(head);
      const muzzle=new THREE.Mesh(this.geometry('cone',[.24,.78,6]),materials[0]); muzzle.rotation.z=-Math.PI/2; head.add(muzzle);
      for(const side of [-1,1]) {
        const horn=new THREE.Mesh(this.geometry('cone',[.055,.42,5]),materials[1]); horn.position.set(-.1,.27,side*.16);horn.rotation.z=.5;head.add(horn);
        const whisker=new THREE.Mesh(this.geometry('torus',[.35,.02,5,18,Math.PI]),materials[0]);whisker.position.set(.2,.04,side*.15);whisker.rotation.x=side*.7;head.add(whisker);
      }
      const slashes=[];
      for(let i=0;i<3;i++) {
        const slash=part('torus',[2.0+i*.4,.035+i*.018,6,50,Math.PI*.87],materials[1],[1.9,1,-.4],[1,1.35,1]);
        slash.rotation.set(.25,-.15,-.78+i*.19);slashes.push(slash);
      }
      root.userData.dragonSegments=segments;root.userData.dragonHead=head;root.userData.slashes=slashes;
      const blade=part('cone',[.19,4.1,4],materials[1],[2,1.7,0],[1,1,.18]);blade.rotation.z=-.5;root.userData.lightningBlade=blade;
    } else if(kind === 'shield') {
      const wards=[];
      for(let row=0;row<this.map.rows;row++) for(let col=0;col<4;col++) {
        const shield=part('torus',[.39,.035,6,6],materials[(row+col)%2],[this.worldX(col),.55,this.worldZ(row)]);
        wards.push(shield);
      }
      root.userData.wards=wards;
    } else {
      const flames=[];
      for(let row=0;row<this.map.rows;row++) for(let i=0;i<8;i++) {
        const flame=part('cone',[.12+(i%3)*.05,.7,5],materials[(row+i)%2],[-5+i*1.4,.5,this.worldZ(row)]);
        flame.rotation.z=-Math.PI*.35;flames.push(flame);
      }
      root.userData.flames=flames;
    }
    const shock=part('torus',[1,.06,6,56],materials[1],[0,.15,0]);shock.rotation.x=Math.PI/2;root.userData.shockwave=shock;
    root.userData.linkActors=actors;
    this.container.dataset.linkEffect=effect.linkId || kind;
  }

  updateLinkEffect(root, progress) {
    const u=root.userData;
    const p=Math.max(0,Math.min(1,progress));
    const intensity=Math.sin(p*Math.PI);
    for(const material of u.linkMaterials) material.opacity=Math.min(.8,intensity*1.3);
    u.shockwave.scale.setScalar(.4+p*6);
    if(u.linkKind==='dragon') {
      for(let i=0;i<u.dragonSegments.length;i++) {
        const x=-6+p*13-i*.16;
        u.dragonSegments[i].position.set(x,.8+Math.sin(x*1.5-p*7)*.24,Math.sin(x*.75-p*5)*.48);
      }
      u.dragonHead.position.copy(u.dragonSegments[0].position);u.dragonHead.position.x+=.2;
      u.lightningBlade.visible=p>.25&&p<.85;
      u.lightningBlade.rotation.z=-1.2+p*2.3;
      u.lightningBlade.position.y=2.5-p*2;
      u.slashes.forEach((slash,i)=>{slash.visible=p>.24+i*.07;slash.scale.setScalar(.4+p*1.3);slash.rotation.z=-.8+p*.6+i*.15;});
    } else if(u.linkKind==='shield') {
      for(let i=0;i<u.wards.length;i++) {const ward=u.wards[i];ward.scale.setScalar(.4+Math.min(p*3,1)*.7);ward.rotation.z=p*Math.PI/3+i*.1;}
    } else {
      for(let i=0;i<u.flames.length;i++) {const flame=u.flames[i];flame.position.y=.2+Math.abs(Math.sin(p*8+i*.43))*.85;flame.scale.y=.3+intensity*1.5;flame.position.x=-6+(i%8)*1.4+p*3;}
    }
  }

  removeEffect(root) {
    root.userData.material.dispose();
    for (const material of root.userData.linkMaterials || []) material.dispose();
    if (root.userData.label) {
      root.userData.label.material.map.dispose();
      root.userData.label.material.dispose();
    }
    root.removeFromParent();
  }

  updateWarnings(bossState) {
    const cells = new Set();
    if (bossState) {
      const casting = Number(bossState.castRemaining) > 0;
      const targetedCells = casting && bossState.warningCells?.length ? bossState.warningCells : (bossState.markedCells || []);
      if (casting && !bossState.warningCells?.length) for (const row of bossState.warningRows || []) if (Number.isInteger(row) && row >= 0 && row < this.map.rows) {
        for (let col = 0; col < this.map.cols; col++) cells.add(`${row}:${col}`);
      }
      for (const cell of targetedCells) {
        const row = Array.isArray(cell) ? cell[0] : cell.row;
        const col = Array.isArray(cell) ? cell[1] : (cell.col ?? cell.x);
        if (Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < this.map.rows && col >= 0 && col < this.map.cols) cells.add(`${row}:${col}`);
      }
    }
    for (const key of cells) {
      let warning = this.warningMeshes.get(key);
      if (!warning) {
        warning = this.mesh('box', [1.17, .013, 1.045], 0xed6687, { emissive: 0xe95379, emissiveIntensity: .6, transparent: true, opacity: .27, depthWrite: false });
        const [row, col] = key.split(':').map(Number);
        warning.position.set(this.worldX(col), .061, this.worldZ(row));
        this.warningRoot.add(warning);
        this.warningMeshes.set(key, warning);
      }
      warning.material.opacity = .18 + (1 + Math.sin(this.time * 8)) * .075;
    }
    for (const [key, warning] of this.warningMeshes) if (!cells.has(key)) { warning.removeFromParent(); this.warningMeshes.delete(key); }
  }

  render(engine, dt = 1 / 60) {
    this.time += Math.min(Number(dt) || 1 / 60, .1);
    const state = engine?.state || engine || {};
    const map = engine?.map || state.map;
    const stage = engine?.stage || state.stage;
    if (map && ((typeof map === 'string' ? map : map.id) !== this.map.id || (stage?.areaId || '') !== this.areaId || (map.cols && map.cols !== this.map.cols) || (map.rows && map.rows !== this.map.rows))) this.setMap(map, stage);
    const units = state.units || engine?.units || [];
    const enemies = state.enemies || engine?.enemies || [];
    this.updateWarnings(state.bossState || engine?.bossState || enemies.find((enemy) => enemy.bossState)?.bossState);
    const actors = [...units.map((u) => [u, false]), ...enemies.map((u) => [u, true])];
    const alive = new Set();
    for (const [actor, isEnemy] of actors) {
      if (actor.dead || actor.hp <= 0) continue;
      const id = `${isEnemy ? 'e' : 'u'}:${actor.id}`;
      alive.add(id);
      let object = this.actorMeshes.get(id);
      const phaseModel=actor.type==='boss_guiji'?[null,'boss_guiji_existence','boss_guiji_decay'][Math.min(2,Math.max(0,(actor.bossState?.phase||1)-1))]:null;
      const desiredModel=phaseModel&&hasOfficialModel(phaseModel)?phaseModel:actor.type;
      if (!object || object.userData.type !== actor.type || (object.userData.modelSourceType&&object.userData.modelSourceType!==desiredModel&&hasOfficialModel(desiredModel))) {
        if (object) this.removeActor(object);
        object = this.buildActor(actor.type, isEnemy,desiredModel);
        this.actorRoot.add(object);
        this.actorMeshes.set(id, object);
      }
      const x = Number.isFinite(actor.x) ? actor.x : actor.col;
      const worldX=this.worldX(x??0),worldZ=this.worldZ(actor.row??0);
      const previous=object.userData.previousPosition;
      const dx=previous?worldX-previous.x:0,dz=previous?worldZ-previous.z:0;
      const distance=Math.hypot(dx,dz);
      const teleported=distance>.6;
      const paused=state.status==='paused'||engine?.paused===true;
      const moving=!paused&&!teleported&&distance>1e-6;
      object.position.set(worldX,.04,worldZ);
      object.userData.previousPosition={x:worldX,z:worldZ};
      const seed = typeof actor.id === 'number' ? actor.id : String(actor.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const key = object.userData.key;
      const phase = this.time * (moving ? 9 : 2.7) + seed;
      const body = object.userData.body;
      // Mesh feet are grounded by the bone solver, never by translating the body
      // up and down. Only flat illustration projections retain a subtle idle float.
      body.position.y=object.userData.officialModel?0:Math.sin(phase)*.008;
      const friendly = Boolean(!isEnemy || actor.side === 'ally' || actor.side === 'friendly' || actor.charmed || actor.hypnotized);
      object.userData.friendly = Boolean(friendly);
      // Fixed lane-facing works on the first paused frame and after hypnosis.
      // Turn only the character, keeping nameplates and health bars readable.
      object.rotation.y=0;
      const previousYaw=body.rotation.y;
      body.rotation.y=getModelFacingYaw(object.userData.officialModel, friendly);
      object.userData.base.material = this.material(isEnemy && !friendly ? 0xad526c : 0x59b7c6, { metalness: .4 });
      object.userData.baseRing.material = this.material(isEnemy && !friendly ? 0xff89a7 : 0x9ff8ef, { emissive: isEnemy && !friendly ? 0xc03465 : 0x45d3d2, emissiveIntensity: .7 });
      const attack = Number(actor.attackAnim) || Number(actor.attackFlash) || 0;
      const hit = Number(actor.hitAnim) || Number(actor.hitFlash) || 0;
      const definition = lookup(isEnemy ? ENEMIES : CHARACTERS, actor.type) || {};
      if (object.userData.officialModel) {
        animateOfficialModel(object.userData.officialModel, { time:this.time+seed, dt, distance:moving?distance:0, speed:moving?distance/Math.max(.001,dt):0, attack, hit, moving, paused, teleported:teleported||Math.abs(previousYaw-body.rotation.y)>.01, kind:definition.kind||definition.behavior });
      }
      this.updateCombatFeedback(object,actor,definition,{attack,hit,dt,paused,friendly});
      body.rotation.z=object.userData.officialModel?0:attack>0?Math.sin(this.time*32)*.06:hit>0?Math.sin(this.time*50)*.04:0;
      const parts = object.userData.parts;
      if (parts) {
        parts.armR.rotation.z = attack > 0 ? -.7 - Math.sin(this.time * 30) * .7 : -.08 + Math.sin(phase) * .04;
        parts.armL.rotation.z = attack > 0 ? .24 + Math.sin(this.time * 25) * .2 : .08;
        parts.leftLeg.rotation.x = moving ? Math.sin(phase) * .24 : 0;
        parts.rightLeg.rotation.x = moving ? -Math.sin(phase) * .24 : 0;
        if (parts.head) parts.head.rotation.z = Math.sin(phase * .5) * .025;
      }
      const health = object.userData.health;
      const hp = Number.isFinite(actor.hp) ? actor.hp : 1;
      const fraction = Math.max(0, Math.min(1, hp / (actor.maxHp || hp || 1)));
      health.group.visible = fraction < .995;
      health.fill.scale.x = fraction;
      health.fill.position.x = -.22 * (1 - fraction);
      health.fill.material = this.material(fraction < .3 ? 0xff827f : 0x97ead7, { emissive: 0x529b85, emissiveIntensity: .3 });
      object.scale.setScalar(actor.isBoss ? 1.08 : 1);
    }
    for (const [id, mesh] of this.actorMeshes) if (!alive.has(id)) { this.removeActor(mesh); this.actorMeshes.delete(id); }
    this.syncPompoms(state.pompoms || engine?.pompoms || [], dt, state.status==='paused'||engine?.paused===true);
    const gemIds = new Set();
    for (const gem of state.gems || engine?.gems || []) {
      const id = gem.id;
      gemIds.add(id);
      let mesh = this.gemMeshes.get(id);
      if (!mesh) {
        mesh = this.makeGem();
        mesh.userData.id = id;
        mesh.userData.kind = 'gem';
        mesh.userData.hit.userData = { kind: 'gem', id };
        for (const part of mesh.children) part.userData = { ...part.userData, kind: 'gem', id };
        this.fxRoot.add(mesh);
        this.gemMeshes.set(id, mesh);
      }
      const seed = typeof id === 'number' ? id : String(id).length;
      mesh.position.set(this.worldX(gem.x ?? gem.col ?? 0), .63 + Math.sin(this.time * 3 + seed) * .055, this.worldZ(gem.row ?? 0));
      mesh.rotation.y += dt * 1.4;
    }
    for (const [id, mesh] of this.gemMeshes) if (!gemIds.has(id)) { mesh.removeFromParent(); this.gemMeshes.delete(id); }
    const projectileIds = new Set();
    for (const bullet of state.projectiles || engine?.projectiles || []) {
      projectileIds.add(bullet.id);
      let mesh = this.projectileMeshes.get(bullet.id);
      if (!mesh) {
        mesh = new THREE.Group();
        const color=bullet.color || 0xa6e6f4;
        const core=this.part(mesh,'octa',[.095],color,[0,0,0],[1.75,.65,.65],{emissive:color,emissiveIntensity:1.1,roughness:.2});
        for(let i=0;i<3;i++)this.part(mesh,'sphere',[.06],color,[-.16-i*.14,0,0],[2.4-i*.35,.65-i*.12,.65-i*.12],{emissive:color,emissiveIntensity:.8,transparent:true,opacity:.32-i*.08,depthWrite:false});
        mesh.userData.core=core;
        this.fxRoot.add(mesh);
        this.projectileMeshes.set(bullet.id, mesh);
      }
      mesh.position.set(this.worldX(bullet.x ?? 0), .61, this.worldZ(bullet.row ?? 0));
      mesh.rotation.y=(bullet.speed<0||bullet.side==='enemy')?Math.PI:0;
      if(state.status!=='paused')mesh.userData.core.rotation.x += dt * 7;
    }
    for (const [id, mesh] of this.projectileMeshes) if (!projectileIds.has(id)) { mesh.removeFromParent(); this.projectileMeshes.delete(id); }
    const effectIds = new Set();
    let shake = 0;
    for (const effect of state.effects || engine?.effects || []) {
      effectIds.add(effect.id);
      let mesh = this.effectMeshes.get(effect.id);
      if (!mesh) { mesh = this.makeEffect(effect); this.fxRoot.add(mesh); this.effectMeshes.set(effect.id, mesh); }
      const progress = 1 - Math.max(0, effect.ttl / (effect.maxTtl || 1));
      mesh.position.set(this.worldX(effect.x ?? 0), .13, this.worldZ(effect.row ?? 0));
      if (mesh.userData.linkKind) {
        this.updateLinkEffect(mesh, progress);
        if (!this.reducedMotion) shake = Math.max(shake, Math.sin(Math.max(0,Math.min(1,progress))*Math.PI)*.07);
      }
      mesh.userData.material.opacity = (1 - progress) * .8;
      mesh.userData.ring.scale.setScalar(mesh.userData.whisperBeam ? 1.1+progress*.6 : .6 + progress * 2);
      for (const child of mesh.children) if (child.userData.direction) child.position.copy(child.userData.direction).multiplyScalar(progress * .9);
      if (mesh.userData.label) {
        mesh.userData.label.position.y = 1.32 + progress * .5;
        mesh.userData.label.material.opacity = Math.min(1, (1 - progress) * 3);
      }
    }
    for (const [id, mesh] of this.effectMeshes) if (!effectIds.has(id)) { this.removeEffect(mesh); this.effectMeshes.delete(id); }
    for (let i = 0; i < this.floaters.length; i++) {
      const obj = this.floaters[i];
      obj.rotation[obj.userData.spinAxis || 'y'] += dt * .14;
    }
    this.hover.material.opacity = .2 + Math.sin(this.time * 4) * .04;
    this.camera.position.x = this.reducedMotion ? 0 : Math.sin(this.time * 43) * shake;
    this.camera.position.y = 12.5 + (this.reducedMotion ? 0 : Math.cos(this.time * 37) * shake * .5);
    this.renderer.render(this.scene, this.camera);
  }

  updateCombatFeedback(root,actor,definition,{attack,hit,dt,paused,friendly}) {
    let fx=root.userData.combatFx;
    if(!fx && !(attack>0||hit>0||actor.shield>0))return;
    if(!fx) {
      const group=new THREE.Group();root.add(group);
      if(actor.type==='mimi')group.scale.setScalar(.65);
      const material=(color,opacity=.8)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending});
      const attackMaterial=material(definition.color||actor.color||0xa9eafb),impactMaterial=material(0xffefc4),shieldMaterial=material(0x8ee7ff,.12);
      const slash=new THREE.Mesh(this.geometry('torus',[.5,.03,4,24,Math.PI*1.28]),attackMaterial);slash.rotation.x=-Math.PI/2;slash.position.set(0,.7,.44);group.add(slash);
      const muzzle=new THREE.Mesh(this.geometry('octa',[.15]),attackMaterial);muzzle.position.set(0,.67,.5);muzzle.scale.set(.6,.6,1.5);group.add(muzzle);
      const shield=new THREE.Mesh(this.geometry('octa',[1]),shieldMaterial);shield.position.y=.62;shield.scale.set(.52,.68,.52);shieldMaterial.wireframe=true;group.add(shield);
      const impact=new THREE.Group();impact.position.y=.67;group.add(impact);
      for(let i=0;i<4;i++) {
        const ray=new THREE.Mesh(this.geometry('octa',[.075]),impactMaterial);
        ray.position.set(Math.cos(i*Math.PI/2)*.12,Math.sin(i*Math.PI/2)*.12,.06);
        ray.scale.set(1.8,.5,.5);ray.rotation.z=i*Math.PI/2;impact.add(ray);
      }
      fx={group,slash,muzzle,shield,impact,materials:[attackMaterial,impactMaterial,shieldMaterial],attackAge:Infinity,hitAge:Infinity,shieldAge:Infinity,previousAttack:0,previousHit:0,previousShield:actor.shield||0};
      root.userData.combatFx=fx;
    }
    fx.group.rotation.y=friendly?Math.PI/2:-Math.PI/2;
    if(!paused) {
      if(attack>0&&attack>fx.previousAttack+1e-4)fx.attackAge=0;
      if(hit>0&&hit>fx.previousHit+1e-4)fx.hitAge=0;
      if((actor.shield||0)<fx.previousShield || (hit>fx.previousHit&&fx.previousShield>0))fx.shieldAge=0;
      fx.attackAge+=dt;fx.hitAge+=dt;fx.shieldAge+=dt;
      fx.previousAttack=attack;fx.previousHit=hit;fx.previousShield=actor.shield||0;
    }
    const kind=definition.kind||definition.behavior;
    const closeAttack=['melee','pet','spin','counter','taunt','charge'].includes(kind);
    const attackPower=Math.max(0,1-fx.attackAge/.25);
    fx.slash.visible=closeAttack&&attackPower>0;
    fx.muzzle.visible=!closeAttack&&attackPower>0;
    fx.slash.rotation.z=-.8+Math.min(1,fx.attackAge/.25)*1.8;
    fx.slash.scale.setScalar(.7+(1-attackPower)*.5);
    fx.muzzle.scale.set(.6*attackPower,.6*attackPower,1.5*attackPower);
    fx.materials[0].opacity=attackPower*(this.reducedMotion?.45:.8);
    const hitPower=Math.max(0,1-fx.hitAge/.2);
    fx.impact.visible=hitPower>0;fx.impact.scale.setScalar(.65+(1-hitPower)*1.1);fx.materials[1].opacity=hitPower*.85;
    const shieldPower=Math.max(0,1-fx.shieldAge/.38);
    fx.shield.visible=(actor.shield||0)>0||shieldPower>0;
    fx.materials[2].opacity=.055+shieldPower*.25;
  }

  syncPompoms(pompoms, dt, paused) {
    const alive = new Set();
    for (const pompom of pompoms) {
      const id = pompom.id ?? `pompom-${pompom.row}`;
      alive.add(id);
      let root = this.pompomMeshes.get(id);
      if (!root) {
        root = this.buildActor('pompom');
        root.userData.kind = 'pompom';
        const thrust = new THREE.Group();
        // A small propelled stand carries the genuine model at cart speed;
        // its short legs are not forced into an implausible high-frequency gait.
        for (const z of [-.19,.19]) {
          const trail = this.part(thrust,'cone',[.065,.5,10],0xf3cc76,[-.51,.11,z],[0,0,Math.PI/2],{emissive:0xf3ac54,emissiveIntensity:.8,transparent:true,opacity:.7,depthWrite:false});
          trail.userData.baseX = -.51;
        }
        root.add(thrust);
        root.userData.thrust = thrust;
        this.actorRoot.add(root);
        this.pompomMeshes.set(id,root);
      }
      const running = pompom.state === 'running';
      const spent = pompom.state === 'spent';
      root.userData.pompomState = pompom.state;
      root.position.set(this.worldX(spent ? -.82 : Number.isFinite(pompom.x) ? pompom.x : -.82),.04,this.worldZ(pompom.row));
      const body = root.userData.body;
      body.visible = !spent;
      body.rotation.y = getModelFacingYaw(root.userData.officialModel,true);
      root.userData.base.material = this.material(spent ? 0x3e4d58 : 0x9d7f48,{metalness:.4});
      root.userData.baseRing.material = this.material(spent ? 0x56646b : 0xffd88c,{emissive:spent ? 0x000000 : 0xe9a24c,emissiveIntensity:.6});
      root.userData.thrust.visible = running && !this.reducedMotion;
      if (!paused) {
        body.position.y = running && !this.reducedMotion ? .012*Math.sin(this.time*18) : 0;
        for (const trail of root.userData.thrust.children) trail.scale.y = .85 + .15*Math.sin(this.time*30+pompom.row);
      }
      if (root.userData.officialModel) animateOfficialModel(root.userData.officialModel,{time:this.time+pompom.row,dt,paused,moving:false});
    }
    for (const [id,root] of this.pompomMeshes) if (!alive.has(id)) { this.removeActor(root); this.pompomMeshes.delete(id); }
  }

  removeActor(root) {
    root.userData.disposed = true;
    if (root.userData.officialModel) disposeOfficialModel(root.userData.officialModel);
    for (const weapon of root.userData.officialWeapons || []) weapon.skeleton.dispose();
    if (root.userData.standee) { root.userData.standee.material.map.dispose(); root.userData.standee.material.dispose(); }
    if (root.userData.companionArt) { root.userData.companionArt.material.map.dispose(); root.userData.companionArt.material.dispose(); }
    for(const material of root.userData.combatFx?.materials||[])material.dispose();
    const sprite = root.userData.nameSprite;
    if (sprite) {
      this.textures.delete(sprite.material.map);
      sprite.material.map.dispose();
      sprite.material.dispose();
    }
    root.removeFromParent();
  }

  updatePointer(event) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  pointerMove(event) {
    this.updatePointer(event);
    const gem = this.raycaster.intersectObjects([...this.gemMeshes.values()], true).find((item) => item.object.userData.kind === 'gem');
    if (gem) { this.container.style.cursor = 'pointer'; this.hover.visible = false; return; }
    const intersection = this.raycaster.intersectObjects(this.tiles, false)[0];
    if (intersection) {
      const { row, col } = intersection.object.userData;
      this.hoverCell = { row, col };
      this.hover.position.set(this.worldX(col), .074, this.worldZ(row));
      this.hover.visible = Boolean(this.selected);
      this.container.style.cursor = this.selected ? 'crosshair' : 'default';
      this.callbacks.onCellHover?.({ row, col });
    } else this.boundLeave();
  }

  pointerClick(event) {
    if (event.button != null && event.button !== 0) return;
    this.updatePointer(event);
    const gem = this.raycaster.intersectObjects([...this.gemMeshes.values()], true).find((item) => item.object.userData.kind === 'gem');
    if (gem) { this.callbacks.onGemClick?.(gem.object.userData.id); return; }
    const intersection = this.raycaster.intersectObjects(this.tiles, false)[0];
    if (intersection) {
      const { row, col } = intersection.object.userData;
      this.callbacks.onCellClick?.(row, col);
    }
  }

  setSelected(type) {
    this.selected = type;
    this.hover.visible = Boolean(type && this.hoverCell);
  }

  resize() {
    if (!this.renderer) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;
    const boardWidth = (this.map?.cols || 9) * PITCH_X + 2.5;
    const boardHeight = (this.map?.rows || 5) * PITCH_Z * .73 + 1.55;
    const viewHeight = Math.max(boardHeight, boardWidth / aspect);
    this.camera.left = -viewHeight * aspect / 2;
    this.camera.right = viewHeight * aspect / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setQuality(quality = 'high') {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 1.6));
    this.resize();
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointermove', this.boundMove);
    this.renderer.domElement.removeEventListener('pointerup', this.boundClick);
    this.renderer.domElement.removeEventListener('pointerleave', this.boundLeave);
    for (const mesh of this.actorMeshes.values()) this.removeActor(mesh);
    for (const mesh of this.pompomMeshes.values()) this.removeActor(mesh);
    for (const mesh of this.effectMeshes.values()) this.removeEffect(mesh);
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.scene.traverse((obj) => { if (obj.isPoints) { obj.geometry.dispose(); obj.material.dispose(); } });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
