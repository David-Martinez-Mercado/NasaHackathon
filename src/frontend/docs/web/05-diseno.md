# 05 · Diseño UI/UX: FieldShift (modo PRESERVACIÓN, responsive + estados)

Fecha: 2026-11-15. Rutas relativas a `src/frontend/`. Insumos: `00-decisiones.md`, `01-brief.md` (R1–R28, P1–P31), `preservacion.json`, `02-colorimetria.md` (tokens y estados de color **aprobados**: aquí se referencian por nombre, no se redefinen), `src/styles/app.css`, `src/main.tsx`, `src/components/*`, `src/pages/*`, `src/map/FieldMap.tsx`.
No existe `03-referencias.md` ni `04-contenido.md`: no se leyeron.

Este documento **no contiene código fuente de la app**. Los fragmentos CSS son valores de especificación (tokens, consultas, rejillas) para que la implementación sea medible; los cambios de TSX se describen por archivo:línea.

## 0. Skills y trazabilidad

| Skill | Estado | Uso |
|---|---|---|
| `impeccable` | cargada; `context` ejecutado (sin PRODUCT.md/DESIGN.md: refinamiento sobre implementación existente, modo **Operate**) | reglas de adaptación (reference/adapt.md), crítica final §15 |
| `design-taste-frontend` | disponible, **no aplicada**: su descripción la excluye para "dashboards or app screens". No hay dirección/semilla/redraws que declarar; la paleta y la tipografía vienen fijadas por `02-colorimetria.md` y el Figma | — |
| `redesign-existing-projects` | no cargada; su flujo (auditar → corregir) ya está cubierto por `01-brief.md` (auditoría) y este documento (corrección) | — |
| `ui-ux-pro-max`, `emil-design-eng` | no cargadas en esta sesión; los criterios de pulido de controles (hundimiento ≤1 px / escala 0.97, transiciones ≤ 150 ms, hover solo con puntero fino) se aplican igualmente en §8 | — |
| `frontend-design` | skill no disponible: frontend-design | — |

Conflictos skill ↔ contrato: ninguno aplicado. Cualquier sugerencia de cambiar textos, rutas, colores de datos o la marca tipográfica "HOME" se ignora (ver §13).

---

## 1. Concepto visual

**"El mapa no se mueve; el cuaderno se acomoda."** El mapa satelital es el campo: siempre montado, siempre a la vista (salvo Statistics). El panel es la libreta del agricultor: al lado en escritorio, rail + libreta en tableta, hoja deslizable encima en móvil. Toda decisión de este documento se mide contra eso: ningún panel, overlay o barra puede tapar el efecto de la acción que lo provocó (tocar un riesgo → se ve en el mapa; dibujar → el mapa ocupa ≥ 70 % del alto).

Se nota en: (a) un único `<FieldMap>` montado fuera de `<Routes>` (`main.tsx:34`) en los tres modos; (b) los overlays del mapa reservan siempre el alto visible del panel (`--sheet-offset`); (c) `map.setPadding` centra la parcela en la parte **visible** del mapa, no en el lienzo completo.

---

## 2. Breakpoints y modos de layout

### 2.1 Tokens de consulta

| Token | Consulta | Nombre |
|---|---|---|
| `Q_SHEET` | `(max-width: 599px), (max-width: 767px) and (orientation: portrait)` | Modo **hoja** (móvil y tableta estrecha vertical) |
| `Q_RAIL` | `(min-width: 600px) and (max-width: 1023px)` excepto `Q_SHEET` | Modo **rail** (tableta, móvil horizontal) |
| `Q_DESK` | `(min-width: 1024px)` | Modo **escritorio** |
| `Q_SHORT` | `(max-height: 800px)` | Pantalla baja (portátil 1366×768, tableta horizontal) |
| `Q_XSHORT` | `(max-height: 600px)` | Muy baja (móvil horizontal, ventanas partidas) |
| `Q_COARSE` | `(pointer: coarse)` | Táctil: objetivos 44 px |
| `Q_HOVER` | `(hover: hover) and (pointer: fine)` | Único contexto donde existen estilos `:hover` |

Justificación del corte 600/768 (desviación declarada respecto al encargo "móvil <600, tablet 600–1023"): entre 600 y 767 px **en vertical** un panel lateral de 320 px deja al mapa < 300 px, y la toolbar de 7 capas no cabe (R4, R10). Por eso esa franja usa la hoja; en horizontal (p. ej. 667×375, 740×360) usa el rail, porque una hoja inferior en 375 px de alto dejaría el mapa en ~150 px. La tipografía y densidad siguen el corte del encargo (600).

`Q_SHEET` se declara **una sola vez** en un módulo nuevo `src/layout.ts` (constante exportada) y se repite literal en `app.css`; comentario en ambos sitios "mantener sincronizados". Lectura en React con un hook nuevo `useMatchMedia(query)` en `src/hooks.ts` (sin librerías; `window.matchMedia` + `change`).

Se elimina el único media query actual `@media (max-width: 900px)` (`app.css:217-223`).

### 2.2 Modo escritorio (≥ 1024)

```
┌──────┬────────────────────┬───────────────────────────────────────────┐
│ side │  panel             │  mapa                                     │
│ 83px │  clamp(360px,      │  flex 1 1 0, min 480 px a 1024            │
│      │   38vw, 488px)     │                                           │
│      │  (=486 a 1280:     │  overlays en rejilla .map-ui (§4)         │
│      │   fiel al Figma)   │                                           │
└──────┴────────────────────┴───────────────────────────────────────────┘
```

- `.app` (`app.css:34`): `display: grid; grid-template-columns: var(--sidebar) var(--panel-w) minmax(0,1fr); height: 100dvh` (con `100vh` como fallback previo).
- `--panel-w: clamp(360px, 38vw, 488px)` sustituye `flex: 0 0 var(--panel)` (`app.css:50`). A 1024: panel 389, mapa 552. A 1280: 486 (Figma 488). A 1920: 488, mapa 1349.
- `.panel-wide` (Statistics, `app.css:51`): ocupa columnas 2–3 (`grid-column: 2 / -1`); el mapa está `hidden`.
- Opcional (P2 de prioridad, no requerido): botón icono "Hide panel" en el header que colapsa a `--panel-w: 0`; solo si el usuario lo confirma (nuevo control).

### 2.3 Modo rail (600–1023, fuera de `Q_SHEET`)

```
┌────┬──────────────────┬───────────────────────────────┐
│rail│ panel            │ mapa                          │
│72px│ clamp(300px,     │ min 320 px                    │
│    │  40vw, 400px)    │                               │
└────┴──────────────────┴───────────────────────────────┘
```

- Sidebar como rail de 72 px (`--sidebar: 72px` dentro de `Q_RAIL`), mismos ítems y orden.
- `--panel-w: clamp(300px, 40vw, 400px)`; si `100vw − 72 − panel < 320`, el panel cede: `--panel-w: min(clamp(300px, 40vw, 400px), 100vw − 72px − 320px)`. A 768: panel 307, mapa 389. A 1023: 400 / 551.
- Móvil horizontal (`Q_RAIL` + `Q_XSHORT`): rail con ítems solo icono (§3.2) y panel header de 48 px.

### 2.4 Modo hoja (`Q_SHEET`)

```
┌──────────────────────────┐ ← env(safe-area-inset-top)
│ [Field +] [Global ◐]  [▤]│  overlays superiores
│                          │
│        MAPA (fixed,      │
│        a pantalla        │
│        completa)   [+]   │
│                    [−]   │
│ [▣][💧][▥][△][☂][☀][⛰] │  toolbar (scroll-x), sobre la hoja
├══════════ ▬▬ ════════════┤ ← asa (botón)
│ HOME                 [←] │  header 56 px
│ ┄ contenido con scroll ┄ │  hoja (peek / half / expanded)
├──────────────────────────┤
│ ⌂    🌱    🛡    🌾   ⋯ │  barra inferior 56 px
└──────────────────────────┘ ← env(safe-area-inset-bottom)
```

- `.map` (`app.css:178`): `position: fixed; inset: 0 0 var(--nav-space) 0` donde `--nav-space: calc(56px + env(safe-area-inset-bottom))`. Sin `70vh` (R12): el alto lo da `inset`, que ya respeta la barra dinámica del navegador.
- `.panel` = hoja (§5). `.sidebar` = barra inferior (§3.3).
- Statistics (`hidden: true`): no hay hoja; el panel es una página normal a pantalla completa (`position: static`, scroll del documento), encima de la barra inferior.
- `index.html:5`: añadir `viewport-fit=cover` al meta viewport (necesario para que `env(safe-area-inset-*)` tenga valor). No toca `vite.config.ts`.

### 2.5 Alturas bajas (todas las anchuras con panel lateral)

| Consulta | `.panel-header` | `.nav-item` | Overlays del mapa |
|---|---|---|---|
| base | 72 px (Figma) | 66 px | tamaños base |
| `Q_SHORT` | 56 px; `h1` 20 px | 56 px, icono 24 | `--map-pad` 12 px; leyenda vertical `min-height` 96 px |
| `Q_XSHORT` | 48 px | 44 px, solo icono (§3.2) | leyenda horizontal compacta; `map-note` colapsada (§4.5) |

---

## 3. Navegación

Preservación: mismos 8 destinos, mismo orden (`ui.tsx:6-16` + Home), mismos iconos (`preservacion.json → iconos_por_destino`), mismo `end` en My fields, mismo botón Account (fuera de alcance: se conserva tal cual, P1 solo se reporta).

