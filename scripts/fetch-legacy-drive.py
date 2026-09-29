"""Download exact public mirror files and archive original bytes with provenance."""
import concurrent.futures,hashlib,html,json,pathlib,re,urllib.request,zipfile
ROOT=pathlib.Path(__file__).resolve().parent.parent
CACHE=ROOT/'.cache/official-models'
links=json.loads((CACHE/'legacy-drive-links.json').read_text(encoding='utf8'))
selected=[('hsr_1004','Welt'),('hsr_1008','Arlan'),('hsr_1009','Asta'),('hsr_1103','Serval'),('hsr_1105','Natasha'),('hsr_1106','Pela'),('hsr_1107','Clara'),('hsr_1109','Hook'),('hsr_1014','Saber'),('hsr_1015','Archer'),('hsr_1224','March 7th - The Hunt Path'),('hsr_1201','Qingque'),('hsr_1202','Tingyun')]
manifest=[]
def download(url):
 for attempt in range(3):
  try:
   with urllib.request.urlopen(url,timeout=35) as response:return response.read()
  except (TimeoutError,ConnectionError):
   if attempt==2:raise
def discover(entry):
 mid,name=entry;url=next(x['url'] for x in links if x['name']==name);url=re.sub(r'/drive/u/\d+/folders/','/drive/folders/',url)
 dest=(CACHE/'mirror-files'/mid).resolve();dest.mkdir(parents=True,exist_ok=True)
 def folder(folderurl,relative='',depth=0):
  if depth>3:raise ValueError('Nested folder limit')
  saved=CACHE/f'legacy-drive-{mid}-{depth}-{hashlib.sha256(folderurl.encode()).hexdigest()[:8]}.html'
  text=saved.read_text(encoding='utf8') if saved.exists() else download(folderurl).decode('utf8')
  saved.write_text(text,encoding='utf8')
  items=re.findall(r'data-id="([^"]+)"[^>]{0,500}data-tooltip="([^"]+)"',text)
  if not items:raise ValueError('No public files')
  files=[]
  for fid,label in items:
   label=html.unescape(label)
   isfolder=label.endswith((' Shared folder',' Folder'))
   filename=re.sub(r' (?:Shared folder|Folder|Image|Text|Binary|Unknown|Compressed archive|Video|PDF)$','',label)
   path=(dest/relative/filename).resolve()
   if dest not in path.parents or '/' in filename or '\\' in filename or ':' in filename:raise ValueError('Unsafe remote filename')
   if isfolder:files+=folder('https://drive.google.com/drive/folders/'+fid,str(path.relative_to(dest)),depth+1)
   elif path.suffix.lower() in ['.pmx','.png','.jpg','.jpeg','.bmp','.tga','.sph','.spa','.txt','.md','.pdf','.zip','.rar']:
    files.append({'path':str(path),'url':'https://drive.usercontent.google.com/download?id='+fid+'&export=download','name':str(path.relative_to(dest)).replace('\\','/')})
  return files
 return {'id':mid,'name':name,'source':url,'files':folder(url),'dest':str(dest)}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 futures={pool.submit(discover,entry):entry for entry in selected}
 for future in concurrent.futures.as_completed(futures):
  try:
   result=future.result();manifest.append(result);print(json.dumps({'id':result['id'],'discovered':len(result['files'])}),flush=True)
  except Exception as error:print(json.dumps({'id':futures[future][0],'discoveryError':str(error)}),flush=True)
(CACHE/'legacy-drive-file-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
def fetch(item):
 p=pathlib.Path(item['path'])
 if not p.exists():
  data=download(item['url'])
  if data[:100].lower().lstrip().startswith((b'<!doctype html',b'<html')):raise ValueError('Unexpected HTML download')
  p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
 item['sha256']=hashlib.sha256(p.read_bytes()).hexdigest();return item
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 futures={pool.submit(fetch,file):(m,file) for m in manifest for file in m['files']}
 for future in concurrent.futures.as_completed(futures):
  m,item=futures[future]
  try:future.result()
  except Exception as error:item['error']=str(error);print(json.dumps({'id':m['id'],'name':item['name'],'error':str(error)}),flush=True)
for m in manifest:
 if any('error' in f for f in m['files']):continue
 archive=CACHE/('mirror-'+m['id']+'-original-files.zip')
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
  for f in m['files']:z.write(f['path'],f['name'])
 m['archive']=str(archive.relative_to(ROOT)).replace('\\','/');m['archiveSha256']=hashlib.sha256(archive.read_bytes()).hexdigest();print(json.dumps({'id':m['id'],'archived':archive.stat().st_size,'pmx':[f['name'] for f in m['files'] if f['name'].endswith('.pmx')]}),flush=True)
(CACHE/'legacy-drive-file-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
