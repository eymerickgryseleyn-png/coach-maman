# Coach Maman - serveur HTTP local (PowerShell pur, zéro dépendance)
# Sert le dossier courant, MIME-aware, ouvre le navigateur automatiquement.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Web -ErrorAction SilentlyContinue

$root = $PSScriptRoot
$ports = 8000, 8080, 8888, 5500, 5000
$listener = $null
$bound = $null

foreach ($p in $ports) {
    try {
        $l = New-Object System.Net.HttpListener
        $l.Prefixes.Add("http://127.0.0.1:$p/")
        $l.Prefixes.Add("http://localhost:$p/")
        $l.Start()
        $listener = $l
        $bound = $p
        break
    } catch {
        # port occupé, on essaie le suivant
    }
}

if (-not $listener) {
    Write-Host ""
    Write-Host "  Impossible de demarrer le serveur sur les ports $($ports -join ', ')" -ForegroundColor Red
    Write-Host "  Ferme les autres serveurs ou modifie serve.ps1"
    Write-Host ""
    pause
    exit 1
}

$url = "http://localhost:$bound/index.html"

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "    Coach Maman - Serveur lance" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "    URL  : $url" -ForegroundColor Green
Write-Host "    Dossier servi : $root"
Write-Host ""
Write-Host "  Astuce : laisse cette fenetre ouverte tant que tu utilises l'app." -ForegroundColor Yellow
Write-Host "  Ferme cette fenetre pour arreter le serveur."
Write-Host ""

# Ouvrir le navigateur
Start-Process $url

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.htm'  = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.mjs'  = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.webp' = 'image/webp'
    '.ico'  = 'image/x-icon'
    '.woff' = 'font/woff'
    '.woff2'= 'font/woff2'
    '.ttf'  = 'font/ttf'
    '.map'  = 'application/json'
    '.txt'  = 'text/plain; charset=utf-8'
    '.webmanifest' = 'application/manifest+json'
    '.xlsx' = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $resp = $ctx.Response

        try {
            $rel = $req.Url.AbsolutePath.TrimStart('/')
            if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
            # Sécurité simple : pas de remontée hors dossier
            $rel = $rel -replace '\.\.', ''
            $rel = [System.Web.HttpUtility]::UrlDecode($rel)

            # Route spéciale : /planif.xlsx -> fichier Excel dans le dossier parent
            if ($rel -ieq 'planif.xlsx') {
                $full = Join-Path (Split-Path $root -Parent) 'Planif marche maman.xlsx'
            } else {
                $full = Join-Path $root $rel
            }

            if (Test-Path $full -PathType Container) {
                $full = Join-Path $full 'index.html'
            }

            if (Test-Path $full -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($full).ToLower()
                $ct = $mime[$ext]
                if (-not $ct) { $ct = 'application/octet-stream' }
                $resp.ContentType = $ct
                $resp.Headers.Add('Cache-Control', 'no-cache')
                $bytes = [System.IO.File]::ReadAllBytes($full)
                $resp.ContentLength64 = $bytes.Length
                $resp.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host ("  200  {0}" -f $rel) -ForegroundColor DarkGray
            } else {
                $resp.StatusCode = 404
                $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - $rel introuvable")
                $resp.OutputStream.Write($msg, 0, $msg.Length)
                Write-Host ("  404  {0}" -f $rel) -ForegroundColor DarkYellow
            }
        } catch {
            $resp.StatusCode = 500
            Write-Host ("  500  {0}" -f $_.Exception.Message) -ForegroundColor Red
        } finally {
            $resp.Close()
        }
    }
} finally {
    if ($listener) { $listener.Stop(); $listener.Close() }
}