### 3.1 Sidebar de escritorio (`ui.tsx:19-34`, `app.css:37-47`)

- `.sidebar`: `display: grid; grid-template-rows: auto minmax(0,1fr) auto; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none` (R1: si aun así no cabe, hace scroll en lugar de cortar).
- `.nav-items`: quitar `margin-top: 164px`; usar `margin-block: clamp(12px, 20.5vh, 164px) 12px` (a 800 px de alto = 164, el Figma exacto; a 700 = 143; con `Q_SHORT` el tope baja a 64 px).
- `.nav-item`: alto 66 / 56 (`Q_SHORT`) / 44 (`Q_XSHORT`); `gap: 6px`; label 12 px (antes 10, R3/R27) con `line-height: 14px`, máx. 2 líneas, `text-align: center`, `hyphens: manual`.
- Iconos homogéneos (R3): todos 24 px, `strokeWidth 2` (hoy 24/28/30 y 2.2/2.6, `ui.tsx:6-16`); `.nav-home` 28 px. Todos con `aria-hidden` (P18).
- Altura mínima verificada: base 25+32+164+7·66+6·6+60+21 = 800 px; `Q_SHORT` 16+28+64+7·56+6·4+48+16 = 588 px; `Q_XSHORT` 8+28+12+7·44+6·2+44+8 = 420 px (+ scroll de seguridad).
- Estado activo (no solo color): `aria-current="page"` (NavLink ya lo pone), fondo `--nav-selected-bg`, texto e icono `--nav-selected-text` 700, **barra lateral izquierda 3 px** `--brand-strong` (02 §5.8).
- Skip link (P7): primer hijo de `.app`, `<a href="#panel">` con texto "Skip to panel" (string nueva en inglés, no toca i18n); visible solo con foco, `position: fixed; top: 8px; left: 8px; z-index: var(--z-skip)`. `<main>` recibe `id="panel" tabIndex={-1}`.

### 3.2 Rail (modo rail)

Igual que 3.1 con `--sidebar: 72px`. En `Q_XSHORT`: label visualmente oculto (clase `.sr-only`, sigue siendo el nombre accesible) y tooltip CSS `::after` con el mismo texto al `:hover` (solo `Q_HOVER`) y `:focus-visible`, posicionado a la derecha (`left: calc(100% + 8px)`), fondo `--neutral-800`, texto blanco 12 px.

### 3.3 Barra inferior (modo hoja)

- `Sidebar` lee `useMatchMedia(Q_SHEET)` y en modo hoja renderiza la variante `bottom`: `<nav aria-label="Main">` (mismo landmark) fijo abajo, `height: 56px; padding-bottom: env(safe-area-inset-bottom)`, fondo `--surface`, borde superior `--border`, `z-index: var(--z-nav)`.
- 5 ranuras de igual ancho (`grid-template-columns: repeat(5, 1fr)`): **Home** (House), **My fields**, **Risks**, **Crops**, **More** (icono `Ellipsis`).
  - Criterio: Home + las 3 consultas más frecuentes del agricultor en campo. "Add field" (acción principal) ya tiene acceso directo permanente en el mapa (botón "Field +", §4) y también en More.
- Ítem: icono 24 px en una "píldora" de 56×32 px; label 12 px debajo; objetivo táctil = toda la celda (≥ 64×56).
- Activo: píldora con fondo `--nav-selected-bg` + icono/texto `--nav-selected-text` 700 (forma + peso + color).
- **More**: `<button aria-expanded aria-controls="nav-more" aria-haspopup="true">`. Abre un panel `popover="auto"` (API nativa: cierre por Esc y clic fuera, sin librería) anclado encima de la barra: lista vertical con Plot history, Statistics, Data, Add field, Account (los NavLink originales, mismos `to`, mismos iconos), filas de 48 px, `role` implícito de enlaces dentro de `<ul>`. Al navegar se cierra; el foco vuelve a More al cerrar con Esc.
  - Si la ruta activa está en el grupo More, el botón More muestra el estado activo (píldora) y un punto de 6 px; el `aria-current` sigue en el enlace real.
- Labels de la barra: "Home" reutiliza el `aria-label` existente; "More" es string nueva en inglés.

### 3.4 Header del panel (`ui.tsx:37-53`, `app.css:52-55`)

- `.panel-header`: `block-size` 72 / 56 / 48 (§2.5); `padding-inline: var(--panel-pad)`; quitar `margin-left: -22px` de `h1.brand` (R5): el título "HOME" se alinea con el contenido.
- Botón Back (P3 se reporta, no se cambia su handler `navigate(-1)`): variante `icon` 44×44, icono `ArrowLeft` 20 px `aria-hidden`; mantiene `aria-label="Back"`.

---

## 4. Overlays del mapa (`FieldMap.tsx:178-257`, `app.css:178-215, 331-354`)

### 4.1 Contenedor único `.map-ui`

Todos los overlays pasan a hijos de un `div.map-ui` (nuevo, en `FieldMap.tsx` después de `.map-canvas`; los pines quedan fuera, sobre el canvas). Se eliminan **todos** los `left/top/right/bottom` en px fijos (R8).

```
.map-ui {
  position: absolute; inset: 0; pointer-events: none;
  container: map-ui / size;
  display: grid; gap: var(--space-2);
  padding: max(var(--map-pad), env(safe-area-inset-top)) max(var(--map-pad), env(safe-area-inset-right))
           calc(var(--map-pad) + var(--sheet-offset, 0px)) max(var(--map-pad), env(safe-area-inset-left));
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas: "tl tr" "info side" "bar bar";
}
.map-ui > * { pointer-events: auto; }
--map-pad: clamp(8px, 2vw, 28px)   (28 a 1400+, como el Figma; 12 en Q_SHORT)
```

| Área | Contenido | Alineación | Reglas |
|---|---|---|---|
| `tl` | `.field-button`, `.global-button` | `display:flex; flex-wrap:wrap; gap: 8px; align-items:start` | Global ya no está en `left: 215px` (R8): va a continuación de Field +, y salta de línea si no cabe |
| `tr` | `.legend` (capa o lista de puntos) | `justify-self: end; align-self: start` | `max-width: min(220px, 45cqw)` |
| `info` | `.map-note`, `.global-panel` | `align-self: start; justify-self: start` | `max-width: min(360px, 100%)` (sustituye `width: 330px` y el parche `calc(100% - 62px)`, R9); `max-height: 100%; overflow-y: auto; overscroll-behavior: contain` |
| `side` | `.zoom` | `align-self: center` | — |
| `bar` | `.toolbar` o `.year-picker` | `justify-self: center; max-width: 100%` | sin `translateX(-50%)` |

`--sheet-offset` lo escribe la hoja (§5.6) en modo hoja; en los otros modos vale `0px`. Así ningún overlay queda bajo la hoja.

### 4.2 Botones superiores

- `.field-button` (`app.css:183`): convertir a `<Link to="/fields/new">` (P4; mismo destino que `navigate('/fields/new')`, `FieldMap.tsx:197`). Texto "Field" literal. Alto 46 (Figma) en escritorio / 44 en `Q_COARSE`; texto `clamp(16px, 1rem + 0.5vw, 24px)` 500 (24 px a ≥ 1600, 16–18 en móvil). Icono `CirclePlus` 24 px (30 en escritorio) `aria-hidden`. Variante `map-overlay` (§8.5).
- `.global-button`: variante `map-overlay` con estado `selected` (02 §5.5); texto "Global mode" 14 px/600, alto 44–46. En `@container map-ui (max-width: 360px)` el texto se oculta visualmente (queda como nombre accesible por `.sr-only`) y el botón es 44×44 con icono Globe + switch.

### 4.3 Leyenda (`.legend`, `.legend-list`)

- Escritorio/rail: vertical como el Figma; `.legend-bar` `min-height: clamp(96px, 20cqh, 150px)` (R13).
- `@container map-ui (max-width: 480px)` o `(max-height: 420px)`: leyenda **horizontal**: título 12 px/600, barra 8 px de alto × 100 %, ticks debajo en `display:flex; justify-content: space-between`, 12 px; ancho `min(200px, 50cqw)`. La rampa (`rampCss(layer.ramp)`) se pinta con `linear-gradient(90deg, …)` en vez de 180deg: mismos colores (dato preservado), solo cambia la orientación.
- Leyenda de puntos (`legend-list`): en el mismo container query se convierte en `<details>` cuyo `<summary>` es el título existente (`cfg.pointLegend.title`); abierta por defecto en escritorio (`open`), cerrada en hoja. Los ítems se mantienen en 14 px (etiquetas cortas); iconos 18 px `aria-hidden`.

### 4.4 Zoom (`.zoom`, `app.css:193-195`)

- Variante `map-overlay` en columna, botones 40×40 (fino) / 44×44 (`Q_COARSE`), `gap: 4px`, iconos 20 px `aria-hidden`, `type="button"` (P19).
- `disabled` mientras `!ready || !map` (P19, sin cambiar el handler `map.zoomIn/zoomOut`).
- `@container map-ui (max-height: 320px)`: se oculta (`display:none`) — en ese caso el mapa visible es pequeño y el pellizco + las teclas +/− del canvas de maplibre quedan como alternativa; con la hoja en `half` en un móvil de 667 px de alto el área visible es ≈ 300 px y el zoom **sí** se ve a partir de 321 px. Ver checklist §14.

### 4.5 Nota de interpolación y Global panel

