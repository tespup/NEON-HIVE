$ErrorActionPreference = 'Continue'
$base = 'https://api.github.com'
$meta = Invoke-RestMethod "$base/repos/Telegram-Mini-Apps/telegram-apps" -TimeoutSec 40
Write-Output ("branch={0} pushed={1} stars={2}" -f $meta.default_branch, $meta.pushed_at, $meta.stargazers_count)

$hdr = New-Object 'System.Collections.Generic.Dictionary[string,string]'
$hdr['Accept'] = 'application/vnd.github.raw'
$rd = Invoke-RestMethod "$base/repos/Telegram-Mini-Apps/telegram-apps/readme" -Headers $hdr -TimeoutSec 40
$rd = "$rd"
Write-Output $rd.Substring(0, [Math]::Min(4500, $rd.Length))

$pk = Invoke-RestMethod "$base/repos/Telegram-Mini-Apps/telegram-apps/contents/packages" -TimeoutSec 40
Write-Output ('PACKAGES: ' + (($pk | ForEach-Object { $_.name }) -join ', '))
