$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$index = Get-Content -LiteralPath (Join-Path $projectRoot 'docs/mirror-character-index.json') -Raw | ConvertFrom-Json
$alias = @{ '1001'='march';'1309'='robin';'1304'='aventurine';'1104'='gepard';'8002'='trailblazer';'8004'='preservation';'8008'='remembrance';'8006'='harmony';'8010'='elation';'1013'='herta';'1003'='himeko';'1002'='dan';'1211'='bailu';'1005'='kafka';'1006'='silverWolf';'1310'='firefly';'1205'='blade';'1108'='sampo';'1101'='bronya';'1306'='sparkle';'1313'='sunday';'1225'='fugue';'1221'='yunli';'1213'='imbibitor';'1414'='permansor';'1204'='jingyuan';'1303'='ruanmei';'1308'='acheron';'1112'='topaz' }
$pool = [RunspaceFactory]::CreateRunspacePool(1,6)
$pool.Open()
$tasks = @()
$records = @()
foreach ($property in $index.PSObject.Properties) {
  $entry = $property.Value
  $id = if ($alias.ContainsKey($property.Name)) {$alias[$property.Name]} else {'hsr_' + $property.Name}
  $url = 'https://cdn.jsdelivr.net/gh/Mar-7th/StarRailRes@master/' + $entry.portrait
  $path = Join-Path $projectRoot ('public/assets/characters/' + $id + '.png')
  $records += [PSCustomObject]@{ id=$id;gameId=$property.Name;name=$entry.name;url=$url;path=$path }
  if (Test-Path -LiteralPath $path) { continue }
  $ps = [PowerShell]::Create()
  $ps.RunspacePool=$pool
  [void]$ps.AddScript({param($id,$url,$path)
    try { Invoke-WebRequest -Uri $url -OutFile $path -TimeoutSec 35 -UseBasicParsing; "OK $id" }
    catch { "FAILED $id $($_.Exception.Message)" }
  }).AddArgument($id).AddArgument($url).AddArgument($path)
  $tasks += [PSCustomObject]@{Shell=$ps;Handle=$ps.BeginInvoke()}
}
$records | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $projectRoot 'docs/roster-download-manifest.json') -Encoding UTF8
foreach ($task in $tasks) { $task.Shell.EndInvoke($task.Handle); $task.Shell.Dispose() }
$pool.Close(); $pool.Dispose()