- `.map-note`: texto 12 px (antes 10), `max-width: min(260px, 100%)`. En `@container map-ui (max-width: 480px)` se reduce a un botón icono `Info` 44×44 con `aria-expanded` que despliega el mismo texto (disclosure); texto literal sin cambios.
- `.global-panel` (`GlobalLayer.tsx:126`): área `info`, vidrio oscuro `--glass-scrim` (aprobado), `max-height: 100%`, scroll interno. Chips internos con la variante sobre vidrio de 02 §5.6 y alto 32 (fino) / 44 (táctil).

### 4.6 Toolbar de capas (`.toolbar`, `FieldMap.tsx:238-255`, `app.css:196-197`)

- `display:flex; gap: clamp(4px, 1.6cqw, 22px); padding: 6px; overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: none; overscroll-behavior-x: contain; max-width: 100%` (R10). Botones `flex: none; scroll-snap-align: center`.
- Tamaño de botón: 50×50 (escritorio, Figma) / 48 (rail) / 44 (hoja). Icono 34 → 24 px en hoja, 28 en rail.
- Ancho a 375: 7·44 + 6·4 + 12 = 344 px ≤ 351 disponibles → cabe sin scroll; a 320 px hace scroll horizontal con máscara de desvanecido en los bordes (`mask-image: linear-gradient(90deg, transparent, #000 16px, #000 calc(100% − 16px), transparent)`) solo cuando hay overflow (clase `is-overflowing` puesta por un `ResizeObserver` existente o comparación `scrollWidth > clientWidth`).
- Capas normales → **enlaces** (P4): `<Link to={activo ? '/' : '/layers/' + tool} aria-current={activo ? 'page' : undefined} aria-label={label}>`. Mismo destino que `FieldMap.tsx:250`. El estado seleccionado pasa de `aria-pressed` a `aria-current` y se pinta con blanco + **barra inferior 3 px** `--glass-selected-indicator` (02 §5.5).
- Variables globales (`GLOBAL_TOOLS`): siguen siendo `<button aria-pressed>` (cambian estado, no navegan).
- `title` se mantiene (tooltip nativo en escritorio).

### 4.7 Year-picker (`FieldMap.tsx:231-236`, `app.css:199-200`)

- Sin `width: 295px` (R11): `display:inline-flex; gap: 8px; padding: 4px`; año en `clamp(18px, 1rem + 0.6vw, 24px)` 700, `min-width: 4ch; text-align:center; font-variant-numeric: tabular-nums`.
- Botones Previous/Next: variante `icon` sobre vidrio, 44×44, icono 22 px `aria-hidden`, `type="button"`. El año en `<output aria-live="polite">`.
- P6 (sin límites de año): se reporta; si se confirma, `disabled` en Next cuando `value ≥ año actual` usando el estado disabled de §8.

### 4.8 Atribución de maplibre (`app.css:203`, R14)

`.maplibregl-ctrl-bottom-right`: `bottom: var(--sheet-offset, 0px)`; queda bajo la toolbar en z-index pero por encima del área de la hoja. Opacidad .7 solo en reposo; `:hover/:focus-within` → 1. No se cambia el texto `VITE_BASEMAP_ATTRIBUTION`.

---

## 5. Bottom sheet (modo hoja)

El `<main class="panel">` existente **es** la hoja; no se crea otro árbol ni se desmonta nada al navegar. El mapa sigue montado debajo.

### 5.1 Estructura y medidas

```
.panel (hoja)          position: fixed; left: 0; right: 0; bottom: var(--nav-space);
                       height: var(--sheet-h); z-index: var(--z-sheet);
                       border-radius: 16px 16px 0 0; box-shadow: var(--shadow-sheet);
  .sheet-handle        <button> nuevo, primer hijo; 28 px de alto, ancho 100 %;
                       barra visual 36×4 px, radio pill, color --border-control (3:1)
  .panel-header        56 px; zona de arrastre junto con el asa
  .panel-status        franja opcional (solo /fields/new, §5.5)
  .panel-body          flex: 1; overflow-y: auto; overscroll-behavior: contain
```

Espacio disponible: `--sheet-space: calc(100dvh − var(--nav-space) − env(safe-area-inset-top))`.

| Snap | `--sheet-h` | En 375×667 (Safari, ~553 px útiles tras barra 56) | Uso |
|---|---|---|---|
| `peek` | `84px` (asa 28 + header 56); `136px` con `.panel-status` | 84 / 136 | Ver el mapa entero; dibujo |
| `half` | `round(50% del --sheet-space)`, mín. 240 px | ~276 | Por defecto: contenido + efecto en el mapa |
| `expanded` | `calc(var(--sheet-space) − 64px)` | ~489 | Lectura y formularios; quedan 64 px de mapa visibles arriba |

### 5.2 Interacción

- **Arrastre** solo desde asa + header (nunca desde `.panel-body`, para no pelear con su scroll). Pointer Events con `setPointerCapture`; durante el arrastre se aplica `transform: translateY(Δ)` (sin reflujo) y `touch-action: none` en la zona de arrastre.
- Al soltar: snap al más cercano; un gesto rápido (|v| > 0.5 px/ms) va al siguiente snap en esa dirección. Después se fija `data-snap` y `--sheet-h`; transición `height 240ms cubic-bezier(.2,.8,.2,1)` (0 ms con reduced motion, §11).
- **Alternativa sin arrastre (WCAG 2.5.7) y teclado**: `.sheet-handle` es `<button type="button" aria-controls="panel-body" aria-expanded={snap === 'expanded'}>` con `aria-label` dinámico: "Expand panel" (peek/half) / "Collapse panel" (expanded) — strings nuevas en inglés.
  - Clic / Enter / Espacio: peek → half → expanded; desde expanded → half.
  - Flecha arriba / abajo con foco en el asa: sube / baja un snap.
  - Esc con el foco dentro de la hoja en `expanded`: baja a `half` y devuelve el foco al asa.
  - Tocar el título del header también alterna (amplía el objetivo).
  - Cambio de snap anunciado en una región `aria-live="polite"` oculta: "Panel expanded" / "Panel half open" / "Panel collapsed".
- Tocar los 64 px de mapa visibles en `expanded` → `half` (excepto en modo dibujo, donde el toque añade vértice).
- **Foco**: si el foco entra en `.panel-body` estando en `peek`, la hoja sube a `half` (`focusin`), para que nunca haya foco en contenido oculto (WCAG 2.4.11 Focus Not Obscured).
- **Selección con efecto en el mapa**: al activar una tarjeta `.risk` (`Risks.tsx:48`), una alerta (`Home.tsx:90`), una capa en Climate/Terrain (chips) o una parcela en My fields estando en `expanded`, la hoja baja a `half` y hace `scrollIntoView({block:'nearest'})` del control activado. Así se cumple el texto "Tap a card to see it on the map" (`Risks.tsx:37`). Implementación: callback `requestMapView()` expuesto por contexto; no altera los handlers (`setSelected`, `setAlert`, `selectField` se llaman igual).

### 5.3 Snap por ruta

Al cambiar de ruta, si el snap actual es `peek` sube a `half`; si no, se respeta el que eligió el usuario. Excepciones:

| Ruta | Snap inicial | Motivo |
|---|---|---|
| `/fields/new` | `peek` + franja de dibujo | el mapa es la herramienta |
| `/statistics` | sin hoja (página completa) | `hidden: true` |
| resto | `half` (o el actual si es `expanded`) | |

### 5.4 Scroll interno

- `.panel-body`: único contenedor con scroll de la hoja; `overscroll-behavior: contain` (no arrastra la página ni el mapa); `scroll-padding-bottom` = alto de la barra de acciones fija (§5.5).
- Se eliminan los scroll anidados (R26): `.recommendations { max-height: 300px; overflow-y:auto }` (`app.css:75`) y `.card .note-list { max-height: 180px; overflow-y:auto }` (`app.css:347`) desaparecen **en todos los modos**; si una lista de notas tiene > 4 ítems se envuelve en `<details>` cuyo `summary` usa el título ya existente de la sección ("Notes", "About this layer"); sin texto nuevo.
- Mapa: en modo hoja `map.setPadding({ bottom: alto visible de la hoja, top: alto de tl })` tras cada snap (FieldMap lee `--sheet-offset` vía contexto) para que `flyTo` (`FieldMap.tsx:163`) centre la parcela en la zona visible.

### 5.5 `/fields/new` mientras se dibuja (`pages/Other.tsx:29-79`)

Flujo en modo hoja (mismos handlers `setDraft`, `save`, misma mutación `crearParcela`):

```
┌──────────────────────────┐
│ [Field +] [Global]   [▤] │
│                          │
│    MAPA ≈ 70 % del alto  │  tap = vértice (map.on('click'), FieldMap.tsx:108)
│      · · ·  polígono     │
│ [toolbar de capas]       │
├════════ ▬▬ ══════════════┤
│ Add a field              │  header 56
│ Click on the map to mark │  .panel-status (52 px mín.)
│ the corners…   [Clear]   │   → con ≥3: "Calculated area: 2.4 ha" [Clear] [Field details ▲]
├──────────────────────────┤
│ nav                      │
└──────────────────────────┘
```

