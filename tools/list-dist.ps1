# list-dist.ps1 — what came out of the last package run.
$dist = Join-Path (Split-Path -Parent $PSScriptRoot) 'dist'
if (-not (Test-Path $dist)) { Write-Output 'no dist/ yet'; exit }
Get-ChildItem $dist -File | Sort-Object Name | ForEach-Object {
  '{0,-45} {1,8:N1} MB' -f $_.Name, ($_.Length / 1MB)
}
