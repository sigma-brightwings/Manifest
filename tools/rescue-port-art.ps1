# rescue-port-art.ps1 — lift the only copies of the port art out of models/
#
# models/ is gitignored (see .gitignore: it is ~300 MB of duplicated ship
# exports) and was about to be deleted wholesale as "old models". Most of it
# IS duplicate — but buried under "Manifest Models/uploads/" are two dozen
# PORT models that exist nowhere else in the repo, and fifteen of them are
# planetside ports that nothing in ref/station-lab/station.js can rebuild.
# The lab builds four orbital patterns and no cities at all.
#
# So: copy the newest copy of every unique model into a tracked home, and
# only then may models/ go.
#
# WHERE EACH ONE LANDS, and why it is not all one folder:
#
#   ref/ports/     art whose NAME already tells render.js what it is, so
#                  glb2hulls --ports can convert it and the pooling in
#                  portModelFor picks it up with no code change.
#   ref/port-art/  everything else: kept and tracked, but not wired in,
#                  because a person has to decide what it IS first. A file
#                  in here is doing nothing except waiting to be named.
#
# THE ONE RENAME. render.js declares its orbital patterns by STEM —
# PORT_PATTERNS = { cylinder, spine, ring, cradle } — and strips a -s/-m/-l
# size suffix before matching. "cylinder-station-l" stems to
# "cylinder-station", which is in no table and carries no `station-` prefix,
# so it would convert and then never be chosen by anything. "cylinder-l"
# stems to "cylinder", which the table already names. The file is renamed to
# match the code rather than the code widened to match the file, because the
# table is the deliberate half.
#
# Run from the repo root:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\rescue-port-art.ps1

$ErrorActionPreference = 'Stop'

if (-not (Test-Path 'models')) {
  Write-Output 'models/ is already gone - nothing to rescue.'
  exit 0
}

New-Item -ItemType Directory -Force -Path 'ref\ports' | Out-Null
New-Item -ItemType Directory -Force -Path 'ref\port-art' | Out-Null
New-Item -ItemType Directory -Force -Path 'ref\port-art\screenshots' | Out-Null

# Anything whose filename already exists in ref/glb is a duplicate ship
# export. That is the bulk of models/ and is not what we are here for.
$shipNames = Get-ChildItem 'ref\glb' -File | ForEach-Object { $_.Name }

function Get-Destination([string]$name) {
  if ($name -like 'cylinder-station-*') {
    return 'ref\ports\' + ($name -replace '^cylinder-station-', 'cylinder-')
  }
  if ($name -like 'city-*') { return 'ref\ports\' + $name }
  return 'ref\port-art\' + $name
}

$rescued = @()
Get-ChildItem 'models' -Recurse -File -Filter *.glb |
  Where-Object { $shipNames -notcontains $_.Name } |
  Group-Object Name |
  ForEach-Object {
    # Several copies of most of these exist at different depths; take the
    # newest by write time, which is the one the lab exported last.
    $best = $_.Group | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $dest = Get-Destination $_.Name
    Copy-Item $best.FullName $dest -Force
    $rescued += [PSCustomObject]@{
      Name   = $_.Name
      Copies = $_.Count
      To     = $dest
      KB     = [int]($best.Length / 1KB)
      When   = $best.LastWriteTime.ToString('MM-dd HH:mm')
    }
  }

Get-ChildItem 'models\screenshots' -File -ErrorAction SilentlyContinue |
  ForEach-Object { Copy-Item $_.FullName ('ref\port-art\screenshots\' + $_.Name) -Force }

$rescued | Sort-Object To, Name | Format-Table -AutoSize | Out-String -Width 110 | Write-Output
Write-Output ('rescued models : ' + $rescued.Count)
Write-Output ('into ref/ports : ' + @(Get-ChildItem 'ref\ports' -File -Filter *.glb).Count)
Write-Output ('into port-art  : ' + @(Get-ChildItem 'ref\port-art' -File -Filter *.glb).Count)
Write-Output ('screenshots    : ' + @(Get-ChildItem 'ref\port-art\screenshots' -File -ErrorAction SilentlyContinue).Count)
