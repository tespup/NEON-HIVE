$ErrorActionPreference = 'Continue'
$out = 'G:\GitHub\Games\TestingStations\.research'
$j = Invoke-RestMethod 'https://data.jsdelivr.com/v1/packages/npm/@telegram-apps/bridge@2.11.0?structure=flat' -TimeoutSec 60
$all = $j.files | ForEach-Object { $_.name }
Write-Output ('total files=' + $all.Count)
Write-Output ('MATCH custom/sendData/scanQr: ')
$all | Where-Object { $_ -match 'custom|send-data|scan' } | Select-Object -First 40 | ForEach-Object { Write-Output ('  ' + $_) }
