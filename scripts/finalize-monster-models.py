"""Join source evidence with actual conversion evidence; never invent success."""
from __future__ import annotations
import base64
import hashlib
import json
from pathlib import Path
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main() -> None:
    report = ROOT / 'docs/model-expansion-monsters.json'
    sources = json.loads(report.read_text('utf-8'))
    conversions = {x['id']: x for x in json.loads((ROOT / 'docs/model-conversion-monsters.json').read_text('utf-8'))}
    for entry in sources:
        result = conversions.get(entry['id'])
        if not result or result.get('status') != 'converted':
            continue
        for original in entry['files']:
            path = ROOT / original['path']
            if path.stat().st_size != original['size'] or sha(path) != original['sha256']:
                raise ValueError(f'Original file changed: {path}')
        bundle_path = ROOT / result['bundlePath']
        bundle = json.loads(bundle_path.read_text('utf-8'))
        if bundle['format'] != 'wulong-glb-bundle-v1':
            raise ValueError(f'Wrong model format: {entry["id"]}')
        if sha(bundle_path) != result['bundleSha256']:
            raise ValueError(f'Bundle changed since conversion: {entry["id"]}')
        glb = base64.b64decode(bundle['glb'])
        if hashlib.sha256(glb).hexdigest() != result['glbSha256']:
            raise ValueError('GLB hash mismatch')
        length, kind = struct.unpack_from('<II', glb, 12)
        doc = json.loads(glb[20:20 + length])
        if any(x.get('uri') for x in doc.get('images', []) + doc.get('buffers', [])):
            raise ValueError('GLB depends on external assets')
        snapshot = ROOT / '.cache/monster-models' / (entry['id'] + '-source-snapshot.zip')
        with zipfile.ZipFile(snapshot, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            base = ROOT / 'public/assets/models' / entry['id'] / 'source'
            for item in entry['files']:
                path = ROOT / item['path']
                z.write(path, path.relative_to(base).as_posix())
            z.write(base / 'SOURCE.json', 'SOURCE.json')
        entry.update(result)
        entry['sourceSha256'] = result['fbxSha256']
        entry['pmxSha256'] = None  # Original is FBX; no fabricated PMX provenance.
        entry['archive'] = snapshot.relative_to(ROOT).as_posix()
        entry['archiveSha256'] = sha(snapshot)
        entry['archiveKind'] = 'locally-created-lossless-snapshot-of-published-original-files'
        entry['verification'].update({'converted': True, 'rawFbxUnchanged': True,
                                      'allSourceHashesVerified': True, 'embeddedImagesAndBuffers': True})
        if entry['id'] == 'enemy_retainer':
            entry['adaptation'] = 'The earlier fictional label 演算眷属 is replaced by exact source enemy 天谴斗士 / Furiae Warrior (4012010), a documented summon of Lycurgus. Stable gameplay id enemy_retainer is preserved.'
            entry['identityEvidence'] = 'docs/boss-lycurgus-source.html:1938-1942 lists 天谴斗士, 黑潮蚀刃, 黑潮蚀斧 as summons; catalogue primaryArtName Art_W4_Strongman_00.'
    report.write_text(json.dumps(sources, ensure_ascii=False, indent=2), 'utf-8')
    converted = [x for x in sources if x.get('status') == 'converted']
    print(f'WULONG_MONSTER_ASSET_AUDIT {len(converted)}/{len(sources)} converted; original hashes, GLB embedded assets, source snapshots verified.')

if __name__ == '__main__':
    main()
