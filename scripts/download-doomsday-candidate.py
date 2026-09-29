"""Fetch an exact full-manifest candidate; identity remains pending visual QA."""
import concurrent.futures, importlib.util, json, pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('boss_download',ROOT/'scripts/download-boss-hoyotoon.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
index=json.loads((ROOT/'.cache/modern-models/boss-doomsday-candidate-index.json').read_text('utf8'))
files=[x for x in index['files'] if 'AML_Boss' in x['path']]
records=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    futures={pool.submit(module.download,x,'Monsters/Flying Sword/Default','boss_doomsday'):x for x in files}
    for future in concurrent.futures.as_completed(futures):
        item=futures[future]
        try:record=future.result()
        except Exception as error:record={'remotePath':item['path'],'error':str(error)}
        records.append(record)
        print(json.dumps({'file':item['path'],'error':record.get('error')}),flush=True)
        (ROOT/'.cache/modern-models/boss-doomsday-downloads.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
