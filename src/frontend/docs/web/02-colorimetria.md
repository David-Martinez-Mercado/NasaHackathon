# 02 · Colorimetría: FieldShift (modo PRESERVACIÓN)

Fuente: `src/styles/app.css` (354 líneas), colores en TSX, `00-decisiones.md` (WCAG 2.2 AA prioritario, ajustes mínimos sobre el Figma 1280×800) y `preservacion.json`. Fecha: 2026-11-15.
Todos los ratios están **calculados con script** (fórmula WCAG 2.x de luminancia relativa; los colores con alfa se componen sobre su fondo real antes de medir). Scripts en `C:\Users\joelm\AppData\Local\Temp\claude\ced2d15c5b4bdf07\a7ebf7ca-5e70-4700-95a0-8743c8a77aa2\scratchpad\` (`c.mjs`, `t1.mjs`, `t2.mjs`, `t3.mjs`).

Criterio: **no se cambia la marca**. Los verdes `#23654E` / `#1E6433` / `#098300`, el ámbar `#B86200`, el azul `#003488`, el gris `#ECF0F3` y las tarjetas blancas se mantienen. Solo se oscurecen textos secundarios, se añaden tokens de borde de control, foco y estados, y se separa "color de texto" de "color de decoración" donde hoy un mismo hex hace las dos cosas y no llega a AA.

---

## 1. Paleta final

### 1.1 Marca y acción (se conservan)

| Token | Hex | Rol | Estado |
|---|---|---|---|
| `--color-marca` (`--brand`) | `#23654E` | Título "HOME", marca tipográfica | Se conserva (6.90:1 sobre blanco) |
| `--color-marca-fuerte` (`--brand-strong`) | `#1E6433` | Nav activo, enlaces, `.why`, borde `.risk` seleccionado | Se conserva (7.18:1) |
| `--color-accion` (`--action`) | `#098300` | Botón Save, chip seleccionado, barras de prioridad | Se conserva (blanco encima 4.93:1) |
| `--color-acento` (`--accent`) | `#B86200` | Bordes/iconos ámbar (alerta seleccionada, badge) | Se conserva **solo como decoración** (4.39:1, pasa 3:1 de UI) |
| `--color-acento-texto` (nuevo) | `#9A5200` | Texto ámbar (`.alert b`) | Nuevo: 5.86 blanco / 4.97 sobre alerta seleccionada |
| `--color-foco` (`--thumb`) | `#003488` | Thumb de sliders, anillo de foco, `.stat b` | Se conserva |

### 1.2 Superficies y neutrales (temperatura fría, la del Figma)

| Token | Hex | Rol |
|---|---|---|
| `--bg` | `#ECF0F3` | Fondo del panel / app |
| `--surface` | `#FFFFFF` | Tarjetas, sidebar, header |
| `--surface-sunken` | `#E3E8EC` | `.note-box`, `.tip` |
| `--surface-muted` | `#F7F9FB` | `.suggest-current`, hover de items |
| `--text` | `#000000` | Texto principal |
| `--text-soft` | `#474B4E` | Texto secundario fuerte |
| `--text-muted` | `#5F6368` (antes `rgba(0,0,0,.5)`) | Texto terciario, labels, nav |
| `--ink` | `#1E1E1E` | Iconos de la toolbar del mapa |
| `--border` | `rgba(0,0,0,.1)` | Borde **decorativo** de tarjetas (se conserva) |
| `--border-control` (nuevo) | `#80878F` | Borde de controles: inputs, chips (3:1) |

### 1.3 Estados semánticos (ya existen en el código; se formalizan)

| Rol | Texto | Fondo | Ratio |
|---|---|---|---|
| Éxito / bajo | `#1E6433` | `#DFF3DC` | 6.15 |
| Aviso / medio | `#8A4B00` | `#FBE9C8` | 5.70 |
| Error / alto | `#9B1C12` | `#FBDCD8` | 6.36 |
| Error (notice) | `#8A1C10` | `#FBE4E1` | 7.67 |
| Neutro / sin dato | `#5A6068` | `#E6E9EE` | 5.22 |
| Info / dato | `#003488` | `#E5E9EC` (`.stat`) | 9.31 |
| Borde de error de input (nuevo) | `#B3261E` | `#FFFFFF` | 6.54 |

### 1.4 Colores de datos: INTOCABLES (preservacion.json)

No se modifican ni se convierten en tokens de UI. Se listan para que nadie los "corrija":

