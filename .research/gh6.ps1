$ErrorActionPreference = 'Continue'
$out = 'G:\GitHub\Games\TestingStations\.research'
$b = 'https://cdn.jsdelivr.net/npm/@telegram-apps/bridge@2.11.0'
foreach ($p in '/dist/dts/utils/invokeCustomMethod.d.ts', '/dist/dts/methods/types/custom-method.d.ts') {
  $name = 'bridge-' + ($p -replace '[/\.]', '_')
  try {
    Invoke-WebRequest ($b + $p) -OutFile "$out\$name" -UseBasicParsing -TimeoutSec 60
    Write-Output ('=== ' + $p)
    Get-Content "$out\$name" -Raw
  } catch { Write-Output ('ERR ' + $p + ' ' + $_.Exception.Message) }
}
$j = Invoke-RestMethod 'https://data.jsdelivr.com/v1/packages/npm/@telegram-apps/bridge@2.11.0?structure=flat' -TimeoutSec 60
$dirs = $j.files | Where-Object { $_.name -match '/dist/dts/methods/' } | ForEach-Object { (($_.name -split '/methods/')[1] -split '/')[0] } | Sort-Object -Unique
Write-Output ('BRIDGE METHOD GROUPS: ' + ($dirs -join ', '))
