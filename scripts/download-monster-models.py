"""wulong: fetch only observed public HoyoToon monster assets, preserving originals."""
from __future__ import annotations
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache' / 'monster-models'
OUT = ROOT / 'public' / 'assets' / 'models'
ORIGIN = 'https://assets.hoyotoon.com'
TARGETS = {
    'reaver': '8012010', 'antibaryon': '8011020', 'baryon': '8011010',
    'distorter': '8012020', 'trampler': '8013010', 'maraSoldier': '2022010',
    'goldenHound': '2022040', 'woodLupus': '2022050', 'dragonfish': '2012010',
    'bubbleHound': '3002030', 'domescreen': '3002010', 'springDealer': '3001010',
    'tideBlade': '4032010', 'tideBow': '4032050', 'tideAxe': '4032030',
    'tideCouncil': '4032040', 'enemy_lotus': '8012200', 'enemy_comedian': '8012040',
    'enemy_retainer': '4012010',
}

def safe_target(base: Path, relative: str) -> Path:
    rel = relative.replace('\\', '/')
    if rel.startswith('/') or ':' in rel or '..' in rel.split('/'):
        raise ValueError(f'Unsafe asset path: {relative}')
    path = (base / rel).resolve()
    if not path.is_relative_to(base.resolve()) or not path.is_relative_to(ROOT):
        raise ValueError(f'Path escaped project: {relative}')
    path.parent.mkdir(parents=True, exist_ok=True)
    return path

def fetch(url: str, path: Path, expected_size: int | None = None) -> None:
    if not url.startswith(ORIGIN + '/'):
        raise ValueError(f'Unobserved origin: {url}')
    if path.exists() and expected_size is not None and path.stat().st_size == expected_size:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.partial')
    for attempt in range(3):
        result = subprocess.run(
            ['curl.exe', '-sSL', '--connect-timeout', '10', '--max-time', '70',
             url, '--output', str(tmp), '--write-out', '%{http_code}'],
            capture_output=True, text=True, timeout=85,
        )
        code = result.stdout.strip()[-3:]
        if result.returncode == 0 and code == '200':
            if expected_size is not None and tmp.stat().st_size != expected_size:
                raise ValueError(f'Size mismatch: {path.name}: {tmp.stat().st_size} != {expected_size}')
            tmp.replace(path)
            return
        # Do not retry or bypass any access-control response.
        if code in ('401', '403'):
            raise PermissionError(f'HTTP {code}: {url}')
        if attempt == 2:
            raise RuntimeError(f'Download failed HTTP {code}: {result.stderr[-250:]}')
        time.sleep(1)

def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def download_one(item: tuple[str, str]) -> dict:
    card_id, monster_id = item
    index_url = ORIGIN + '/api/remote-assets?' + urlencode({'game': 'hsr', 'type': 'monsters', 'ids': monster_id})
    index_path = CACHE / f'hoyotoon-{card_id}-files.json'
    if not index_path.exists():
        fetch(index_url, index_path)
    index = json.loads(index_path.read_text('utf-8'))
    files = index.get('files', [])
    targets = [x for x in index.get('targets', []) if x.get('entityId') == monster_id]
    record = {'id': card_id, 'monsterId': monster_id, 'source': ORIGIN + '/?game=hsr&type=monsters',
              'sourceKind': 'public-hoyotoon-original-game-asset-mirror', 'indexUrl': index_url,
              'indexPath': index_path.relative_to(ROOT).as_posix(), 'indexSha256': digest(index_path),
              'status': 'missing-public-model', 'files': [], 'targets': targets,
              'rules': 'Public third-party game asset archive; copyright remains miHoYo/HoYoverse. No free redistribution permission is inferred.',
              'verification': {'browserRenderVerified': False, 'converted': False}}
    if not files:
        print(card_id, 'NO_FILES', flush=True)
        return record
    if sum(x.get('size', 0) for x in files) > 120 * 1024 * 1024:
        raise ValueError(f'{card_id}: exceeds per-model source download budget')
    base = OUT / card_id / 'source'
    for asset in files:
        # Only this model geometry, material definitions and texture files; no animation/scene archive.
        relative = asset['path'].replace('\\', '/')
        if not relative.startswith('Monsters/'):
            raise ValueError(f'Wrong category for {card_id}: {relative}')
        local_relative = '/'.join(relative.split('/')[2:])
        if Path(relative).suffix.lower() not in ('.fbx', '.json', '.png', '.jpg', '.jpeg', '.tga', '.dds'):
            continue
        url = asset['downloadUrl']
        if not url.startswith('/api/remote-assets/file?'):
            raise ValueError(f'Unexpected published download URL: {url}')
        target = safe_target(base, local_relative)
        fetch(ORIGIN + url, target, asset['size'])
        if target.suffix.lower() == '.fbx' and not target.read_bytes().startswith(b'Kaydara FBX Binary'):
            raise ValueError(f'Not a binary FBX: {target}')
        record['files'].append({'path': target.relative_to(ROOT).as_posix(), 'sourcePath': relative,
                                'source': ORIGIN + url, 'size': target.stat().st_size,
                                'sha256': digest(target), 'etag': asset.get('etag')})
    record['status'] = 'downloaded-fbx'
    record['fbxPaths'] = [x['path'] for x in record['files'] if x['path'].lower().endswith('.fbx')]
    record['verification']['allIndexedFilesDownloaded'] = len(record['files']) == len(files)
    record['verification']['sourceSizesVerified'] = True
    (base / 'SOURCE.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), 'utf-8')
    print(card_id, 'DOWNLOADED', len(record['files']), 'files', record['fbxPaths'], flush=True)
    return record

def main() -> None:
    sys.stdout.reconfigure(encoding='utf-8')
    requested = sys.argv[1:]
    selected = [(key, value) for key, value in TARGETS.items() if not requested or key in requested]
    report_path = ROOT / 'docs' / 'model-expansion-monsters.json'
    records = json.loads(report_path.read_text('utf-8')) if report_path.exists() else []
    by_id = {x['id']: x for x in records}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        pending = {pool.submit(download_one, entry): entry[0] for entry in selected}
        for future in concurrent.futures.as_completed(pending):
            key = pending[future]
            try:
                by_id[key] = future.result()
            except Exception as exc:
                by_id[key] = {'id': key, 'monsterId': TARGETS[key], 'status': 'download-failed', 'error': str(exc)}
                print(key, 'FAILED', str(exc), flush=True)
            report_path.write_text(json.dumps(list(by_id.values()), ensure_ascii=False, indent=2), 'utf-8')

if __name__ == '__main__':
    main()