- Rampas de capas globales `GlobalLayer.tsx:16-18`: `#2E86DE #F7DC6F #E74C3C` / `#C0392B #F4D03F #2471A3` / `#BFE3FF #4DB3F0 #1B4FD0 #0B2A8A` (y `data/index.ts:302`).
- Parcela `#E8A531` 60 % con borde blanco punteado, `#474B4E` (`FieldMap.tsx:98-102`); fondo del mapa `#2C4227` (`FieldMap.tsx:89`, `app.css:179`).
- Gradientes de slider: `--scale` (`#FF0202 → #FFFC5F → #00C4FF`), `.slider-rain`, `.slider-heat` (`app.css:21, 269-270`).
- Series: `#4464E8` (precios, DataHub), `#34B3F1` y `#292D30` (Statistics), ticks `#697386`, `#474B4E`, rejilla `#C9CBCD`, `#E6E9EE`.
- Niveles `low/medium/high/none` (`app.css:274-277`), `factor-good/fair/poor/none`, `score-*`, `source-*` (todos pasan AA, ver §4).
- Indicadores: `.alert-bar` (`#FF0202 → #FFAE00`), `.alert-trend` `#FFAE00`, icono Home `#FF5A00`, `.moisture-bar` (`#003488 → #00E5D0`), `.legend-item svg` `#34B3F1`, pines (`#1B6FB8`, `#FF5A00`, `#B3261E`, `#8A3B0B`, `#2D5A8C`, `#E07B45`, `#E8A07A`).

Nota: `#4464E8` hoy es también el foco de `.btn` (`app.css:241`). El foco pasa al token unificado; el color de serie se queda.

---

## 2. Escalas de 9 pasos (+50)

Generadas por mezcla sRGB con blanco/negro, ancladas en los hex reales del Figma. Ratios contra blanco / contra `#ECF0F3`.

### Marca `#23654E` (ancla en 700)

| Paso | Hex | vs blanco | vs bg | Uso |
|---|---|---|---|---|
| 50 | `#F4F7F6` | 1.08 | 1.06 | fondo sutil |
| 100 | `#E5EDEA` | 1.19 | 1.04 | hover de superficies de marca |
| 200 | `#C6D7D1` | 1.50 | 1.30 | bordes suaves (decorativo) |
| 300 | `#9EBBB1` | 2.06 | 1.80 | decorativo |
| 400 | `#77A091` | 2.91 | 2.54 | decorativo (no UI) |
| 500 | `#4F8471` | 4.31 | 3.76 | iconos / bordes UI (3:1) y texto grande |
| 600 | `#35715C` | 5.73 | 5.00 | texto normal mínimo de la escala |
| **700** | **`#23654E`** | 6.90 | 6.02 | **marca** |
| 800 | `#1B4F3D` | 9.41 | 8.21 | pressed sobre marca |
| 900 | `#13382B` | 12.90 | 11.25 | texto sobre tintes de marca |

### Neutral frío (anclada en los grises que ya usa el CSS)

| Paso | Hex | vs blanco | vs bg | Origen / uso |
|---|---|---|---|---|
| 50 | `#F7F9FB` | 1.06 | 1.09 | `.suggest-current`; hover de items |
| 100 | `#ECF0F3` | 1.15 | 1.00 | `--bg` |
| 200 | `#E3E8EC` | 1.23 | 1.08 | `.note-box`; hover ghost |
| 300 | `#D5D9DE` | 1.42 | 1.24 | fondo disabled |
| 400 | `#B8BEC6` | 1.87 | 1.63 | `factor-none`; bordes decorativos |
| 500 | `#80878F` | 3.63 | 3.17 | **nuevo** `--border-control` (3:1 en ambos fondos) |
| 600 | `#5F6368` | 6.05 | 5.28 | **nuevo** `--text-muted` |
| 700 | `#474B4E` | 8.81 | 7.69 | `--text-soft` |
| 800 | `#292D30` | 13.89 | 12.12 | botón primary |
| 900 | `#1E1E1E` | 16.67 | 14.55 | `--ink` |

---

## 3. Proporciones de uso (60-30-10)

El Figma ya respeta la regla; no se cambia, solo se documenta.

| Zona | 60 % neutral | 30 % secundario | 10 % acento |
|---|---|---|---|
| Sidebar | `--surface` blanco | texto `--text-muted`, iconos | `--brand-strong` solo en el ítem activo |
| Panel | `--bg` `#ECF0F3` + tarjetas blancas | texto negro / `--text-soft` | `--action` en el CTA principal y selecciones; ámbar solo en alertas |
| Mapa | imagen satelital (la imagen es el 60 %) | vidrio oscuro `--glass-scrim` para overlays con texto | blanco seleccionado + barra de marca en toolbar; verde acción en Global mode activo |
| Statistics | `--bg` + tarjeta | gris de pestañas `#C9C9C9` | celeste `#5CC0F7` en pestaña activa y serie `#34B3F1` |

Regla: el verde `--action` significa "acción / seleccionado"; no se usa para decorar. El ámbar significa "aviso"; nunca en botones.

---

## 4. Tabla de contraste (combinaciones reales)

Leyenda: T = texto normal (4.5:1), TG = texto grande ≥24 px o ≥18.66 px bold (3:1), UI = componente / estado / icono (3:1). "Peor caso" en el mapa = la imagen satelital detrás es blanca (nieve, nubes, campo seco).

### 4.1 Fallos actuales y corrección (antes → después)

