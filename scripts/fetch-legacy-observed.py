import pathlib,re,json,concurrent.futures,urllib.request
root=pathlib.Path('.cache/official-models')
files=[*root.glob('legacy-page-*.html'),*pathlib.Path('docs').glob('official-model-page-*.html')]
urls={}
for f in files:
 for u in re.findall(r'(?:https?:)?//(?:activity|i0).hdslb.com/[^"\s<>\\]+?\.(?:zip|rar)',f.read_text(encoding='utf8')):
  u='https:'+u if u.startswith('//') else u;urls[u]=str(f)
(root/'legacy-observed-urls.json').write_text(json.dumps(urls,ensure_ascii=False,indent=2),encoding='utf8')
def get(u):
 dest=root/u.rsplit('/',1)[-1]
 if dest.exists():return {'file':dest.name,'status':'cached'}
 try:
  with urllib.request.urlopen(u,timeout=45) as response: data=response.read()
  if data[:2] not in [b'PK',b'Ra']:raise ValueError('Not an archive')
  dest.write_bytes(data);return {'file':dest.name,'status':'downloaded','bytes':len(data)}
 except Exception as e:return {'file':dest.name,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as p:
 for r in p.map(get,urls):print(json.dumps(r),flush=True)
