"""Preserve FBX meshes/rigs while packaging public HoyoToon materials as a GLB.

Usage: blender --background --factory-startup --python scripts/convert-fbx-blender.py --
  source.fbx bundle.json --id boss_phantylia --source https://assets.hoyotoon.com/
No scripts from downloaded files are executed. Original files are never modified.
"""
import argparse, array, base64, copy, hashlib, json, pathlib, re, struct, sys
import bpy

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def glb_json(data):
    if data[:4] != b'glTF':
        raise ValueError('Exporter did not produce GLB')
    length, chunk_type = struct.unpack_from('<II', data, 12)
    if chunk_type != 0x4E4F534A:
        raise ValueError('GLB JSON chunk missing')
    return json.loads(data[20:20 + length])

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input')
    parser.add_argument('output')
    parser.add_argument('--id', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--height', type=float, default=2.0)
    parser.add_argument('--max-texture', type=int, default=256)
    parser.add_argument('--locomotion', default='hover')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    source = pathlib.Path(args.input).resolve()
    output = pathlib.Path(args.output).resolve()
    if not source.is_file() or source.suffix.lower() != '.fbx':
        raise ValueError('Expected existing FBX source')
    if args.max_texture < 16 or args.max_texture > 4096:
        raise ValueError('Invalid texture limit')
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Blender 5.2 rejects progressive FBX morph channels before reading meshes.
    # Keep every original shape as an independent glTF target. This process-local
    # adapter does not alter Blender installation files or the source FBX bytes.
    from io_scene_fbx import import_fbx
    native_read_shapes = import_fbx.blen_read_shapes
    progressive_shapes = []
    def read_progressive_shapes(template, data, objects, mesh, scene):
        compatible = []
        for channel_id, shape, channel, assigned in data:
            if len(assigned) > 1:
                channel_copy = copy.deepcopy(channel)
                weights = import_fbx.elem_prop_first(import_fbx.elem_find_first(channel, b'FullWeights'))
                percent = import_fbx.elem_prop_first(import_fbx.elem_find_first(channel, b'DeformPercent'), default=0)
                if percent != 0:
                    raise ValueError('Progressive morph has nonzero default deformation; needs explicit interpolation adapter')
                for element in channel_copy.elems:
                    if element.id == b'FullWeights':
                        element.props[0] = array.array('d', [100.0])
                progressive_shapes.append({'mesh': mesh.name, 'shape': import_fbx.elem_name_ensure_class(shape, b'Geometry'), 'fullWeights': list(weights)})
                compatible.append((channel_id, shape, channel_copy, [assigned[0]]))
            else:
                compatible.append((channel_id, shape, channel, assigned))
        return native_read_shapes(template, compatible, objects, mesh, scene)
    import_fbx.blen_read_shapes = read_progressive_shapes
    bpy.ops.import_scene.fbx(filepath=str(source), use_anim=True, automatic_bone_orientation=False)
    meshes = [x for x in bpy.context.scene.objects if x.type == 'MESH']
    if not meshes:
        raise ValueError('FBX contains no mesh')
    source_vertices = sum(len(x.data.vertices) for x in meshes)
    source_triangles = sum(sum(len(p.vertices) - 2 for p in x.data.polygons) for x in meshes)
    source_bones = sum(len(x.data.bones) for x in bpy.context.scene.objects if x.type == 'ARMATURE')
    source_bone_names = [b.name for x in bpy.context.scene.objects if x.type == 'ARMATURE' for b in x.data.bones]
    source_actions = [x.name for x in bpy.data.actions]
    if progressive_shapes and source_actions:
        raise ValueError('Progressive morph animation found; refuse an inaccurate animation conversion')
    records = {}
    image_cache = {}
    material_records = []
    material_dir = source.parent / 'Materials'
    jsons = {x.stem: x for x in material_dir.glob('*.json')}
    images = {}
    for image_file in source.parent.rglob('*'):
        if image_file.suffix.lower() in ('.png', '.jpg', '.jpeg', '.tga', '.bmp'):
            images.setdefault(image_file.stem, []).append(image_file)
    used_materials = {m for obj in meshes for m in obj.data.materials if m}
    unresolved = []
    for material in used_materials:
        key = re.sub(r'\.\d{3}$', '', material.name)
        record_file = jsons.get(material.name) or jsons.get(key)
        if not record_file:
            unresolved.append({'material': material.name, 'reason': 'No matching original material JSON'})
            continue
        original = json.loads(record_file.read_text('utf-8-sig'))
        props = original.get('m_SavedProperties', {})
        texenvs = props.get('m_TexEnvs') or {}
        diffuse = None
        diffuse_key = None
        for property_name in ('_MainTex', '_BaseMap', '_BaseColorMap', '_DiffuseTex'):
            candidate = texenvs.get(property_name, {}).get('m_Texture', {})
            if candidate.get('Name') and not candidate.get('IsNull'):
                diffuse, diffuse_key = candidate['Name'], property_name
                break
        candidates = images.get(diffuse, [])
        if not diffuse and key == 'Mat_FaceMask' and not texenvs and not props.get('m_Colors'):
            # Exact original stencil helper material: source has no color map or
            # color parameters. Keep its geometry but do not paint an opaque mask
            # over the real textured face in glTF's non-stencil material system.
            material.use_nodes = True
            material.node_tree.nodes.clear()
            sink = material.node_tree.nodes.new('ShaderNodeOutputMaterial')
            shader = material.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
            shader.inputs['Alpha'].default_value = 0
            material.node_tree.links.new(shader.outputs['BSDF'], sink.inputs['Surface'])
            material.surface_render_method = 'BLENDED' if bpy.app.version < (4, 2, 0) else 'DITHERED'
            material_records.append({'material': material.name, 'sourceRecord': record_file.relative_to(source.parent).as_posix(), 'sourceRecordSha256': sha(record_file), 'diffuse': None, 'stencilHelper': True, 'adaptation': 'Original empty Mat_FaceMask stencil helper retained as transparent geometry; glTF does not reproduce original game stencil shader.'})
            continue
        if not diffuse or len(candidates) != 1:
            unresolved.append({'material': material.name, 'reason': 'Original material does not identify one existing diffuse texture', 'reference': diffuse})
            continue
        texture_file = candidates[0]
        relative = texture_file.relative_to(source.parent).as_posix()
        if relative not in image_cache:
            image = bpy.data.images.load(str(texture_file), check_existing=False)
            before = tuple(image.size)
            scale = min(1.0, args.max_texture / max(before))
            if scale < 1:
                image.scale(max(1, round(before[0] * scale)), max(1, round(before[1] * scale)))
            image.pack()
            image_cache[relative] = image
            records[relative] = {'source': relative, 'sha256': sha(texture_file), 'originalWidth': before[0], 'originalHeight': before[1], 'width': image.size[0], 'height': image.size[1], 'bindingEvidence': f'{record_file.name} m_SavedProperties.m_TexEnvs.{diffuse_key}.m_Texture.Name'}
        image = image_cache[relative]
        material.use_nodes = True
        nodes = material.node_tree.nodes
        nodes.clear()
        output_node = nodes.new('ShaderNodeOutputMaterial')
        shader = nodes.new('ShaderNodeBsdfPrincipled')
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        shader.inputs['Roughness'].default_value = 0.85
        shader.inputs['Metallic'].default_value = 0
        material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
        material.node_tree.links.new(shader.outputs['BSDF'], output_node.inputs['Surface'])
        floats = props.get('m_Floats') or {}
        # Game color-map alpha is often a shading channel. Only an explicit source
        # alpha-test property makes it opacity; using every alpha hides real bodies.
        alpha_test = floats.get('_AlphaTest', floats.get('_AlphaClip', 0)) > 0
        if alpha_test:
            material.node_tree.links.new(texture.outputs['Alpha'], shader.inputs['Alpha'])
            material.surface_render_method = 'DITHERED'
        material.use_backface_culling = bool(floats.get('_Cull', 0) == 2)
        material_records.append({'material': material.name, 'sourceRecord': record_file.relative_to(source.parent).as_posix(), 'sourceRecordSha256': sha(record_file), 'diffuse': relative, 'alphaTestFromSource': alpha_test})
    if unresolved:
        raise ValueError('Unresolved original materials: ' + json.dumps(unresolved, ensure_ascii=True))
    hidden_auxiliary_meshes = []
    for obj in meshes:
        if obj.data.materials and all(obj.data.materials[p.material_index] for p in obj.data.polygons):
            continue
        # This exact published FBX has an Effect mesh with vertex colors and no
        # source material slot. Its game effect shader is absent from the package.
        # Keep the source geometry/rig/color data, but do not invent its appearance.
        is_verified_effect = (args.id == 'maraSoldier' and obj.name == 'Effect'
                              and len(obj.data.materials) == 0
                              and len(obj.data.vertices) == 217
                              and sum(len(p.vertices) - 2 for p in obj.data.polygons) == 360
                              and sha(source) == '52dc255a354e25f3fa19f1c6569beebbdfce2446bd50a81565eccb75e56f66e2')
        if not is_verified_effect:
            raise ValueError(f'Mesh has no source material; no approved auxiliary treatment: {obj.name}')
        material = bpy.data.materials.new('wulong_hidden_unbound_Effect')
        material.use_nodes = True
        material.node_tree.nodes.clear()
        sink = material.node_tree.nodes.new('ShaderNodeOutputMaterial')
        shader = material.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        shader.inputs['Alpha'].default_value = 0
        material.node_tree.links.new(shader.outputs['BSDF'], sink.inputs['Surface'])
        material.surface_render_method = 'BLENDED' if bpy.app.version < (4, 2, 0) else 'DITHERED'
        color_records = []
        for color in obj.data.color_attributes:
            values = [list(x.color) for x in color.data]
            color_records.append({'name': color.name, 'domain': color.domain, 'dataType': color.data_type,
                                  'count': len(values), 'alphaMin': min(v[3] for v in values),
                                  'alphaMax': max(v[3] for v in values)})
        if obj.data.color_attributes:
            color = material.node_tree.nodes.new('ShaderNodeVertexColor')
            color.layer_name = obj.data.color_attributes[0].name
            material.node_tree.links.new(color.outputs['Color'], shader.inputs['Base Color'])
        obj.data.materials.append(material)
        record = {'mesh': obj.name, 'material': material.name, 'sourceMaterialSlots': 0,
                  'vertices': len(obj.data.vertices), 'triangles': 360,
                  'sourceVertexColors': color_records, 'geometryRetained': True,
                  'reason': 'Original FBX Effect mesh has no material slot; package supplies only Body/Leaf material records. Nontrivial vertex RGB and alpha=1 are present, but do not establish the missing game shader appearance. Kept transparent in this preview without inventing a diffuse texture or deleting geometry.',
                  'evidence': 'docs/model-material-evidence-monsters.json', 'sourceSha256': sha(source)}
        hidden_auxiliary_meshes.append(record)
        material_records.append({'material': material.name, 'sourceRecord': None, 'diffuse': None,
                                 'unboundAuxiliary': True, 'adaptation': record['reason']})
    glb_path = output.with_name('model.glb')
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format='GLB', export_yup=True,
                              export_skins=True, export_animations=True, export_all_influences=True,
                              export_apply=False, export_texcoords=True, export_normals=True,
                              export_materials='EXPORT', export_image_format='AUTO')
    binary = glb_path.read_bytes()
    doc = glb_json(binary)
    if any(x.get('uri') for x in doc.get('buffers', [])) or any(x.get('uri') for x in doc.get('images', [])):
        raise ValueError('GLB must contain all buffers and images')
    primitives = [p for m in doc.get('meshes', []) for p in m['primitives']]
    if any('material' not in p for p in primitives):
        raise ValueError('Exported primitive has an implicit default material')
    vertices = sum(doc['accessors'][p['attributes']['POSITION']]['count'] for p in primitives)
    triangles = sum(doc['accessors'][p['indices']]['count'] // 3 for p in primitives)
    bones = len({j for skin in doc.get('skins', []) for j in skin['joints']})
    exported_node_names = {x.get('name') for x in doc.get('nodes', [])}
    missing_bones = [name for name in source_bone_names if name not in exported_node_names]
    animations = [{'name': a.get('name', ''), 'channels': len(a.get('channels', []))} for a in doc.get('animations', [])]
    metadata = {'id': args.id, 'source': args.source, 'sourceKind': 'public-community-game-asset-catalog',
                'sourceFile': pathlib.Path(__import__('os').path.relpath(source, output.parent)).as_posix(), 'sourceFormat': 'fbx', 'sourceSha256': sha(source),
                'sha256': hashlib.sha256(binary).hexdigest(), 'vertices': vertices, 'triangles': triangles,
                'bones': bones, 'textures': records, 'materials': material_records,
                'sourceVertices': source_vertices, 'sourceTriangles': source_triangles, 'sourceBones': source_bones,
                'sourceActions': source_actions, 'animations': animations, 'forwardAxis': '+Z',
                'progressiveMorphTargets': progressive_shapes, 'hiddenAuxiliaryMeshes': hidden_auxiliary_meshes,
                'forwardAxisNeedsVisualCheck': True, 'locomotion': args.locomotion,
                'credits': 'Game assets © miHoYo / HoYoverse. Public game-asset catalogue provided by HoyoToon; not an official MMD distribution.',
                'originalComment': '', 'conversion': {'tool': 'Blender ' + bpy.app.version_string, 'maxTextureDimension': args.max_texture,
                'geometry': 'Original FBX meshes, UVs, skeletons and weights imported without mesh simplification or replacement.',
                'animations': 'All original FBX actions exported when present; none synthesized. Progressive morph geometry is retained as independent targets; original FBX progressive channel timing is not used when no source animation exists.',
                'materials': 'Original material JSON binds exact diffuse files. Unity game-specific toon/ramp/lighting shaders are approximated by standard GLTF materials; original shaders/textures are preserved beside the FBX.',
                'coordinateSystem': 'Blender FBX importer to glTF Y-up exporter; source object hierarchy and local transforms preserved.'},
                'validation': {'embeddedBuffers': True, 'embeddedImages': True, 'noMissingDiffuseTextures': True,
                'allPrimitivesHaveExplicitMaterials': True,
                'sourceTrianglesPreserved': source_triangles == triangles, 'sourceBonesPreserved': not missing_bones,
                'missingSourceBones': missing_bones}}
    if source_triangles != triangles or missing_bones:
        raise ValueError('Geometry or skeleton changed unexpectedly: ' + json.dumps(metadata['validation']))
    bundle = {'format': 'wulong-glb-bundle-v1', 'glb': base64.b64encode(binary).decode('ascii'), 'height': args.height, 'metadata': metadata}
    output.write_text(json.dumps(bundle, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    print('WULONG_GLB_RESULT ' + json.dumps({'id': args.id, 'vertices': vertices, 'triangles': triangles, 'bones': bones, 'animations': animations, 'textures': len(records), 'bytes': len(binary)}, ensure_ascii=True), flush=True)

if __name__ == '__main__':
    main()