| # | Elemento (archivo:línea) | Antes | Ratio antes | Después | Ratio después | Req. |
|---|---|---|---|---|---|---|
| 1 | `--text-muted` sobre blanco (`app.css:6`) | `rgba(0,0,0,.5)` = `#808080` | **3.95** | `#5F6368` | 6.05 | T |
| 2 | `--text-muted` sobre `--bg` | `#76787A` | **3.87** | `#5F6368` | 5.28 | T |
| 3 | `--text-muted` sobre `.note-box` / `.stat` (`#E3E8EC` / `#E5E9EC`) | | **3.80 / 3.79** | `#5F6368` | 4.90 / 4.95 | T |
| 4 | `.alert > span` sobre alerta seleccionada `#FAEDAE` | | **3.83** | `#5F6368` | 5.12 | T |
| 5 | `--text-muted` sobre `.suggest-current` `#F7F9FB` | | **3.91** | `#5F6368` | 5.73 | T |
| 6 | Icono nav `.nav-item svg` (`app.css:42`) | `rgba(88,100,94,.5)` = `#ACB2AF` | **2.16** | `currentColor` = `#5F6368` | 6.05 | UI |
| 7 | Pestaña Statistics no seleccionada (`app.css:170`) | `#6F6F6F` / `#C9C9C9` | 3.03 (16 px, no es TG) | texto `#333333` | 7.63 | T |
| 8 | Pestaña Statistics seleccionada (`app.css:171`) | `#FFFFFF` / `#5CC0F7` | **2.03** | texto `#062B40` sobre el mismo `#5CC0F7` | 7.24 | T |
| 9 | Seleccionada vs no seleccionada (solo color de fondo) | `#5CC0F7` vs `#C9C9C9` | **1.23** | + barra inferior 3 px `#0A5A86` + `font-weight:600` | barra 3.67 vs pestaña, 7.45 vs tarjeta | UI |
| 10 | `.badge-warn` (`app.css:119`) | `#B86200` / `#FFAE00` | **2.36** | texto `#5C2F00` (borde `#B86200` se queda) | 6.07 | T |
| 11 | `.alert b` (`app.css:105`) sobre `#FBFDFB` | `#B86200` | **4.29** | `--accent-text` `#9A5200` | 5.74 | T |
| 12 | `.alert b` en alerta seleccionada `#FAEDAE` | `#B86200` | **3.72** | `#9A5200` | 4.97 | T |
| 13 | `.series-legend` (`app.css:174`, 14 px) | `#8D9092` | **3.21** | `#5F6368` | 6.05 | T |
| 14 | `.nav-user` (fuera de alcance, solo se reporta) | `rgba(30,30,30,.5)` / `#FFFAFA` | **3.22** | `#5F6368` si se toca | 5.9 aprox. | UI |
| 15 | Borde de `.chip` (`app.css:153`) | `#D9D9D9` | **1.41** | `--border-control` `#80878F` | 3.63 | UI |
| 16 | Borde de inputs `.form` (`app.css:149`) sobre `#FCFCFD` | `#E6E9EE` | **1.19** | `#80878F` | 3.54 | UI |
| 17 | Borde `.box` / textarea (`app.css:70`) | `rgba(0,0,0,.1)` = `#E6E6E6` | **1.25** | `#80878F` | 3.63 | UI |
| 18 | Chip seleccionado en modo lectura (`app.css:249`) | blanco / `#5F9A5A` | **3.36** | blanco / `#3F7A3B` | 5.17 | T (transmite el valor guardado) |
| 19 | Foco global `#003488` sobre el mapa `#2C4227` (`app.css:31`) | | **1.04** | anillo doble: 2 px blanco interior + 2 px `#003488` exterior | peor caso ante **cualquier** fondo 3.38 | UI |
| 20 | Foco de `.btn` (`app.css:241`), tercer color distinto | `#4464E8` | 4.96 | unificado al anillo doble | 11.37 blanco / 9.92 bg | UI |
| 21 | Texto blanco en vidrio claro `.glass` (`app.css:182`) sobre imagen clara | blanco / `rgba(217,217,217,.25)` | **1.08** peor caso | blanco / `--glass-scrim rgba(20,28,24,.62)` (el valor que ya usa `.global-panel`) | 4.89 peor caso | T |
| 22 | `.year-picker` (`app.css:199`, 24 px bold) | blanco / `rgba(39,54,10,.25)` | **1.62** peor caso | `--glass-scrim` | 4.89 | TG |
| 23 | `.zoom button` blanco sobre `--glass-strong` | | **1.18** peor caso | `--glass-scrim` + icono blanco | 4.89 | UI |
| 24 | `.global-button[aria-pressed]` (14 px/600) | blanco / `rgba(9,131,0,.75)` | **3.23** peor caso | `--action` opaco `#098300` | 4.93 | T |
| 25 | Iconos `.toolbar` `#1E1E1E` sobre `--glass-strong` con imagen negra | | 3.22 (justo) | fondo `--glass-light rgba(236,240,243,.7)` | 6.97 peor caso | UI |
| 26 | `.pin-label` oscuro (`app.css:212`) blanco / `rgba(30,30,30,.55)` | | **3.79** peor caso | `rgba(30,30,30,.7)` | 6.10 | T (etiqueta de UI, no dato) |
| 27 | Botón disabled (`app.css:242`) `#8A9097` / `#D5D9DE` | | 2.27 | `#666C73` (opcional) | 3.74 | Exento por WCAG; se recomienda por uso a pleno sol |

