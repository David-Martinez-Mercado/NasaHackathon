# 01 · Brief: FieldShift (frontend)

Fuente: análisis estático del código en `src/frontend` (sin URL pública), 2026-11-15. Rutas de archivo relativas a `src/frontend/`.
Diseño de origen: Figma `2nS935kN9c36rWRDHqbxt7` (capturas en `repo/docs/diseno/figma/`, tokens en `repo/docs/diseno/tokens.md`), pensado para un lienzo fijo de **1280 × 800**.

---

## 1. Qué es

Herramienta web de **apoyo a la decisión agrícola**: el agricultor dibuja sus parcelas en un mapa satelital y ve riesgos climáticos y de suelo de la zona (ola de calor, sequía, humedad, estrés, erosión, pendiente…), pronósticos en vivo, escenarios "What if?" (lluvia/temperatura) y sugerencias de cultivo ordenadas según sus prioridades. Los números vienen de modelos ML entrenados con datos de **Weld County, Colorado (EE. UU.)**; la propia app insiste en que no reemplaza la experiencia local.

- Stack: React 18.3 + Vite 5 + TypeScript 5.6, react-router-dom 6.28 (BrowserRouter), maplibre-gl 4.7, recharts 2.13, lucide-react 0.460. Sin librería de UI ni CSS framework: **un único `src/styles/app.css` (354 líneas)**.
- Datos: GraphQL (`/graphql`, proxy de Vite o `VITE_API_URL`) contra backend NestJS. Despliegue estático en Cloudflare Workers (`wrangler.jsonc`, SPA fallback).
- Idioma de la interfaz: **inglés** (`<html lang="en">`); el backend responde en español y `src/data/i18n.ts` traduce textos conocidos.

## 2. Para quién

- **Principal**: agricultores/productores (no técnicos), uso probable **en campo con móvil o tableta, a pleno sol** (el código lo dice: `risk.tsx:4` "readable in the sun", "colorblind-safe").
- **Secundario**: agrónomos/asesores y evaluadores del proyecto (hackathon NASA, por el nombre del worker `nasahackathon`) que revisan modelos, métricas y fuentes (pestaña Data → Models).
- Hoy la app está optimizada solo para **escritorio 1280×800**; móvil es un caso de uso real pero mal resuelto (ver §6).

## 3. Objetivo de la interfaz

- **Acción principal**: registrar una parcela (`/fields/new`: dibujar el polígono en el mapa + formulario) y consultar sus riesgos/sugerencias.
- **Secundarias**: editar la parcela (`/fields`), ajustar prioridades y cambiar de cultivo (`/crops`, botón "Switch to X"), explorar capas del mapa (`/layers/:tool`), registrar historial anual (`/history`), consultar estadísticas y datos (`/statistics`, `/data`), activar "Global mode" en el mapa.

## 4. Propuesta de valor y diferenciadores reales (observados en el código)

- Honestidad del dato: nunca muestra cifras inventadas ("N/A", "No data", "not available… rather than made-up numbers"), indica fuente, fecha (`data up to`), resolución (~25 km, 30 m) y si es interpolado.
- Indicadores accesibles por diseño: nivel de riesgo = icono + palabra + color (`LevelPill`), fuente "Live / Saved batch" con icono.
- Escenarios "What if?" que repintan capas y pronósticos en vivo.
- Sugerencias de cultivo explicadas ("Why?"), con barras por criterio y prioridades ajustables con presets.
- Nota de juicio fija en cada panel: "Decision support only…".

## 5. Tono y personalidad

Cercano, sobrio y **prudente/transparente** ("Check with your agronomist", "not a climate projection"). Visual: verdes de marca (`#23654E`, `#1E6433`, `#098300`), acento ámbar `#B86200`, tarjetas blancas radio 15 px sobre `#ECF0F3`, controles "glass" sobre el mapa. Tipografía Inter (Poppins solo en la gráfica de Statistics).

## 6. Competencia / análogos (para el investigador de referencias)

