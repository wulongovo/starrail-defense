"""Render an imported GLB from three angles for identity/orientation QA only."""
import argparse, pathlib, sys
import bpy
from mathutils import Vector

p=argparse.ArgumentParser();p.add_argument('glb');p.add_argument('out');a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(pathlib.Path(a.glb).resolve()))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
points=[o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
low=Vector(tuple(min(v[i] for v in points) for i in range(3)));high=Vector(tuple(max(v[i] for v in points) for i in range(3)))
center=(low+high)/2;size=max(high-low)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('QA World');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(0.18,0.2,0.27,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=0.5
scene.view_settings.view_transform='Standard'
for loc,energy in [((2,-3,4),1200),((-3,-2,2),800),((0,3,3),1000)]:
 d=bpy.data.lights.new('QA area','AREA');d.energy=energy*size*size;d.shape='DISK';d.size=size*3;o=bpy.data.objects.new('QA area',d);scene.collection.objects.link(o);o.location=center+Vector(loc)*size;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
camera_data=bpy.data.cameras.new('QA camera');camera_data.type='ORTHO';camera_data.ortho_scale=size*1.13
camera=bpy.data.objects.new('QA camera',camera_data);scene.collection.objects.link(camera);scene.camera=camera
prefix=pathlib.Path(a.out).resolve();prefix.parent.mkdir(parents=True,exist_ok=True)
for name,direction in [('front',(0,-3,.1)),('side',(3,-.2,.1)),('back',(0,3,.1))]:
 camera.location=center+Vector(direction)*size;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.clip_end=size*20
 scene.render.filepath=str(prefix.with_name(prefix.name+'-'+name+'.png'));bpy.ops.render.render(write_still=True)
print('QA_BOUNDS',tuple(low),tuple(high),flush=True)