### 4.2 Combinaciones que ya pasan (se conservan sin cambio)

| Combinación | Ratio |
|---|---|
| `--text` negro / blanco, `--bg`, `#E3E8EC` | 21.0 / 18.1 / 17.0 |
| `--text-soft` `#474B4E` / blanco / `--bg` | 8.81 / 7.69 |
| `.nav-home` `#757575` / blanco | 4.61 |
| `--brand` `#23654E` / blanco (título HOME) | 6.90 |
| `--brand-strong` `#1E6433` / blanco / `--bg` (links, nav activo) | 7.18 / 6.26 |
| Botón primary blanco / `#292D30` | 13.89 |
| Botón save blanco / `#098300` | 4.93 |
| Botón secondary `#292D30` / blanco | 13.89 |
| Chip seleccionado blanco / `#098300` | 4.93 |
| `.chip` texto `#474B4E` / blanco | 8.81 |
| Inputs en lectura `#5A6068` / `#F1F3F5` | 5.71 |
| `.chart-card small` y ticks `#697386` / blanco | 4.78 |
| `.stat b` `#003488` / `#E5E9EC` | 9.31 |
| `.notice-error`, `.field-hint` `#8A1C10` | 7.67 / 9.32 |
| Niveles low / medium / high / none | 6.15 / 5.70 / 6.36 / 5.22 |
| `.tag`, `.source-batch` `#474B4E` / `#E6E9EE` | 7.24 |
| `.score-fair` / `.score-poor` / blanco | 6.80 / 8.18 |
| `.global-panel` blanco / `rgba(20,28,24,.62)` (peor caso) | 4.89 |
| `.pin-label` claro negro / `rgba(240,240,236,.86)` | 13.32 |
| Borde `.field-item` seleccionado `#098300` / blanco | 4.93 |
| Borde `.risk` seleccionado `#1E6433` / blanco | 7.18 |
| Borde alerta seleccionada `#B86200` / blanco | 4.39 |

---

## 5. Tokens de estado por tipo de control

Principios:
- **hover**: cambio de fondo leve (solo con `@media (hover: hover)`).
- **active/pressed**: cambio de color **más fuerte que hover y en dirección distinta o más profunda**, nunca `filter: brightness`. Delta mínimo medido entre default y active ≥ 1.3:1 de luminancia (perceptible sin depender del tono).
- **selected**: nunca solo color; siempre un segundo indicador (peso, borde de 2 px, barra o icono).
- **focus-visible**: un único anillo doble para toda la app (§5.8).
- **disabled**: gris neutro, `cursor: not-allowed`, sin hover/active.
- **loading**: mantiene el color del estado default (no se confunde con disabled), `aria-busy="true"`, `cursor: progress`, spinner en `currentColor`, ancho fijo.

Cada fila indica el texto sobre el fondo y su ratio. Δ = contraste entre el fondo del estado y el de default.

### 5.1 Botón primary (`.btn-primary`, base `#292D30`)

| Estado | Fondo | Texto | Ratio texto | Δ vs default |
|---|---|---|---|---|
| default | `#292D30` | `#FFFFFF` | 13.89 | — |
| hover | `#41474C` (aclara) | `#FFFFFF` | 9.42 | 1.47 |
| active | `#0F1112` (oscurece) + `inset 0 2px 0 rgba(0,0,0,.35)` | `#FFFFFF` | 18.93 | 1.36 (2.01 vs hover) |
| disabled | `#D5D9DE` | `#666C73` | 3.74 | n/a |
| loading | `#292D30` + spinner blanco | `#FFFFFF` | 13.89 | — |

### 5.2 Botón save / acción (`.btn-save`, base `#098300`)

| Estado | Fondo | Texto | Ratio | Δ vs default |
|---|---|---|---|---|
| default | `#098300` | `#FFFFFF` | 4.93 | — |
| hover | `#076A00` | `#FFFFFF` | 6.84 | 1.39 |
| active | `#044D00` | `#FFFFFF` | 10.16 | 2.06 |
| disabled | `#D5D9DE` | `#666C73` | 3.74 | n/a |
| loading | `#098300` + spinner | `#FFFFFF` | 4.93 | — |

### 5.3 Botón secondary (`.btn-secondary`, blanco con borde `#292D30`)

| Estado | Fondo | Borde | Texto | Ratio | Δ fondo |
|---|---|---|---|---|---|
| default | `#FFFFFF` | `#292D30` | `#292D30` | 13.89 | — |
| hover | `#ECF0F3` | `#292D30` | `#292D30` | 12.12 | 1.15 (+ borde 13.89 mantiene el límite) |
| active | `#D5DDE3` | `#292D30` | `#292D30` | 10.10 | 1.37 |
| disabled | `#FFFFFF` | `#D5D9DE` | `#666C73` | 5.3 aprox. | n/a |
| loading | `#FFFFFF` + spinner `#292D30` | `#292D30` | `#292D30` | 13.89 | — |