Climate FieldView, Cropwise (Syngenta), xarvio FIELD MANAGER, OneSoil, EOS Crop Monitoring, Farmers Edge, AgriWebb, Windy.com (patrón de capas y barra inferior sobre mapa), Google Maps móvil (patrón bottom sheet sobre mapa).

## 7. Restricciones

- **Mantener**: React + Vite + TS, react-router 6 (BrowserRouter), maplibre (un solo mapa compartido montado fuera de `<Routes>`, `main.tsx:34`), recharts, lucide-react. Sin backend nuevo.
- Arquitectura de layout: `.app` = `Sidebar` + página (`<Panel>`) + `<FieldMap>` hermanos en flex (`main.tsx:20-35`). Las páginas controlan el mapa vía `useMapConfig` (capa, puntos, tool, draw, year, hidden). **El mapa no debe desmontarse al navegar** (se crea una sola vez, `FieldMap.tsx:79-116`).
- El dibujo de parcela depende de `map.on('click')` (`FieldMap.tsx:108-110`): en táctil debe seguir funcionando (tap).
- CSS plano con variables en `:root`; no hay Tailwind/CSS-modules. Introducir uno sería decisión a confirmar.
- Textos: inglés, con traducciones de i18n.ts que no deben cambiar (ver `preservacion.json`).
- Sin favicon, sin meta description, sin `public/` (no hay logo gráfico: la "marca" es el texto "Field Shift"/"HOME" en verde y el icono `House`).

## 8. Pantallas / rutas

Definidas en `src/main.tsx:22-33`.

| Ruta | Componente | Título del panel | Mapa | Contenido clave |
|---|---|---|---|---|
| `/` | `Home` (pages/Home.tsx) | "HOME" (brand, con botón Back) | sí; capa según `?alert=` | selector de parcela, "What if?" (2 sliders), LiveForecast, riesgos (chips), CropSuggestions (3), "Critical alerts" (3 tarjetas-botón) |
| `/layers/:tool` | `LayerPage` (pages/Layers.tsx) | según tool | sí, capa + tool activo | tools: `temperature`, `vulnerability`, `rain`, `drought` (VariableLayer), `humidity`, `terrain` (chips Elevation/Slope/Erosion potential), `water`; otro → `/` |
| `/fields` | `Fields` | "My fields" | sí | lista de parcelas (listbox), barra Modify/Save/Cancel, `FieldForm` en solo lectura/edición, CropSuggestions |
| `/fields/new` | `AddField` (pages/Other.tsx) | "Add a field" | sí, modo dibujo (`draw: true`) | `FieldForm`, estado del dibujo, "Clear", "Save field" |
| `/risks` | `Risks` | "Zone risks" | sí, capa por riesgo | LiveForecast "Right now", 9 tarjetas-botón de riesgo, notas |
| `/crops` | `Crops` | "Crops for my field" | sí (sin capa) | presets (chips), 4 sliders de prioridad, Save/Reset, riesgos, lista de opciones con "Switch to X" |
| `/history` | `History` (Other.tsx) | "HOME" (brand) — sospechoso | sí, con **year-picker** en lugar de toolbar | ficha del año, editor (select cultivo, date, textarea) |
| `/statistics` | `Statistics` (Other.tsx) | "Statistics" (panel ancho) | **oculto** (`hidden: true`) | tabs Temperature/Humidity, LineChart 380 px |
| `/data` | `Data` (pages/DataHub.tsx) | "Data: {tab}" | sí | chips Economy/Climate/Models/Local practice; gráfica de precios, tablas (Yield, rotación, ciclo), tarjetas de modelos |
| `*` | `Navigate to="/"` | — | — | — |

Overlays permanentes del mapa (`FieldMap.tsx`): botón "Global mode" (switch), botón "Field +" (→ `/fields/new`), leyenda (capa o puntos), zoom +/−, nota de interpolación, toolbar inferior de 7 capas (o 3 variables en global mode) o year-picker, panel de Global mode (`GlobalLayer.tsx`), pines.

## 9. Inventario de componentes

