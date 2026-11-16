# 06 · Motion e interacción: FieldShift (modo PRESERVACIÓN)

Fecha: 2026-11-15. Rutas relativas a `src/frontend/`. Insumos leídos: `00-decisiones.md`, `01-brief.md`, `preservacion.json`, `02-colorimetria.md` (colores de estado aprobados) y `05-diseno.md` (especificación aprobada; §8 variantes, §5 hoja, §11 movimiento). No existe `03-referencias.md`.

Este documento **no modifica código fuente**. Los fragmentos CSS/TS están listos para que el desarrollador los pegue en la fase 8 de `05-diseno.md` §15 (y en la fase 4 en el caso de la hoja). No añade librerías: CSS (transiciones, `@keyframes`, `@starting-style`, popover nativo), Web Animations API (WAAPI, nativa) y Pointer Events.

## 0. Skills y trazabilidad

| Skill | Estado | Uso |
|---|---|---|
| `emil-design-eng` | cargada | criterio base: frecuencia manda, < 300 ms, sin `ease-in`, `:active` inmediato, hover solo con puntero fino, transiciones (no keyframes) para UI interrumpible, curva de cajón iOS, rubber-band y velocidad en arrastres |
| `animate` | disponible, no cargada | su orden de decisión (¿animar? → propósito → herramienta → propiedades → curva/duración → interrupción → salida) estructura §2 y cada fila de §3 |
| `review-animations`, `improve-animations` | disponibles, no cargadas | no hay movimiento implementado que revisar (el brief §7 registra solo `.btn` y `.switch` con `transition`); aplicar `review-animations` sobre el diff de la fase 8 |
| `impeccable` | disponible, no cargada en esta sesión | ya aplicada en `05-diseno.md` (§0); este documento no contradice sus reglas de adaptación |
| `design-taste-frontend` | no aplica | su descripción excluye "dashboards or app screens"; intensidad de movimiento fijada aquí como **baja (herramienta de trabajo)** |

Plantilla del encargo: se adaptan los tokens sugeridos. `--dur-escena: 480ms` no se usa (no hay escenas ni hero) y `--ease-entrada` (curva *ease-in*) se descarta: ninguna animación de interfaz empieza lenta.

---

## 1. Postura de movimiento

FieldShift es una herramienta de campo que se usa muchas veces por sesión: el movimiento es **funcional y casi invisible**. Hay tres sitios donde el movimiento explica algo y por eso se permite más: la **hoja** (dónde está el panel respecto al mapa), la **cámara del mapa** (a qué parcela te llevé) y el **popover More** (de dónde sale el menú).

### 1.1 Frecuencia → decisión

| Interacción | Frecuencia | Decisión |
|---|---|---|
| Hover, press de botones/chips/items/toolbar | cientos por sesión | solo color 120 ms + hundimiento ≤ 60 ms; nunca más |
| Navegar entre rutas (sidebar, barra inferior) | decenas | **sin transición de página** (§6) |
| Cambiar pestaña (Statistics, chips de Data) | decenas | instantáneo; color 120 ms en el botón |
| Cambiar capa del mapa | decenas | sin animación de leyenda ni de raster (ya `raster-fade-duration: 0`) |
| Snap de la hoja | decenas en móvil | 160–300 ms con curva de cajón; explica la posición |
| Abrir More, Global panel, nota del mapa | ocasional | 120–160 ms, opacidad + desplazamiento de 4–6 px |
| Volar a una parcela (`flyTo`) | ocasional | 800 ms actuales (cámara, explica el desplazamiento) |
| Carga inicial | una por sesión | **sin secuencia de entrada** (§8.1) |

### 1.2 Reglas duras

1. Solo se animan `transform`, `opacity` y colores (`background-color`, `border-color`, `color`). Nunca `width`, `height`, `top`, `left`, `margin`, `padding`, `box-shadow` ni `filter`.
2. Pulsar es inmediato: al entrar en `:active` el color cambia en **0 ms** y el hundimiento en **60 ms**; al soltar se vuelve en 120 ms (asimetría: rápido cuando el usuario actúa, suave cuando el sistema responde).
3. El foco nunca se anima (`outline` y el anillo interior por `box-shadow` aparecen en 0 ms).
4. Hover solo dentro de `@media (hover: hover) and (pointer: fine)` (ya fijado en `05` §8.0); en táctil no existe.
5. Lo que el usuario dispara repetidamente usa **transiciones** (interrumpibles), no `@keyframes`. Keyframes solo para movimiento continuo (spinner, barra indeterminada).
6. Las acciones de teclado no tienen animación propia, salvo cambios espaciales (snap de la hoja, más corto: 160 ms).
7. `will-change` solo en la hoja y solo mientras se mueve (clase `.is-moving`).
8. `prefers-reduced-motion: reduce` elimina todo desplazamiento/escala; conserva colores y opacidades cortas (§9).

---

## 2. Tokens de movimiento (`src/styles/app.css`, dentro del `:root` de la fase 1)

```css
:root {
  /* Duraciones */
  --dur-press: 60ms;        /* entrada a :active (hundimiento) */
  --dur-micro: 120ms;       /* hover, release, color, switch, chevron, tooltip */
  --dur-pop: 160ms;         /* entrada de popover More, global-panel, nota */
  --dur-pop-exit: 120ms;    /* salida (más rápida que la entrada) */
  --dur-sheet: 240ms;       /* snap de la hoja por toque o programático */
  --dur-sheet-key: 160ms;   /* snap de la hoja por teclado */
  --dur-panel: 200ms;       /* panel de escritorio (opcional "Hide panel") */
  --dur-spin: 700ms;        /* una vuelta de spinner */
  --dur-indeterminate: 1200ms;
  --delay-tooltip: 400ms;   /* tooltip del rail con hover (con foco: 0) */
  --delay-busy: 300ms;      /* barra de carga: no aparece en recargas rápidas */

  /* Curvas (sin ease-in) */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* entradas, press, popovers */
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* hoja y panel (cajón tipo iOS) */
  --ease-color: ease;                               /* cambios de color */

  /* Magnitudes */
  --press-y: 1px;           /* botones de texto, list-item, chips, tabs */
  --press-scale: 0.96;      /* icono, overlays del mapa, toolbar, píldora de la barra */
}
```

Constantes equivalentes en JS (nuevo bloque en `src/layout.ts`, junto a `Q_SHEET`; "mantener sincronizados" con `app.css`):

```ts
export const Q_REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
export const MOTION = {
  sheetMs: 240,
  sheetKeyMs: 160,
  sheetMinMs: 160,
  sheetMaxMs: 300,
  easeDrawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
  flyMs: 800,
} as const;
```

---

## 3. Tabla maestra por elemento

"Reducido" = comportamiento con `prefers-reduced-motion: reduce`. Los colores de cada estado son los de `02-colorimetria.md` §5; aquí solo se fija el tiempo.

