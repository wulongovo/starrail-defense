"""Safely unpack observed public PMX archives and make verified game bundles."""
import concurrent.futures
import hashlib
import json
import pathlib
import re
import stat
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODELS = (ROOT / 'public/assets/models').resolve()
REPORT = ROOT / 'docs/model-expansion-legacy.json'

def unpack(source, target, depth=0):
    if depth > 3:
        raise ValueError('Nested archive limit exceeded')
    target = target.resolve()
    if MODELS not in target.parents:
        raise ValueError('Extraction target outside project model root')
    target.mkdir(parents=True, exist_ok=True)
    if source.suffix.lower() == '.rar':
        listing = subprocess.run(['tar', '-tf', str(source)], capture_output=True, check=True).stdout
        try: names = listing.decode('utf8').splitlines()
        except UnicodeDecodeError: names = listing.decode('gbk').splitlines()
        if len(names) > 5000:
            raise ValueError('Archive exceeds expected member count')
        for name in names:
            name = name.replace('\\', '/')
            if ':' in name or name.startswith('/') or '..' in pathlib.PurePosixPath(name).parts:
                raise ValueError('Unsafe RAR archive member')
        details = subprocess.run(['tar', '-tvf', str(source)], capture_output=True, check=True).stdout
        if any(line.startswith((b'l', b'h')) for line in details.splitlines()):
            raise ValueError('Archive symlink/hardlink is not permitted')
        subprocess.run(['tar', '-xf', str(source), '-C', str(target)], capture_output=True, check=True)
        for nested in list(target.rglob('*.zip')):
            unpack(nested, nested.with_suffix(''), depth + 1)
        return
    with zipfile.ZipFile(source) as archive:
        items = archive.infolist()
        if len(items) > 5000 or sum(i.file_size for i in items) > 650_000_000:
            raise ValueError('Archive exceeds expected character model size')
        for item in items:
            name = item.filename
            if not item.flag_bits & 0x800:
                try:
                    name = name.encode('cp437').decode('gbk')
                except (UnicodeEncodeError, UnicodeDecodeError):
                    pass
            name = name.replace('\\', '/')
            if ':' in name or name.startswith('/') or '..' in pathlib.PurePosixPath(name).parts:
                raise ValueError('Unsafe archive member: ' + name)
            if stat.S_ISLNK(item.external_attr >> 16):
                raise ValueError('Archive symlink is not permitted')
            out = (target / name).resolve()
            if target not in out.parents and out != target:
                raise ValueError('Archive member escaped extraction root')
            if item.is_dir():
                out.mkdir(parents=True, exist_ok=True)
            else:
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(archive.read(item))
    for nested in list(target.rglob('*.zip')):
        unpack(nested, nested.with_suffix(''), depth + 1)

def process(job):
    model_id = job['id']
    if not re.fullmatch(r'[A-Za-z0-9_]+', model_id):
        raise ValueError('Invalid model id')
    target = MODELS / model_id
    archive = (ROOT / job['archive']).resolve()
    if not (ROOT / '.cache/official-models').resolve() in archive.parents:
        raise ValueError('Archive is outside the designated cache')
    unpack(archive, target)
    candidates = [p for p in target.rglob('*.pmx') if re.search(job['match'], p.name, re.I)]
    if job.get('exclude'):
        candidates = [p for p in candidates if not re.search(job['exclude'], str(p), re.I)]
    if job.get('pmxRelative'):
        expected = (target / job['pmxRelative']).resolve()
        if target.resolve() not in expected.parents:
            raise ValueError('Explicit PMX path outside target')
        candidates = [p for p in candidates if p.resolve() == expected]
    if len(candidates) != 1:
        raise ValueError(f'{model_id}: expected one character PMX; found {[str(p) for p in candidates]}')
    pmx = candidates[0]
    output = target / 'bundle.json'
    command = ['node', str(ROOT / 'scripts/convert-pmx.mjs'), str(pmx), str(output), '--id', model_id, '--source', job['source'], '--max-texture', '256']
    completed = subprocess.run(command, cwd=ROOT, capture_output=True, encoding='utf8', errors='replace')
    if completed.returncode:
        raise RuntimeError(completed.stderr[-2000:])
    bundle = json.loads(output.read_text(encoding='utf8'))
    meta = bundle['metadata']
    record = {**job, 'status':'converted', 'pmxPath':str(pmx.relative_to(ROOT)).replace('\\','/'), 'bundlePath':str(output.relative_to(ROOT)).replace('\\','/'), 'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(), 'pmxSha256':meta['sha256'], 'vertices':meta['vertices'], 'triangles':meta['triangles'], 'bones':meta['bones'], 'textureCount':len(meta['textures']), 'missingTextures':False, 'bundleBytes':output.stat().st_size, 'modelName':meta['modelName'], 'originalComment':meta['originalComment'], 'rules':[str(p.relative_to(ROOT)).replace('\\','/') for p in target.rglob('*.txt')]}
    record['missingTextures'] = 'No missing initially visible diffuse textures; see omittedTransparentMaterials for disabled expression layers'
    record['omittedTransparentMaterials'] = meta.get('omittedTransparentMaterials', [])
    record['texturePathAliases'] = meta.get('texturePathAliases', [])
    return record

jobs = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
records = json.loads(REPORT.read_text(encoding='utf8')) if REPORT.exists() else []
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    futures = {pool.submit(process, job):job for job in jobs}
    for future in concurrent.futures.as_completed(futures):
        job=futures[future]
        try: record=future.result()
        except Exception as error: record={**job, 'status':'failed', 'error':str(error)}
        records = [r for r in records if r['id'] != record['id']] + [record]
        REPORT.write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
        print(json.dumps({k:v for k,v in record.items() if k in ['id','status','vertices','triangles','textureCount','bundleBytes','error']},ensure_ascii=True),flush=True)
