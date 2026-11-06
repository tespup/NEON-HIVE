$ErrorActionPreference = 'Continue'
$out = 'G:\GitHub\Games\TestingStations\.research'
foreach ($p in '@telegram-apps/sdk', '@telegram-apps/bridge', '@telegram-apps/init-data') {
  $enc = [uri]::EscapeDataString($p)
  $j = Invoke-RestMethod "https://registry.npmjs.org/$enc" -TimeoutSec 40
  Write-Output ($p + ' dist-tags=' + (($j.'dist-tags' | ConvertTo-Json -Compress)))
}
$u = 'https://data.jsdelivr.com/v1/packages/npm/@telegram-apps/sdk@3.11.8?structure=flat'
try {
  $j = Invoke-RestMethod $u -TimeoutSec 60
  $names = $j.files | Where-Object { $_.name -match '/dist/types/modules/[a-zA-Z]+/' } | ForEach-Object { ($_.name -split '/modules/')[1] }
  $mods = $names | ForEach-Object { ($_ -split '/')[0] } | Sort-Object -Unique
  Write-Output ('SDK MODULES: ' + ($mods -join ', '))
} catch { Write-Output ('ERR jsdelivr ' + $_.Exception.Message) }
try {
  Invoke-WebRequest 'https://docs.telegram-mini-apps.com/' -OutFile "$out\tma-docs-home.html" -UseBasicParsing -TimeoutSec 40
  Write-Output ('docs home bytes=' + (Get-Item "$out\tma-docs-home.html").Length)
} catch { Write-Output ('ERR docs ' + $_.Exception.Message) }
