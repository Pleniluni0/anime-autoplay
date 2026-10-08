# Anime AutoPlay

Extensión de Chrome que convierte sitios de anime/donghua en una experiencia tipo Netflix: cuenta atrás al final del episodio, paso automático al siguiente, pantalla completa y salto de intro configurable.

## Sitios probados

- AnimeAV1
- AnimeFLV
- SeriesDonghua
- MundoDonghua
- DonghuaLife
- JKAnime

Funciona en la mayoría de los reproductores embebidos (Dailymotion, Voe, JWPlayer, Streamtape, Filemoon, Vidhide, Mp4upload, HLS/zilla-networks, Mega…).

## Funcionalidades

- **Reproducción automática** con overlay de cuenta atrás (3–15 s). Botones *Ver ahora* / *Cancelar*.
- **Pantalla completa al pasar de episodio**: aparece un overlay y basta un click para activar el reproductor y el fullscreen.
- **Recordar reproductor**: guarda qué servidor elegiste y lo selecciona solo al cambiar de episodio.
- **Salto de intro/opening**: configura inicio y fin (ej. `0:00 → 1:30`).
  - *Manual*: botón flotante "⏩ Saltar intro" sobre el vídeo.
  - *Automático*: salta solo sin botón.
  - *×2*: reproduce la intro al doble de velocidad.
- **Salto de créditos/ending**: muestra la cuenta atrás *N* segundos antes del final.
- **Modo noche**: eliges cuántos episodios más ver y el autoplay se detiene solo, por si te quedas dormido.
- **Historial**: último episodio visto de cada serie, agrupado por sitio, en el popup (🕘). Solo se guarda cuando la cuenta atrás terminó y se pasó de episodio. Se guarda únicamente en tu navegador.
- **Idioma**: español o inglés (por defecto, el del navegador).
- **Pausa al cambiar de pestaña**: la cuenta atrás se pausa si dejas de mirar la pestaña.

## Atajos de teclado

Funcionan con el reproductor enfocado (si no responden, haz click en el vídeo antes).

| Tecla | Acción |
| --- | --- |
| `N` | Siguiente episodio |
| `S` | Saltar intro |
| `C` | Cancelar la cuenta atrás |
| `G` | Acortar la cuenta atrás a 2 s |
| `Esc` | Cancelar (y volver a pantalla completa) |
| `F` | Pantalla completa |
| `P` | Picture-in-Picture |
| `←` `→` | Retroceder / adelantar 5 s |
| `+` `-` | Sumar / restar 5 s a "Saltar créditos / ending" (y a la cuenta atrás en pantalla, si hay una) |

## Instalación

### Chrome Web Store (recomendada)

1. Abre [Chrome Web Store](https://chrome.google.com/webstore) y busca "Anime AutoPlay".
2. Pulsa **Añadir a Chrome**.
3. Listo. La extensión funciona inmediatamente en los sitios soportados.

### Desde el código fuente (desarrollador)

1. Abre `chrome://extensions/` en Chrome (o Edge/Brave/etc.).
2. Activa el **Modo de desarrollador** (esquina superior derecha).
3. Pulsa **Cargar descomprimida** y selecciona la carpeta del proyecto.

## Configuración

Abre el popup pulsando el icono de la extensión:

| Opción | Descripción |
| --- | --- |
| Reproducción automática | Activa el paso al siguiente episodio |
| Fullscreen al cargar | Overlay de pantalla completa al pasar de episodio |
| Cuenta atrás | Segundos antes de saltar (3–15) |
| Saltar créditos / ending | Muestra cuenta atrás *N* s antes del final |
| Saltar intro / opening | Define rango y modo (manual/automático/×2) |
| Recordar reproductor | Mantiene el mismo servidor entre episodios |
| Modo noche | Detiene el autoplay tras unos episodios |
| Atajos de teclado | Activa o desactiva los atajos |
| 🕘 Historial | Último episodio visto de cada serie |
| ES / EN | Idioma de la interfaz |

## Cómo funciona

La extensión usa cuatro scripts coordinados, más `i18n.js` (traducciones, cargado antes que `main.js`, `player.js` y el popup):

- **`main.js`** — corre en la página principal. Detecta el botón de "Siguiente episodio", muestra los overlays, gestiona flags entre navegaciones, el modo noche y el historial.
- **`bridge.js`** — corre en iframes intermedios del mismo origen. Reenvía mensajes entre la página principal y los iframes cross-origin del reproductor real.
- **`player.js`** — corre en iframes de reproductores (Dailymotion, Voe, JWPlayer, etc.). Engancha el `<video>`, gestiona el salto de intro, los atajos, el unmute tras autoplay y su propia cuenta atrás/toasts cuando el reproductor está a pantalla completa.
- **`background.js`** — service worker mínimo (la extensión no usa native messaging).

## Estructura del repositorio

```
.
├── manifest.json          # Manifest V3 (permisos mínimos)
├── main.js                # Script principal (top frame)
├── background.js          # Service worker mínimo
├── bridge.js              # Relay de mensajes en iframes intermedios
├── player.js              # Script para iframes del reproductor
├── i18n.js                # Traducciones es/en
├── popup.html             # UI de configuración
├── popup.js               # Lógica del popup
├── overlay.css            # Estilos compartidos de overlays
├── PRIVACY.md             # Política de privacidad
├── DESCRIPTION.md         # Texto para la Chrome Web Store
└── icons/                 # Iconos de la extensión
```

## Licencia

MIT
