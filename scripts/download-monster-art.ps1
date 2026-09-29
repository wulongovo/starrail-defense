$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$records = Get-Content -LiteralPath (Join-Path $projectRoot 'docs/monster-art-sources-part2.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($record in $records) {
  $path = Join-Path $projectRoot ('public/assets/characters/' + $record.id + '.png')
  try { Invoke-WebRequest -Uri $record.imageUrl -OutFile $path -TimeoutSec 25 -UseBasicParsing; "OK $($record.id)" }
  catch { "FAILED $($record.id) $($_.Exception.Message)" }
}
