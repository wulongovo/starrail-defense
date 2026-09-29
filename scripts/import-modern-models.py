"""wulong: safely import verified official modern-character PMX archives."""
import concurrent.futures, hashlib, json, pathlib, re, shutil, stat, subprocess, sys, zipfile

ROOT=pathlib.Path(__file__).resolve().parent.parent
CACHE=(ROOT/'.cache/modern-models').resolve()
MODELS=(ROOT/'public/assets/models').resolve()
REPORT=ROOT/'docs/model-expansion-modern.json'

def checked_target(root,name):
    name=name.replace('\\','/')
    if ':' in name or name.startswith('/') or '..' in pathlib.PurePosixPath(name).parts:
        raise ValueError('Unsafe archive member: '+name)
    out=(root/name).resolve()
    if out!=root and root not in out.parents: raise ValueError('Archive member escaped root')
    return out

def unpack(source,target,depth=0):
    target=target.resolve()
    if CACHE not in target.parents or depth>3: raise ValueError('Invalid extraction destination/depth')
    if (target/'.extracted').exists(): return
    target.mkdir(parents=True,exist_ok=True)
    if source.suffix=='.7z':
        # Windows tar uses GBK console output; reject links and unsafe members before extraction.
        listing=subprocess.run(['tar','-tf',str(source)],capture_output=True,check=True).stdout.decode('gbk')
        details=subprocess.run(['tar','-tvf',str(source)],capture_output=True,check=True).stdout.decode('gbk')
        names=listing.splitlines()
        if len(names)>5000: raise ValueError('Too many entries')
        for n in names: checked_target(target,n)
        size=0
        for line in details.splitlines():
            if not line.startswith(('-', 'd')): raise ValueError('Archive link not permitted')
            size+=int(line.split()[4])
        if size>700_000_000: raise ValueError('Archive exceeds size limit')
        subprocess.run(['tar','-xf',str(source),'-C',str(target)],check=True,capture_output=True)
    else:
        with zipfile.ZipFile(source) as z:
            entries=z.infolist()
            if len(entries)>5000 or sum(i.file_size for i in entries)>700_000_000: raise ValueError('Archive limit exceeded')
            for i in entries:
                name=i.filename
                if not i.flag_bits&0x800:
                    try:name=name.encode('cp437').decode('gbk')
                    except (UnicodeEncodeError,UnicodeDecodeError):pass
                if stat.S_ISLNK(i.external_attr>>16): raise ValueError('Archive symlink not permitted')
                out=checked_target(target,name)
                if i.is_dir():out.mkdir(parents=True,exist_ok=True)
                else:
                    out.parent.mkdir(parents=True,exist_ok=True)
                    out.write_bytes(z.read(i))
    for nested in list(target.rglob('*.zip')):
        unpack(nested,nested.with_suffix(''),depth+1)
    (target/'.extracted').write_text('Source archive validated and extracted.',encoding='utf8')

def process(job):
    ident=job['id']
    if not re.fullmatch(r'[A-Za-z0-9_]+',ident):raise ValueError('Invalid model id')
    source=(ROOT/job['archive']).resolve()
    if CACHE not in source.parents: raise ValueError('Archive outside designated cache')
    extracted=CACHE/'unpacked'/source.stem
    # Archives are extracted serially before concurrent conversion.
    candidates=[p for p in extracted.rglob('*.pmx') if re.search(job['match'],p.name,re.I)]
    if job.get('exclude'):candidates=[p for p in candidates if not re.search(job['exclude'],str(p),re.I)]
    if len(candidates)!=1:raise ValueError(f'{ident}: expected one PMX, got {[str(p) for p in candidates]}')
    pmx=candidates[0]
    target=MODELS/ident
    target.mkdir(parents=True,exist_ok=True)
    # Copy exact model folder, retaining original rules and companion weapon files.
    modelroot=target/'original'
    shutil.copytree(pmx.parent,modelroot,dirs_exist_ok=True)
    pmx=modelroot/pmx.name
    output=target/'bundle.json'
    command=['node',str(ROOT/'scripts/convert-pmx.mjs'),str(pmx),str(output),'--id',ident,'--source',job['source'],'--max-texture','256']
    result=subprocess.run(command,capture_output=True,encoding='utf8',errors='replace',cwd=ROOT)
    if result.returncode:raise RuntimeError(result.stderr[-3000:])
    bundle=json.loads(output.read_text(encoding='utf8'))
    meta=bundle['metadata']
    archive_hash=hashlib.sha256(source.read_bytes()).hexdigest()
    meta['sourcePage']=job['page']
    meta['sourceArchiveSha256']=archive_hash
    output.write_text(json.dumps(bundle,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    return {**job,'status':'converted','archiveSha256':archive_hash,'pmxPath':str(pmx.relative_to(ROOT)).replace('\\','/'),'bundlePath':str(output.relative_to(ROOT)).replace('\\','/'),'pmxSha256':meta['sha256'],'modelName':meta['modelName'],'vertices':meta['vertices'],'triangles':meta['triangles'],'bones':meta['bones'],'textureCount':len(meta['textures']),'bundleBytes':output.stat().st_size,'maxTexture':256,'originalComment':meta['originalComment'],'rules':[str(p.relative_to(ROOT)).replace('\\','/') for p in target.rglob('*.txt')]}

if __name__=='__main__':
    jobs=json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
    for archive in dict.fromkeys(job['archive'] for job in jobs):
        source=ROOT/archive
        unpack(source,CACHE/'unpacked'/source.stem)
    records=json.loads(REPORT.read_text(encoding='utf8')) if REPORT.exists() else []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures={pool.submit(process,job):job for job in jobs}
        for future in concurrent.futures.as_completed(futures):
            try:record=future.result()
            except Exception as error:record={**futures[future],'status':'failed','error':str(error)}
            records=[r for r in records if r['id']!=record['id']]+[record]
            REPORT.write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
            print(json.dumps({k:v for k,v in record.items() if k in ['id','status','modelName','vertices','triangles','textureCount','bundleBytes','error']},ensure_ascii=True),flush=True)