| # | Elemento | Selector / archivo | Disparador | Propiedades | Duración | Curva | Retraso | Reducido |
|---|---|---|---|---|---|---|---|---|
| 1 | Color de estado de todo control | lista `PRESSABLE` (§4.1), `app.css` | hover / salir de hover / soltar | `background-color`, `border-color`, `color` | 120 ms | `--ease-color` | 0 | igual (no es movimiento) |
| 2 | Pulsar (color) | `PRESSABLE:active` | pointerdown / Espacio | colores | **0 ms** | — | 0 | igual |
| 3 | Pulsar (hundimiento texto) | `.btn`, `.chip`, `.tabs button`, `.field-item`, `.risk-card`, `.alert`, `.link`, `.see-all`, `.why summary`, `.more-menu a` | `:active` | `transform: translateY(1px)` | 60 ms in / 120 ms out | `--ease-out` | 0 | sin `transform` |
| 4 | Pulsar (escala) | `.icon-btn`, `.panel-header button`, `.sheet-handle`, `.field-button`, `.global-button`, `.zoom button`, `.year-picker button`, `.toolbar :is(a,button)`, `.bottom-nav .pill` | `:active` | `transform: scale(.96)` | 60 ms in / 120 ms out | `--ease-out` | 0 | sin `transform` |
| 5 | Sombra pressed (primary/save/secondary) | `.btn-primary/-save/-secondary:active` | `:active` | `box-shadow` (`--shadow-pressed`) | 0 ms (no se transiciona) | — | 0 | igual |
| 6 | Foco | `:focus-visible` global; `input, select, textarea:focus` | foco | `outline` + anillo `box-shadow` | 0 ms | — | 0 | igual |
| 7 | Borde de input en hover | `.form :is(input,select,textarea)` | hover (fino) | `border-color` | 120 ms | `--ease-color` | 0 | igual |
| 8 | Input inválido | `[aria-invalid="true"]` | validación | borde 2 px, icono, mensaje | 0 ms (sin sacudida) | — | 0 | igual |
| 9 | Thumb de slider | `.slider-thumb` (`ui.tsx:124`), `.priority` | hover / active | `transform: scale(1.27)` (15→19 px), color | 120 ms | `--ease-out` | 0 | sin escala; halo y color sí |
| 10 | Posición de slider | `.slider-fill`, `.slider-thumb`, `.priority-fill` | arrastre | (estilo inline existente) | 0 ms | — | — | igual (manipulación directa) |
| 11 | Switch de Global | `.switch::after` (`app.css:334`) | `aria-pressed` | `transform: translateX(14px)` (sustituye `left`) | 120 ms | `--ease-out` | 0 | 0 ms |
| 12 | Chevron "Why?" | `.why summary .chev` (`CropSuggestions.tsx:64`) | `[open]` | `rotate: 90deg` | 120 ms | `--ease-out` | 0 | 0 ms |
| 13 | Spinner | `.spinner` (nuevo, en `Btn`, `.global-button`, list-item) | `aria-busy="true"` | `transform: rotate` | 700 ms/vuelta, infinito | `linear` | 0 | 1600 ms/vuelta |
| 14 | Etiqueta de carga en `Btn` | `.btn-label` / `.btn-loading` (`ui.tsx:68-74`) | `loading` | `visibility` | 0 ms | — | 0 | igual |
| 15 | Barra indeterminada de Card | `.card[aria-busy="true"]::before` | recarga con datos previos (`hooks.ts:11`) | `opacity`, `transform: translateX` | entra 120 ms; ciclo 1200 ms | `--ease-out` / `ease-in-out` | 300 ms | barra fija 100 %, opacidad .6, sin ciclo |
| 16 | Snap de la hoja | `main.panel` en `Q_SHEET` (`ui.tsx` Panel) | tap asa/título, flechas, Esc, `focusin`, ruta, soltar arrastre | `transform: translateY` (WAAPI) | 240 ms tap; 160 ms teclado; 160–300 ms tras arrastre (por velocidad) | `--ease-drawer` | 0 | 0 ms (salto); el arrastre sigue al dedo |
| 17 | Seguimiento del dedo | `main.panel` + seguidores (§5.4) | `pointermove` | `transform: translateY` | por frame (rAF) | — | 0 | igual (manipulación directa) |
| 18 | Overlays inferiores del mapa siguen la hoja | `.map-ui .toolbar`, `.year-picker`, `.zoom`, `.maplibregl-ctrl-bottom-right` (`FieldMap.tsx`) | arrastre / snap | `transform: translateY` | igual que la hoja | `--ease-drawer` | 0 | 0 ms |
| 19 | Encuadre del mapa tras snap | `map.easeTo({ padding })` (`FieldMap.tsx`) | inicio de cada snap | cámara (WebGL) | igual que la hoja | `--ease-drawer` aproximada | 0 | `jumpTo({ padding })` |
| 20 | Barra inferior: ítem activo | `.bottom-nav a[aria-current] .pill` (nuevo, `ui.tsx` Sidebar variante `bottom`) | cambio de ruta | `background-color`, `color` | 120 ms | `--ease-color` | 0 | igual |
| 21 | Popover More (entrada) | `#nav-more` (`popover="auto"`) | clic en More | `opacity` 0→1, `transform: translateY(6px) scale(.98)`→none | 160 ms | `--ease-out` | 0 | solo `opacity` 120 ms |
| 22 | Popover More (salida) | `#nav-more:not(:popover-open)` | Esc, clic fuera, navegar | `opacity` 1→0, `translateY(4px)` | 120 ms | `--ease-out` | 0 | solo `opacity` 120 ms |
| 23 | Punto de "ruta en More" | `.bottom-nav .more-dot` | ruta del grupo More | ninguna | 0 ms | — | — | igual |
| 24 | Tooltip del rail | `.nav-item::after` en `Q_RAIL`+`Q_XSHORT` | hover (fino) / `:focus-visible` | `opacity` | 120 ms | `--ease-color` | 400 ms hover; 0 foco | igual |
| 25 | Global panel / nota del mapa | `.global-panel` (`GlobalLayer.tsx:126`), `.map-note-body` | montaje / `aria-expanded` | `opacity`, `translateY(-4px)`→0 | 160 ms | `--ease-out` | 0 | solo `opacity` |
| 26 | Selected (chip, tab, list-item, toolbar, nav) | `[aria-pressed]`, `[aria-checked]`, `[aria-selected]`, `[aria-current]` | selección | colores 120 ms; borde 2 px, barra 3 px, check: 0 ms | 120 ms / 0 | `--ease-color` | 0 | igual |
| 27 | Cámara a parcela | `map.flyTo` (`FieldMap.tsx:163`) | cambio de `currentField` | cámara | 800 ms (sin cambio) | por defecto de maplibre | 0 | `map.jumpTo` mismo centro/zoom/padding |
| 28 | Zoom +/− | `.zoom button` (`FieldMap.tsx:221-222`) | clic | cámara | 500 ms aprox. (por defecto maplibre) | por defecto | 0 | `zoomIn({ animate: false })` |
| 29 | Scroll programático | `scrollIntoView` de `requestMapView` (`05` §5.2), elemento activo en toolbar | selección | scroll | `smooth` | navegador | 0 | `behavior: 'auto'` |
| 30 | Panel de escritorio (solo si se aprueba "Hide panel") | `.app[data-panel]`, `main.panel` | botón | `opacity`, `translateX(-8px)` | 200 ms entra / 120 ms sale | `--ease-drawer` / `--ease-out` | 0 | solo `opacity` |
| 31 | Cambio de ruta (contenido del panel) | `main.panel` (remonta en cada ruta) | navegación | ninguna | 0 | — | — | igual |
| 32 | Carga inicial | `.app`, mapa | primera carga | ninguna (salvo fundido nativo de teselas de maplibre) | — | — | — | igual |

