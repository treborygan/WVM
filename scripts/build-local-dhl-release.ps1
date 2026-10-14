param(
    [Parameter(Mandatory = $true)]
    [string]$BrandPackPath
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$packRoot = (Resolve-Path -LiteralPath $BrandPackPath).Path
$manifestPath = Join-Path $packRoot 'brand.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$stageRoot = Join-Path $repoRoot 'public/brand-assets'

if (Test-Path -LiteralPath $stageRoot) {
    throw "Private asset staging already exists at '$stageRoot'. Review or remove it before rebuilding."
}

$selected = @(
    $manifest.assets | Where-Object id -eq 'asset-dhl-logo-bf-rgb'
    $manifest.assets | Where-Object id -eq 'asset-dhl-illustration-warehouse-delivery'
    $manifest.fonts | Where-Object { $_.family -eq 'Delivery' -and $_.style -eq 'normal' -and $_.weight -in @(400, 700) }
)
if ($selected.Count -ne 4) {
    throw "Expected the DHL logo, warehouse illustration, and two Delivery font styles; found $($selected.Count) manifest entries."
}

New-Item -ItemType Directory -Path $stageRoot | Out-Null
$staged = @()
try {
    foreach ($asset in $selected) {
        $relative = [string]$asset.relative_path
        if ($relative -notmatch '^(assets|fonts)/[A-Za-z0-9_. -]+$') {
            throw "Unsafe brand asset path in manifest: '$relative'"
        }
        $source = Join-Path $packRoot $relative
        $resolvedSource = (Resolve-Path -LiteralPath $source).Path
        if (-not $resolvedSource.StartsWith($packRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Brand asset path escaped the selected pack: '$relative'"
        }
        $actualHash = (Get-FileHash -LiteralPath $resolvedSource -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne ([string]$asset.sha256).ToLowerInvariant()) {
            throw "Brand asset hash mismatch for '$relative'."
        }
        $destinationName = switch -Exact ([IO.Path]::GetFileName($relative)) {
            'DHL_Logo_BF_rgb.svg' { 'DHL_Logo_BF_rgb.svg' }
            'DHL_Illustration_Warehouse_Delivery.svg' { 'DHL_Illustration_Warehouse_Delivery.svg' }
            'Delivery_Rg.ttf' { 'Delivery_Rg.ttf' }
            'Delivery_Bd.ttf' { 'Delivery_Bd.ttf' }
            default { throw "Unapproved asset selected: '$relative'" }
        }
        Copy-Item -LiteralPath $resolvedSource -Destination (Join-Path $stageRoot $destinationName)
        $staged += [pscustomobject]@{ path = $destinationName; sha256 = $actualHash; source = $relative }
    }

    $staged | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stageRoot 'manifest.json') -Encoding utf8
    Push-Location $repoRoot
    try {
        & npx.cmd tauri build --ci --no-sign --bundles msi
        if ($LASTEXITCODE -ne 0) { throw "Tauri package build failed with exit code $LASTEXITCODE." }
    }
    finally { Pop-Location }
}
catch {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
    throw
}

Write-Output 'Private, hash-verified DHL MSI build completed.'
Write-Output 'The verified local asset staging is retained under public/brand-assets/ and excluded from Git.'
