"""Download ZIP links observed in official creator event pages, preserving originals."""
import concurrent.futures
import json
import pathlib
import sys
import urllib.parse
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEST = ROOT / '.cache' / 'official-models'
DEST.mkdir(parents=True, exist_ok=True)

def download(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != 'activity.hdslb.com':
        raise ValueError('Only the observed official distribution CDN is accepted')
    path = DEST / pathlib.PurePosixPath(parsed.path).name
    if not path.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(request, timeout=45) as response:
            content = response.read()
        path.write_bytes(content)
    with zipfile.ZipFile(path) as archive:
        models = []
        for info in archive.infolist():
            name = info.filename
            if not info.flag_bits & 0x800:
                try: name = name.encode('cp437').decode('gbk')
                except (UnicodeEncodeError, UnicodeDecodeError): pass
            if name.lower().endswith('.pmx'): models.append(name)
    return {'url':url,'path':str(path),'bytes':path.stat().st_size,'models':models}

urls = []
for argument in sys.argv[1:]:
    urls.extend(json.loads((ROOT / argument).read_text(encoding='utf-8')))
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for future in concurrent.futures.as_completed([pool.submit(download, url) for url in dict.fromkeys(urls)]):
        try: print(json.dumps(future.result(),ensure_ascii=True),flush=True)
        except Exception as error: print(json.dumps({'error':str(error)},ensure_ascii=True),flush=True)