---

## 4. Microinteracciones de estado (`src/styles/app.css`)

### 4.1 Lista de pulsables y transición base

Sustituye la transición actual de `.btn` (`app.css:236`, `background 0.15s, color 0.15s`), elimina `filter: brightness` (`app.css:240`) y la de `.switch::after` (`app.css:334`).

```css
/* PRESSABLE: mantener esta lista igual en los tres bloques de esta sección */
:is(.btn, .chip, .tabs button, .field-item, .risk-card, .alert,
    .link, .see-all, .why summary, .icon-btn, .panel-header button, .sheet-handle,
    .nav-item, .nav-home, .nav-user, .bottom-nav :is(a, button), .more-menu a,
    .field-button, .global-button, .zoom button, .year-picker button, .toolbar :is(a, button)) {
  transition:
    background-color var(--dur-micro) var(--ease-color),
    border-color var(--dur-micro) var(--ease-color),
    color var(--dur-micro) var(--ease-color),
    transform var(--dur-micro) var(--ease-out);
  -webkit-tap-highlight-color: transparent; /* el estado pressed propio sustituye al flash gris de iOS/Android */
  touch-action: manipulation;               /* sin espera de doble toque */
}

/* Al pulsar: el color cambia ya; el hundimiento casi ya. Al soltar se usa la regla base (120 ms). */
:is(.btn, .chip, .tabs button, .field-item, .risk-card, .alert,
    .link, .see-all, .why summary, .icon-btn, .panel-header button, .sheet-handle,
    .nav-item, .nav-home, .nav-user, .bottom-nav :is(a, button), .more-menu a,
    .field-button, .global-button, .zoom button, .year-picker button, .toolbar :is(a, button)):active:not(:disabled, [aria-disabled="true"]) {
  transition-duration: 0ms, 0ms, 0ms, var(--dur-press);
}
```

Nota: CSS plano (decisión 6), así que la lista `PRESSABLE` se repite literal en cada bloque; si se añade una variante, añadirla en todos. `box-shadow` y `outline` quedan **fuera** de la transición a propósito: el anillo de foco y `--shadow-pressed` aparecen en 0 ms.

### 4.2 Hundimiento (solo con movimiento permitido)

```css
@media (prefers-reduced-motion: no-preference) {
  /* Texto y tarjetas: bajan 1 px */
  :is(.btn, .chip, .tabs button, .field-item, .risk-card, .alert,
      .link, .see-all, .why summary, .more-menu a):active:not(:disabled, [aria-disabled="true"]) {
    transform: translateY(var(--press-y));
  }
  /* Icono, vidrio del mapa, toolbar, píldora de la barra inferior: escala */
  :is(.icon-btn, .panel-header button, .sheet-handle,
      .field-button, .global-button, .zoom button, .year-picker button,
      .toolbar :is(a, button)):active:not(:disabled, [aria-disabled="true"]),
  .bottom-nav :is(a, button):active .pill {
    transform: scale(var(--press-scale));
  }
}
.bottom-nav .pill { transition: background-color var(--dur-micro) var(--ease-color), transform var(--dur-micro) var(--ease-out); }
.bottom-nav :is(a, button):active .pill { transition-duration: 0ms, var(--dur-press); }
```

- Sidebar de escritorio/rail (`.nav-item`, `.nav-home`, `.nav-user`): **solo color**, sin transform (ítem alto con barra lateral; un desplazamiento se lee como temblor en una columna fija). La barra lateral de 3 px de `aria-current` aparece en 0 ms.
- `.toolbar` es un contenedor con `overflow-x: auto`: la escala .96 del botón no se recorta porque reduce, no amplía.
- `.field-item`/`.risk-card` seleccionados: el borde de 2 px aparece en 0 ms (con compensación de padding de `05` §8.4, no hay salto de contenido); el fondo tinte transiciona 120 ms.
- Chips: el check y el peso 700 aparecen en 0 ms; el ancho no cambia (hueco reservado, `05` §8.6), así que no hay reflujo que animar.

### 4.3 `primary` / `save` / `secondary` con loading (`ui.tsx:68-74`)

```css
.btn { display: inline-grid; grid-template-areas: "s"; place-items: center; }
.btn > .btn-label, .btn > .btn-loading { grid-area: s; display: inline-flex; align-items: center; gap: 8px; }
.btn > .btn-loading { visibility: hidden; }
.btn[aria-busy="true"] > .btn-label { visibility: hidden; }
.btn[aria-busy="true"] > .btn-loading { visibility: visible; }
.btn[aria-busy="true"] { cursor: progress; }

.spinner {
  inline-size: 16px; block-size: 16px; flex: none;
  border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%;
  animation: fs-spin var(--dur-spin) linear infinite;
}
@keyframes fs-spin { to { transform: rotate(1turn); } }
```

- El cambio de etiqueta es instantáneo: el usuario acaba de pulsar y espera respuesta inmediata; el giro ya comunica actividad. Sin fundido (evita que parezca que el botón "duda").
- `aria-disabled="true"` excluye el hundimiento (§4.2 `:not([aria-disabled="true"])`), así un segundo toque durante "Saving…" no da retroalimentación falsa.
- Mismo `.spinner` (blanco por `currentColor`) en `.global-button[aria-busy]` mientras `GlobalLayer` carga (`GlobalLayer.tsx:38`) y en la esquina de `.field-item/.risk-card/.alert[aria-busy]`.

### 4.4 Ghost, chevron de "Why?", icon

```css
.why summary { list-style: none; }
.why summary::-webkit-details-marker { display: none; }
.why summary .chev { transition: rotate var(--dur-micro) var(--ease-out); }
.why[open] summary .chev { rotate: 90deg; }
```

El contenido de `<details>` aparece sin animación de altura (animar `height`/`interpolate-size` está fuera de las reglas y sin soporte amplio).

### 4.5 Switch de Global (`app.css:333-335`)

```css
.switch::after { left: 2px; transform: translateX(0); transition: transform var(--dur-micro) var(--ease-out), background-color var(--dur-micro) var(--ease-color); }
.global-button[aria-pressed="true"] .switch::after { transform: translateX(14px); }
```

### 4.6 Pestañas y chips de selección única

