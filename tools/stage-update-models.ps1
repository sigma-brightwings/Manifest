# stage-update-models.ps1 — file a drop of fresh exports into the two
# folders the converters actually read.
#
# The browser names downloads "trader-l(3).glb" when trader-l.glb already
# sits in the folder, so a drop arrives with the counter baked into the
# filename. glb2hulls keys a model by its filename, so left alone that
# counter becomes part of the hull id and "trader-l(3)" matches nothing in
# HULL_ASSIGN. Strip it, and where stripping collides — the same model
# downloaded twice — keep the newest write.
#
# SHIPS vs PORTS is decided by name, from the tables that already exist:
# render.js's PORT_PATTERNS names the four orbital patterns, and the pool
# prefixes are station-/city-/deep-. Everything else is a hull.
#
#   -WhatIf   print the plan and touch nothing.
#
# Run from the repo root:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\stage-update-models.ps1

param([switch]$WhatIf)

$ErrorActionPreference = 'Stop'

$SRC = 'update_models'
if (-not (Test-Path $SRC)) { Write-Output "$SRC not found - nothing to stage."; exit 0 }

New-Item -ItemType Directory -Force -Path 'ref\glb', 'ref\ports', 'ref\port-art' | Out-Null

# The four orbital patterns, by stem, exactly as render.js PORT_PATTERNS
# declares them. Kept as a list here rather than re-derived so that adding a
# fifth pattern is one edit in each place and visibly the same edit.
$ORBITAL = @('cylinder', 'ring', 'spine', 'cradle')

# Names the art arrives with that the game cannot live with. An ID is the
# contract — the hull table, the viewer and every save refer to a model by
# it — so a character that is only ever going to need quoting or escaping
# somewhere is worth spending one line on here rather than discovering in a
# stack trace. "enf._heavy" is an abbreviation that reached the filename;
# the period survives JSON but has no business in an identifier.
$RENAME = @{ 'enf._heavy' = 'enforcer_heavy' }

function Get-Stem([string]$name) {
  # "trader-l(3).glb" -> "trader-l";  "detail-kit(1).glb" -> "detail-kit"
  $stem = ($name -replace '\(\d+\)\.glb$', '') -replace '\.glb$', ''
  foreach ($k in $RENAME.Keys) {
    if ($stem -like ($k + '*')) { $stem = $RENAME[$k] + $stem.Substring($k.Length) }
  }
  $stem
}

function Get-Bucket([string]$stem) {
  $bare = $stem -replace '-(s|m|l)$', ''       # drop the size suffix
  if ($ORBITAL -contains $bare)   { return 'ref\ports' }
  if ($bare -like 'station-*')    { return 'ref\ports' }
  if ($bare -like 'city-*')       { return 'ref\ports' }
  if ($bare -like 'deep-*')       { return 'ref\ports' }
  # Not a port and not a hull: a kit of greebles, or art whose role nobody
  # has decided. Parked, not guessed — same rule as the rescue.
  if ($bare -like 'detail-kit*')  { return 'ref\port-art' }
  if ($bare -like 'comet*')       { return 'ref\port-art' }
  return 'ref\glb'
}

$plan = Get-ChildItem $SRC -File -Filter *.glb |
  Group-Object { Get-Stem $_.Name } |
  ForEach-Object {
    $best = $_.Group | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $bucket = Get-Bucket $_.Name
    [PSCustomObject]@{
      Stem    = $_.Name
      Copies  = $_.Count
      Source  = $best.Name
      Dest    = Join-Path $bucket ($_.Name + '.glb')
      KB      = [int]($best.Length / 1KB)
      When    = $best.LastWriteTime.ToString('MM-dd HH:mm')
      Existed = (Test-Path (Join-Path $bucket ($_.Name + '.glb')))
      Full    = $best.FullName
    }
  } | Sort-Object Dest, Stem

$plan | Select-Object Stem, Copies, Source, Dest, KB, When, Existed |
  Format-Table -AutoSize | Out-String -Width 130 | Write-Output

if ($WhatIf) { Write-Output ('WHATIF - ' + $plan.Count + ' files would be staged, nothing written.'); exit 0 }

foreach ($p in $plan) { Copy-Item $p.Full $p.Dest -Force }

Write-Output ('staged      : ' + $plan.Count)
Write-Output ('to ref/glb  : ' + @($plan | Where-Object { $_.Dest -like 'ref\glb\*' }).Count)
Write-Output ('to ref/ports: ' + @($plan | Where-Object { $_.Dest -like 'ref\ports\*' }).Count)
Write-Output ('to port-art : ' + @($plan | Where-Object { $_.Dest -like 'ref\port-art\*' }).Count)
Write-Output ('new ids     : ' + (($plan | Where-Object { -not $_.Existed } | ForEach-Object { $_.Stem }) -join ', '))
