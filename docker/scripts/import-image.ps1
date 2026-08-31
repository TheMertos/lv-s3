<#
.SYNOPSIS
  docker load from export-image output; tags the result as lv-s3:latest.

.DESCRIPTION
  Export file name: lv-s3-<tag>-<timestamp>.tar  e.g. lv-s3-latest-20260409-132834.tar
  If -Path is omitted, picks the newest matching archive among all *existing* search folders:
    LV_S3_EXPORT_DIRS (semicolon or colon separated), LV_S3_EXPORT_DIR, script ..\out,
    repo docker\out, .\docker\out, .\out (cwd).

.PARAMETER Path
  Optional path to .tar archive.

.PARAMETER NoTagLatest
  Skip docker tag ... lv-s3:latest
#>
param(
    [string] $Path = "",
    [switch] $NoTagLatest
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Get-RepoRoot([string] $scriptDir) {
    $candidates = @(
        @{ Base = $scriptDir; Steps = 0 },
        @{ Base = $scriptDir; Steps = 1 },
        @{ Base = $scriptDir; Steps = 2 }
    )
    foreach ($c in $candidates) {
        $dir = $c.Base
        for ($i = 0; $i -lt $c.Steps; $i++) { $dir = Split-Path -Parent $dir }
        if (Test-Path -LiteralPath (Join-Path $dir "docker-compose.yml")) {
            return (Resolve-Path -LiteralPath $dir).Path
        }
    }
    return (Resolve-Path -LiteralPath (Join-Path $scriptDir "..\..")).Path
}

$RepoRoot = Get-RepoRoot $ScriptDir

function Get-SearchDirs {
    $ordered = [ordered]@{}

    function Add-IfDir([string] $p) {
        if ([string]::IsNullOrWhiteSpace($p)) { return }
        if (-not (Test-Path -LiteralPath $p -PathType Container)) { return }
        $abs = (Resolve-Path -LiteralPath $p).Path
        if (-not $ordered.Contains($abs)) { $ordered[$abs] = $true }
    }

    if ($env:LV_S3_EXPORT_DIRS) {
        foreach ($seg in $env:LV_S3_EXPORT_DIRS -split '[;:]', [StringSplitOptions]::RemoveEmptyEntries) {
            Add-IfDir $seg.Trim()
        }
    }
    if ($env:LV_S3_EXPORT_DIR) {
        Add-IfDir $env:LV_S3_EXPORT_DIR
    }
    Add-IfDir $ScriptDir
    Add-IfDir (Join-Path $RepoRoot "docker\out")
    Add-IfDir (Join-Path $ScriptDir "..\out")
    Add-IfDir (Join-Path (Get-Location) "docker\out")
    Add-IfDir (Join-Path (Get-Location) "out")

    @($ordered.Keys)
}

function Get-NewestExportPath {
    $all = @()
    foreach ($dir in Get-SearchDirs) {
        $items = @(
            Get-ChildItem -LiteralPath $dir -ErrorAction SilentlyContinue |
            Where-Object {
                -not $_.PSIsContainer -and (
                    ($_.Name -like "lv-s3-*.tar" -and $_.Name -notlike "*.gz") -or
                    $_.Name -like "lv-s3-*.tar.gz" -or
                    $_.Name -like "lv-s3-*.tgz"
                )
            }
        )
        $all += $items
    }
    if ($all.Count -eq 0) { return $null }
    ($all | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}

if (-not $Path) {
    $Path = Get-NewestExportPath
    if (-not $Path) {
        throw @"
No lv-s3-<tag>-<stamp>.tar(.gz) in any existing search directory.
Searched (only if folder exists): LV_S3_EXPORT_DIRS, LV_S3_EXPORT_DIR,
  $ScriptDir, $(Join-Path $RepoRoot 'docker\out'), $(Join-Path $ScriptDir '..\out'), .\docker\out, .\out
Pass -Path or set LV_S3_EXPORT_DIRS (e.g. C:\exports;D:\backup).
"@
    }
    Write-Host "Using newest export: $Path"
}

if (-not (Test-Path -LiteralPath $Path)) {
    throw "File not found: $Path"
}

$lower = $Path.ToLowerInvariant()
if ($lower.EndsWith(".gz") -or $lower.EndsWith(".tgz")) {
    Write-Host @"
Gzip: use Git Bash / WSL:
  ./docker/scripts/import-image.sh
or decompress to .tar then re-run import-image.ps1 -Path file.tar
"@
    exit 1
}

Write-Host "Loading $Path"
$log = docker load -i $Path 2>&1
$log | Write-Host
if ($LASTEXITCODE -ne 0) { throw "docker load failed" }

$text = ($log | Out-String)
$m = [regex]::Match($text, 'Loaded image:\s*(.+)', 'IgnoreCase')
if (-not $m.Success) {
    Write-Warning "Could not parse 'Loaded image:'; skip tagging lv-s3:latest"
}
elseif (-not $NoTagLatest) {
    $ref = $m.Groups[1].Value.Trim()
    docker tag $ref lv-s3:latest
    if ($LASTEXITCODE -ne 0) { throw "docker tag failed" }
    Write-Host "Tagged $ref -> lv-s3:latest"
}

Write-Host "Done. Example: `$env:LV_S3_IMAGE_TAG='latest'; docker compose -f docker-compose.yml up -d"