Sin indicador deslizante: la barra inferior de 3 px (`05` §8.7) aparece en 0 ms en la pestaña nueva; el fondo transiciona 120 ms. El panel de la pestaña cambia sin animación (`Other.tsx`, `setTab`). Razón: se cambia de pestaña decenas de veces y el contenido (gráfica recharts) se repinta igualmente; un deslizamiento solo añade espera.

Recharts: dejar `isAnimationActive` como está por defecto en escritorio sería una animación de 1.5 s en cada cambio de pestaña; **recomendado** `isAnimationActive={false}` en `Line`/`Area` de `Other.tsx:187-195` y `DataHub.tsx:62-71` (es una prop, no altera datos ni colores). Si se prefiere conservarla: `animationDuration={300}` y `false` con movimiento reducido.

### 4.7 Inputs, selects, textarea, sliders

```css
.form :is(input, select, textarea) { transition: border-color var(--dur-micro) var(--ease-color), background-color var(--dur-micro) var(--ease-color); }
.form :is(input, select, textarea):focus { transition-duration: 0ms; } /* foco y borde azul al instante */

.slider-thumb, .priority-thumb {
  transition: transform var(--dur-micro) var(--ease-out), background-color var(--dur-micro) var(--ease-color);
}
@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
  .slider:hover .slider-thumb { transform: translate(-50%, -50%) scale(1.27); } /* 15 → 19 px sin tocar width */
}
.slider:has(input:active) .slider-thumb { transition-duration: 0ms; } /* color oscuro + halo 6 px (box-shadow) al instante */
```

- El `translate(-50%, -50%)` debe coincidir con el centrado que use el thumb en la fase 5; si el thumb se centra con `margin`, usar solo `scale(1.27)`.
- La posición del thumb y del relleno (`left`/`width` inline, `ui.tsx:123-124`) **no** se transiciona: es manipulación directa y debe ir pegada al dedo.
- Validación: sin sacudidas ni parpadeos. Borde de 2 px, icono y mensaje aparecen en 0 ms; el mensaje se anuncia por `aria-describedby`/`aria-live` (`05` §10 P17).

### 4.8 Barra indeterminada de carga (`05` §8.10)

```css
.card[aria-busy="true"] { position: relative; overflow: clip; }
.card[aria-busy="true"]::before {
  content: ""; position: absolute; inset: 0 auto auto 0; block-size: 2px; inline-size: 40%;
  background: var(--action); opacity: 0; pointer-events: none;
  animation:
    fs-fade-in var(--dur-micro) var(--ease-out) var(--delay-busy) forwards,
    fs-indeterminate var(--dur-indeterminate) ease-in-out var(--delay-busy) infinite;
}
@keyframes fs-fade-in { to { opacity: 1; } }
@keyframes fs-indeterminate { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
```

El retraso de 300 ms evita el destello en recargas rápidas (la mayoría de los `useRemote`).

---

## 5. Bottom sheet (`Q_SHEET`)

### 5.1 Decisión de técnica (desviación declarada respecto a `05` §5.2 y §11)

`05` especifica `transition: height 240ms`. Animar `height` reflowa la hoja, su contenido y `.map-ui` en cada frame (jank en móviles medios). Se sustituye por:

- **En reposo**: la hoja tiene `height: var(--sheet-h)` y `transform: none` (layout real: `.panel-body` hace scroll correcto y las barras sticky quedan visibles), exactamente como en `05`.
- **En movimiento** (arrastre o snap): una sola escritura de layout al empezar (`height` = alto de `expanded`), y a partir de ahí solo `transform: translateY(alto_caja − alto_visible)`. Al terminar, una sola escritura: `--sheet-h` = snap destino, `height` y `transform` vuelven a CSS.
- Animación con **WAAPI** (`element.animate`), nativa: corre en el compositor, se cancela leyendo la posición actual (interrumpible) y no necesita estado React por frame.

Dos layouts por gesto en lugar de uno por frame. Snaps, alturas, accesibilidad y strings de `05` §5 no cambian.

### 5.2 CSS (`app.css`, dentro de la consulta `Q_SHEET`)

```css
.panel {
  position: fixed; inset-inline: 0; bottom: var(--nav-space);
  height: var(--sheet-h); max-height: calc(var(--sheet-space) - 64px); /* max-height = alto de expanded, lo lee el JS */
  z-index: var(--z-sheet);
  transform: translateY(0);
}
.panel.is-moving { will-change: transform; }
.panel.is-moving .panel-body { pointer-events: none; } /* sin clics accidentales en contenido durante el gesto */
/* Extensión bajo la hoja: si el rubber-band la levanta por encima de la barra inferior, no se ve el mapa por debajo */
.panel::after { content: ""; position: absolute; inset-inline: 0; top: 100%; height: 64px; background: var(--surface); }
.sheet-handle, .panel-header { touch-action: none; user-select: none; }
.panel-body { overscroll-behavior: contain; }
```

El `.panel` no debe llevar `overflow: hidden` (cortaría el `::after`); el redondeo superior lo pinta el propio fondo.

### 5.3 Modelo de alturas

| Snap | Alto (px, leído en vivo) | Fuente |
|---|---|---|
| `peek` | `handle.offsetHeight + header.offsetHeight + (status?.offsetHeight ?? 0)` | 84 / 136 de `05` §5.1, medido para no desincronizar |
| `expanded` | `parseFloat(getComputedStyle(sheet).maxHeight)` | CSS resuelve `dvh` y `env()` a px |
| `half` | `min(expanded, max(240, round((expanded + 64) / 2)))` | 50 % de `--sheet-space`, mín. 240 |

`resize` de `window` (o `visualViewport`) en reposo: se recalcula y se reescribe `--sheet-h` del snap actual sin animación. Durante un gesto se ignora.

### 5.4 Controlador (nuevo `src/sheet.ts`, sin dependencias)