- El bloque `.draw-status` (hoy `footer` de `FieldForm`, `Other.tsx:64-69`) se mueve a una prop nueva de `Panel`, `status?: ReactNode`, que se pinta justo debajo del header **en todos los modos** (en escritorio también: queda siempre visible mientras se hace scroll del formulario). Es el mismo JSX, mismo texto literal, mismo `onClick={() => setDraft([])}`. `role="status"` para que el área calculada se anuncie.
- Con `draft.length ≥ 3` aparece un botón secondary "Field details" (string nueva) con `ChevronUp` que sube la hoja a `expanded` y enfoca el primer input. No se auto-expande al llegar a 3 puntos (el usuario puede querer más vértices).
- El texto "Click on the map…" se conserva literal (i18n/preservación); se reporta que en táctil "Tap" sería más preciso (no se cambia).
- `.form-actions` (Save field + "Draw the field on the map first.") es **sticky** al fondo de `.panel-body` en modo hoja: `position: sticky; bottom: 0; background: var(--surface); border-top: 1px solid var(--border); padding: 12px var(--panel-pad); margin-inline: calc(var(--panel-pad) * -1)`. Igual para `.edit-bar` de `/fields` y `/crops` (`Fields.tsx:288`, `Crops.tsx:84`) en modo hoja.
- El cursor crosshair y el modo dibujo no cambian. La zona de arrastre de la hoja hace `stopPropagation` de pointer events para que un arrastre de la hoja nunca cree un vértice.
- Alternativa por teclado para dibujar (P20, falla de WCAG 2.1.1): **propuesta pendiente de confirmación** (brief §14.10): retícula central fija en el mapa + botón "Add corner here" que añade el centro del mapa al borrador con el mismo `setDraft([...draft, center])`, y "Undo last point". El mapa ya se desplaza con flechas cuando el canvas tiene foco (handler de teclado de maplibre). No se implementa sin el sí del usuario.

### 5.6 Safe areas y z-index

- Hoja: `bottom: var(--nav-space)` (incluye `env(safe-area-inset-bottom)`); `padding-inline: env(safe-area-inset-left) env(safe-area-inset-right)` en horizontal.
- `.map-ui` (§4.1) usa `env(safe-area-inset-top/left/right)`; `--sheet-offset = --sheet-h` actual, publicado como custom property en `.app`.
- Escala `z-index`: `--z-map-ui: 10; --z-sheet: 20; --z-nav: 30; --z-skip: 50` (popover y tooltips nativos van en top layer).

---

## 6. Tablas, gráficas, formularios, Statistics, tarjetas

### 6.1 Tablas (`DataHub.tsx:81-88, 207-210, 219-226`, `app.css:304-306`)

- Cada `<table class="data-table">` se envuelve en `div.table-wrap` con `overflow-x: auto; role="region"; aria-label` = título de la Card ("Yield", "What farmers plant next", "Days from planting to harvest", textos existentes) y `tabIndex={0}` (región con scroll accesible por teclado). Foco visible con el anillo común.
- Se anula `overflow-wrap: anywhere` en tablas (R15): `.data-table, .data-table * { overflow-wrap: normal }`; celdas numéricas `white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums`.
- **Reflujo a tarjetas** para las tablas de 3 columnas (Yield, Cycle) con `@container card (max-width: 420px)` (`.card { container: card / inline-size }`): `thead` visualmente oculto; cada `tr` es un bloque con borde inferior `--border`, padding 8 0; cada `td` en `display:grid; grid-template-columns: 1fr auto` con `td::before { content: attr(data-label) }` en `--text-muted` 12 px; la primera celda (cultivo) a ancho completo en 600. Requiere añadir `data-label` a cada `<td>` con **el mismo literal** del `<th>` correspondiente ("Crop", "Model estimate", "Past average", "Typical (10 years)", "Latest season").
- Rotación (2 columnas) se queda como tabla.
- Tamaños: texto 14 px (12 en `th`), `padding: 8px 8px`, fila ≥ 40 px.

### 6.2 Gráficas recharts

Hook nuevo `useMatchMedia('(min-width: 600px)')` para valores que recharts necesita en JS.

| Gráfica | Hoy | Especificación |
|---|---|---|
| Statistics `Other.tsx:187-195` | `height={380}`, ticks 14 Poppins, stroke 5, margin right 30 | Envolver en `div.chart-box` con `height: clamp(240px, 45dvh, 380px)` y `ResponsiveContainer height="100%"`. Ticks 12 px (<600) / 14 px (≥600), Poppins, color `#474B4E` (dato, sin cambio). `strokeWidth` 3 (<600) / 5. `margin {top 8, right 12 (<600) / 30, left 0, bottom 0}`; `YAxis width={44}`; `XAxis interval="preserveStartEnd" minTickGap={16}`. Colores de serie `#34B3F1` / `#292D30` intactos. |
| Economy `DataHub.tsx:62-71` | `height={190}`, `left: -14`, ticks 9/10 px (R18) | `chart-box` `height: clamp(200px, 30dvh, 260px)`; `margin left 0`; `YAxis width={44}`; ticks 12 px `#697386`; `minTickGap 24` se mantiene. Serie `#4464E8` y discontinua intactas. |
| Tooltip (ambas) | estilo por defecto | `contentStyle`: radio 10, borde `--border-control`, 12–14 px; `wrapperStyle { pointerEvents: 'none' }`; en táctil se activa con tap (comportamiento nativo de recharts). |