| Componente | Archivo | Notas |
|---|---|---|
| `Sidebar` | components/ui.tsx:19-34 | Home + 7 NavLink + botón "Account" |
| `Panel` | ui.tsx:37-53 | `<main>` con header 72 px, body con scroll, nota de juicio; variantes `brand`, `wide` |
| `Card` | ui.tsx:55-62 | `<section>` + `h2` opcional |
| `Btn` | ui.tsx:68-74 | variantes `primary` (#292D30), `save` (#098300), `secondary` (blanco con borde); solo `disabled`, sin `loading` |
| `Notice` | ui.tsx:77-79 | info / error (`role=alert`) / loading (`role=status`) |
| `ReadField` | ui.tsx:81-88 | etiqueta + caja de solo lectura |
| `Chips` | ui.tsx:90-98 | grupo de toggles `aria-pressed` (single select) |
| `Slider` | ui.tsx:115-128 | input range invisible sobre pista/thumb pintados; tonos rain/heat |
| `PriorityBar` | ui.tsx:131-141 | slider vertical (`writing-mode: vertical-lr`) |
| `LevelPill`, `RISK_INFO` | components/risk.tsx | |
| `FieldForm` | components/FieldForm.tsx | `<fieldset disabled>` para modo lectura |
| `LiveForecast`, `SourceBadge` | components/LiveForecast.tsx | botón "Update" |
| `CropSuggestions`, `SuggestionCard`, `FactorBars` | components/CropSuggestions.tsx | `<details>` "Why?" |
| `GlobalLayer` | components/GlobalLayer.tsx | panel glass sobre el mapa |
| `FieldMap` | map/FieldMap.tsx | todos los controles del mapa |
| Botones ad-hoc fuera de `Btn` | `.alert` (Home), `.risk` (Risks), `.field-item` (Fields), `.tabs button` (Statistics), `.chip` (Chips/Economy/FieldForm), `.link` (Fields/AddField), `.glass` buttons (mapa), `.nav-user` | **cada uno con estilos e interacciones propios: fuente principal de inconsistencia** |

---

## 10. Estado actual de responsive

### Breakpoints existentes
**Uno solo**: `@media (max-width: 900px)` en `src/styles/app.css:217-223`. No hay breakpoints para tablet ni para móvil pequeño, ni media queries de altura, ni `prefers-reduced-motion`, ni `hover: hover`/`pointer: coarse`.

Lo que hace a ≤900 px: `.app` pasa a `flex-wrap` con altura automática; el panel ocupa `100% - 83px` junto a la sidebar; el mapa baja a una fila completa de `70vh`; `.alert-grid` a `1fr 1fr`; la sidebar queda `sticky` con `height: 100vh`.

### Layout de escritorio (base)
Sidebar fija 83 px (`--sidebar`, app.css:22) + panel fijo 488 px (`--panel`, app.css:23, `flex: 0 0`, app.css:50) + mapa el resto. Medidas en px absolutos copiadas del Figma 1280×800.

### Problemas concretos (archivo:línea)

**Sidebar**
- R1. `app.css:40` `.nav-items { margin-top: 164px }` + 7 ítems de 66 px + gap + `nav-user` 60 px (app.css:47) ≈ 800 px de alto mínimo. En cualquier viewport más bajo (portátil 1366×768 con barra del navegador, tablet horizontal, móvil) los ítems se salen o el botón de cuenta queda fuera; la sidebar no tiene `overflow` (app.css:37).
- R2. `app.css:222` en ≤900 px la sidebar es una columna `sticky; height: 100vh` de 83 px que roba ancho al contenido en móviles (375 px → 292 px para el panel) y sigue con el `margin-top: 164px`. No existe navegación inferior/hamburguesa.
- R3. `ui.tsx:6-16` iconos de tamaños dispares (24/28/30) y labels de 10 px (app.css:41) — ilegible en móvil.

**Panel**
- R4. `app.css:50` panel `flex: 0 0 488px` entre 901 y ~1100 px deja al mapa con ~450 px o menos; la toolbar del mapa (R10) ya no cabe.
- R5. `app.css:52-55` paddings fijos (header 0 23px 0 28px; body 14px 29px 16px 28px); `app.css:54` `margin-left: -22px` en el título brand (hack que en móvil puede cortar "HOME").
- R6. `app.css:56` `.panel-wide .panel-body { padding: 30px 75px }` (Statistics): 150 px de padding horizontal en móvil.
- R7. En ≤900 px el panel se apila **encima** del mapa (app.css:218-220): en `/fields/new` el usuario tiene que hacer scroll más allá de todo el formulario para dibujar, y el texto dice "Click on the map" (Other.tsx:66). En `/risks` y `/layers/*` el efecto en el mapa (la razón de tocar una tarjeta, Risks.tsx:37 "Tap a card to see it on the map") queda fuera de pantalla.

**Mapa y overlays (FieldMap.tsx, app.css:178-215, 331-354)**
- R8. Todos los overlays son `position:absolute` con px fijos: `.field-button` left 31 top 26 (app.css:183), `.global-button` **left 215px** (app.css:331), `.legend` right 28 top 49 (app.css:184), `.zoom` right 44 (app.css:193), `.map-note`/`.global-panel` left 31 top 84 (app.css:201, 336). En un mapa de 375 px el botón Global (215 + ~170 px) se sale por la derecha y se solapa con la leyenda.
- R9. `.global-panel` width 330 px (app.css:336), parche `max-width: calc(100% - 62px)` (app.css:352).
- R10. `.toolbar` (app.css:196-197): 7 botones × 50 px + 6 × 22 px de gap + 30 px de padding ≈ **512 px**, centrada con `translateX(-50%)`, sin wrap ni scroll: se recorta en móvil y en escritorio estrecho (R4).
- R11. `.year-picker` 295 px y texto 24 px (app.css:199).
- R12. `.map` en ≤900 px usa `height: 70vh` (app.css:220): con barra de navegador móvil `vh` cambia; considerar `dvh`/`svh`.
- R13. `.legend-bar` `min-height: 150px` (app.css:186) + leyenda de puntos con texto 14 px (app.css:189): ocupa media pantalla en móvil.
- R14. La attribution de maplibre con `opacity: .7` (app.css:203) puede quedar bajo la toolbar.

**Tablas** (DataHub.tsx:81-88, 207-210, 219-226; app.css:304-306)
- R15. `.data-table` sin contenedor con `overflow-x:auto`; la tabla de ciclo tiene 3 columnas con textos como "120 days (2025)"; en ≤360 px se aprieta y `overflow-wrap:anywhere` (app.css:346) rompe palabras a mitad.

**Gráficas (recharts)**
- R16. Statistics: `ResponsiveContainer height={380}` fijo (Other.tsx:187), ticks de 14 px Poppins (Other.tsx:190-191), `strokeWidth 5`, margen derecho 30; leyenda `margin: 0 0 30px 30px; gap: 40px` (app.css:174); `.stats-card { padding: 34px 48px }` (app.css:172). En móvil la gráfica queda con ~200 px útiles y etiquetas solapadas.
- R17. `.tabs { gap: 100px }` y botones de 140 px (app.css:169-170) = 380 px mínimo: desborda en móvil.
- R18. Economy: `height={190}` y `margin left: -14` (DataHub.tsx:62-63); ticks de 9 px (DataHub.tsx:65) ilegibles.

**Formularios y tarjetas**
- R19. `.alert-grid { grid-template-columns: repeat(2, 168px); gap: 21px 39px }` (app.css:102) y `.alert { height: 75px }` fijo (app.css:103): con textos traducidos largos ("Not loaded on the server yet") el contenido se desborda; el `.alert-icon` absoluto (app.css:108-111) se pisa con el texto.
- R20. `.grid-2 { gap: 6px 60px }` (app.css:73) sin colapso a 1 columna.
- R21. `.priority-row` 4 columnas fijas (app.css:157) con labels largos ("Save water / drought tolerance") en `min-height:45px` (app.css:159) y pistas verticales de 128 px; en 292 px de ancho cada columna ≈ 65 px.
- R22. `.factor { grid-template-columns: 96px 1fr 72px }` (app.css:295): en móvil la barra queda casi en 0 px.
- R23. `.months select { width: 92px }` (app.css:151) y `.box-small` (app.css:71) con anchos fijos.
- R24. `.stat-row` 3 columnas fijas (app.css:114) en Humidity.
- R25. `.chips { gap: 8px 18px }` (app.css:152) — aceptable porque hace wrap, pero chips de 25 px de alto (app.css:153).
- R26. `.recommendations { max-height: 300px; overflow-y:auto }` (app.css:75) y `.card .note-list { max-height: 180px; overflow-y: auto }` (app.css:347): scroll anidado dentro del scroll del panel; en móvil es un trampa de scroll.

**Tipografía y objetivos táctiles**
- R27. `body { font-size: 12px }` (app.css:28); abundan 9-10 px (app.css:41, 57, 63, 65, 88, 125-127, 131, 168, 230, 284, 314, 326). Por debajo de lo recomendable en móvil (16 px base, mínimo ~12 px para texto secundario); además iOS hace zoom al enfocar inputs < 16 px: `.form input, .form select { font-size: 10px }` (app.css:149).
- R28. Objetivos táctiles < 44×44 px: `.chip` 25 px (app.css:153), `.form input/select` min-height 28 px (app.css:149), zoom 34 px (app.css:195), slider: área del input 25 px y thumb 15 px (app.css:85-86), `.link` y `.see-all` en línea, `summary` "Why?", botones del year-picker (solo icono 22 px), botón Back 16 px (ui.tsx:43), `.suggest .btn` / `.live-foot .btn` con padding 6px 14px (app.css:267, 328).

---

## 11. Estado actual de estados interactivos

Reglas globales existentes:
- `:focus-visible { outline: 2px solid var(--thumb); outline-offset: 2px }` (app.css:31) — bueno como base, pero `#003488` sobre el mapa oscuro (`#2C4227`) o fotos satelitales apenas se ve.
- `button { cursor: pointer; border: 0; background: none; padding: 0 }` (app.css:30) — reset total.
- Sin ninguna regla `:active` en todo el CSS. Sin `transition` salvo `.btn` (app.css:236) y `.switch::after` (app.css:334). Sin `prefers-reduced-motion`.

Matriz por control (✔ existe, ✘ falta, ~ parcial):

| Control | hover | active/pressed | focus-visible | disabled | loading | seleccionado |
|---|---|---|---|---|---|---|
| `.btn` (Btn) app.css:236-242 | ~ `filter: brightness(1.12)`: invisible en `secondary` (blanco) y casi nulo en `primary` (#292D30); la `transition` no incluye `filter` | ✘ | ✔ propio (#4464E8, 3 px) distinto del global | ✔ gris #D5D9DE | ~ solo cambia el texto ("Saving…", "Updating…"); sin spinner, sin `aria-busy`, el ancho del botón salta | n/a |
| `.chip` app.css:153-154 | ✘ | ✘ | global | ~ solo dentro de `fieldset:disabled` (app.css:248-249) | n/a | ✔ `aria-pressed` verde |
| `.nav-item` / `.nav-home` app.css:38-44 | ✘ | ✘ | global | n/a | n/a | ✔ `.active` |
| `.nav-user` app.css:47 / ui.tsx:31 | ✘ | ✘ | global | — | — | — (**no hace nada**, ver P1) |
| `.alert` (Home) app.css:103-107, 233 | ✘ | ✘ | global | ~ `opacity:.55` vía `data-unavailable`, cursor sigue `pointer` | ✘ | ✔ `aria-pressed` amarillo |
| `.risk` (Risks) app.css:279-280 | ✘ | ✘ | global | n/a | ✘ | ✔ `aria-pressed` borde verde |
| `.field-item` app.css:254-257 | ✘ | ✘ | global | ✔ opacity .5 | n/a | ✔ `aria-selected` |
| `.tabs button` app.css:170-171 | ✘ | ✘ | global | n/a | n/a | ✔ pero contraste insuficiente (P9) |
| `.link` / `.see-all` app.css:156, 287 | ✘ | ✘ | global | n/a | n/a | n/a |
| `.why summary` app.css:301 | ✘ | ✘ | global | n/a | n/a | ✘ sin indicador abierto/cerrado propio |
| Inputs/selects/textarea app.css:70, 149 | ✘ | n/a | global (sin cambio de borde) | ✔ en fieldset disabled (app.css:247) | n/a | — ; sin estado de error (`.field-hint` solo texto, sin `aria-invalid`/`aria-describedby`) |
| `Slider` / `PriorityBar` app.css:83-87, 160-164 | ✘ (thumb no crece) | ✘ | ✔ vía `:has(input:focus-visible)` | ✘ sin estilo propio fuera del fieldset | n/a | n/a |
| Botones glass del mapa (`.zoom`, `.toolbar`, `.year-picker`, `.field-button`, `.global-button`) app.css:194-200, 331-335 | ✘ | ✘ | global (poco visible sobre el mapa) | ✘ (zoom activo aunque `map` sea null) | ✘ (GlobalLayer muestra texto en el panel, no en el botón) | ✔ `aria-pressed` en toolbar y global |
| Botón Back (Panel brand) ui.tsx:43 | ✘ | ✘ | global | n/a | n/a | n/a |

---

## 12. Lista de problemas (accesibilidad, consistencia, bugs) con archivo:línea

**Funcionales / navegación (reportados, NO arreglar sin confirmar)**
- P1. `components/ui.tsx:31` botón "Account" (`.nav-user`) sin `onClick` ni destino: control muerto.
- P2. `pages/Other.tsx:142` la página Plot history usa `<Panel title="HOME" brand>`: muestra "HOME" y botón Back en vez de un título propio. Probable copia de Home.
- P3. `components/ui.tsx:43` botón Back (`navigate(-1)`) en Home: si se entra directo a `/`, sale de la app o no hace nada.
- P4. `map/FieldMap.tsx:250` la toolbar navega con `<button onClick={navigate}>`: no son enlaces (sin `href`, no se pueden abrir en pestaña, el lector no anuncia navegación). Igual en `FieldMap.tsx:197` ("Field +") y `pages/Fields.tsx:63` ("Add your first field" es `<button>` que navega).
- P5. `pages/Home.tsx:49` el texto remite a "Add field" sin enlace.
- P6. `map/FieldMap.tsx:233-235` year-picker sin límites (años futuros o anteriores infinitos).

**Accesibilidad**
- P7. Sin enlace "saltar al contenido"; la región principal es `<main>` en Panel (ui.tsx:40) — correcto, pero la sidebar tiene 9 paradas de tab antes.
- P8. Contraste: `--text-muted rgba(0,0,0,.5)` (app.css:6) ≈ #808080 sobre blanco/#ECF0F3 ≈ 3.9:1 / 3.4:1, **falla AA** para texto pequeño (usado en nav, `.empty`, `.note-list`, `.risk-source`, etc.). `.nav-item svg rgba(88,100,94,.5)` (app.css:42) aún peor.
- P9. `.tabs button` (app.css:170-171): `#6F6F6F` sobre `#C9C9C9` ≈ 2.9:1 y blanco sobre `#5CC0F7` ≈ 2.1:1: fallan AA.
- P10. `.alert b` `#B86200` (app.css:105) sobre fondo casi blanco ≈ 4.3:1 (límite); `.badge-warn` `#B86200` sobre `#FFAE00` (app.css:119) ≈ 2:1, falla.
- P11. Texto blanco sobre glass semitransparente encima de imagen satelital (app.css:182, 331, 336): contraste no garantizado.
- P12. `pages/Fields.tsx:68-71` `role="listbox"` con hijos `<button role="option">`: patrón ARIA incorrecto (listbox exige gestión de flechas y un solo tab stop). Mejor lista de botones con `aria-pressed`/`aria-current`.
- P13. `components/ui.tsx:118-125` el `<label>` envuelve también `<output>` y marcas; el `input range` no tiene `aria-valuetext` (se lee "50" en vez de "+10 %"). Igual `PriorityBar` (ui.tsx:133-138), y la orientación vertical no se anuncia (`aria-orientation`).
- P14. `components/FieldForm.tsx:56-65` selects "From"/"To" sin `<label>` asociado (texto suelto); `FieldForm.tsx:55, 67, 71` títulos de grupo como `<div className="label">` en lugar de `<fieldset><legend>`; los chips de riego/suelo (single select) no son `radiogroup`.
- P15. `pages/Other.tsx:125` `<textarea placeholder="Write...">` sin label.
- P16. `pages/Home.tsx:43` y `pages/DataHub.tsx:203` selects sin label propio visible/asociado (Home usa el título de la Card).
- P17. `FieldForm.tsx:66` mensaje de validación sin `aria-invalid`/`aria-describedby` en los selects.
- P18. lucide-react 0.460 **no** añade `aria-hidden` por defecto (`node_modules/lucide-react/dist/esm/defaultAttributes.js`): iconos decorativos en nav (ui.tsx:6-16), mapa (FieldMap.tsx:193, 198, 227, 241, 252) y alertas (Home.tsx:95-96) quedan expuestos.
- P19. `FieldMap.tsx:221-222, 233-235` botones del mapa sin `type="button"` (no están en form, riesgo bajo) y zoom ejecuta `map?.zoomIn()` sin estado disabled.
- P20. El dibujo de parcela solo se hace con clic/tap en el mapa (`FieldMap.tsx:108-110`): sin alternativa por teclado; no hay "deshacer último punto" (solo "Clear", Other.tsx:68).
- P21. Mensajes de guardado (`Notice` info) usan `role="status"` (ui.tsx:78), bien; pero los `Notice kind="loading"` se renderizan y desmontan, y los botones no exponen `aria-busy`.
- P22. Sin `prefers-reduced-motion`: `map.flyTo` de 800 ms (FieldMap.tsx:163).

**Consistencia de componentes / CSS**
- P23. **Colisión de clase `.risk`**: definida en app.css:96 (pastilla roja de 10 px, para `.rotation`) y en app.css:279 (tarjeta de riesgo). La segunda gana parcialmente pero hereda `font-style`, `font-weight:600`, `color` y `background` de la primera según orden: fuente de bugs al reestilar.
- P24. CSS muerto (sin uso en TSX): `.traffic*`, `.lamp*` (app.css:137-145), `.rotation*` (app.css:91-98), `.crop-list`, `.crop*` (app.css:128-133), `.tip`, `.tip-row` (app.css:114, 134).
- P25. Radios inconsistentes: 15 px (`--radius`), 12, 10, 10.25, 20.5, 22, 999 px; botones `.btn` 10 px vs chips 12 px vs tarjetas 15 px.
- P26. Tres focos distintos: global #003488 2 px, `.btn` #4464E8 3 px, sliders via `:has`.
- P27. Colores sueltos fuera de tokens (decenas de hex en app.css y en TSX: DataHub.tsx:64-69, Other.tsx:184-195, Home.tsx:95, FieldMap.tsx:89-102, GlobalLayer.tsx:16-18). Las rampas de mapa son datos y deben preservarse.
- P28. Variantes de selección dispares: chip verde relleno, alerta amarilla, riesgo borde verde, field-item borde verde + sombra, tabs azul celeste, toolbar fondo blanco, global-button verde translúcido.
- P29. `font: inherit` repetido (app.css:236, 254, 279) porque el reset de app.css:29 ya lo hace.
- P30. Estados vacíos/carga: solo texto ("Loading…"); sin skeletons; `useRemote` mantiene datos previos al recargar (hooks.ts:11) sin indicador visual de "actualizando".
- P31. `index.html`: sin favicon, sin `<meta name="description">`, sin `theme-color`, sin OG; fuentes de Google con 5 pesos de Inter + Poppins (posible carga innecesaria).

---

## 13. Secciones / trabajo necesario y prioridad

1. **Shell responsivo** (alta): sidebar → barra inferior o drawer en móvil; panel como bottom sheet/pestañas "Panel | Map" en móvil; panel redimensionable/colapsable en tablet; media queries de altura para la sidebar.
2. **Overlays del mapa** (alta): reorganizar en una pila/ grid de esquinas con tamaños relativos; toolbar con scroll horizontal o colapsable; leyenda compacta.
3. **Sistema de botones y controles** (alta): unificar `Btn`, chips, tarjetas seleccionables, botones glass y tabs en un set con hover / active (cambio de color real) / focus-visible / disabled / loading (`aria-busy` + spinner) / selected.
4. **Formularios** (alta): inputs ≥ 44 px y 16 px de fuente en móvil, labels/legends, errores accesibles.
5. **Tablas y gráficas** (media): contenedores con scroll, alturas y ticks responsivos.
6. **Tipografía y contraste** (media): escala mínima legible, `--text-muted` con AA.
7. **Limpieza CSS** (baja): colisión `.risk`, CSS muerto, tokens.

---

## 14. Riesgos y dudas (a confirmar con el usuario)

1. **Patrón móvil**: ¿mapa a pantalla completa con panel como bottom sheet (tipo Google Maps), o pestañas "Panel / Map"? Afecta a `/fields/new` (dibujar) y a `/risks`.
2. **Navegación móvil**: ¿barra inferior con 5 ítems + "More", o menú hamburguesa? Hay 8 destinos + Account.
3. **Botón "Account"** (ui.tsx:31) no hace nada: ¿se oculta, se mantiene como placeholder o tiene destino previsto?
4. **History muestra "HOME"** (Other.tsx:142): ¿intencional (Figma `49-158_historial.png`) o error? ¿Cambiar a "Plot history"?
5. **Fidelidad al Figma**: el diseño es 1280×800 en px fijos. ¿Se permite desviarse (radios, tamaños de fuente 9-10 px, colores de tabs que fallan contraste) para cumplir WCAG AA?
6. ¿Convertir la toolbar del mapa y "Field +" en `<Link>` (mismo destino) es aceptable? No cambia rutas.
7. ¿Se puede introducir alguna librería (p. ej. Radix/Headless para tabs/sheet, o CSS modules/Tailwind) o debe seguir siendo CSS plano en `app.css`?
8. ¿Mantener el idioma inglés de la UI? (Los mensajes del backend y la documentación están en español.)
9. ¿Favicon/logo? No existe ningún recurso gráfico de marca; ¿hay logo en Figma que deba añadirse?
10. Dibujo de parcela en táctil: ¿se acepta añadir "deshacer último punto" y un modo dibujo a pantalla completa en móvil?
11. Los enlaces/controles con problemas listados (P1-P6) se **reportan, no se corrigen** salvo que el usuario lo autorice.
12. **Discrepancia con `repo/CLAUDE.md`**: dice "Frontend: React + Leaflet" y "Apollo Client", pero el código usa **maplibre-gl 4.7.1** y un cliente `fetch` propio (`src/data/api.ts`). El rediseño debe seguir con maplibre salvo indicación contraria. [POR VERIFICAR con el usuario]
13. **Caso de uso**: `CLAUDE.md` describe productores de Durango, México (temporal y riego), pero la UI está en inglés y los modelos son de Weld County, CO. ¿El público objetivo del rediseño es el productor mexicano (implicaría español) o el jurado del hackatón?
14. `CLAUDE.md` pide semáforos agua/suelo/riesgo para rotaciones a 3 años; hoy no hay vista de rotación a 3 años en el frontend (las clases `.traffic*`, `.lamp*`, `.rotation*` de `app.css` son restos sin uso). ¿Entra en el alcance o solo se rediseña lo existente?