```ts
import { MOTION } from './layout';

export type Snap = 'peek' | 'half' | 'expanded';
const ORDER: Snap[] = ['peek', 'half', 'expanded'];
const FLICK = 0.5;        // px/ms, umbral de "gesto rápido" de 05 §5.2
const SLOP = 6;           // px antes de considerar que es arrastre y no toque
const RUBBER = 0.3;       // fricción fuera de [peek, expanded]
const RUBBER_MAX = 40;    // px máximos de sobre-desplazamiento
const DRAWER_SLOPE = 2.25; // pendiente inicial de cubic-bezier(.32,.72,0,1) = 0.72/0.32

type Follower = { el: HTMLElement; ratio: number };
export interface SheetOptions {
  sheet: HTMLElement;                 // <main class="panel">
  handle: HTMLElement;                // .sheet-handle
  header: HTMLElement;                // .panel-header
  status?: () => HTMLElement | null;  // .panel-status (solo /fields/new)
  followers: () => Follower[];        // toolbar/year-picker/atribución ratio 1, zoom ratio 0.5
  app: HTMLElement;                   // .app: recibe --sheet-h y --sheet-offset
  getSnap: () => Snap;
  onSettle: (snap: Snap) => void;     // React: data-snap, aria-expanded, aria-live
  onTarget: (heightPx: number, ms: number) => void; // FieldMap: easeTo padding (§5.6)
  reduced: () => boolean;
}

export function createSheet(o: SheetOptions) {
  let anims: Animation[] = [];
  let box = 0;          // alto fijado durante el movimiento
  let rest = 0;         // alto en reposo (= --sheet-offset)
  let pointerId: number | null = null;
  let startY = 0, startV = 0, dragging = false, raf = 0, nextV = 0;
  let samples: { t: number; y: number }[] = [];
  let suppressClick = false;

  const heights = (): Record<Snap, number> => {
    const expanded = parseFloat(getComputedStyle(o.sheet).maxHeight);
    const peek = o.handle.offsetHeight + o.header.offsetHeight + (o.status?.()?.offsetHeight ?? 0);
    const half = Math.min(expanded, Math.max(240, Math.round((expanded + 64) / 2)));
    return { peek, half, expanded };
  };

  // Alto visible actual, incluida una animación en curso (getComputedStyle refleja WAAPI).
  const visible = () => {
    const ty = new DOMMatrixReadOnly(getComputedStyle(o.sheet).transform).m42;
    return o.sheet.offsetHeight - ty;
  };

  const paint = (v: number) => {
    o.sheet.style.transform = `translateY(${box - v}px)`;
    for (const f of o.followers()) f.el.style.transform = `translateY(${(rest - v) * f.ratio}px)`;
  };

  // Congela la posición actual (interrupción) y fija la caja: 1 layout.
  const prepare = () => {
    const v = visible();
    anims.forEach((a) => a.cancel());
    anims = [];
    box = heights().expanded;
    o.sheet.style.height = `${box}px`;
    o.sheet.classList.add('is-moving');
    paint(v);
    return v;
  };

  const settle = (snap: Snap) => {
    const h = heights()[snap];
    rest = h;
    // Escritura síncrona en el DOM (no vía setState) para que no haya un frame con alto viejo y transform limpio.
    o.app.style.setProperty('--sheet-h', `${h}px`);
    o.app.style.setProperty('--sheet-offset', `${h}px`);
    o.sheet.style.height = '';
    o.sheet.style.transform = '';
    for (const f of o.followers()) f.el.style.transform = '';
    o.sheet.classList.remove('is-moving');
    o.onSettle(snap);
  };

  const rubber = (raw: number, H: Record<Snap, number>) => {
    if (raw > H.expanded) return H.expanded + Math.min(RUBBER_MAX, (raw - H.expanded) * RUBBER);
    if (raw < H.peek) return H.peek - Math.min(RUBBER_MAX, (H.peek - raw) * RUBBER);
    return raw;
  };

  function snapTo(snap: Snap, opts: { velocity?: number; source?: 'tap' | 'key' | 'auto' } = {}) {
    const from = prepare();
    const H = heights();
    const to = H[snap];
    const dist = Math.abs(to - from);
    let ms: number;
    if (o.reduced()) ms = 0;
    else if (opts.velocity && Math.abs(opts.velocity) > 0.1)
      // velocidad inicial de la curva ≈ velocidad del dedo al soltar
      ms = Math.min(MOTION.sheetMaxMs, Math.max(MOTION.sheetMinMs, (DRAWER_SLOPE * dist) / Math.abs(opts.velocity)));
    else ms = opts.source === 'key' ? MOTION.sheetKeyMs : MOTION.sheetMs;

    o.onTarget(to, ms);
    if (ms === 0 || dist < 1) return settle(snap);

    const opt: KeyframeAnimationOptions = { duration: ms, easing: MOTION.easeDrawer };
    const sheetAnim = o.sheet.animate(
      [{ transform: `translateY(${box - from}px)` }, { transform: `translateY(${box - to}px)` }], opt);
    anims = [sheetAnim, ...o.followers().map((f) => f.el.animate(
      [{ transform: `translateY(${(rest - from) * f.ratio}px)` }, { transform: `translateY(${(rest - to) * f.ratio}px)` }], opt))];
    paint(to); // el estilo base ya es el final: sin fill: 'forwards'
    sheetAnim.finished.then(() => settle(snap), () => { /* cancelada por interrupción */ });
  }

  // ---- Arrastre (solo asa + header, 05 §5.2) ----
  function onDown(e: PointerEvent) {
    if (!e.isPrimary || e.button !== 0 || pointerId !== null) return; // ignora segundo dedo
    pointerId = e.pointerId; startY = e.clientY; samples = [{ t: e.timeStamp, y: e.clientY }];
    e.stopPropagation(); // un arrastre de la hoja nunca crea un vértice (05 §5.5)
    if (anims.length) { startV = prepare(); dragging = true; (e.currentTarget as Element).setPointerCapture(e.pointerId); }
    else { dragging = false; }
  }
  function onMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    if (!dragging) {
      if (Math.abs(e.clientY - startY) < SLOP) return;
      startV = prepare(); startY = e.clientY; dragging = true;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }
    samples.push({ t: e.timeStamp, y: e.clientY });
    while (samples.length > 2 && e.timeStamp - samples[0].t > 100) samples.shift();
    nextV = rubber(startV + (startY - e.clientY), heights());
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(nextV); });
  }
  function onUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (!dragging) return; // fue un toque: lo resuelve el onClick del asa/título
    dragging = false; suppressClick = true;
    cancelAnimationFrame(raf); raf = 0;
    const H = heights();
    const v = visible();
    const a = samples[0], b = samples[samples.length - 1];
    const vel = e.type === 'pointercancel' ? 0 : (a.y - b.y) / Math.max(1, b.t - a.t); // px/ms, + = hacia arriba
    let target: Snap;
    if (Math.abs(vel) > FLICK) {
      const up = vel > 0;
      target = (up ? ORDER.find((s) => H[s] > v + 1) : [...ORDER].reverse().find((s) => H[s] < v - 1))
        ?? (up ? 'expanded' : 'peek');
    } else {
      target = ORDER.reduce((best, s) => (Math.abs(H[s] - v) < Math.abs(H[best] - v) ? s : best), 'peek');
    }
    snapTo(target, { velocity: vel });
  }
  const onClickCapture = (e: MouseEvent) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } };

  const zones = [o.handle, o.header];
  for (const z of zones) {
    z.addEventListener('pointerdown', onDown);
    z.addEventListener('pointermove', onMove);
    z.addEventListener('pointerup', onUp);
    z.addEventListener('pointercancel', onUp);
    z.addEventListener('click', onClickCapture, true);
  }
  const onResize = () => { if (pointerId === null && !anims.length) settle(o.getSnap()); };
  window.addEventListener('resize', onResize);

  // Montaje: colocar sin animar (la hoja remonta en cada ruta, ver §5.5)
  settle(o.getSnap());

  return {
    snapTo,
    destroy() {
      anims.forEach((a) => a.cancel());
      for (const z of zones) {
        z.removeEventListener('pointerdown', onDown); z.removeEventListener('pointermove', onMove);
        z.removeEventListener('pointerup', onUp); z.removeEventListener('pointercancel', onUp);
        z.removeEventListener('click', onClickCapture, true);
      }
      window.removeEventListener('resize', onResize);
    },
  };
}
```