### 5.4 Ghost / icono sobre superficie clara (Back, `.link`, `.see-all`, `summary` "Why?", botones icono)

| Estado | Fondo | Texto / icono | Ratio |
|---|---|---|---|
| default | transparente | `#1E6433` (links) o `#1E1E1E` (iconos) | 7.18 / 16.67 |
| hover | `#E3E8EC` + subrayado | idem | 6.0 / 13.5 aprox. |
| active | `#CBD3DA` (Δ 1.51 vs blanco) | idem | ≥ 5.0 |
| disabled | transparente | `#666C73` | n/a |

### 5.5 Botones sobre el mapa (`.glass`: `.zoom`, `.field-button`, `.global-button`, `.year-picker`, `.toolbar`)

Dos familias, según lleven texto/ícono blanco o ícono oscuro:

**Vidrio oscuro con texto blanco** (`.field-button`, `.global-button` off, `.zoom`, `.year-picker`, `.map-note`, `.legend`):

| Estado | Fondo | Texto | Ratio peor caso | Δ vs default |
|---|---|---|---|---|
| default | `rgba(20,28,24,.62)` + `backdrop-filter` | `#FFFFFF` | 4.89 | — |
| hover | `rgba(20,28,24,.75)` | `#FFFFFF` | 7.63 | 1.56 |
| active | `rgba(20,28,24,.85)` | `#FFFFFF` | 10.97 | 2.24 |
| selected (`.global-button[aria-pressed]`) | `#098300` opaco + switch desplazado + borde blanco | `#FFFFFF` | 4.93 | hover `#076A00` 6.84; active `#044D00` 10.16 |
| disabled (zoom sin mapa) | `rgba(20,28,24,.45)` | `rgba(255,255,255,.6)` | exento | — |
| loading (Global mode cargando) | default + spinner blanco, `aria-busy` | `#FFFFFF` | 4.89 | — |

**Toolbar de capas (ícono oscuro)**:

| Estado | Fondo | Ícono | Ratio peor caso | Indicador extra |
|---|---|---|---|---|
| default | `rgba(236,240,243,.7)` | `#1E1E1E` | 6.97 | — |
| hover | `rgba(255,255,255,.92)` | `#1E1E1E` | 13.98 | — |
| active | `#D5DDE3` opaco | `#1E1E1E` | 12.13 | — |
| selected | `#FFFFFF` | `#1E6433` | 7.18 | barra inferior 3 px `#1E6433` (7.18 vs blanco), no solo cambio de fondo |

### 5.6 Chips / toggles seleccionables (`.chip`, presets, series, Elevation/Slope/Erosion, FieldForm)

| Estado | Fondo | Borde | Texto | Ratio texto |
|---|---|---|---|---|
| default | `#FFFFFF` | `#80878F` (3.63) | `#474B4E` | 8.81 |
| hover | `#EEF6EE` | `#1E6433` | `#1E6433` | 6.51 |
| active | `#D3EFD3` (color ya usado en `.priority-track`) | `#1E6433` | `#1E6433` | 5.83 |
| selected | `#098300` | `#098300` | `#FFFFFF` bold + icono check opcional | 4.93 |
| selected hover | `#076A00` | `#076A00` | `#FFFFFF` | 6.84 |
| selected active | `#044D00` | `#044D00` | `#FFFFFF` | 10.16 |
| disabled / lectura | `#F1F3F5` | `#D5D9DE` | `#5A6068` | 5.71 |
| lectura + seleccionado | `#3F7A3B` | `#3F7A3B` | `#FFFFFF` | 5.17 |

Variante sobre `.global-panel`: default `rgba(255,255,255,.12)` + borde `rgba(255,255,255,.35)`; hover `rgba(255,255,255,.22)`; active `rgba(255,255,255,.32)`; selected `#098300` (4.93).

### 5.7 Pestañas (Statistics `.tabs button`; Data usa chips §5.6)

| Estado | Fondo | Texto | Ratio | Indicador |
|---|---|---|---|---|
| default | `#C9C9C9` | `#333333` | 7.63 | — |
| hover | `#B8B8B8` | `#333333` | 6.37 | — |
| active | `#A6A6A6` | `#1E1E1E` | 6.85 | — |
| selected | `#5CC0F7` (Figma) | `#062B40` weight 600 | 7.24 | barra inferior 3 px `#0A5A86` (3.67 vs pestaña, 7.45 vs tarjeta) |
| selected hover | `#48B3EE` | `#062B40` | 6.28 | barra |
| selected active | `#2FA2E0` | `#062B40` | 5.16 | barra |

### 5.8 Items de lista / tarjetas-botón (`.field-item`, `.risk`, `.alert`, `.nav-item`)

