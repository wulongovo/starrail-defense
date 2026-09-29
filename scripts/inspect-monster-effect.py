"""Read-only inspection of the original Mara-Struck Soldier FBX effect helper."""
import bpy, hashlib, json, pathlib

root = pathlib.Path(__file__).resolve().parents[1]
source = root / 'public/assets/models/maraSoldier/source/Default/Art_W2_Abomi01_00.fbx'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(source), use_anim=True, automatic_bone_orientation=False)
records = []
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH':
        continue
    mesh = obj.data
    colors = []
    for color in mesh.color_attributes:
        values = [list(x.color) for x in color.data]
        colors.append({'name': color.name, 'domain': color.domain, 'dataType': color.data_type,
                       'count': len(values), 'firstValues': values[:8],
                       'rangeMin': [min(v[i] for v in values) for i in range(4)] if values else [],
                       'rangeMax': [max(v[i] for v in values) for i in range(4)] if values else []})
    records.append({'objectName': obj.name, 'meshName': mesh.name,
                    'vertices': len(mesh.vertices), 'polygons': len(mesh.polygons),
                    'triangles': sum(len(p.vertices)-2 for p in mesh.polygons),
                    'materialSlots': [s.material.name if s.material else None for s in obj.material_slots],
                    'polygonMaterialIndices': sorted(set(p.material_index for p in mesh.polygons)),
                    'uvLayers': [u.name for u in mesh.uv_layers], 'colorAttributes': colors,
                    'dimensions': list(obj.dimensions), 'boundBox': [list(p) for p in obj.bound_box],
                    'parent': obj.parent.name if obj.parent else None,
                    'modifiers': [{'name': m.name, 'type': m.type} for m in obj.modifiers],
                    'vertexGroups': [g.name for g in obj.vertex_groups],
                    'customProperties': dict(obj.items())})
evidence = {'source': source.relative_to(root).as_posix(), 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'blenderVersion': bpy.app.version_string, 'meshes': records,
            'materialJsonFiles': [p.name for p in (source.parent/'Materials').glob('*.json')],
            'sourceActions': [x.name for x in bpy.data.actions]}
out = root/'docs/model-material-evidence-monsters.json'
out.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), 'utf8')
print('WULONG_EFFECT_EVIDENCE '+json.dumps(evidence, ensure_ascii=True))
