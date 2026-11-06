$ErrorActionPreference = 'Continue'
$out = 'G:\GitHub\Games\TestingStations\.research'
$urls = @(
  'https://docs.ton.org/develop/dapps/ton-connect/overview.md',
  'https://docs.ton.org/develop/dapps/ton-connect/implementation-web.md',
  'https://docs.ton.org/develop/dapps/appearance-guidelines.md',
  'https://docs.ton.org/learn/tutorials/dapps/telegram-apps.md'
)
foreach ($u in $urls) {
  $name = 'ton-' + ($u -replace 'https?://.*?/', '' -replace '[/\.]', '_')
  try {
    Invoke-WebRequest $u -OutFile "$out\$name" -UseBasicParsing -TimeoutSec 40
    $len = (Get-Item "$out\$name").Length
    Write-Output ("OK $u bytes=$len")
  } catch { Write-Output ("ERR $u " + $_.Exception.Message) }
}
