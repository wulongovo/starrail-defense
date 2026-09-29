"""Download explicitly public mirrored source files and retain per-file evidence."""
import concurrent.futures, hashlib, html, json, pathlib, re, subprocess, urllib.request
ROOT=pathlib.Path(__file__).resolve().parent.parent
CACHE=ROOT/'.cache/modern-models'
JOBS=[
 {'id':'hsr_1508','key':'rin','name':'远坂凛','folder':'1bUXlaTaxAieKl4PMSI-NRSQFmwpLcZec','pmx':'TohsakaRin.pmx'},
 {'id':'hsr_1509','key':'gilgamesh','name':'吉尔伽美什','folder':'16txH4kCG5CvD0qZ2xwNX0Vv2h1Vezocl','pmx':'Gilgamesh.pmx'},
 {'id':'elation','key':'elation','name':'欢愉女主','folder':'1CZW76ryegfea5sVZQOKSgwor47MUQPKe','pmx':'星穹铁道—女主.pmx'},
]

def source_files(job):
    text=(CACHE/f"drive-{job['key']}.html").read_text(encoding='utf8')
    found={}
    for m in re.finditer(r'data-id="([^"]+)"',text):
        tail=text[m.end():m.end()+2500]
        tooltip=re.search(r'data-tooltip="([^"]+)"',tail)
        if not tooltip:continue
        name=html.unescape(tooltip.group(1)).rsplit(' ',1)[0]
        if not re.search(r'\.(?:pmx|txt|png|jpg|jpeg|tga|bmp|sph|spa)$',name,re.I):continue
        if any(x in name for x in [':','/','\\','..']):raise ValueError('Invalid filename')
        found[m.group(1)]={'fileId':m.group(1),'name':name,'model':job['id']}
    return list(found.values())

def download(item):
    target=ROOT/'public/assets/models'/item['model']/'mirror-original'/item['name']
    target.parent.mkdir(parents=True,exist_ok=True)
    source=f"https://drive.usercontent.google.com/download?id={item['fileId']}&export=download"
    if not target.exists():
        request=urllib.request.Request(source,headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(request,timeout=45) as r:
            if 'text/html' in r.headers.get('Content-Type',''):raise ValueError('Sign-in or confirmation page; no bypass attempted')
            body=r.read(60_000_001)
            if len(body)>60_000_000:raise ValueError('Unexpected model file size')
        part=target.with_suffix(target.suffix+'.partial')
        part.write_bytes(body);part.replace(target)
    return {**item,'source':source,'path':str(target.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size}

records=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    futures={pool.submit(download,item):item for job in JOBS for item in source_files(job)}
    for future in concurrent.futures.as_completed(futures):
        try:record=future.result()
        except Exception as error:record={**futures[future],'error':str(error)}
        records.append(record)
        (CACHE/'mirror-downloads.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
        print(json.dumps(record,ensure_ascii=True),flush=True)
for job in JOBS:
    files=[r for r in records if r['model']==job['id']]
    if any(r.get('error') for r in files):continue
    target=ROOT/'public/assets/models'/job['id']
    pmx=target/'mirror-original'/job['pmx']
    if not pmx.exists():
        print(json.dumps({'id':job['id'],'status':'pmx-name-needs-verification','files':[r['name'] for r in files]},ensure_ascii=True),flush=True);continue
    source='https://drive.google.com/drive/folders/'+job['folder']
    result=subprocess.run(['node','scripts/convert-pmx.mjs',str(pmx),str(target/'bundle.json'),'--id',job['id'],'--source',source,'--max-texture','256'],cwd=ROOT,capture_output=True,encoding='utf8',errors='replace')
    if result.returncode:
        print(json.dumps({'id':job['id'],'status':'conversion-failed','error':result.stderr[-2000:]},ensure_ascii=True),flush=True);continue
    bundle=json.loads((target/'bundle.json').read_text(encoding='utf8'))
    meta=bundle['metadata'];meta['sourceKind']='public-community-mirror';meta['sourceFiles']=files
    meta['provenanceNote']='公开社区存档，不是官方CDN；保留原PMX备注、使用规则与逐文件SHA256供核验。'
    (target/'bundle.json').write_text(json.dumps(bundle,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    report=ROOT/'docs/model-expansion-modern.json'
    current=json.loads(report.read_text(encoding='utf8'))
    record={**job,'source':source,'sourceKind':meta['sourceKind'],'status':'converted','bundlePath':str((target/'bundle.json').relative_to(ROOT)).replace('\\','/'),'pmxSha256':meta['sha256'],'vertices':meta['vertices'],'triangles':meta['triangles'],'bones':meta['bones'],'textureCount':len(meta['textures']),'maxTexture':256,'originalComment':meta['originalComment'],'files':files}
    current=[r for r in current if r['id']!=job['id']]+[record]
    report.write_text(json.dumps(current,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'id':job['id'],'status':'converted','vertices':meta['vertices'],'bones':meta['bones']},ensure_ascii=True),flush=True)
