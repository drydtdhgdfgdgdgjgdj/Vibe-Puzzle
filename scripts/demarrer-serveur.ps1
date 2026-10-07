# ============================================================
# Lance le jeu depuis ce PC, prêt à être partagé.
#
#   Clic droit sur ce fichier > "Exécuter avec PowerShell"
#   ou, dans un terminal à la racine du projet :
#   powershell -ExecutionPolicy Bypass -File scripts\demarrer-serveur.ps1
#
# Compile l'interface puis démarre le serveur : tout passe par une seule
# adresse (port 3001), interface comprise. Ctrl+C pour arrêter.
#
# Options :
#   -Port 3002        autre port
#   -SansCompilation  ne recompile pas (plus rapide si rien n'a changé)
# ============================================================
param(
  [int]$Port = 3001,
  [switch]$SansCompilation
)

$ErrorActionPreference = 'Stop'
$racine = Split-Path -Parent $PSScriptRoot
Set-Location $racine

if (-not (Test-Path "$racine\node_modules")) {
  Write-Host "Installation des dépendances du serveur..." -ForegroundColor Cyan
  npm install
}
if (-not (Test-Path "$racine\puzzle-frontend\node_modules")) {
  Write-Host "Installation des dépendances de l'interface..." -ForegroundColor Cyan
  Push-Location "$racine\puzzle-frontend"; npm install; Pop-Location
}

if (-not $SansCompilation) {
  Write-Host "Compilation de l'interface..." -ForegroundColor Cyan
  Push-Location "$racine\puzzle-frontend"
  npm run build
  if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "La compilation a échoué." -ForegroundColor Red; exit 1 }
  Pop-Location
}

# Le port est-il déjà pris ? (serveur déjà lancé dans un autre terminal)
$occupe = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($occupe) {
  Write-Host "Le port $Port est déjà utilisé : un serveur tourne sans doute déjà." -ForegroundColor Yellow
  Write-Host "Ferme l'autre fenêtre (Ctrl+C), ou relance avec -Port 3002." -ForegroundColor Yellow
  exit 1
}

# Adresses par lesquelles on peut atteindre ce PC.
$adresses = [ordered]@{}
$adresses['Sur ce PC'] = "http://localhost:$Port"
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  ForEach-Object {
    $nom = if ($_.InterfaceAlias -like '*Tailscale*') { 'Par Tailscale (ami à distance)' } else { "Sur le même wifi ($($_.InterfaceAlias))" }
    if (-not $adresses.Contains($nom)) { $adresses[$nom] = "http://$($_.IPAddress):$Port" }
  }

Write-Host ""
Write-Host "  Adresses pour jouer :" -ForegroundColor Green
foreach ($a in $adresses.GetEnumerator()) { "    {0,-34} {1}" -f $a.Key, $a.Value | Write-Host }
Write-Host ""
Write-Host "  Dans le jeu, le bouton « Lien » copie l'invitation à envoyer à ton ami." -ForegroundColor DarkGray
Write-Host "  Laisse cette fenêtre ouverte pendant que vous jouez. Ctrl+C pour arrêter." -ForegroundColor DarkGray
Write-Host ""

$env:PORT = "$Port"
node server.js