| Estado | `.field-item` / `.risk` | `.alert` (Home) | `.nav-item` (sidebar) |
|---|---|---|---|
| default | fondo `#FFFFFF`, borde `--border` (decorativo; el texto identifica el control) | fondo `rgba(200,228,198,.07)`, borde `rgba(217,217,217,.5)` | transparente, texto e icono `#5F6368` (6.05) |
| hover | fondo `#F7F9FB`, borde `#80878F` | fondo `#F7F9FB`, borde `#80878F` | fondo `#F5F7F9`, texto `#1E1E1E` (15.5) |
| active | fondo `#DDE4E9` (Δ 1.28; texto negro 16.35, muted 4.71) | fondo `#DDE4E9` | fondo `#E3E8EC` (texto 13.5; muted 5.07) |
| selected | borde 2 px `--action` / `--brand-strong` (4.93 / 7.18 vs blanco) + fondo `#EEF6EE` + título bold | fondo `#FAEDAE` (Figma) + borde 2 px `#B86200` (4.39) + texto `#9A5200` (4.97) y muted `#5F6368` (5.12) | fondo `#ECF0F3` + texto/icono `#1E6433` bold (6.26) + barra lateral 3 px `#1E6433` (`aria-current="page"`) |
| disabled | opacidad .5 se sustituye por fondo `#F1F3F5`, texto `#5A6068` (5.71), `cursor:not-allowed` | `data-unavailable`: igual que disabled, `cursor: default` | n/a |
| loading | `aria-busy` + spinner a la derecha | idem | n/a |

### 5.9 Inputs, selects, textarea

| Estado | Fondo | Borde | Texto | Ratio borde / texto |
|---|---|---|---|---|
| default | `#FCFCFD` | 1 px `#80878F` | `#000000` | 3.54 / 20.4 |
| placeholder | | | `#5F6368` | 5.9 |
| hover | `#FCFCFD` | 1 px `#5F6368` | | 5.90 |
| focus-visible | `#FFFFFF` | 1 px `#003488` + anillo doble | | 11.09 |
| invalid (`aria-invalid`) | `#FFFFFF` | 2 px `#B3261E` + icono + mensaje `#8A1C10` enlazado con `aria-describedby` | | 6.54 / 9.32 |
| disabled / lectura (`fieldset:disabled`) | `#F1F3F5` | `#D5D9DE` | `#5A6068` | n/a / 5.71 |

Sliders (`.slider-thumb`, `.priority-fill`): el thumb `#003488` sobre blanco 11.37 y el relleno `#098300` 4.93 ya cumplen 3:1. Hover: thumb crece de 15 a 19 px; active: thumb `#00266A` + halo `0 0 0 6px rgba(0,52,136,.18)`; foco: anillo doble. Los gradientes de la pista son datos y no se tocan.

### 5.10 Foco unificado (sustituye a los tres focos actuales, P26)

```css
:focus-visible {
  outline: 2px solid var(--focus-ring);          /* #003488, exterior */
  outline-offset: 2px;
  box-shadow: 0 0 0 2px var(--focus-ring-inner); /* #FFFFFF rellena el hueco del offset */
}
```

Ratios: `#003488` vs blanco 11.37, vs `--bg` 9.92; blanco vs mapa `#2C4227` 10.96. Barrido de todo el espacio de color: **el par `#003488` + `#FFFFFF` nunca baja de 3.38:1** frente a cualquier fondo adyacente (peor caso `#009C9C`), así que vale igual sobre panel, tarjetas, vidrio y foto satelital. En elementos que ya tienen `box-shadow` (selección inset), combinar: `box-shadow: inset 0 0 0 1px var(--action), 0 0 0 2px var(--focus-ring-inner)`.

---

## 6. Modo oscuro

**No aplica** en esta fase: la app no tiene modo oscuro, el Figma no lo define y la decisión 2 pide mínimos cambios. Lo más parecido es la capa de controles sobre el mapa, que ya se trata como "superficie oscura" con `--glass-scrim` (§5.5). Si en el futuro se añade, no invertir: superficies `#151A17` / `#1E2521` / `#28302B`, texto `#E8ECEA`, verde de acción desaturado `#4CAF50` aprox. (a medir), y los colores de datos sin cambiar.

---

## 7. Tokens CSS listos para pegar en `app.css`

Sustituyen el bloque `:root` actual (`app.css:2-24`). Los nombres antiguos se conservan como alias para no romper selectores existentes.

