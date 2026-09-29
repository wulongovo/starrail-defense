"""Fetch observed official distribution links only; preserve source evidence."""
import concurrent.futures, hashlib, json, pathlib, re, sys, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / '.cache/modern-models'
PAGES = {
 '3.0':'oEdf9S9dWjtnc5GE', '3.2':'CelYdxhP47H0bp8U', '3.3':'m8NJW6sCPEjH2YUp',
 '3.4':'xvqfNojrTLPhpkTW', '3.5':'MkIsgP3BxED7lSwX', '3.6':'ifmvOMd2l2plJeqa',
 '3.7':'CgsSNa1gEKjhVMKi', '4.0':'aQk7LivgyaxprXl6', '4.1':'iwrM5CWtZOZYrq5B',
 '4.2':'5fZBAcFlCEz8DxWr', '4.3':'mOtHG9t1mhpoU1Tk', '4.4':'HuuEsy2WXwvrQMC6', '4.5':'dEL8k0LkDaqjLxle',
}

def fetch(url, target):
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != 'https' or parts.hostname not in ['www.bilibili.com','activity.hdslb.com','i0.hdslb.com','jssz-boss.hdslb.com']:
        raise ValueError('Source is not an observed official distribution host')
    encoded = urllib.parse.urlunsplit((parts.scheme,parts.netloc,urllib.parse.quote(parts.path,safe='/%'),parts.query,''))
    req = urllib.request.Request(encoded,headers={'User-Agent':'Mozilla/5.0'})
    temp = target.with_suffix(target.suffix+'.partial')
    with urllib.request.urlopen(req,timeout=45) as response, temp.open('wb') as out:
        total = 0
        while chunk := response.read(1024*1024):
            total += len(chunk)
            if total > 700_000_000: raise ValueError('Unexpected archive size')
            out.write(chunk)
    temp.replace(target)

def page(version):
    url = f'https://www.bilibili.com/blackboard/era/{PAGES[version]}.html'
    path = CACHE / f'page-{version}.html'
    if not path.exists(): fetch(url,path)
    body = path.read_text(encoding='utf8')
    if '验证码' in body and len(body)<10000: raise ValueError('Access challenge: stop')
    links = list(dict.fromkeys(re.findall(r'https?[^\s"<>]+?\.(?:zip|rar|7z)',body)))
    return [{'version':version,'page':url,'source':u,'archive':str((CACHE/f'{version}-{i}{pathlib.PurePosixPath(urllib.parse.urlsplit(u).path).suffix}').relative_to(ROOT)).replace('\\','/')} for i,u in enumerate(links)]

def archive(job):
    target = ROOT / job['archive']
    if not target.exists(): fetch(job['source'],target)
    magic = target.read_bytes()[:8]
    if not (magic.startswith(b'PK') or magic.startswith(b'7z\xbc\xaf') or magic.startswith(b'Rar!')):
        raise ValueError('Downloaded response is not an archive')
    return {**job,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'status':'downloaded'}

if __name__ == '__main__':
    CACHE.mkdir(parents=True,exist_ok=True)
    jobs=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for version,result in zip(PAGES,pool.map(page,PAGES)):
            jobs.extend(result)
    (CACHE/'sources.json').write_text(json.dumps(jobs,ensure_ascii=False,indent=2),encoding='utf8')
    records=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures={pool.submit(archive,job):job for job in jobs}
        for future in concurrent.futures.as_completed(futures):
            try: record=future.result()
            except Exception as error: record={**futures[future],'status':'failed','error':str(error)}
            records.append(record)
            (CACHE/'downloads.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
            print(json.dumps(record,ensure_ascii=True),flush=True)
