# check-toolchain.ps1 — what a Tauri build needs, and whether this machine has it.
foreach ($c in 'rustc','cargo','rustup','node','npm','cl','link','git') {
  $p = Get-Command $c -ErrorAction SilentlyContinue
  if ($p) { Write-Output "OK      $c  ->  $($p.Source)" } else { Write-Output "MISSING $c" }
}
Write-Output '--- versions ---'
try { Write-Output (rustc --version) } catch {}
try { Write-Output (cargo --version) } catch {}
try { Write-Output (node --version) } catch {}
Write-Output '--- webview2 runtime ---'
$k = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$v = (Get-ItemProperty $k -ErrorAction SilentlyContinue).pv
if ($v) { Write-Output "WebView2 $v" } else { Write-Output 'WebView2 not found in registry' }
Write-Output '--- visual studio build tools ---'
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path $vswhere) {
  & $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property displayName
} else { Write-Output 'vswhere not present — no Visual Studio / Build Tools installed' }
Write-Output '--- done ---'
