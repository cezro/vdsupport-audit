# FASE GHL Page Export -> GitHub
# Run from PowerShell: .\export-to-github.ps1
# Requires: git, gh (optional for repo create)

$ErrorActionPreference = 'Stop'
$BaseUrl = 'https://fullarchsalesexperts.com'
$ExportRoot = Join-Path $PSScriptRoot 'site-export'
$HtmlDir = Join-Path $ExportRoot 'html'
$AuditDir = Join-Path $ExportRoot 'audit'

New-Item -ItemType Directory -Force -Path $HtmlDir, $AuditDir | Out-Null

# Pages discovered via crawl + audit log funnel paths (Jun 2026)
$Pages = @(
    '/home',
    '/fase-service-page',
    '/full-arch-growth-system',
    '/service-page',
    '/service-page-555902',
    '/ncla-quiz-funnel',
    '/ncla-squeeze-page-1',
    '/ncla-result-page',
    '/course-641943',
    '/nextlevel-124405',
    '/discovery-call',
    '/booking',
    '/thank-you',
    '/result-page-4799-page',
    '/privacy-policy',
    '/privacy-policy-page',
    '/terms-of-use'
)

$manifest = @()
foreach ($path in $Pages) {
    $url = "$BaseUrl$path"
    $safe = ($path.Trim('/') -replace '[^a-zA-Z0-9_-]', '_')
    if (-not $safe) { $safe = 'index' }
    $outFile = Join-Path $HtmlDir "$safe.html.disabled"
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -MaximumRedirection 5
        $html = $resp.Content
        [System.IO.File]::WriteAllText($outFile, $html, [System.Text.UTF8Encoding]::new($false))
        $title = if ($html -match '<title[^>]*>(.*?)</title>') { $Matches[1] } else { '' }
        $manifest += [pscustomobject]@{
            path = $path
            url = $resp.BaseResponse.ResponseUri.AbsoluteUri
            file = "html/$safe.html.disabled"
            status = [int]$resp.StatusCode
            title = ($title -replace '\s+', ' ').Trim()
            size_kb = [math]::Round($html.Length / 1024, 1)
        }
        Write-Host "OK  $path -> $safe.html.disabled"
    } catch {
        $manifest += [pscustomobject]@{ path = $path; url = $url; error = $_.Exception.Message }
        Write-Host "ERR $path : $($_.Exception.Message)"
    }
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $AuditDir 'sitemap.json') -Encoding UTF8

# Text extraction for copy audit
$issues = @()
foreach ($item in $manifest) {
    if (-not $item.file) { continue }
    $html = Get-Content (Join-Path $ExportRoot $item.file) -Raw
    $text = $html -replace '(?is)<script.*?</script>', ' '
    $text = $text -replace '(?is)<style.*?</style>', ' '
    $text = $text -replace '<[^>]+>', ' '
    $text = $text -replace '\s+', ' '
    $issues += [pscustomobject]@{
        path = $item.path
        home_lending_copy = $text -match 'home lending'
        demo_mode_result_page = $text -match 'Demo mode'
        template_literal = $html -match '\$\{gapHeadline\}'
        broken_spacing = $text -match 'hasa leak|exactlywhere|YourFull-Arch'
        zero_stats = $text -match '0%\s*conversion|Only 0%'
    }
}
$issues | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $AuditDir 'content-flags.json') -Encoding UTF8

Write-Host "`nExport complete: $ExportRoot"
Write-Host "Next: cd $ExportRoot; git init; git add .; git commit -m 'FASE site HTML snapshot'"