```css
:root {
  /* ---- marca (sin cambios) ---- */
  --color-marca: #23654e;
  --color-marca-fuerte: #1e6433;
  --color-accion: #098300;
  --color-acento: #b86200;         /* solo bordes/iconos/decoración */
  --color-acento-texto: #9a5200;   /* texto ámbar AA */
  --color-superficie: #ffffff;
  --color-fondo: #ecf0f3;
  --color-texto: #000000;
  --color-borde: rgba(0, 0, 0, 0.1);   /* decorativo (tarjetas) */
  --color-borde-control: #80878f;      /* controles: 3:1 */

  /* escalas */
  --brand-50: #f4f7f6;  --brand-100: #e5edea; --brand-200: #c6d7d1; --brand-300: #9ebbb1; --brand-400: #77a091;
  --brand-500: #4f8471; --brand-600: #35715c; --brand-700: #23654e; --brand-800: #1b4f3d; --brand-900: #13382b;
  --neutral-50: #f7f9fb;  --neutral-100: #ecf0f3; --neutral-200: #e3e8ec; --neutral-300: #d5d9de; --neutral-400: #b8bec6;
  --neutral-500: #80878f; --neutral-600: #5f6368; --neutral-700: #474b4e; --neutral-800: #292d30; --neutral-900: #1e1e1e;

  /* ---- alias existentes (mismos nombres que hoy) ---- */
  --bg: var(--color-fondo);
  --surface: var(--color-superficie);
  --surface-sunken: #e3e8ec;
  --surface-muted: #f7f9fb;
  --text: var(--color-texto);
  --text-muted: #5f6368;           /* antes rgba(0,0,0,.5): 3.95 -> 6.05 */
  --text-soft: #474b4e;
  --brand: var(--color-marca);
  --brand-strong: var(--color-marca-fuerte);
  --action: var(--color-accion);
  --accent: var(--color-acento);
  --accent-text: var(--color-acento-texto);
  --thumb: #003488;
  --border: var(--color-borde);
  --border-soft: rgba(217, 217, 217, 0.5);
  --border-control: var(--color-borde-control);
  --field-border: #dbe0e8;
  --ink: #1e1e1e;

  /* ---- estados semánticos ---- */
  --success-text: #1e6433; --success-bg: #dff3dc;
  --warning-text: #8a4b00; --warning-bg: #fbe9c8;
  --danger-text: #9b1c12;  --danger-bg: #fbdcd8;  --danger-border: #b3261e;
  --error-text: #8a1c10;   --error-bg: #fbe4e1;
  --info-text: #003488;
  --badge-warn-bg: #ffae00; --badge-warn-text: #5c2f00; --badge-warn-border: #b86200;

  /* ---- foco único ---- */
  --focus-ring: #003488;
  --focus-ring-inner: #ffffff;

  /* ---- disabled / lectura ---- */
  --disabled-bg: #d5d9de;
  --disabled-text: #666c73;
  --disabled-border: #d5d9de;
  --readonly-bg: #f1f3f5;
  --readonly-text: #5a6068;
  --readonly-selected: #3f7a3b;

  /* ---- botón primary ---- */
  --btn-primary-bg: #292d30;
  --btn-primary-bg-hover: #41474c;
  --btn-primary-bg-active: #0f1112;
  --btn-primary-text: #ffffff;
  /* ---- botón save / acción ---- */
  --btn-save-bg: var(--action);
  --btn-save-bg-hover: #076a00;
  --btn-save-bg-active: #044d00;
  --btn-save-text: #ffffff;
  /* ---- botón secondary ---- */
  --btn-secondary-bg: #ffffff;
  --btn-secondary-bg-hover: #ecf0f3;
  --btn-secondary-bg-active: #d5dde3;
  --btn-secondary-border: #292d30;
  --btn-secondary-text: #292d30;
  /* ---- ghost / icono (superficie clara) ---- */
  --ghost-bg-hover: #e3e8ec;
  --ghost-bg-active: #cbd3da;
  --link: var(--brand-strong);

  /* ---- mapa ---- */
  --glass: rgba(217, 217, 217, 0.25);        /* se conserva solo para contenedores sin texto */
  --glass-strong: rgba(217, 217, 217, 0.5);
  --glass-scrim: rgba(20, 28, 24, 0.62);     /* overlays con texto/ícono blanco */
  --glass-scrim-hover: rgba(20, 28, 24, 0.75);
  --glass-scrim-active: rgba(20, 28, 24, 0.85);
  --glass-light: rgba(236, 240, 243, 0.7);   /* toolbar con íconos oscuros */
  --glass-light-hover: rgba(255, 255, 255, 0.92);
  --glass-light-active: #d5dde3;
  --glass-selected-bg: #ffffff;
  --glass-selected-indicator: #1e6433;
  --pin-label-dark: rgba(30, 30, 30, 0.7);

  /* ---- chips ---- */
  --chip-bg: #ffffff;
  --chip-border: var(--border-control);
  --chip-text: #474b4e;
  --chip-bg-hover: #eef6ee;
  --chip-bg-active: #d3efd3;
  --chip-border-hover: #1e6433;
  --chip-text-hover: #1e6433;
  --chip-selected-bg: var(--action);
  --chip-selected-bg-hover: #076a00;
  --chip-selected-bg-active: #044d00;
  --chip-selected-text: #ffffff;

  /* ---- pestañas (Statistics) ---- */
  --tab-bg: #c9c9c9;
  --tab-bg-hover: #b8b8b8;
  --tab-bg-active: #a6a6a6;
  --tab-text: #333333;
  --tab-selected-bg: #5cc0f7;
  --tab-selected-bg-hover: #48b3ee;
  --tab-selected-bg-active: #2fa2e0;
  --tab-selected-text: #062b40;
  --tab-selected-indicator: #0a5a86;

  /* ---- items de lista / tarjetas-botón / nav ---- */
  --item-bg-hover: #f7f9fb;
  --item-bg-active: #dde4e9;
  --item-border-hover: var(--border-control);
  --item-selected-bg: #eef6ee;
  --item-selected-border: var(--action);      /* .field-item */
  --risk-selected-border: var(--brand-strong); /* .risk */
  --alert-selected-bg: #faedae;                /* = rgba(244,219,92,.5) sobre blanco */
  --alert-selected-border: var(--accent);
  --nav-bg-hover: #f5f7f9;
  --nav-bg-active: #e3e8ec;
  --nav-selected-bg: var(--bg);
  --nav-selected-text: var(--brand-strong);

  /* ---- inputs ---- */
  --input-bg: #fcfcfd;
  --input-border: var(--border-control);
  --input-border-hover: #5f6368;
  --input-border-focus: #003488;
  --input-border-invalid: #b3261e;
  --input-placeholder: #5f6368;

  /* ---- series de Statistics (antes sueltos) ---- */
  --series-legend-text: #5f6368;

  /* ---- datos: NO TOCAR (preservacion.json) ---- */
  --scale: linear-gradient(90deg, #ff0202 0%, #fffc5f 31.73%, #00c4ff 100%);

  /* resto sin cambios */
  --radius: 15px;
  --shadow: 0 2px 6px rgba(26, 36, 56, 0.07);
  --sidebar: 83px;
  --panel: 488px;
}
```

