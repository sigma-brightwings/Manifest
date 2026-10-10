# verify-dist.ps1 — is what came out of the packager actually complete?
#
# Worth having because a partial artifact looks exactly like a whole one in
# a directory listing. The Linux tarball was written once while an AppImage
# build was failing beside it, and came out a third of its true size with no
# error attached to it.
$dist = Join-Path (Split-Path -Parent $PSScriptRoot) 'dist'
$tar  = Get-ChildItem $dist -Filter '*linux*.tar.gz' -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $tar) { Write-Output 'no linux tarball in dist/'; exit 1 }

Write-Output ('archive: {0}  ({1:N1} MB)' -f $tar.Name, ($tar.Length / 1MB))
$entries = & tar -tzf $tar.FullName 2>&1
if ($LASTEXITCODE -ne 0) { Write-Output 'FAIL — tar could not read it (truncated or corrupt)'; exit 1 }

Write-Output ('entries: {0}' -f $entries.Count)
foreach ($want in 'resources/app/index.html',
                  'resources/app/src/main.js',
                  'resources/app/electron/main.js',
                  'chrome-sandbox') {
  $hit = $entries | Where-Object { $_ -like "*$want*" } | Select-Object -First 1
  if ($hit) { Write-Output "  ok      $want" } else { Write-Output "  MISSING $want" }
}

# The game's own source must be in there; the models and the tests must not.
$leaked = $entries | Where-Object { $_ -like '*ref/glb/*' -or $_ -like '*/test/*' -or $_ -like '*node_modules/electron/dist*' }
if ($leaked) {
  Write-Output ('  LEAKED  {0} file(s) that should not ship, e.g. {1}' -f $leaked.Count, $leaked[0])
} else {
  Write-Output '  ok      no ref/, test/ or dev dependencies packaged'
}
