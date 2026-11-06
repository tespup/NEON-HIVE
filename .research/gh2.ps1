$ErrorActionPreference = 'Continue'
$out = 'G:\GitHub\Games\TestingStations\.research'
$meta = Invoke-RestMethod 'https://api.github.com/repos/Telegram-Mini-Apps/telegram-apps' -TimeoutSec 40
$br = $meta.default_branch
Write-Output ("branch=" + $br + " pushed=" + $meta.pushed_at + " stars=" + $meta.stargazers_count)
Invoke-WebRequest "https://raw.githubusercontent.com/Telegram-Mini-Apps/telegram-apps/$br/README.md" -OutFile "$out\ta-sdk-readme.md" -UseBasicParsing -TimeoutSec 40
Write-Output ("readme bytes=" + (Get-Item "$out\ta-sdk-readme.md").Length)
$pk = Invoke-RestMethod "https://api.github.com/repos/Telegram-Mini-Apps/telegram-apps/contents/packages?ref=$br" -TimeoutSec 40
Write-Output ('PACKAGES: ' + (($pk | ForEach-Object { $_.name }) -join ', '))
$docs = Invoke-RestMethod "https://api.github.com/repos/Telegram-Mini-Apps/telegram-apps/contents/apps?ref=$br" -TimeoutSec 40
Write-Output ('APPS: ' + (($docs | ForEach-Object { $_.name }) -join ', '))
