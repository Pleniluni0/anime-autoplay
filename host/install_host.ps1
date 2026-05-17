# install_host.ps1
# Registra el native messaging host en Chrome para el usuario actual.
# Ejecutar una vez, y de nuevo si cambia el ID de la extensión.
#
# Uso: .\install_host.ps1 -ExtensionId "abcdefghijklmnopqrstuvwxyzabcdef"
# Si omites -ExtensionId se usa el placeholder y habrá que volver a ejecutarlo.

param(
    [string]$ExtensionId = "EXTENSION_ID_PLACEHOLDER"
)

$HostName   = "com.animeautoplay.host"
$HostJson   = "$PSScriptRoot\com.animeautoplay.host.json"
$RegKey     = "HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts\$HostName"

# Actualizar el JSON con el ID real de la extensión
$json = Get-Content $HostJson | ConvertFrom-Json
$json.allowed_origins = @("chrome-extension://$ExtensionId/")
$json | ConvertTo-Json -Depth 5 | Set-Content $HostJson -Encoding UTF8

# Registrar en el registro de Windows
if (-not (Test-Path $RegKey)) { New-Item -Path $RegKey -Force | Out-Null }
Set-ItemProperty -Path $RegKey -Name "(default)" -Value $HostJson

Write-Host "Host registrado correctamente:"
Write-Host "  JSON: $HostJson"
Write-Host "  Clave: $RegKey"
Write-Host ""
Write-Host "Si Python no esta en el PATH, edita animeautoplay_host.bat"
Write-Host "y pon la ruta completa a python.exe."
