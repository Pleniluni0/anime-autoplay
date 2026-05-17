# Host Anime Autoplay

Extensión de Chrome que convierte sitios de anime/donghua en una experiencia tipo Netflix: cuenta atrás al final del episodio, paso automático al siguiente, pantalla completa y salto de intro configurable.

Funciona en **dos modos**: con host nativo instalado (totalmente automático) o sin él (igual que una extensión normal, con un click manual para activar fullscreen).

## Sitios probados

- AnimeAV1
- AnimeFLV
- SeriesDonghua
- MundoDonghua
- DonghuaLife

Funciona en la mayoría de los reproductores embebidos (Dailymotion, Voe, JWPlayer, Streamtape, Filemoon, HLS/zilla-networks, Mega…).

## Modos de funcionamiento

### Modo automático (con host nativo)

Cuando el episodio termina, la extensión pasa al siguiente y activa el reproductor + pantalla completa **sin ninguna interacción del usuario**. Para lograrlo, un script Python local simula un click real del sistema operativo, lo que le da al navegador el gesto de usuario necesario para entrar en fullscreen.

```
Extensión → background.js → Native Messaging → Python (pyautogui) → click real del SO
```

### Modo manual (sin host nativo)

Si el host no está instalado, la extensión funciona igual que una extensión normal: al pasar de episodio aparece un overlay en pantalla y el usuario pulsa una vez para activar el reproductor y la pantalla completa. El resto (autoplay, countdown, saltar intro…) funciona exactamente igual.

## Funcionalidades

- **Reproducción automática** con overlay de cuenta atrás (3–15 s). Botones *Ver ahora* / *Cancelar*.
- **Modo automático**: click automático vía host nativo, sin tocar nada.
- **Recordar reproductor**: guarda qué servidor elegiste y lo selecciona solo al cambiar de episodio.
- **Salto de intro/opening**: configura inicio y fin (ej. `0:00 → 1:30`).
  - *Manual*: botón flotante "⏩ Saltar intro" sobre el vídeo.
  - *Automático*: salta solo sin botón.
- **Salto de créditos/ending**: muestra la cuenta atrás *N* segundos antes del final.
- **Pausa al cambiar de pestaña**: el countdown se pausa si dejas de mirar la pestaña.

## Instalación

### 1. Cargar la extensión en Chrome

1. Abre `chrome://extensions/` en Chrome (o Edge/Brave/etc.).
2. Activa el **Modo de desarrollador** (esquina superior derecha).
3. Pulsa **Cargar descomprimida** y selecciona la carpeta `host-animeav1-autoplay`.
4. Copia el **ID** de la extensión que aparece debajo del nombre.

### 2. Activar el modo automático (opcional)

Si quieres el modo totalmente automático necesitas instalar el host nativo:

**Requisito:** Python en el PATH con pyautogui instalado.

```bash
pip install pyautogui
```

Luego, desde la carpeta `host\`, ejecuta en PowerShell con el ID de tu extensión:

```powershell
.\install_host.ps1 -ExtensionId "tu_id_de_extension_aqui"
```

Reinicia Chrome. A partir de ahora el paso de episodio es completamente automático.

> **Nota:** El registro del host solo afecta a tu usuario de Windows (`HKCU`). No necesita permisos de administrador.

Si en el futuro mueves la carpeta de sitio, vuelve a ejecutar el `.ps1`.

## Configuración

Abre el popup pulsando el icono de la extensión:

| Opción | Descripción |
| --- | --- |
| Reproducción automática | Activa el paso al siguiente episodio |
| Modo automático | Click automático vía host nativo (requiere instalación) |
| Cuenta atrás | Segundos antes de saltar (3–15) |
| Recordar reproductor | Mantiene el mismo servidor entre episodios |
| Saltar intro / opening | Define rango y modo (manual/automático) |
| Saltar créditos / ending | Muestra cuenta atrás *N* s antes del final |

## Cómo funciona

La extensión usa cuatro scripts coordinados:

- **`main.js`** — corre en la página principal. Detecta el botón de "Siguiente episodio", muestra los overlays, gestiona flags entre navegaciones. Cuando aparece el overlay de fullscreen envía las coordenadas al background para el auto-click.
- **`background.js`** — service worker que recibe el mensaje de `main.js` y lo reenvía al host nativo vía `chrome.runtime.sendNativeMessage`.
- **`bridge.js`** — corre en iframes intermedios del mismo origen. Reenvía mensajes entre la página principal y los iframes cross-origin del reproductor real.
- **`player.js`** — corre en cualquier iframe (Dailymotion, Voe, JWPlayer, etc.). Engancha el `<video>`, gestiona el salto de intro y el unmute tras autoplay.

### Host nativo (`host/`)

| Archivo | Descripción |
| --- | --- |
| `animeautoplay_host.py` | Script Python que lee mensajes JSON del stdin y ejecuta clicks con `pyautogui` |
| `animeautoplay_host.bat` | Lanzador que Chrome usa para arrancar el script |
| `com.animeautoplay.host.json` | Manifiesto del host con la ruta al `.bat` y el ID de la extensión |
| `install_host.ps1` | Registra el host en `HKCU\SOFTWARE\Google\Chrome\NativeMessagingHosts` |

### Por qué funciona el click del host

Chrome bloquea `requestFullscreen()` sin un gesto real del usuario (`isTrusted: true`). Un click de JavaScript tiene `isTrusted: false` y no vale. El host Python usa `pyautogui` que simula un click a nivel del sistema operativo — el navegador lo recibe como si lo hubiera hecho el usuario físicamente.

### Restricciones del navegador (sin host)

Sin host, la extensión usa estas alternativas:

- **Truco mute → play → unmute**: el autoplay siempre permite vídeo muteado; se reproduce muteado y se restaura el volumen a los 300 ms.
- **Prompt de fullscreen con transient activation**: el overlay grande que aparece al cargar el episodio; el click del usuario activa fullscreen dentro de la ventana de ~5 s de activación de Chrome.

## Estructura del repositorio

```
.
├── manifest.json          # Manifest V3
├── main.js                # Script principal (top frame)
├── background.js          # Service worker — puente hacia el host nativo
├── bridge.js              # Relay de mensajes en iframes intermedios
├── player.js              # Script para iframes del reproductor
├── popup.html             # UI de configuración
├── popup.js               # Lógica del popup
├── overlay.css            # Estilos compartidos de overlays
├── icons/                 # Iconos de la extensión
└── host/
    ├── animeautoplay_host.py         # Script Python del host nativo
    ├── animeautoplay_host.bat        # Lanzador para Chrome
    ├── com.animeautoplay.host.json   # Manifiesto del host
    └── install_host.ps1              # Script de instalación (registro en Windows)
```

## Licencia

MIT
