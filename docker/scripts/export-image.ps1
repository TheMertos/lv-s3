<#
.SYNOPSIS
  Build image (docker build backend/Dockerfile), start stack (compose up --wait), then docker save (gzip by default).

.DESCRIPTION
  Matches backend/Dockerfile: Vite UI is embedded in the image. Default flow builds,
  runs the stack until healthy, exports lv-s3:<Tag> as lv-s3-<tag>-<stamp>.tar.gz
  (System.IO.Compression; no gzip.exe required). Use -NoCompress for plain .tar.

.PARAMETER Tag
  Image tag (default: latest). Same as env LV_S3_IMAGE_TAG for compose.

.PARAMETER SaveOnly
  Skip build/up; only docker save (image must exist locally).

.PARAMETER NoUp
  Only docker build, then save (no container start — e.g. missing .env).

.PARAMETER Down
  Run docker compose down after a successful save.

.PARAMETER NoCompress
  Write uncompressed .tar instead of .tar.gz.

.PARAMETER OutDir
  Output directory (default: docker/out).
#>
param(
    [string] $Tag = "latest",
    [switch] $SaveOnly,
    [switch] $SkipBuild, # deprecated: same as -SaveOnly
    [switch] $NoUp,
    [switch] $Down,
    [switch] $NoCompress,
    [string] $OutDir = ""
)

if ($SkipBuild) { $SaveOnly = $true }

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
if (-not $OutDir) { $OutDir = Join-Path $ScriptDir "..\out" }
$OutDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutDir)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$Image = "lv-s3:$Tag"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outTar = Join-Path $OutDir "lv-s3-$Tag-$Stamp.tar"
$outGz = Join-Path $OutDir "lv-s3-$Tag-$Stamp.tar.gz"

Push-Location $RepoRoot
try {
    $env:LV_S3_IMAGE_TAG = $Tag
    if (-not $SaveOnly) {
        $viteS3 = if ($env:PUBLIC_S3_API) { $env:PUBLIC_S3_API } else { "http://localhost:9000" }
        $viteRegion = if ($env:PUBLIC_S3_REGION) { $env:PUBLIC_S3_REGION } else { "us-east-1" }
        Write-Host "==> docker build -f backend/Dockerfile -t $Image"
        docker build -f backend/Dockerfile -t $Image `
            --build-arg "VITE_ADMIN_API=" `
            --build-arg "VITE_S3_ENDPOINT=$viteS3" `
            --build-arg "VITE_S3_REGION=$viteRegion" `
            .
        if ($LASTEXITCODE -ne 0) { throw "docker build failed" }
        if (-not $NoUp) {
            Write-Host "==> docker compose up -d --wait"
            docker compose -f docker-compose.yml up -d --wait
            if ($LASTEXITCODE -ne 0) {
                throw "docker compose up failed (need Compose v2 with 'up --wait'? Try -NoUp)"
            }
        }
    }
}
finally {
    Pop-Location
}

$exportedPath = $null
if ($NoCompress) {
    Write-Host "==> docker save $Image -> $outTar"
    docker save -o $outTar $Image
    if ($LASTEXITCODE -ne 0) { throw "docker save failed" }
    $exportedPath = $outTar
    Write-Host "Saved $exportedPath"
}
else {
    $tempTar = Join-Path ([System.IO.Path]::GetTempPath()) ("lv-s3-export-" + [Guid]::NewGuid().ToString("N") + ".tar")
    try {
        Write-Host "==> docker save $Image (temp)"
        docker save -o $tempTar $Image
        if ($LASTEXITCODE -ne 0) { throw "docker save failed" }
        Write-Host "==> gzip -> $outGz"
        $inFs = [System.IO.File]::OpenRead($tempTar)
        $outFs = [System.IO.File]::Create($outGz)
        $gz = New-Object System.IO.Compression.GZipStream($outFs, [System.IO.Compression.CompressionLevel]::Optimal)
        try {
            $inFs.CopyTo($gz)
        }
        finally {
            $gz.Dispose()
            $outFs.Dispose()
            $inFs.Dispose()
        }
        $exportedPath = $outGz
        Write-Host "Saved $exportedPath"
    }
    finally {
        Remove-Item -LiteralPath $tempTar -Force -ErrorAction SilentlyContinue
    }
}

if ($Down -and -not $SaveOnly) {
    Push-Location $RepoRoot
    try {
        Write-Host "==> docker compose down"
        docker compose -f docker-compose.yml down
        if ($LASTEXITCODE -ne 0) { throw "docker compose down failed" }
    }
    finally {
        Pop-Location
    }
}

Write-Host "Remote: .\docker\scripts\import-image.ps1 -Path `"$exportedPath`"  then  docker compose up -d"