Propiedades garantizadas:

| Requisito | Cómo |
|---|---|
| Sigue al dedo | `pointermove` → rAF → `transform` directo en el elemento (no custom property heredable, que recalcularía estilos de todos los hijos) |
| Interrupción | `pointerdown` durante un snap: `prepare()` lee la posición actual de la animación, la cancela y el dedo continúa desde ahí sin salto; un nuevo `snapTo` durante otro hace lo mismo |
| Sin jank | por frame solo `transform`; layout solo al empezar y al terminar |
| Velocidad | ventana de 100 ms; un gesto rápido (> 0.5 px/ms) va al snap siguiente desde la posición actual; la duración se ajusta para que la hoja arranque a la velocidad del dedo (160–300 ms) |
| Bordes | rubber-band 0.3 con tope de 40 px por encima de `expanded` y por debajo de `peek` |
| Multitoque | se ignoran punteros no primarios y un segundo dedo mientras hay uno activo |
| Toque ≠ arrastre | umbral de 6 px; tras un arrastre se suprime el `click` del asa/título |

### 5.5 Integración con React (`ui.tsx` Panel, `AppContext.tsx`)

- `Panel` remonta en cada ruta (cada página renderiza su propio `<Panel>` dentro de `<Routes>`, `main.tsx:22-33`). Por eso el **snap vive en el contexto** y `--sheet-h` en `.app` (persistente): la hoja nueva nace ya a la altura correcta, sin animación de entrada.
- `useLayoutEffect` en `Panel` (solo si `useMatchMedia(Q_SHEET)` y no `wide`): `createSheet({...})` y `destroy` al desmontar. Si la ruta exige otro snap (`05` §5.3: `peek` → `half`, o `/fields/new` → `peek`), llamar `snapTo(target, { source: 'auto' })` **después** del montaje: la animación explica que el panel cambió de altura.
- Disparadores de `snapTo` (todos de `05` §5.2):

| Disparador | `source` | Duración |
|---|---|---|
| Clic/tap en asa o título | `tap` | 240 ms |
| Enter/Espacio/↑/↓ en el asa, Esc en `expanded` | `key` | 160 ms |
| `focusin` en `.panel-body` estando en `peek` | `auto` | 240 ms |
| Tocar el mapa visible en `expanded` | `tap` | 240 ms |
| `requestMapView()` (selección con efecto en el mapa) | `auto` | 240 ms |
| "Field details" (`/fields/new`) | `tap` | 240 ms; el foco al primer input se mueve **al terminar** (`onSettle`), no antes, para que el navegador no haga scroll a mitad de animación |
| Soltar arrastre | — | 160–300 ms por velocidad |

- `onSettle` actualiza en React `data-snap`, `aria-expanded`/`aria-label` del asa y la región `aria-live` ("Panel expanded"...). Ninguno de esos atributos debe afectar a la geometría (la geometría solo la da `--sheet-h`).

### 5.6 Mapa sincronizado con la hoja (`FieldMap.tsx`)

`05` §5.4 pide `map.setPadding` tras cada snap. `setPadding` sin animación hace saltar el centro del mapa al final del snap. En su lugar, `onTarget(h, ms)` (al **empezar** el snap):

```ts
// FieldMap.tsx — paddingRef lo comparten este callback y el efecto de flyTo
const paddingRef = useRef<maplibregl.PaddingOptions>({ top: 0, right: 0, bottom: 0, left: 0 });
const onSheetTarget = (sheetH: number, ms: number) => {
  const map = mapRef.current;
  paddingRef.current = { ...paddingRef.current, bottom: sheetH, top: topOverlayH() };
  if (!map) return;
  if (ms === 0) map.jumpTo({ padding: paddingRef.current });
  else map.easeTo({ padding: paddingRef.current, duration: ms, easing: drawerEase });
};
// aproximación JS de cubic-bezier(.32,.72,0,1) suficiente para la cámara
const drawerEase = (t: number) => 1 - Math.pow(1 - t, 3.2);
```

Durante el arrastre la cámara no se toca (evita trabajo WebGL por frame); se ajusta al soltar, en paralelo con el snap. Si `flyTo` (§7.1) arranca mientras corre este `easeTo`, lo interrumpe, y por eso `flyTo` también recibe `padding: paddingRef.current`.

Seguidores de la hoja (§5.4 `followers`), en `FieldMap.tsx`:

| Elemento | `ratio` | Por qué |
|---|---|---|
| `.toolbar` / `.year-picker` (área `bar`) | 1 | anclados al borde inferior de `.map-ui`, que sube y baja con la hoja |
| `.maplibregl-ctrl-bottom-right` | 1 | `bottom: var(--sheet-offset)` (`05` §4.8) |
| `.zoom` (área `side`, centrado) | 0.5 | el centro de un área cuyo borde inferior se mueve Δ se mueve Δ/2: posición exacta, sin salto al asentar |
| `tl`, `tr`, `info` | — | anclados arriba; no se mueven |

---

## 6. Navegación

### 6.1 Barra inferior (`ui.tsx` Sidebar variante `bottom`, `.bottom-nav`)

- Tap: la píldora `.pill` cambia de fondo/color en 0 ms al pulsar (§4.1) y escala a .96 en 60 ms; al soltar 120 ms.
- Ítem activo (`aria-current="page"`): fondo de píldora y peso 700. Sin píldora que se expanda o deslice entre ítems: se toca decenas de veces; el estado debe estar ya ahí cuando el dedo se levanta.
- La navegación no anima el panel (§6.4); la hoja mantiene su altura (o anima `peek` → `half` por §5.5).

### 6.2 Popover More (`#nav-more`, `popover="auto"`)

```css
#nav-more {
  position: fixed; margin: 0;
  inset: auto max(8px, env(safe-area-inset-right)) calc(var(--nav-space) + 8px) auto;
  transform-origin: bottom right; /* sale del botón More (última ranura, abajo a la derecha) */
  opacity: 1; transform: none;
  transition:
    opacity var(--dur-pop) var(--ease-out),
    transform var(--dur-pop) var(--ease-out),
    overlay var(--dur-pop) allow-discrete,
    display var(--dur-pop) allow-discrete;
}
@starting-style {
  #nav-more:popover-open { opacity: 0; transform: translateY(6px) scale(0.98); }
}
#nav-more:not(:popover-open) {
  opacity: 0; transform: translateY(4px);
  transition-duration: var(--dur-pop-exit);
}
```

