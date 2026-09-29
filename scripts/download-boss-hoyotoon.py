"""Download only files listed by HoyoToon's public live monster index."""
import concurrent.futures, hashlib, json, pathlib, subprocess, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / '.cache/modern-models/boss-remote-assets.json'
MAP = {
    'Art_W2_Huanlong_00': ('boss_phantylia', '幻胧'),
    'Art_W3_Sunday_00': ('boss_dominicus', '神主日'),
    'Art_W4_Theoroi_00': ('boss_lycurgus', '来古士'),
    'Art_W5_AsatPramad_00': ('boss_guiji', '归寂·成'),
    'Art_W5_AsatPramad_01': ('boss_guiji_existence', '归寂·住'),
    'Art_W5_AsatPramad_02': ('boss_guiji_decay', '归寂·坏'),
}

def download(item, folder, model_id):
    relative = pathlib.PurePosixPath(item['path'][len(folder):].lstrip('/'))
    target_root = ROOT / 'public/assets/models' / model_id / 'hoyotoon-original'
    target = (target_root / relative).resolve()
    if target_root.resolve() not in target.parents or '..' in relative.parts:
        raise ValueError('Unsafe source path')
    url = urllib.parse.urljoin('https://assets.hoyotoon.com', item['downloadUrl'])
    if urllib.parse.urlparse(url).netloc != 'assets.hoyotoon.com':
        raise ValueError('Unexpected index download host')
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists() or target.stat().st_size != item['size']:
        part = target.with_suffix(target.suffix + '.partial')
        result = subprocess.run(['curl.exe', '--fail', '--location', '--silent', '--show-error', '--max-time', '90', url, '-o', str(part)], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stderr.strip())
        if part.stat().st_size != item['size']:
            raise ValueError(f"File size mismatch {part.stat().st_size} != {item['size']}")
        part.replace(target)
    body = target.read_bytes()
    return {'id': model_id, 'path': target.relative_to(ROOT).as_posix(), 'remotePath': item['path'], 'source': url, 'size': len(body), 'sha256': hashlib.sha256(body).hexdigest(), 'etag': item['etag']}

def main():
    index = json.loads(INDEX.read_text('utf8'))
    folders = {}
    for item in index['files']:
        stem = pathlib.PurePosixPath(item['path']).stem
        if stem in MAP and item['path'].endswith('.fbx'):
            folders[str(pathlib.PurePosixPath(item['path']).parent)] = MAP[stem][0]
    tasks = [(item, folder, model_id) for folder, model_id in folders.items() for item in index['files'] if item['path'].startswith(folder + '/')]
    records = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(download, *args): args for args in tasks}
        for future in concurrent.futures.as_completed(futures):
            item, folder, model_id = futures[future]
            try:
                record = future.result()
            except Exception as error:
                record = {'id': model_id, 'remotePath': item['path'], 'error': str(error)}
            records.append(record)
            print(json.dumps({'id': model_id, 'file': pathlib.PurePosixPath(item['path']).name, 'error': record.get('error')}, ensure_ascii=True), flush=True)
            (ROOT / '.cache/modern-models/boss-hoyotoon-downloads.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'files': len(records), 'errors': [x for x in records if 'error' in x]}, ensure_ascii=True), flush=True)

if __name__ == '__main__':
    main()
