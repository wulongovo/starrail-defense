"""Import exact, observed public repository boss assets with file hash evidence."""
import concurrent.futures,hashlib,json,pathlib,subprocess,urllib.parse,urllib.request
ROOT=pathlib.Path(__file__).resolve().parent.parent
TREE=json.loads((ROOT/'.cache/modern-models/hsr-model-tree.json').read_text(encoding='utf8'))
PREFIX='chars/Lygus/Lygus_boss/'
MODEL='boss_lycurgus'
TARGET=ROOT/'public/assets/models'/MODEL/'repository-original'
SOURCE='https://github.com/Phoshco/hsr/tree/main/chars/Lygus/Lygus_boss'

def download(item):
    relative=pathlib.PurePosixPath(item['path'][len(PREFIX):])
    if '..' in relative.parts or relative.is_absolute():raise ValueError('Unsafe repository path')
    target=(TARGET/relative).resolve()
    if TARGET.resolve() not in target.parents:raise ValueError('Path escaped model folder')
    target.parent.mkdir(parents=True,exist_ok=True)
    url='https://raw.githubusercontent.com/Phoshco/hsr/'+TREE['sha']+'/'+urllib.parse.quote(item['path'],safe='/')
    if not target.exists():
        with urllib.request.urlopen(url,timeout=45) as response:
            body=response.read(60_000_001)
        if len(body)!=item['size']:raise ValueError('Repository file size mismatch')
        actual=hashlib.sha1(b'blob '+str(len(body)).encode()+b'\0'+body).hexdigest()
        if actual!=item['sha']:raise ValueError('Repository blob hash mismatch')
        target.write_bytes(body)
    return {'source':url,'path':str(target.relative_to(ROOT)).replace('\\','/'),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'gitBlobSha':item['sha']}

files=[x for x in TREE['tree'] if x['type']=='blob' and x['path'].startswith(PREFIX)]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:records=list(pool.map(download,files))
pmx=TARGET/'Lygus.pmx';out=TARGET.parent/'bundle.json'
subprocess.run(['node','scripts/convert-pmx.mjs',str(pmx),str(out),'--id',MODEL,'--source',SOURCE,'--max-texture','256','--height','2.0'],cwd=ROOT,check=True)
bundle=json.loads(out.read_text(encoding='utf8'));m=bundle['metadata']
m['sourceKind']='public-community-game-model-port';m['sourceFiles']=records;m['sourceCommit']=TREE['sha']
m['provenanceNote']='公开Phoshco/hsr仓库提供的来古士战斗形态PMX移植；不是官方MMD配布。原PMX、原纹理和作者备注保持不变。'
out.write_text(json.dumps(bundle,ensure_ascii=False,separators=(',',':')),encoding='utf8')
path=ROOT/'docs/model-expansion-bosses-pompom.json'
report=json.loads(path.read_text(encoding='utf8')) if path.exists() else []
record={'id':MODEL,'name':'来古士','status':'converted','source':SOURCE,'sourceKind':m['sourceKind'],'sourceCommit':TREE['sha'],'bundlePath':str(out.relative_to(ROOT)).replace('\\','/'),'pmxPath':str(pmx.relative_to(ROOT)).replace('\\','/'),'pmxSha256':m['sha256'],'modelName':m['modelName'],'vertices':m['vertices'],'triangles':m['triangles'],'bones':m['bones'],'textureCount':len(m['textures']),'maxTexture':256,'originalComment':m['originalComment'],'files':records}
report=[r for r in report if r['id']!=MODEL]+[record]
path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(record,ensure_ascii=True),flush=True)