---

## 8. Daltonismo: el significado nunca depende solo del color

Simulación Machado 2009 (severidad 1) calculada con script; ratios de luminancia entre los dos colores que deben distinguirse.

| Par | Normal | Deutan | Protan | Tritan | ¿Qué lo salva además del color? |
|---|---|---|---|---|---|
| Barra factor good `#1E6433` vs poor `#C4382B` | 1.35 | 1.64 | **1.05** | 1.37 | Texto "72 · Good" / "Poor" en `.factor-score` (`CropSuggestions.tsx:26`) |
| good vs fair `#D98A00` | 2.59 | 2.94 | 2.12 | 2.59 | Texto, idem |
| Nivel low `#DFF3DC` vs high `#FBDCD8` | 1.10 | 1.07 | 1.16 | 1.10 | `LevelPill`: icono (CircleCheck / TriangleAlert / OctagonAlert) + palabra |
| Chip seleccionado vs default | 4.93 | 5.19 | 4.61 | 4.93 | Además texto bold (`font-weight:700`) |
| `.field-item` seleccionado vs default (borde) | 3.95 | 4.16 | 3.69 | 3.95 | Borde de 2 px (grosor) + fondo; recomendado título bold |

Comprobación por control:
- **Riesgos** (low/medium/high): icono + palabra + color. Cumple.
- **Puntuación de cultivo**: número + palabra ("Good/Fair/Poor"). Cumple; las barras rojas/verdes son indistinguibles en protanopia, pero el texto lleva el significado.
- **Fuente del dato** (Live / Saved batch / Not available): icono + palabra. Cumple.
- **Chips y pestañas seleccionadas**: con los tokens propuestos llevan fondo + peso de fuente (chips) o barra inferior (pestañas). Hoy las pestañas de Statistics dependen solo del color: **se corrige con `--tab-selected-indicator`**.
- **Toolbar del mapa**: hoy seleccionado = solo fondo blanco; **se añade barra `--glass-selected-indicator`**.
- **Alertas críticas seleccionadas**: amarillo + borde ámbar de 2 px (grosor distinto del default de 1 px). Recomendado un icono check o `font-weight` para no depender del tono.
- **Global mode**: switch con posición del círculo (forma) además del verde. Cumple.
- **Errores de formulario**: borde rojo **más** icono y mensaje de texto (`aria-describedby`); hoy solo texto `.field-hint`, que ya es independiente del color.
- **Capas del mapa** (rampas de datos, intocables): llevan leyenda con ticks numéricos; las rampas `--scale` y `.slider-heat` usan azul-amarillo-rojo (eje azul/amarillo legible en deutan/protan). No se modifican.

---

## 9. Resumen de cambios mínimos respecto al Figma

1. `--text-muted` sólido `#5F6368` (visualmente casi igual al gris 50 % actual, solo algo más oscuro).
2. Texto ámbar separado del ámbar decorativo (`#9A5200` vs `#B86200`).
3. Pestañas de Statistics: se queda el celeste `#5CC0F7` y el gris `#C9C9C9`, cambia el color del texto y se añade barra.
4. `.badge-warn`: mismo fondo `#FFAE00` y borde, texto marrón oscuro `#5C2F00`.
5. Bordes de controles a `#80878F` (chips, inputs); tarjetas siguen con borde suave.
6. Overlays del mapa con texto: vidrio oscuro (el mismo `rgba(20,28,24,.62)` que ya usa `.global-panel`) en lugar del vidrio gris claro.
7. Un solo anillo de foco de dos tonos.
8. Estados hover/active/selected/disabled/loading con colores propios en todos los controles.