`.series-legend` (`app.css:174`): `margin: 0 0 16px; gap: 8px 24px; flex-wrap: wrap`; texto `--series-legend-text` (02 §4.1 #13), 12 / 14 px.

### 6.3 Formularios (`FieldForm.tsx`, `Other.tsx:113-131`, `app.css:70, 148-151`)

- Tamaño de texto de input/select/textarea: **16 px en `Q_SHEET` y en `Q_COARSE`** (evita el zoom de iOS), 14 px en escritorio con puntero fino (antes 10 px, R27).
- Alto mínimo: 44 px (`Q_COARSE`), 40 px (fino). Padding `10px 12px`. Radio 10 px (§7.3).
- `.months` (`app.css:150-151`): `flex-wrap: wrap; gap: 8px 12px`; selects `width: auto; min-width: 7.5em` (R23).
- `.grid-2` (`app.css:73`, Data/Climate): `grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: 12px 24px` (R20; 60 px de gap solo en ≥1024).
- `.box-small` (`app.css:71`): `min-width: 4.5em; width: fit-content`.
- `.form label` (`app.css:148`): label 14 px `--text-muted` (AA en 02), `gap: 4px`, `margin-bottom: 12px`.
- Selects nativos: se conservan nativos (mejor UX en móvil); `appearance: none` + chevron SVG inline de 12 px en `background-image` a la derecha, `padding-right: 36px`.
- Estados: §8.9.

### 6.4 Statistics (`Other.tsx:165-203`, `app.css:56, 168-176`)

- `.panel-wide .panel-body`: `padding: clamp(16px, 3vw, 30px) clamp(16px, 5vw, 75px)` (R6; 75 px solo a ≥1500 px). Contenido `max-width: 1100px; margin-inline: auto; width: 100%`.
- `.tabs`: `display:flex; justify-content:center; gap: clamp(8px, 6vw, 100px)` (R17). Botón `flex: 1 1 0; max-width: 200px; min-width: 0` en <600; `min-width: 140px; height: 43px` a ≥600 (Figma). Variante `tab` (§8.7).
- Semántica: `role="tablist"` + `role="tab"` con `aria-selected`, `aria-controls="stats-panel"`, tabindex itinerante (solo el seleccionado en el orden de tab) y flechas ←/→, Home/End; la Card `.stats-card` lleva `role="tabpanel" id="stats-panel" aria-labelledby` del tab activo. Handlers `setTab` sin cambio.
- `.stats-card`: `padding: clamp(16px, 3vw, 34px) clamp(16px, 4vw, 48px)`; `h2` `clamp(18px, 1rem + 0.6vw, 24px)`.

### 6.5 `.alert` (Home, `app.css:102-111`, R19)

- `.alert-grid`: `grid-template-columns: repeat(auto-fill, minmax(min(100%, 168px), 1fr)); gap: 12px` (<600) / `21px 39px` (≥1024, Figma).
- `.alert`: **sin `height: 75px`**; `min-height: 75px`; `display:grid; grid-template-columns: minmax(0,1fr) auto; grid-template-rows: auto auto 1fr; column-gap: 8px; padding: 8px 12px`. Título, valor y detalle en la columna 1; `.alert-icon` deja de ser `absolute` y ocupa columna 2 fila 1; `.alert-bar` pasa al flujo en columna 2 fila 3 (`align-self: end`). Así el texto largo ("Not loaded on the server yet") nunca pisa el icono.
- Estados: variante `list-item` en su sabor "alert" (02 §5.8). `data-unavailable` + `disabled`: estilo disabled, `cursor: not-allowed`; se mantiene `title`.

### 6.6 `.priority-row` y `.priority` (`FieldForm.tsx:79-89`, `ui.tsx:131-141`, `app.css:157-164`, R21)

- `.priorities` Card con `container: priorities / inline-size`.
- ≥ 400 px de contenedor: 4 columnas verticales como el Figma; `.priority-label` `min-height: 3lh` (3 líneas a 14 px) en vez de 45 px, `font-size: 12px; line-height: 16px; text-wrap: balance`.
- `@container priorities (max-width: 399px)`: una columna; cada `.priority` es `grid-template-columns: 1fr auto; grid-template-areas: "label value" "track track"`; la pista pasa a **horizontal** 100 % × 26 px (`writing-mode: horizontal-tb; direction: ltr` en el input) y el relleno usa `width` en vez de `height`.
  - Para que el CSS pueda elegir eje, `PriorityBar` deja de escribir `style={{height}}` y escribe la custom property `--v: value` (`ui.tsx:135`); CSS: `height: calc(var(--v) * 1%)` (vertical) / `width: calc(var(--v) * 1%)` (horizontal).
  - Se muestra el valor numérico (`<output>`, área `value`) en ambos modos: hoy no se ve en ningún sitio.
- Accesibilidad (P13): `aria-valuetext={`${value} out of 100`}` (string nueva); `aria-orientation="vertical"` solo cuando el contenedor es ≥400 (lo decide el componente con un `ResizeObserver` sobre la Card; o se omite y se deja horizontal en el árbol accesible: preferible omitir y evitar desajuste).
- Área táctil: la pista vertical 26×128 px ya supera 24 px; en `Q_COARSE` el input se extiende `inset: 0 -9px` (44 px de ancho).

### 6.7 `.factor` (`CropSuggestions.tsx:21-28`, `app.css:295`, R22)

- `.factors` con `container: factors / inline-size`.
- Base: `grid-template-columns: minmax(6.5em, 32%) minmax(48px, 1fr) auto; gap: 8px; font-size: 12px`.
- `@container factors (max-width: 300px)`: `grid-template-areas: "name score" "bar bar"`; barra a ancho completo, 8 px de alto.

### 6.8 Otros (R24, R25)

- `.stat-row` (`app.css:114`): `repeat(auto-fit, minmax(min(100%, 96px), 1fr))`; quitar `.tip-row` del selector (muerto).
- `.chips` (`app.css:152`): `gap: 8px` (antes 8/18): con chips de 44 px en táctil la separación de 18 px no es necesaria.

---

## 7. Tipografía, espaciado, radios, sombras, objetivos táctiles

### 7.1 Escala tipográfica

Familias: Inter (UI) y Poppins (solo gráfica de Statistics): 2 familias. `index.html:9`: cargar Inter 400/500/600/700 y Poppins 400 (P31: se quita Inter 300 y Poppins 500, sin uso en CSS; verificar con búsqueda de `font-weight: 300`/`500` en Poppins antes de quitar).

Escala ~1.2 redondeada a px enteros. Mínimo absoluto de contenido: **12 px** (no hay textos de 9/10/11 px: R27).

| Token | Tamaño | `line-height` | Uso (selectores) |
|---|---|---|---|
| `--fs-xs` | 12px | 16px | `.judgment-note`, `.note-list`, `.risk-source`, `.live-reason`, `.source`, `.level`, `.tag`, `.slider-marks`, `.legend`, `.map-note`, `.global-note`, `.moisture*` pequeños, `.card h3 small`, `.chart-card small`, labels de nav, `th` |
| `--fs-sm` | 14px | 20px | cuerpo en escritorio (`body`, antes 12/15), `.risk-text`, chips, botones, inputs (fino), `.field-item span`, `.factor`, tablas |
| `--fs-base` | 15px en `Q_SHEET` / 14px resto | 22 / 20 | `body` |
| `--fs-md` | 16px | 22px | `.card h3` (antes 14), `.risk-head strong`, `.live-head strong`, tabs, inputs en táctil |
| `--fs-lg` | 20px | 26px | `.card h2` en `Q_SHEET`, `.live-value` (antes 22), `.panel-header h1` en `Q_SHEET`/`Q_XSHORT` |
| `--fs-xl` | `clamp(20px, 0.9rem + 0.8vw, 24px)` | 1.2 | `.panel-header h1`, `.card h2`, `.section-title` (24 a ≥1200 px: Figma) |
| `--fs-2xl` | `clamp(24px, 1.2rem + 0.8vw, 28px)` | 1.15 | `.moisture-value b` |

Longitud de línea: `.panel-body p, li` `max-width: 70ch` (en panel de 488 px ya se cumple ≈ 62 caracteres a 14 px); en Statistics notas `max-width: 75ch`.
Números: `font-variant-numeric: tabular-nums` en `.live-value`, `.suggest-score`, `.factor-score`, tablas, year-picker, `output` de sliders.

### 7.2 Espaciado (base 4 px)

| Token | px | Uso |
|---|---|---|
| `--space-1` | 4 | gaps internos de icono+texto |
| `--space-2` | 8 | gap de chips, listas, overlays |
| `--space-3` | 12 | `.panel-body` gap (actual), padding de controles |
| `--space-4` | 16 | padding de card en `Q_SHEET`, padding de hoja |
| `--space-5` | 20 | padding de card en escritorio (Figma 18 → 20) |
| `--space-6` | 24 | separación entre grupos de formulario |
| `--space-8` | 32 | separación entre secciones |
| `--space-10` | 40 | — |
| `--space-12` | 48 | — |

Derivados: `--panel-pad: clamp(16px, 2.2vw, 28px)` (sustituye los 28/29/23 asimétricos de `app.css:52-53`); `--card-pad: var(--space-4)` (<1024) / `16px 20px 20px` (≥1024); `.card h2 margin-bottom: var(--space-4)` (antes 22).
Ritmo: dentro de una card 12 px entre campos, 24 px entre grupos (`h3`); entre cards 12 px (Figma). Alternancia de densidad en §12.

### 7.3 Radios (P25: de 8 valores a 5)

| Token | px | Uso |
|---|---|---|
| `--radius-xs` | 6 | `.pin-label`, tooltips, `.moisture-bar i` |
| `--radius-sm` | 10 | botones `.btn`, inputs, selects, textarea, tabs, botones de zoom/toolbar, `.map-note` |
| `--radius-md` | 12 | elementos dentro de cards: `.field-item`, `.suggest`, `.risk-card`, `.alert` |
| `--radius-lg` | 15 | `.card`, `.note-box`, `.glass` contenedores, hoja (16 arriba ≈ lg) |
| `--radius-pill` | 999 | `.chip`, `.level`, `.source`, `.tag`, `.field-button`, `.global-button`, `.switch`, barras |

`--radius` (15 px) se conserva como alias de `--radius-lg`.

### 7.4 Sombras

| Token | Valor | Uso |
|---|---|---|
| `--shadow-1` | `0 2px 6px rgba(26,36,56,.07)` (= `--shadow` actual) | sliders, cards elevadas |
| `--shadow-overlay` | `0 2px 8px rgba(0,0,0,.28)` | overlays del mapa (separa el vidrio de la imagen satelital) |
| `--shadow-sheet` | `0 -4px 16px rgba(26,36,56,.16)` | hoja |
| `--shadow-pressed` | `inset 0 2px 0 rgba(0,0,0,.25)` (primary: `.35`, de 02 §5.1) | estado active |

### 7.5 Objetivos táctiles

- `Q_COARSE` o `Q_SHEET`: **≥ 44×44** en todos los controles: chips (hoy 25, R28), inputs (28), zoom (34), slider (input 25 → 44 alto efectivo con `inset: -10px -8px`), Back (16), `summary` "Why?" (`min-height: 44px; display:flex; align-items:center`), `.link` y `.see-all` (`display:inline-flex; min-height: 44px; align-items:center`), botones del year-picker, `.suggest .btn` / `.live-foot .btn` (`min-height: 44px`).
- Puntero fino: mínimo **24×24 con separación** (WCAG 2.5.8) y objetivo de diseño 32 px: chips 32, inputs 40, botones 40, zoom 40, iconos de toolbar 50 (Figma).
- Densidad aceptada con 24×24: enlaces en línea dentro de texto (`.note-list` con enlaces) — excepción de 2.5.8 "inline".

---

## 8. Sistema de componentes unificado

Los ~10 botones ad hoc (brief §9, P28) se consolidan en 8 variantes. Colores: **tokens de `02-colorimetria.md` §5 y §7** (no se repiten hex). Aquí se fijan geometría, comportamiento y el mapeo de selectores.

### 8.0 Reglas comunes a todos los controles

| Estado | Regla |
|---|---|
| default | tokens de 02 |
| hover | solo dentro de `@media (hover: hover) and (pointer: fine)`; solo color de fondo/borde |
| active / pressed (`:active`) | color más profundo que hover (02, Δ ≥ 1.3:1) **+ hundimiento**: `transform: translateY(1px)` en botones de texto y `.list-item`; `scale(.96)` en `icon`, `map-overlay` circulares y toolbar; `--shadow-pressed` en `primary`/`save`/`secondary` |
| selected | nunca solo color: peso 600/700 **y** (borde 2 px **o** barra 3 px **o** icono); semántica `aria-pressed` / `aria-selected` / `aria-current` / `aria-checked` según patrón |
| focus-visible | anillo doble único (02 §5.10): outline 2 px `--focus-ring` + offset 2 px + `box-shadow: 0 0 0 2px var(--focus-ring-inner)`. Se eliminan el foco propio de `.btn` (`app.css:241`) y el `:has()` de sliders pasa a usar el mismo anillo (P26) |
| disabled | tokens disabled de 02; `cursor: not-allowed`; sin hover ni active (`:not(:disabled)` en todos los selectores de estado) |
| loading | color default (no gris), `aria-busy="true"`, `aria-disabled="true"` (no `disabled`, para no perder el foco), clic ignorado en el handler, `cursor: progress`, spinner 16 px, **ancho estable** (§8.1) |
| transición | `background-color, border-color, color, box-shadow 120ms ease-out, transform 80ms ease-out`. Nada de `filter: brightness` (`app.css:240` se elimina) |

### 8.1 `primary` / `save` / `secondary` (componente `Btn`, `ui.tsx:68-74`, `app.css:236-242`)

- Se conservan las clases `.btn .btn-primary/.btn-save/.btn-secondary` (sin churn en páginas).
- Tamaños: `md` alto 40 (fino) / 44 (táctil), `padding: 0 16px`, texto 14/600; `sm` (antes `.suggest .btn`, `.live-foot .btn`, `app.css:267, 328`) alto 32 fino / 44 táctil, `padding: 0 12px`. Se eliminan esos overrides y se usa `size="sm"`.
- `display:inline-flex; align-items:center; justify-content:center; gap: 8px`; icono 16 px `aria-hidden`.
- Nueva API de `Btn` (sin cambiar handlers): `loading?: boolean`, `loadingLabel?: ReactNode`, `size?: 'md'|'sm'`, `icon?`.
  - Ancho estable: dos capas apiladas en la misma celda (`display:grid; grid-template-areas:"s"`): etiqueta normal y etiqueta de carga (spinner + `loadingLabel`); la inactiva con `visibility: hidden` → el botón mide lo que la más ancha, no salta.
  - Las páginas pasan los literales existentes: `children="Save field"` + `loadingLabel="Saving…"` (`Other.tsx:74`), `Save`/`Saving…` (`Fields.tsx:87`, `Other.tsx:128`), `Save as my priorities`/`Saving…` (`Crops.tsx:85`), `Update`/`Updating…` (`LiveForecast.tsx:101-103`), `Switch to X`/`Saving…` (`CropSuggestions.tsx:68`). Los textos no cambian.
  - Spinner: círculo 16 px, borde 2 px `currentColor` con un cuarto transparente, rotación 700 ms lineal; `aria-hidden`.
- Jerarquía de CTAs: 1 `save` por vista (acción que persiste); `primary` (`#292D30`) para entrar en modo edición (Modify); `secondary` para Cancel/Reset/Update/Switch.

### 8.2 `ghost` (texto/enlace)

Selectores: `.link` (`Fields.tsx:63` Clear `Other.tsx:68`), `.see-all` (`Home.tsx:77`, `CropSuggestions.tsx:127`), `.why summary` (`CropSuggestions.tsx:64`).
- `display:inline-flex; min-height: 32px (fino)/44 (táctil); padding: 0 8px; margin-inline: -8px; border-radius: 10px`; texto `--link` 14/600, subrayado en default para `.link` (enlace), en hover para `.see-all`.
- `.why summary`: marcador propio (chevron 16 px que rota 90° con `[open]`, rotación 0 ms con reduced motion) en lugar del triángulo nativo (`list-style: none`); estado abierto = chevron girado + `aria-expanded` nativo de `<details>`.
- `Fields.tsx:63` "Add your first field" pasa de `<button onClick={navigate}>` a `<Link to="/fields/new" className="link">` (P4).

### 8.3 `icon` (sobre superficie clara)

Botón Back (`ui.tsx:43`), Info de `.map-note` en hoja, asa de la hoja, chevrons de tablas.
- 40×40 (fino) / 44×44 (táctil), radio 10, icono 20 px `aria-hidden`; nombre accesible por `aria-label`. Tokens ghost de 02 §5.4.

### 8.4 `list-item` (tarjeta-botón)

Selectores: `.field-item` (`Fields.tsx:69-78`), `.risk-card` (renombre de `.risk`, `Risks.tsx:48`), `.alert` (`Home.tsx:90`), filas del popover More.
- `display:grid; gap: 4px; padding: 12px 14px; border-radius: 12px; text-align: left; width: 100%`; mínimo 56 px de alto.
- Selected (02 §5.8): borde 2 px (se compensa con `padding` −1 px para no mover el contenido) + fondo tinte + título 700 + **icono `Check` 16 px** a la derecha del título en `.field-item` y `.risk-card` (el `.alert` mantiene el amarillo + borde 2 px + check).
- Semántica: `.field-item` → `aria-current="true"` (P12, §10); `.risk-card` y `.alert` → `aria-pressed` (ya existe).
- Disabled: tokens disabled/lectura de 02 (sustituye `opacity: .5`, `app.css:257`, y `.55`, `app.css:233`).
- Loading (cuando la acción dispara una carga del mapa, p. ej. alerta "stress" cargando puntos): `aria-busy` + spinner 16 px en la esquina superior derecha; contenido sin cambios.

### 8.5 `map-overlay` (vidrio oscuro aprobado)

Selectores: `.field-button`, `.global-button`, `.zoom button`, `.year-picker button`, botón Info de nota, contenedores `.legend`, `.map-note`, `.global-panel`, `.year-picker`.
- Fondo `--glass-scrim` + `backdrop-filter: blur(6px)` (antes 3 px) + `--shadow-overlay`; borde 1 px `rgba(255,255,255,.35)`; texto/icono blanco.
- Botones: 44–46 px alto; pill para Field/Global, radio 10 para zoom/year.
- Estados: 02 §5.5 (hover `--glass-scrim-hover`, active `--glass-scrim-active` + `scale(.96)`, selected de Global = `--action` opaco + switch desplazado + borde blanco, disabled zoom, loading de Global con spinner blanco mientras `GlobalLayer` carga).
- Foco: el anillo doble funciona sobre cualquier imagen (02 §5.10).
- `.switch` (`app.css:333-335`): 32×18, círculo 14; transición `left` 120 ms → `transform: translateX(14px)` (composición, sin reflujo).

### 8.6 `chip` / `toggle`

Selectores: `.chip` (`ui.tsx:90-98` `Chips`; DataHub series `DataHub.tsx:58`; equipo `FieldForm.tsx:74`; dentro de `.global-panel`).
- Alto 32 (fino) / 44 (táctil); `padding: 0 14px`; radio pill; texto 14 px.
- Tokens: 02 §5.6 (incluida variante sobre vidrio y lectura).
- Selected sin depender del color: fondo `--chip-selected-bg` + peso 700 + **icono `Check` 14 px** a la izquierda. Para que el chip no cambie de ancho al seleccionarse: el icono ocupa un hueco reservado de 14 px + 4 px en todos los estados (vacío si no está seleccionado) y el peso se pre-reserva con un pseudo-elemento `::after { content: attr(data-label); font-weight: 700; visibility: hidden; height: 0; overflow: hidden; display: block }` (`Chips` añade `data-label={o}`; texto idéntico).
- Semántica: `Chips` de selección única (riego, suelo, presets, tabs de Data, Temperature/Rain, Elevation/Slope/Erosion) → `role="radiogroup"` + `role="radio"` + `aria-checked` + tabindex itinerante + flechas (P14). Multiselección (equipo, `FieldForm.tsx:72-76`) → `aria-pressed` (se queda). Series de precios (`DataHub.tsx:56-60`) → radiogroup.
  - Presets de Crops (`Crops.tsx:74`): valor `''` cuando ninguno coincide → ningún radio marcado; el primero recibe tabindex 0.

### 8.7 `tab`

Selectores: `.tabs button` (Statistics). Pestañas de Data (`DataHub.tsx:20`) siguen como chips radiogroup (cambian el contenido entero del panel, pero el Figma las dibuja como chips; se respeta).
- Tokens 02 §5.7; selected = `--tab-selected-bg` + texto 600 + **barra inferior 3 px** `--tab-selected-indicator`.
- Geometría §6.4. Semántica ARIA tabs §6.4.

### 8.8 `nav-item` y `map-tool`

- `nav-item`: §3; tokens 02 §5.8 (columna nav).
- `map-tool` (botones/enlaces de `.toolbar`): §4.6; tokens 02 §5.5 "toolbar"; active `scale(.96)`.

### 8.9 Inputs, selects, textarea, sliders

| Estado | Regla (colores de 02 §5.9) |
|---|---|
| default | borde 1 px `--input-border`, fondo `--input-bg`, radio 10, alto §6.3 |
| placeholder | `--input-placeholder` |
| hover (fino) | borde `--input-border-hover` |
| focus-visible | borde `--input-border-focus` + anillo doble (en inputs de texto se usa `:focus`, no solo `:focus-visible`, porque al teclear el foco siempre debe verse) |
| invalid | `aria-invalid="true"` → borde 2 px `--input-border-invalid` (padding −1 px), icono `CircleAlert` 16 px dentro a la derecha, mensaje debajo en `--error-text` 12–14 px, enlazado por `aria-describedby` |
| disabled / lectura | `fieldset:disabled` (ya existe, `app.css:247`) con `--readonly-bg/--readonly-text`; chips en lectura `--readonly-selected` |
| textarea | `min-height: 88px; resize: vertical`; contador opcional no (no hay texto previsto) |

Sliders (`Slider`, `ui.tsx:115-128`; `PriorityBar`):
- Pista 9 px (sin cambio de colores: gradientes son datos). Input invisible con área ≥ 44 px de alto en táctil (`inset: -18px -11px`), ≥ 28 px en fino.
- Thumb 15 px (fino, Figma) / 22 px (táctil). Hover: 19 px. Active: `--thumb` más oscuro (`#00266A` de 02) + halo 6 px. Foco: anillo doble sobre el thumb.
- Disabled (dentro de `fieldset:disabled`): pista `--readonly-bg`, thumb `--neutral-400`, `cursor: not-allowed`.
- Estructura (P13): `<div class="slider">` con `<label htmlFor={id}>` solo para el nombre, `<output htmlFor={id}>` para el valor, marcas `aria-hidden`; input con `aria-valuetext={display}` (p. ej. "+10%", "+1.5 °C", literal ya calculado en `Home.tsx:55,60`).

### 8.10 Feedback: `Notice`, vacíos, carga

- `Notice` (`ui.tsx:77-79`): padding 12 16, radio 15, texto 14; icono 16 px a la izquierda por tipo (`Info`, `CircleAlert`, spinner) `aria-hidden`. `role` actual se conserva.
- Carga (P30): mientras `useRemote` recarga con datos previos (`hooks.ts:11`), la Card afectada lleva `aria-busy="true"` y una barra de progreso indeterminada de 2 px en su borde superior (`--action`); sin skeletons nuevos. Texto "Loading…" existente se mantiene en primera carga.
- Vacío: `.empty` 14 px `--text-muted`, con el enlace/acción existente si lo hay.

---

## 9. Mapeo de selectores (antes → variante)

| Hoy (archivo) | Variante | Cambios de marcado |
|---|---|---|
| `.btn-*` (`ui.tsx:71`) | primary/save/secondary | `loading`, `size` |
| `.suggest .btn`, `.live-foot .btn` | `size="sm"` | quitar overrides |
| `.link`, `.see-all`, `.why summary` | ghost | `Fields.tsx:63` → `Link` |
| Back (`ui.tsx:43`) | icon | `type="button"` |
| `.field-item` | list-item | `role` listbox/option fuera |
| `.risk` (tarjeta) | list-item | renombrar a `.risk-card` |
| `.alert` | list-item (alert) | reflujo §6.5 |
| `.chip` | chip | radiogroup / `data-label` |
| `.tabs button` | tab | ARIA tabs |
| `.nav-item`, `.nav-home`, `.nav-user` | nav-item | — (Account sin cambios funcionales) |
| `.field-button`, `.global-button`, `.zoom button`, `.year-picker button` | map-overlay | Field → `Link`; `type="button"` |
| `.toolbar button` | map-tool | capas → `Link` + `aria-current` |

---

## 10. Correcciones ARIA y semántica (P1–P31)

| # | Corrección | Archivo |
|---|---|---|
| P1 | Account: se reporta. Visualmente se alinea al nav (§3); no se le asigna destino | `ui.tsx:31` |
| P2 | History con título "HOME": se reporta, no se cambia (fuera de alcance, decisión 7) | `Other.tsx:142` |
| P3 | Back `navigate(-1)`: se reporta | `ui.tsx:43` |
| P4 | Toolbar de capas, "Field +", "Add your first field" → `<Link>` con los mismos destinos | `FieldMap.tsx:197, 245-253`; `Fields.tsx:63` |
| P5 | Se reporta; opción (requiere sí): envolver las palabras `"Add field"` de `Home.tsx:49` en `<Link to="/fields/new">` sin cambiar el texto | `Home.tsx:49` |
| P6 | Se reporta; si se confirma, disabled de §4.7 | `FieldMap.tsx:233-235` |
| P7 | Skip link + `main#panel` | §3.1 |
| P8–P11 | Contraste: tokens de 02 | app.css |
| P12 | `div[role=listbox]` → `<ul class="field-list" aria-label="Your fields">` con `<li><button aria-current={sel ? 'true' : undefined}>`; un tab stop por parcela (lista corta) | `Fields.tsx:68-78` |
| P13 | Slider/PriorityBar: label solo con el nombre, `output htmlFor`, `aria-valuetext`, marcas `aria-hidden` | `ui.tsx:115-141` |
| P14 | "Months the field stays empty" → `<fieldset><legend>` (mismo texto; el `div.label` se elimina); "From" y "To" → `<label htmlFor>` con el mismo literal; "Irrigation system" y "Equipment available" → `<fieldset><legend>`; soil: el `h3` "Perceived soil type" se convierte en el `legend` (estilo h3) | `FieldForm.tsx:55-76` |
| P15 | Textarea: `aria-labelledby` = id del `h2` de la Card ("Add description" / "Add the {year} record"); `placeholder` se mantiene | `Other.tsx:125`, `ui.tsx:55-62` (Card acepta `titleId`) |
| P16 | Select de parcela en Home: `aria-labelledby` del `h2` "Field"; en DataHub ya está dentro de `<label>` (correcto), se deja | `Home.tsx:43` |
| P17 | Selects From/To con `aria-invalid` cuando `monthsIncomplete` y `aria-describedby="months-hint"`; el `<small id="months-hint">` vive dentro de un contenedor `aria-live="polite"` siempre presente | `FieldForm.tsx:56-66` |
| P18 | `aria-hidden="true"` en todos los iconos lucide decorativos: nav (`ui.tsx:6-16, 22, 31, 43`), mapa (`FieldMap.tsx:186, 193, 198, 215, 221-222, 227, 233, 235, 241, 252`), alertas (`Home.tsx:95-96`), `Home.tsx:35` (CloudDrizzle), `LevelPill` ya lo tiene. Alternativa: helper `Icon` que lo aplique por defecto | varios |
| P19 | `type="button"` en botones del mapa; zoom disabled sin mapa | `FieldMap.tsx` |
| P20 | Alternativa de teclado para dibujar: propuesta §5.5, pendiente | `FieldMap.tsx`, `Other.tsx` |
| P21 | `aria-busy` en botones y cards en carga (§8.1, §8.10) | |
| P22 | reduced motion §11 | |
| P23 | **`.risk` duplicada**: el bloque `app.css:91-98` (`.rotation*`, incluida `.risk` de línea 96) es CSS muerto; se borra entero. La tarjeta pasa a `.risk-card` (`app.css:279-280` + `Risks.tsx:48`). Resultado: una sola definición, sin herencia accidental de `font-style/font-weight/color/background` | |
| P24 | Borrar CSS sin uso (verificado con búsqueda en `src/**/*.tsx`): `.rotation`, `.rotation-row*`, `.rotation p`, `.risk` (pastilla), `.traffic*`, `.lamp*`, `.crop-list`, `.crop`, `.crop span`, `.crop em*`, `.tip`, `.tip-row`, `.whatif hr` (no hay `<hr>`) | `app.css:91-98, 114 (tip-row), 128-145, 82` |
| P25 | Radios §7.3 | |
| P26 | Foco único §8.0 | |
| P27 | Colores sueltos → tokens de 02; los de datos se quedan | |
| P28 | Variantes §8 | |
| P29 | Quitar `font: inherit` repetido (`app.css:236, 254, 279`) | |
| P30 | §8.10 | |
| P31 | Fuentes §7.1; favicon/description/theme-color: se reportan (requieren recursos o textos del usuario) | `index.html` |

---

## 11. Movimiento y `prefers-reduced-motion`

Inventario de movimiento tras el rediseño (todo ≤ 240 ms, solo `transform`/`opacity`/colores, salvo el `height` de la hoja):

| Movimiento | Normal | `prefers-reduced-motion: reduce` |
|---|---|---|
| Colores de estado | 120 ms ease-out | se mantiene (no es movimiento) |
| Hundimiento active | 80 ms | sin `transform`; solo cambio de color (sigue siendo perceptible, 02 §5) |
| Snap de la hoja | 240 ms `cubic-bezier(.2,.8,.2,1)` | 0 ms; el arrastre sigue al dedo (es manipulación directa) |
| `.switch` | 120 ms | 0 ms |
| Chevron "Why?" | 120 ms | 0 ms |
| Spinner | 700 ms/vuelta | 1600 ms/vuelta (sigue indicando actividad; además `aria-busy` y texto "Saving…") |
| Barra indeterminada (§8.10) | deslizamiento 1.2 s | barra fija al 100 % con opacidad .6 |
| `map.flyTo` 800 ms (`FieldMap.tsx:163`) | igual | `map.jumpTo` con el mismo centro/zoom (comprobar con `matchMedia` en el efecto; maplibre 4.7 también acorta animaciones no `essential`, pero no se confía en ello) |
| Popover More | aparición 120 ms opacity + translateY(4px) | solo opacity |

Regla global en `app.css`: bloque `@media (prefers-reduced-motion: reduce)` que fija `transition-duration` de `transform` a 0 y anula `transform` en `:active`, sin `*{animation:none}` indiscriminado (rompería el spinner).

---

## 12. Especificación por sección: jerarquía y balance

Escala de jerarquía en todas las vistas: **N1** = `h1` del panel (`--fs-xl`) y, en el mapa, la capa activa; **N2** = `h2` de Card (`--fs-xl`/`--fs-lg`), CTA `save`, cifras (`.live-value`); **N3** = `h3`, labels, notas (`--fs-xs`/`--fs-sm`, `--text-muted`). Un solo foco por pantalla:

| Vista | Foco (1) | Secundario (2) | Rompe la simetría | Densidad |
|---|---|---|---|---|
| Home `/` | Card "What if?" (2 sliders, primera interacción) → efecto en el mapa | LiveForecast (cifras 20–22 px), riesgos en chips | `.alert-grid` 2 columnas con icono/barra a la derecha: única zona en rejilla dentro de un flujo de una columna | denso (forecast) → aire (riesgos, chips) → denso (sugerencias) → rejilla (alertas) |
| `/risks` | lista `.risk-card` (la seleccionada con borde 2 px + check) | "Right now" | el nivel (`LevelPill`) alineado a la derecha de cada título | lista densa seguida de notas con fondo `--surface-sunken` (cambio de textura) |
| `/fields` | `.field-list` + `edit-bar` (Modify `primary`, Save `save`) | FieldForm en lectura | barra de acciones sticky en hoja | lista → barra → formulario largo → sugerencias |
| `/fields/new` | **el mapa** (dibujo) + franja de estado | formulario | franja `.panel-status` bajo el header, única pieza siempre visible | mapa 70 % / hoja 30 % en peek; formulario completo en expanded |
| `/crops` | presets + 4 sliders + Save | riesgos, lista de opciones | "Switch to X" (`secondary sm`) alineado a la izquierda en cada tarjeta, frente a la puntuación a la derecha | |
| `/history` | year-picker en el mapa + ficha del año | editor | año grande (24 px bold) sobre el mapa, contrapeso a la izquierda del panel | |
| `/statistics` | la gráfica (45 dvh) | pestañas | pestañas centradas sobre una tarjeta ancha (única vista simétrica, intencional) | gráfica densa → notas en 75ch |
| `/data` | chips de pestaña + primer gráfico/tabla | notas | tablas que refluyen a tarjetas en estrecho | |
| Mapa (todas) | capa + leyenda | botones superiores | toolbar centrada abajo vs botones arriba a la izquierda y leyenda arriba a la derecha (diagonal de peso) | |

Bocetos clave adicionales:

```
Escritorio 1280×800 /risks
┌─────┬──────────────────────────┬───────────────────────────────────────┐
│ ⌂   │ Zone risks           72px│ [Field ⊕] [◐ Global mode]   ┌legend┐ │
│     ├──────────────────────────┤                              │▮ 40° │ │
│ 🌱  │ Around X. Tap a card…    │                              │▮     │ │
│▌🛡  │ ┌Right now─────────────┐ │        mapa + capa           │▮ 10° │ │
│ 🌾  │ │ 31 °C  next 7 days   │ │                              └──────┘ │
│ 📅  │ └──────────────────────┘ │                                  [+] │
│ 📊  │ ┏Heat wave ✓ ▲Medium━━━┓ │                                  [−] │
│ 🗄  │ ┃ texto…               ┃ │                                       │
│ ⊞+  │ └──────────────────────┘ │                                       │
│     │ ┌Drought  ●Low────────┐ │   [🌡][💧][▥][△][☂][☀][⛰]           │
│ (●) │ Decision support only…   │                                       │
└─────┴──────────────────────────┴───────────────────────────────────────┘
 83px        clamp → 486px                   resto (711px)
```

```
Rail 834×1112 (iPad vertical, fuera de Q_SHEET por ancho ≥768)
┌────┬──────────────┬──────────────────────┐
│ ⌂  │ HOME         │ [Field⊕][Global]  ▤  │
│ 🌱 │ What if? ... │                      │
│ …  │ 334 px       │  mapa 428 px    [+]  │
│    │              │  [toolbar 48px]      │
└────┴──────────────┴──────────────────────┘
```

---

## 13. Respeto del contrato de preservación

| Elemento de `preservacion.json` | Cómo se respeta |
|---|---|
| Rutas (10) y `Navigate` | sin cambios; hoja/barra/rail son presentación |
| Enlaces de nav (8 + Account) | mismos `to`, labels, iconos, orden; en hoja 4 en la barra + 4 y Account en More |
| `gotos_js` | `navigate(-1)` y `navigate('/fields')` intactos; `navigate('/fields/new')` y `navigate('/layers/…')` pasan a `Link` con **el mismo destino** (P4, pedido en el encargo) |
| Controles sin navegación | mismos handlers (`selectField`, `setScenario`, `setSelected`, `setPrio`, `setTab`, `setPicked`, `setView`, `setGlobalMode`, `setGlobalVar`, `zoomIn/Out`, `setDraft`); solo cambia el marcado ARIA |
| Formularios y mutaciones | `crearParcela`, `actualizarParcela`, `guardarHistorial`: sin cambios; `claveIdempotencia` intacta; `loading` usa `aria-disabled` + guarda en el handler existente (`saving`) |
| Textos i18n y literales | ningún texto existente cambia; strings nuevas solo para controles nuevos (en inglés): "Skip to panel", "More", "Expand panel", "Collapse panel", "Panel expanded/half open/collapsed", "Field details", "{n} out of 100". `data-label` de tablas reutiliza los `<th>` |
| Colores de datos | rampas, parcela, gradientes de slider, series, niveles, pines: intactos; la leyenda horizontal solo rota el gradiente |
| Marca tipográfica "HOME" | se conserva; solo se quita el `margin-left: -22px` |
| Un solo mapa montado | `<FieldMap>` sigue fuera de `<Routes>`; ningún modo lo desmonta; en hoja cambia a `position: fixed` por CSS |
| Decisiones 4 y 6 | no se tocan `seed.ts`, `.env.development`, `vite.config.ts`; sin librerías nuevas (popover nativo, Pointer Events, matchMedia, container queries) |

---

## 14. Checklist de balance y verificación (medible)

- [ ] A 1280×800 el panel mide 486 ± 2 px y el mapa ≥ 700 px; a 1024×768, panel 389 y mapa 552.
- [ ] A 1366×768 (viewport ~1366×657) toda la sidebar es visible sin scroll y el botón Account cabe.
- [ ] A 375×667 (Safari) en `half`: mapa visible ≥ 270 px; toolbar completa sin scroll horizontal; zoom visible si `cqh > 320`.
- [ ] A 320×568: toolbar con scroll horizontal y máscara; ningún overlay se solapa con otro (rejilla `.map-ui`).
- [ ] `/fields/new` en 375×667 peek: mapa visible ≥ 70 % del alto útil; un arrastre de la hoja no añade vértices; "Save field" visible en `expanded` sin hacer scroll (sticky).
- [ ] 667×375 y 740×360 horizontal: modo rail, sin hoja; panel ≥ 300 px.
- [ ] Ningún texto de contenido < 12 px (buscar `font-size: 9px|10px|11px` → 0 resultados; ticks recharts ≥ 12).
- [ ] Inputs/selects/textarea a 16 px en `Q_SHEET`/`Q_COARSE` (sin zoom al enfocar en iOS).
- [ ] Todos los controles ≥ 44×44 en `Q_COARSE`; ≥ 24×24 con separación en fino.
- [ ] Cada control de §8 muestra 7 estados distinguibles en una página de prueba (default, hover, active, selected, focus, disabled, loading); hover inexistente en táctil.
- [ ] Selected nunca solo por color (verificar en escala de grises).
- [ ] Un solo anillo de foco en toda la app; visible sobre mapa, vidrio, tarjeta y fondo.
- [ ] Botones en loading no cambian de ancho (medir antes/después).
- [ ] Tablas de 3 columnas refluyen a tarjetas con contenedor ≤ 420 px; sin palabras partidas.
- [ ] Sin scroll anidado en el panel (R26): `grep "max-height.*overflow-y"` en `.panel-body` → 0.
- [ ] Alternancia de densidad: en Home no hay dos Cards densas seguidas sin una ligera entre ellas (orden existente ya lo cumple).
- [ ] Peso visual escritorio: masa a la izquierda (sidebar + panel claro) compensada por la imagen satelital a la derecha; overlays en diagonal (arriba-izq. / arriba-der. / abajo-centro).
- [ ] Con `prefers-reduced-motion`: sin `transform` en `:active`, snap instantáneo, `jumpTo` en lugar de `flyTo`.
- [ ] Lighthouse/axe: 0 errores de `aria-allowed-role`, `label`, `button-name`, `scrollable-region-focusable`.
- [ ] Detector de impeccable: `impeccable detect --json src/styles/app.css` sin hallazgos críticos tras implementar.

---

## 15. Orden de implementación priorizado

| Fase | Trabajo | Archivos | Depende de |
|---|---|---|---|
| 1 | Tokens: aplicar `:root` de 02 §7 + tokens de §7 (tipografía, espacio, radios, sombras, z-index); foco único; borrar CSS muerto y la `.risk` duplicada; quitar `filter` y `font: inherit` repetidos | `app.css`, `Risks.tsx:48` | — |
| 2 | Shell responsivo: `Q_*` en `src/layout.ts` + `useMatchMedia`; `.app` en grid; panel fluido; sidebar con alturas; rail; `viewport-fit=cover` | `main.tsx`, `ui.tsx`, `hooks.ts`, `app.css`, `index.html` | 1 |
| 3 | Overlays del mapa: `.map-ui` + regiones, toolbar con scroll, leyenda compacta, Field/capas → `Link`, `type="button"`, zoom disabled | `FieldMap.tsx`, `app.css` | 2 |
| 4 | Modo hoja: barra inferior + More, hoja con snaps, asa accesible, `--sheet-offset`, `setPadding`, `Panel status` + sticky actions, flujo `/fields/new` | `ui.tsx`, `AppContext.tsx`, `FieldMap.tsx`, `Other.tsx`, `Fields.tsx`, `Crops.tsx`, `app.css` | 2, 3 |
| 5 | Componentes y estados: `Btn` (loading/size), chips (radiogroup, check), list-item, tab, ghost, icon, map-overlay, inputs y sliders | `ui.tsx`, `FieldForm.tsx`, `CropSuggestions.tsx`, `LiveForecast.tsx`, `Home.tsx`, `Risks.tsx`, `Other.tsx`, `DataHub.tsx`, `Crops.tsx`, `app.css` | 1 |
| 6 | ARIA/semántica P12–P19, P21 (listbox, labels, fieldsets, `aria-hidden`, `aria-invalid`) | idem 5 | 5 |
| 7 | Contenido responsivo: tablas (wrap + reflujo), gráficas, `.alert`, `.priority-row`, `.factor`, Statistics | `DataHub.tsx`, `Other.tsx`, `Home.tsx`, `ui.tsx`, `CropSuggestions.tsx`, `app.css` | 2, 5 |
| 8 | Movimiento y reduced motion; `flyTo` → `jumpTo` condicional | `app.css`, `FieldMap.tsx` | 4, 5 |
| 9 | Verificación con la checklist §14 en 320, 375, 768, 834, 1024, 1280, 1366×657, 667×375; detector de impeccable | — | todo |
| Pendiente de confirmación | dibujo por teclado + deshacer (P20), enlace en "Add field" (P5), límites de año (P6), botón "Hide panel", Account/History/Back (P1–P3), favicon/meta (P31) | — | usuario |
