$ErrorActionPreference = 'Continue'
$out = 'G:\GitHub\Games\TestingStations\.research'
$urls = @(
  'https://unpkg.com/@types/telegram-web-app@10.1.0/index.d.ts',
  'https://unpkg.com/@types/telegram-web-app@10.1.0/package.json'
)
$i = 0
foreach ($u in $urls) {
  $i++
  $f = "$out\twa-types-$i.txt"
  try {
    Invoke-WebRequest $u -OutFile $f -UseBasicParsing -TimeoutSec 60
    Write-Output ("OK $u -> " + (Get-Item $f).Length + " bytes")
  } catch { Write-Output ("ERR $u " + $_.Exception.Message) }
}