- Navegadores sin `@starting-style`/`allow-discrete` (Safari < 17.5/18, Firefox < 129): aparece y desaparece al instante; funcional.
- Esc y clic fuera: cierre nativo con la misma salida de 120 ms; el foco vuelve a More (`05` §3.3) en el acto, sin esperar la animación.
- Al tocar un enlace de More: `hidePopover()` en el mismo handler de clic; la salida (120 ms) se solapa con el cambio de ruta, no lo retrasa.
- Filas `.more-menu a`: `list-item` → color + `translateY(1px)` (§4.2).
- Sin escalonado de filas: son 5 enlaces en un menú que se abre a menudo.

### 6.3 Sidebar y rail (escritorio/tableta)

- `.nav-item`, `.nav-home`, `.nav-user`: solo color 120 ms (hover fino), 0 ms al pulsar. La barra lateral de 3 px del activo aparece en 0 ms.
- Tooltip del rail en `Q_XSHORT` (`05` §3.2):

```css
.nav-item::after { opacity: 0; transition: opacity var(--dur-micro) var(--ease-color) 0ms; pointer-events: none; }
@media (hover: hover) and (pointer: fine) {
  .nav-item:hover::after { opacity: 1; transition-delay: var(--delay-tooltip); }
}
.nav-item:focus-visible::after { opacity: 1; transition-delay: 0ms; }
```

Salida sin retraso (el `0ms` de la regla base aplica al quitar el hover).

### 6.4 Transiciones entre rutas del panel: **no**

Se evaluaron y se descartan:

| Opción | Motivo del descarte |
|---|---|
| View Transitions API (`document.startViewTransition`) | captura el lienzo WebGL del mapa como imagen durante la transición (el mapa "se congela"), añade una capa por navegación y la navegación es la acción más repetida de la app |
| Fundido/desplazamiento del contenido del panel | decenas de veces por sesión; el usuario ya ve el cambio de título del header y el estado activo del nav; añadiría ≥ 120 ms de espera percibida |
| Escalonado de tarjetas al entrar | decorativo; las Cards de cada vista no "llegan", ya estaban |

Lo que sí ocurre al cambiar de ruta: el scroll de `.panel-body` empieza arriba (remonta) y, en modo hoja, el snap `peek` → `half` anima (§5.5) porque explica que aparece contenido.

### 6.5 Apertura del panel en escritorio (solo si se aprueba "Hide panel", `05` §2.2)

- **No** se anima `grid-template-columns` ni el ancho del panel: provocaría `map.resize()` en cada frame (el `ResizeObserver` de `FieldMap.tsx:105-106` lo dispara) y reflujo del contenido.
- Abrir: la columna cambia al instante (un único `resize` del mapa) y el contenido entra con:

```css
.app[data-panel="open"] .panel { transition: opacity var(--dur-panel) var(--ease-drawer), transform var(--dur-panel) var(--ease-drawer); }
@starting-style { .app[data-panel="open"] .panel { opacity: 0; transform: translateX(-8px); } }
```

- Cerrar: JS mínimo antes de colapsar la columna.

```ts
async function closePanel(panel: HTMLElement, app: HTMLElement, reduced: boolean) {
  if (!reduced) await panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'cubic-bezier(0.23,1,0.32,1)' }).finished;
  app.dataset.panel = 'closed'; // la columna pasa a 0: un único resize del mapa
}
```

---

## 7. Mapa (`src/map/FieldMap.tsx`, `src/components/GlobalLayer.tsx`)

### 7.1 `flyTo` → `jumpTo` con movimiento reducido (`FieldMap.tsx:159-165`)

```ts
import { MOTION, Q_REDUCED_MOTION } from '../layout';
// …
const reduced = useMatchMedia(Q_REDUCED_MOTION);   // hook de 05 §2.1
const reducedRef = useRef(reduced);
reducedRef.current = reduced;

useEffect(() => {
  const map = mapRef.current;
  if (!ready || !map || !currentField) return;
  const camera = { center: currentField.center, zoom: currentField.zoom, padding: paddingRef.current };
  if (reducedRef.current) map.jumpTo(camera);
  else map.flyTo({ ...camera, duration: MOTION.flyMs });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [ready, currentId]);
```

- Mismo centro, mismo zoom, misma dependencia (`currentId`): no cambia cuándo se mueve la cámara, solo cómo.
- No se confía en el recorte automático de maplibre 4.7 para animaciones no `essential` (`05` §11): se decide explícitamente.
- `padding` incluido para que la parcela quede centrada en la parte visible sobre la hoja (§5.6).

### 7.2 Zoom +/− (`FieldMap.tsx:221-222`)

Mismo handler, con opción: `onClick={() => map?.zoomIn({ animate: !reducedRef.current })}` (ídem `zoomOut`). Sin cambiar a qué llama el botón.

### 7.3 Overlays

| Overlay | Movimiento |
|---|---|
| `.global-panel` (`GlobalLayer.tsx:126`) al activar Global mode | entrada `@starting-style { opacity: 0; transform: translateY(-4px) }`, 160 ms `--ease-out`; al desactivar se desmonta sin salida (React lo quita; aceptable para un panel informativo) |
| `.map-note` desplegable en hoja (`05` §4.5) | igual que `.global-panel`, sobre `.map-note-body` cuando `aria-expanded="true"` |
| `.legend` al cambiar de capa | ninguno: el cambio de rampa es dato, no transición |
| Raster de capa (`heat`, `global-img`) | ya `raster-fade-duration: 0` (`FieldMap.tsx:144`, `GlobalLayer.tsx:105`); se mantiene |
| Basemap y símbolos | fundido nativo de teselas de maplibre (opacidad, ~300 ms); se mantiene: evita el destello de teselas vacías |
| `.pin` (`app.css:205`) | ya usa `transform` + `will-change` en `move`; se mantiene |
| `.toolbar` con overflow (320 px) | al activar una capa fuera de vista: `scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })` |

```css
.global-panel, .map-note-body {
  transition: opacity var(--dur-pop) var(--ease-out), transform var(--dur-pop) var(--ease-out);
}
@starting-style { .global-panel, .map-note[aria-expanded="true"] + .map-note-body { opacity: 0; transform: translateY(-4px); } }
```

(El selector de la nota se ajusta al marcado final del disclosure de la fase 3.)

---

## 8. Carga inicial y scroll

### 8.1 Carga inicial: sin secuencia de entrada

No hay hero ni onboarding. Una secuencia escalonada (sidebar, panel, overlays) retrasaría la primera interacción en una herramienta que se abre para consultar algo concreto, y el mapa (WebGL) ya tarda en pintar teselas. Lo único visible "en movimiento" es el fundido nativo de teselas de maplibre. La primera carga de datos usa el texto "Loading…" existente (`05` §8.10).

### 8.2 Scroll

- Sin revelado al hacer scroll ni parallax en `.panel-body`: son tarjetas de trabajo que el usuario recorre arriba y abajo; reaparecer con animación en cada pasada sería ruido.
- Sin indicador de progreso de scroll (paneles cortos).
- `scrollIntoView` programático de `requestMapView` (`05` §5.2): `behavior: reduced ? 'auto' : 'smooth'`, `block: 'nearest'`.
- `scroll-behavior` global: no se fija (evita que anclas y el skip link "Skip to panel" se desplacen con suavidad: el foco debe llegar al instante).

