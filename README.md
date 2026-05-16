# Anime AutoPlay

Extensión de Chrome que convierte sitios de anime/donghua en una experiencia tipo Netflix: cuenta atrás al final del episodio, paso automático al siguiente, pantalla completa restaurada entre episodios y salto de intro configurable.

## Sitios compatibles

- AnimeAV1
- AnimeFLV
- SeriesDonghua
- MundoDonghua
- DonghuaLife

## Funcionalidades

- **Reproducción automática del siguiente episodio** con overlay de cuenta atrás (3–15 s). Botones *Ver ahora* / *Cancelar*.
- **Recordar reproductor**: guarda qué servidor (Tamamo, Voe, Dailymotion, JWPlayer, etc.) elegiste y lo selecciona solo al cambiar de episodio.
- **Pantalla completa automática**: si veías el episodio en fullscreen, al pasar al siguiente aparece un prompt grande sobre la pantalla; un solo click la restaura. En MundoDonghua además dispara el placeholder del reproductor en el mismo click.
- **Salto de intro/opening**: configura inicio y fin (ej. `0:00 → 1:30`).
  - *Manual*: botón flotante "⏩ Saltar intro" sobre el vídeo.
  - *Automático*: salta solo sin botón.
- **Salto de créditos/ending**: muestra la cuenta atrás *N* segundos antes del final, para evitar el ending.
- **Pausa al cambiar de pestaña**: el countdown se pausa si dejas de mirar la pestaña y se reanuda al volver.
- **DNS-prefetch y prefetch del siguiente episodio**: arranca la carga del próximo episodio en segundo plano para que el cambio sea más rápido.

## Instalación

1. Descarga o clona el repositorio:
   ```bash
   git clone https://github.com/Pleniluni0/anime-autoplay.git
   ```
2. Abre `chrome://extensions/` en Chrome (o Edge/Brave/etc.).
3. Activa el **Modo de desarrollador** (esquina superior derecha).
4. Pulsa **Cargar descomprimida** y selecciona la carpeta `anime-autoplay`.
5. Listo. El icono ▶ aparecerá en la barra de extensiones.

## Configuración

Abre el popup pulsando el icono ▶ de la extensión:

| Opción | Descripción |
| --- | --- |
| Reproducción automática | Activa el paso al siguiente episodio |
| Cuenta atrás | Segundos antes de saltar (3–15) |
| Recordar reproductor | Mantiene el mismo servidor entre episodios |
| Pantalla completa automática | Restaura fullscreen al cambiar |
| Saltar intro / opening | Define rango y modo (manual/automático) |
| Saltar créditos / ending | Muestra cuenta atrás *N* s antes del final |

## Cómo funciona

La extensión usa tres content scripts coordinados por `postMessage`:

- **`main.js`** — corre en la página principal del sitio. Detecta el botón de "Siguiente episodio", muestra los overlays, gestiona el guardado de flags entre navegaciones (`aap_autoplay`, `aap_fullscreen`, `aap_player_*`).
- **`bridge.js`** — corre en iframes intermedios del mismo origen (ej. `mdnemonicplayer.xyz`, `mundodonghua.com/player.php`). Reenvía mensajes entre la página principal y los iframes cross-origin del reproductor real.
- **`player.js`** — corre en cualquier iframe (Dailymotion, Voe, JWPlayer, etc.). Engancha el `<video>` del reproductor real, muestra el countdown desde dentro del iframe, gestiona el salto de intro y el unmute tras autoplay.

### Restricciones del navegador

Chrome bloquea `play()` y `requestFullscreen()` sin un *trusted user gesture*. La extensión las sortea con:

- **Truco mute → play → unmute**: el autoplay siempre permite vídeo muteado, así que se reproduce muteado y se restaura el volumen tras 300 ms.
- **Mensaje `UNMUTE` explícito**: cuando el video arrancó muteado por la policy y `mutePlay` cacheó ese estado, un mensaje cross-frame fuerza `video.muted = false` (no bloqueado por la policy cuando el video ya está reproduciéndose) + dispara `setMuted([false])` por la API de Dailymotion/Vimeo.
- **Prompt de fullscreen con transient activation**: al cargar el siguiente episodio aparece un overlay grande; el click del usuario se aprovecha para entrar en pantalla completa dentro de la ventana de ~5 s de activación de Chrome.

## Estructura del repositorio

```
.
├── manifest.json     # Manifest V3
├── main.js           # Script principal (top frame)
├── bridge.js         # Relay de mensajes en iframes intermedios
├── player.js         # Script para iframes del reproductor
├── popup.html        # UI de configuración
├── popup.js          # Lógica del popup
├── overlay.css       # Estilos compartidos de overlays
└── icons/            # Iconos de la extensión
```

## Licencia

MIT
