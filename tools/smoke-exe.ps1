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

# The process is named after build.productName. It was 'Procedural Space
# Game' up to 0.3.0-beta and is 'Manifest' after it; both are accepted so
# this still reports honestly against an older artifact.
$names = 'Manifest', 'Procedural Space Game'

Start-Process -FilePath $exe

# WAITED FOR, NOT SLEPT THROUGH. This used to sleep a flat twenty seconds
# and then look once, which was fine while the artifact sat on a local
# disk. It does not: a portable build unpacks 83 MB of itself into %TEMP%
# before Electron so much as starts, and read off the X: share that takes
# longer than the window. The test reported FAIL on a build that was
# running perfectly well twenty-two seconds later — a false alarm on the
# last gate before a release, which is the worst place to have one.
#
# So: poll until the processes appear, then hold for a few seconds and
# check they are STILL there. Both halves matter. Appearing is not the
# same as surviving — a crash on boot puts processes on the list for a
# moment on its way out — and a fixed sleep tests neither.
$deadline = (Get-Date).AddSeconds(90)
$procs = @()
while ((Get-Date) -lt $deadline) {
  $procs = @(Get-Process -Name $names -ErrorAction SilentlyContinue)
  if ($procs.Count -ge 3) { break }
  Start-Sleep -Seconds 2
}
if ($procs.Count -ge 3) {
  Start-Sleep -Seconds 8
  $procs = @(Get-Process -Name $names -ErrorAction SilentlyContinue)
}
Write-Output ('processes alive: {0}' -f $procs.Count)

if ($procs.Count -ge 3) {
  Write-Output 'PASS — main, renderer and GPU processes are up and stayed up'
} else {
  Write-Output 'FAIL — the app did not come up, or did not stay running'
}
foreach ($p in $procs) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
Write-Output 'closed'
