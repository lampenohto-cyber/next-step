# Adds "Next Step" to the Start menu and desktop. It opens in its own app window (Microsoft Edge app mode).
# Run again after rebuilding; run with -Uninstall to remove the shortcuts.
param([switch]$Uninstall)
$app   = Join-Path $PSScriptRoot "dist\app"
$edge  = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
$links = @((Join-Path ([Environment]::GetFolderPath("Programs")) "Next Step.lnk"), (Join-Path ([Environment]::GetFolderPath("Desktop")) "Next Step.lnk"))
if ($Uninstall) { $links | Where-Object { Test-Path $_ } | Remove-Item; "Removed Next Step shortcuts."; return }
if (-not $edge) { throw "Microsoft Edge not found." }
if (-not (Test-Path "$app\icons\icon.ico")) { throw "Run 'python build.py' first." }
# use the hosted app when site.txt has its address, so the shortcut always opens the latest version
$site = Join-Path $PSScriptRoot "site.txt"
$url = if (Test-Path $site) { (Get-Content $site -Raw).Trim() } else { ([Uri](Join-Path $app "index.html")).AbsoluteUri }
$shell = New-Object -ComObject WScript.Shell
foreach ($l in $links) {
  $s = $shell.CreateShortcut($l)
  $s.TargetPath = $edge
  $s.Arguments = "--app=`"$url`" --window-size=1000,900"
  $s.IconLocation = "$app\icons\icon.ico"
  $s.Description = "Next Step planner"
  $s.Save()
}
"Installed: Start menu and desktop shortcuts -> $url"
