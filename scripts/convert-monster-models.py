"""Convert downloaded original monster FBX packages without substituting geometry."""
from __future__ import annotations
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BLENDER = Path('D:/AIGC/.tools/blender-5.2.1/blender.exe')
REPORT = ROOT / 'docs/model-conversion-monsters.json'

def convert(entry: dict, catalogue: dict) -> dict:
    key = entry['id']
    model = catalogue[entry['monsterId']]
    matches = [ROOT / p for p in entry['fbxPaths'] if Path(p).stem == model['primaryArtName']]
    if len(matches) != 1:
        raise ValueError(f'Exact primary FBX not unique for {key}: {model["primaryArtName"]}')
    source = matches[0]
    output = ROOT / 'public/assets/models' / key / 'bundle.json'
    hovering = {'baryon', 'antibaryon', 'dragonfish', 'enemy_lotus'}
    quadrupeds = {'trampler', 'woodLupus', 'goldenHound', 'bubbleHound'}
    height = {'trampler': 1.7, 'woodLupus': 1.6, 'goldenHound': 1.15, 'bubbleHound': 1.1,
              'baryon': 0.8, 'antibaryon': 0.8, 'dragonfish': 0.95, 'enemy_lotus': 1.15}.get(key, 1.35)
    env = dict(os.environ, BLENDER_USER_RESOURCES=str(ROOT / '.cache/blender-user'))
    args = [str(BLENDER), '--background', '--factory-startup', '--python-exit-code', '1',
            '--python', str(ROOT / 'scripts/convert-fbx-blender.py'), '--', str(source), str(output),
            '--id', key, '--source', entry['indexUrl'], '--height', str(height), '--max-texture', '256',
            '--locomotion', 'hover' if key in hovering else 'quadruped' if key in quadrupeds else 'biped']
    result = subprocess.run(args, cwd=ROOT, env=env, capture_output=True, timeout=180)
    log = ROOT / '.cache/monster-models' / f'convert-{key}.log'
    log.write_bytes(result.stdout + b'\n' + result.stderr)
    if result.returncode != 0:
        raise RuntimeError(f'Converter failed ({result.returncode}); {log.relative_to(ROOT)}')
    bundle = json.loads(output.read_text('utf-8'))
    meta = bundle['metadata']
    if not all(meta['validation'][x] for x in ('embeddedBuffers', 'embeddedImages', 'noMissingDiffuseTextures',
                                             'sourceTrianglesPreserved', 'sourceBonesPreserved')):
        raise ValueError('Converter validation failed')
    record = {'id': key, 'monsterId': entry['monsterId'], 'status': 'converted', 'source': entry['indexUrl'],
              'sourceKind': entry['sourceKind'], 'sourceFormat': 'fbx',
              'sourceName': model['displayName'], 'primaryArtName': model['primaryArtName'],
              'sourceChineseName': model.get('externalRefs', {}).get('nanoka', {}).get('summary', {}).get('translations', {}).get('zh'),
              'fbxPath': source.relative_to(ROOT).as_posix(), 'fbxSha256': meta['sourceSha256'],
              'bundlePath': output.relative_to(ROOT).as_posix(),
              'bundleSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
              'glbSha256': meta['sha256'], 'vertices': meta['vertices'], 'triangles': meta['triangles'],
              'bones': meta['bones'], 'textureCount': len(meta['textures']), 'animations': meta['animations'],
              'validation': meta['validation'], 'browserRenderVerified': False,
              'hiddenAuxiliaryMeshes': meta.get('hiddenAuxiliaryMeshes', []),
              'materialLimitations': meta['conversion']['materials']}
    print(key, 'CONVERTED', record['vertices'], 'vertices', record['triangles'], 'tris', record['bones'], 'bones', flush=True)
    return record

def main() -> None:
    sys.stdout.reconfigure(encoding='utf-8')
    selected = set(sys.argv[1:])
    entries = json.loads((ROOT / 'docs/model-expansion-monsters.json').read_text('utf-8'))
    rows = json.loads((ROOT / '.cache/monster-models/hoyotoon-hsr-monsters.json').read_text('utf-8'))['snapshot']['page']['items']
    catalogue = {x['monsterId']: x for x in rows}
    records = {x['id']: x for x in json.loads(REPORT.read_text('utf-8'))} if REPORT.exists() else {}
    pending = [e for e in entries if e['status'] in ('downloaded-fbx', 'converted') and (not selected or e['id'] in selected)
               and (selected or records.get(e['id'], {}).get('status') != 'converted')]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        tasks = {pool.submit(convert, e, catalogue): e['id'] for e in pending}
        for future in concurrent.futures.as_completed(tasks):
            key = tasks[future]
            try:
                records[key] = future.result()
            except Exception as exc:
                records[key] = {'id': key, 'status': 'conversion-failed', 'error': str(exc)}
                print(key, 'FAILED', str(exc), flush=True)
            REPORT.write_text(json.dumps(list(records.values()), ensure_ascii=False, indent=2), 'utf-8')

if __name__ == '__main__':
    main()
