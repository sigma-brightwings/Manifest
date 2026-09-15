# smoke-exe.ps1 — does the packaged Windows build actually come up?
#
# The headless suites boot main.js against a stubbed canvas, which is most
# of the game but not the parts that need a real GPU or a real window. This
# is the cheapest check that covers the rest: launch the artifact, wait, and
# see whether it is still alive with a renderer and a GPU process beside it.
# A crash on boot exits within a second or two and leaves nothing standing.
# The version is NOT written here. It was, as 0.1.0, and a smoke test that
# quietly stops finding its artifact the first time anyone bumps the version
# is a smoke test that passes by testing nothing — it exits 1 with a message
# that reads like the build failed. Newest portable in dist/, whatever it is
# called, and the name is printed so you can see which one was launched.
$dist = Join-Path (Split-Path -Parent $PSScriptRoot) 'dist'
$exe = Get-ChildItem $dist -Filter '*portable*.exe' -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $exe) { Write-Output 'no portable exe in dist/ — run npm run dist:win'; exit 1 }
Write-Output ('launching: {0}  ({1:N1} MB)' -f $exe.Name, ($exe.Length / 1MB))
$exe = $exe.FullName

Start-Process -FilePath $exe
Start-Sleep -Seconds 20
$procs = @(Get-Process -Name 'Procedural Space Game' -ErrorAction SilentlyContinue)
Write-Output ('processes alive after 20s: {0}' -f $procs.Count)

if ($procs.Count -ge 3) {
  Write-Output 'PASS — main, renderer and GPU processes are up'
} else {
  Write-Output 'FAIL — the app did not stay running'
}
foreach ($p in $procs) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
Write-Output 'closed'