---

## 9. `prefers-reduced-motion` (bloque único al final de `app.css`)

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-sheet: 0ms;       /* referencia CSS; el JS usa reduced() */
    --dur-sheet-key: 0ms;
    --dur-spin: 1600ms;     /* el spinner sigue girando más lento: indica actividad */
  }
  /* Los hundimientos ya no existen (§4.2 está en no-preference). */
  .switch::after, .why summary .chev { transition-duration: 0ms; }
  .bottom-nav .pill { transition-property: background-color, color; }

  #nav-more, #nav-more:not(:popover-open) { transform: none; transition-duration: var(--dur-micro); }
  @starting-style { #nav-more:popover-open { opacity: 0; transform: none; } }

  .global-panel, .map-note-body { transform: none; }
  @starting-style { .global-panel, .map-note[aria-expanded="true"] + .map-note-body { opacity: 0; transform: none; } }

  .app[data-panel="open"] .panel { transform: none; }
  @starting-style { .app[data-panel="open"] .panel { opacity: 0; transform: none; } }

  .card[aria-busy="true"]::before {
    inline-size: 100%; transform: none; opacity: 0.6;
    animation: fs-fade-in-dim var(--dur-micro) var(--ease-out) var(--delay-busy) both; /* sin ciclo */
  }
}
@keyframes fs-fade-in-dim { from { opacity: 0; } to { opacity: 0.6; } }
```

| Pieza | Normal | Reducido | Dónde |
|---|---|---|---|
| Colores de estado | 120 ms / 0 ms al pulsar | igual | CSS |
| Hundimiento `:active` | 60 ms | ninguno (solo color, Δ ≥ 1.3:1 de `02` §5) | CSS §4.2 |
| Snap de la hoja | 160–300 ms | 0 ms; el arrastre sigue al dedo | `src/sheet.ts` (`reduced()`) |
| Seguidores y padding del mapa | con la hoja | 0 ms / `jumpTo({ padding })` | `sheet.ts`, `FieldMap.tsx` |
| Popover More | opacidad + 6 px + escala .98 | solo opacidad 120 ms | CSS |
| Global panel / nota | opacidad + 4 px | solo opacidad | CSS |
| Switch, chevron | 120 ms | 0 ms | CSS |
| Spinner | 700 ms/vuelta | 1600 ms/vuelta | CSS |
| Barra indeterminada | deslizamiento 1.2 s | barra fija .6 | CSS |
| `flyTo` 800 ms | sí | `jumpTo` | `FieldMap.tsx` §7.1 |
| Zoom +/− | animado | `animate: false` | `FieldMap.tsx` §7.2 |
| `scrollIntoView` | `smooth` | `auto` | `ui.tsx`/contexto, `FieldMap.tsx` |
| Recharts | `isAnimationActive={false}` recomendado siempre | `false` | `Other.tsx`, `DataHub.tsx` |
| Panel escritorio (opcional) | opacidad + 8 px | solo opacidad | CSS + `closePanel` |

No se usa `* { animation: none !important }` (rompería el spinner y la información de carga). Ningún elemento parpadea ni destella (nada por encima de 3 cambios por segundo; el spinner rota, no parpadea).

`reduced()` en `sheet.ts`: `() => matchMedia(Q_REDUCED_MOTION).matches` (se evalúa en cada snap, así respeta cambios en vivo de la preferencia).

---

## 10. Desviaciones respecto a `05-diseno.md` (para que el implementador no dude)

| `05` dice | `06` especifica | Motivo |
|---|---|---|
| §5.2/§11: `transition: height 240ms cubic-bezier(.2,.8,.2,1)` | `transform` con WAAPI; `height` solo al empezar/terminar; curva `cubic-bezier(.32,.72,0,1)`; 240 ms tap, 160 ms teclado, 160–300 ms tras arrastre | animar `height` reflowa cada frame; la curva de cajón arranca con más velocidad y casa con el gesto |
| §8.0: transición de `box-shadow` 120 ms y `transform` 80 ms | `box-shadow` sin transición; `transform` 60 ms al pulsar / 120 ms al soltar; colores 0 ms al pulsar | foco y pressed deben ser instantáneos (encargo: "sin retraso al presionar", "focus-visible sin animación lenta") |
| §5.4: `map.setPadding` tras cada snap | `easeTo({ padding })` al empezar el snap, misma duración; `jumpTo` reducido; `flyTo` recibe `padding` | `setPadding` desplaza el centro de golpe al final |
| §11: popover 120 ms opacity + translateY(4px) | entrada 160 ms (opacidad + 6 px + escala .98, origen abajo-derecha); salida 120 ms | entrada ligeramente más larga que la salida; origen en el botón More |
| §8.9: thumb hover 15 → 19 px | `scale(1.27)`, no `width/height` | solo `transform` |
| §8.5: `.switch` `left` → `transform` | igual (confirmado) | — |

Ningún cambio toca rutas, textos, colores de datos, handlers ni mutaciones (`preservacion.json`).

---

## 11. Verificación

- [ ] Chrome DevTools > Performance, móvil 4× CPU: arrastrar la hoja `peek` → `expanded` → soltar. Sin "Layout" ni "Recalculate Style" en los frames del arrastre (solo al empezar y al asentar); ≥ 55 fps.
- [ ] Panel Animations a 10 %: la hoja arranca a la velocidad del dedo al soltar; ningún salto al asentar (ni la hoja, ni `.toolbar`, ni `.zoom`, ni el centro del mapa).
- [ ] Tocar la hoja a mitad de un snap: se detiene bajo el dedo y continúa desde ahí.
- [ ] Rubber-band: arrastrar por encima de `expanded` no deja ver el mapa entre la hoja y la barra inferior.
- [ ] Un toque corto en el asa alterna snap; un arrastre no dispara además el clic; un arrastre de la hoja en `/fields/new` no añade vértices.
- [ ] Mantener pulsado cualquier control de §8: el color cambia en el primer frame (grabación a 60 fps: frame 1 ya con color pressed).
- [ ] Tab por la app: el anillo de foco aparece completo en el primer frame.
- [ ] Táctil (Android Chrome, iOS Safari): sin flash gris de tap; pressed visible; ningún hover pegado.
- [ ] `Btn` en loading: ancho idéntico antes/durante; spinner gira; segundo toque sin hundimiento.
- [ ] More: abre desde abajo-derecha, Esc cierra y el foco vuelve a More al instante.
- [ ] Emulación `prefers-reduced-motion: reduce` (DevTools > Rendering): ningún `transform` en `:active`, hoja salta, More solo funde, `jumpTo` al cambiar de parcela, zoom sin animación, spinner lento, barra de carga fija.
- [ ] `grep -n "transition: all\|transition:.*height\|transition:.*width\|filter: brightness" src/styles/app.css` → 0 resultados.
- [ ] Pasar `review-animations` sobre el diff de la fase 8.
