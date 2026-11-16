# 07 · Auditoría de fidelidad: rediseño responsivo

- Rama: `feat/rediseno-responsive` (cambios sin commit) comparada con `produccion`, solo en `src/frontend`.
- Contrato: `docs/web/preservacion.json`. Excepciones aplicadas: `00-decisiones.md` (decisiones 1 a 8) y `05-diseno.md` §13 (P4, P5, P6, Hide/Show panel, textos nuevos en inglés para controles nuevos).
- No se auditan, por instrucción: `src/backend/prisma/seed.ts`, `.env.development` y `vite.config.ts`.
- Método: `git diff produccion`, extracción automática de literales (antes y después) en los 14 `.tsx` modificados, comparación de colores de datos en `app.css`, comprobación de ids y anclas, y `tsc --noEmit` (sin errores).

## Veredicto: **BLOQUEADO** (1 bloqueo formal y menor)

Hay un único cambio sin autorización explícita del usuario: se quitaron pesos de fuente en `index.html`. No tiene efecto visible, porque esos pesos no se usan en ningún sitio. Se resuelve con un "sí" del usuario a P31 (fuentes) o revirtiendo una línea. El resto del contrato coincide o cae dentro de las excepciones aprobadas.

## Conteo por bloque del inventario

| Bloque | Total | Idéntico | Cambiado autorizado | Cambiado sin autorizar | Eliminado |
|---|---|---|---|---|---|
| Rutas (`main.tsx`) | 10 | 10 | 0 | 0 | 0 |
| Enlaces (8 de navegación + 2 del cuerpo) | 10 | 10 | 0 | 0 | 0 |
| Anclas | 0 → 1 nueva | — | — | — | — |
| `gotos_js` | 7 | 4 | 3 (P4, pasan a `Link` con el mismo destino) | 0 | 0 |
| Controles de estado | 19 | 19 (mismos handlers, solo cambia ARIA o marcado) | 0 | 0 | 0 |
| Formularios y mutaciones | 5 | 5 | 0 | 0 | 0 |
| Consultas GraphQL | 16 | 16 (`src/data/` sin cambios) | 0 | 0 | 0 |
| Logos | 2 | 1 | 1 (tamaño del icono House, decisión 2) | 0 | 0 |
| Meta (`index.html`) | 6 | 4 | 1 (`viewport-fit=cover`) | **1 (fuentes)** | 0 |
| Textos legales (7) | 7 | 7 | 0 | 0 | 0 |
| Textos i18n (`i18n.ts`, `risk.tsx`, traducciones de `LiveForecast`) | todos | todos (archivos sin cambios o con cambios fuera de los textos) | 0 | 0 | 0 |
| Colores de datos | 9 grupos | 9 | 0 | 0 | 0 |

Literales de texto: los 14 `.tsx` modificados no pierden ningún literal de interfaz. Los únicos "desaparecidos" son cambios de comillas o de forma: `'Saving…'` pasa a `loadingLabel="Saving…"`; `'Update'`, `'Save'` y `'Save field'` pasan a ser hijos JSX; `Temperature` y `Humidity` pasan a `STAT_TABS`; el texto de Home se conserva y "Add field" queda enlazado (P5).

## Tabla de diferencias

| # | Elemento | Antes | Después | Clase | Estado |
|---|---|---|---|---|---|
| 1 | Fuentes de Google | Inter 300/400/500/600/700 y Poppins 400/500 | Inter 400/500/600/700 y Poppins 400 (`index.html:9`) | Cambiado | **BLOQUEO** (ver B1) |
| 2 | Viewport | `width=device-width, initial-scale=1.0` | `… , viewport-fit=cover` (`index.html:5`) | Cambiado | Autorizado implícitamente por la decisión 1 (la hoja inferior necesita `safe-area-inset`). Confirmar |
| 3 | Logo House (`.nav-home`) | 32 px, stroke 2.4 | 28 px, stroke 2.2 (`ui.tsx:41`); mismo icono, misma ubicación, `aria-label="Home"` conservado, proporción 1:1 | Cambiado | Autorizado (decisión 2: tamaños; 05 §3 R3) |
| 4 | Marca "HOME" | `#23654E`, 700, `margin-left:-22px` | `var(--brand)` = `#23654e`, 700, sin margen negativo (`app.css:346`) | Cambiado | Autorizado (§13) |
| 5 | Botón "Field" del mapa | `<button onClick={navigate('/fields/new')}>` | `<Link to="/fields/new">` (`FieldMap.tsx:281`) | Cambiado | Autorizado (P4) |
| 6 | Barra de capas | `navigate(cfg.tool === tool ? '/' : '/layers/'+tool)` | `<Link to={active ? '/' : '/layers/'+tool}>` con `aria-current` (`FieldMap.tsx:390`) | Cambiado | Autorizado (P4); misma lógica de destino |
| 7 | "Add your first field" | `button.link` con `navigate('/fields/new')` | `<Link className="link" to="/fields/new">` (`Fields.tsx:64`) | Cambiado | Autorizado (P4) |
| 8 | Texto "Add field" en Home | texto plano | mismo texto, con "Add field" enlazado a `/fields/new` (`Home.tsx:53`) | Cambiado | Autorizado (P5) |
| 9 | Selector de año | sin límites | límites de 1950 (el `@Min(1950)` del backend) al año actual, ampliados si ya hay registros fuera del rango (`Other.tsx:97,160-162`; botones deshabilitados en `FieldMap.tsx:365,372`) | Cambiado | Autorizado (P6) |
| 10 | Estado del dibujo en "Add a field" | pie de la primera tarjeta del formulario | franja `panel-status` bajo la cabecera; textos idénticos, botón Clear con el mismo handler `setDraft([])` (`Other.tsx:68-80`) | Cambiado (ubicación) | Autorizado (05 §15, fase 4, hoja) |
| 11 | Navegación en modo hoja | barra lateral | barra inferior con Home, My fields, Risks y Crops, y menú More con Plot history, Statistics, Data, Add field y Account; mismos `to`, labels e iconos (`ui.tsx:110-152`) | Cambiado (presentación) | Autorizado (decisión 1, §13) |
| 12 | Nota de capa interpolada | siempre visible | visible; tras el botón "About this layer" solo si el mapa mide ≤ 480 px (`FieldMap.tsx:330`, `app.css:863-867`) | Cambiado (presentación) | Texto idéntico. Ver N7 |
| 13 | Leyenda de puntos | `div` | `<details>` abierto junto al panel y plegado en modo hoja | Cambiado (presentación) | Mismos ítems |
| 14 | Etiqueta oscura de pines | `rgba(30,30,30,.55)` | `rgba(30,30,30,.7)` (`app.css:100,923`) | Cambiado | Autorizado (decisión 2, AA; 02 §4 fila 26: etiqueta de UI, no dato) |
| 15 | Gráficas | ticks 9-10 px (Economy), 14 px y stroke 5 (Statistics) | ticks de 12 px; Statistics 12/14 px y stroke 3/5 según el ancho; mismos colores de serie | Cambiado (tamaño) | Autorizado (decisión 2; 05 §6) |
| 16 | Lista "Your fields" | `role=listbox/option` | `ul` con botones y `aria-current`; mismo `selectField` | Cambiado (ARIA) | Autorizado (§13: solo marcado ARIA) |
| 17 | Pestañas de Statistics y chips | `aria-pressed` | `role=tab` / `role=radiogroup`; mismos `setTab`, `setPicked`, `setView` | Cambiado (ARIA) | Autorizado |

Lo nuevo, a confirmar (todo en inglés y solo en controles nuevos):

| # | Nuevo | Dónde |
|---|---|---|
| N1 | Enlace "Skip to panel" → `#panel` | `main.tsx:41` (el ancla resuelve a `ui.tsx:256`) |
| N2 | Botones "Hide panel" y "Show panel" | `ui.tsx:277`, `FieldMap.tsx:275` (aprobados en 00 §8) |
| N3 | Asa de la hoja con "Expand panel" / "Collapse panel" y avisos "Panel expanded" / "Panel half open" / "Panel collapsed" | `ui.tsx:226-266` |
| N4 | Botón "More"; etiqueta visible "Home" en la barra inferior; texto visible "Account" en More, que sigue sin acción (decisión 7) | `ui.tsx:117-150` |
| N5 | Botón "Field details" (solo en modo hoja, con contorno de 3 vértices o más) | `Other.tsx:79` |
| N6 | `aria-valuetext` "{n} out of 100" y número visible en las barras de prioridad | `ui.tsx` `PriorityBar` |
| N7 | Botón "About this layer" (no figura en la lista de §13, pero es un control nuevo) | `FieldMap.tsx:330` |
| N8 | `aria-label` de las regiones de tabla ("Yield", "What farmers plant next", "Days from planting to harvest"), que reutilizan los títulos de las tarjetas, y `data-label` en las celdas, que reutiliza los `<th>` | `DataHub.tsx:83,222,236` |
| N9 | Spinners y estados `aria-busy`, check de seleccionado e iconos en `Notice`, sin texto nuevo | varios |

## Comprobaciones

- **Rutas:** las 10 coinciden, incluido `*` → `Navigate to="/" replace` y el `Navigate` de `Layers.tsx` para un `:tool` no válido.
- **Navegaciones JS que siguen como antes:** `navigate(-1)` (`ui.tsx:272`), `navigate('/fields')` tras crear la parcela (`Other.tsx:59`, en el mismo orden: `refreshFields` → `selectField` → `setDraft([])` → `navigate`), `setParams(..., { replace: true })` (`Home.tsx`).
- **Mutaciones:** `createField` con `retryKey` (`claveIdempotencia`) se renueva tras el éxito; `updateField` en My fields y en Crops; `setFieldCrop` por `useSwitchCrop`; `saveHistory`. `src/data/` no tiene cambios. El estado `saving` ahora bloquea el botón con `loading` (`onClick` pasa a `undefined` y se pone `aria-disabled`), sin riesgo de doble envío.
- **Anclas e ids:** `#panel` → `main#panel` (presente en todas las páginas, porque todas usan `Panel`); `aria-controls` `panel-body`, `nav-more`, `map-note-body` y `stats-panel` existen.
- **Mapa único:** `<FieldMap />` sigue fuera de `<Routes>` (`main.tsx:55`) y nunca se monta de forma condicional. En Statistics se oculta con `hidden`, igual que antes. Al ocultar el panel solo se aplica `display:none` al `<main>`, sin desmontarlo.
- **Colores de datos:** son idénticos la parcela `#E8A531` al 60 % con borde blanco punteado, el `--scale` por defecto, los gradientes de los sliders de lluvia y calor, `alert-bar`, `moisture-bar`, los niveles low/medium/high/none, los factores y puntuaciones, los pines (cabezas) y las series `#4464E8`, `#34B3F1` y `#292D30`. Las rampas de `GlobalLayer.tsx` no cambian. La leyenda horizontal solo rota la misma rampa (`rampCss(ramp, '90deg')`).
- **i18n:** `src/data/i18n.ts`, `src/components/risk.tsx` y las traducciones de `LiveForecast.tsx:10-45` no cambian.
- **Información y textos legales:** los 7 avisos legales y la información clave (presets, umbrales, valores por defecto, opciones de formulario) siguen intactos.
- **Dependencias:** `package.json` no cambia. `tsc --noEmit` termina sin errores.

## Bloqueos

**B1. Pesos de fuente eliminados.** Archivo `src/frontend/index.html:9`.
- Antes: `Inter:wght@300;400;500;600;700&family=Poppins:wght@400;500`.
- Después: `Inter:wght@400;500;600;700&family=Poppins:wght@400`.
- `preservacion.json` → `favicons_meta.fuentes` lista "Inter 300/400/500/600/700, Poppins 400/500".
- La justificación está en `05-diseno.md` §7.1 (P31), pero P31 figura como "pendiente de confirmación" en 05 §15 y no está en `00-decisiones.md`.
- Impacto real: ninguno. Ni el CSS de `produccion` ni el actual usan `font-weight: 300`, y Poppins solo se usa a 400.
- Para levantar el bloqueo: el usuario confirma P31 o se restaura la URL original.

## Observaciones (no bloquean)

- Comentario desactualizado en `AppContext.tsx:28`: dice que los límites del año "not set by any page yet", pero `History` ya los define (`Other.tsx:162`).
- Las chips Temperature/Rain de Data → Climate (`DataHub.tsx:116`) no tienen `labelledBy` ni `label`: el `radiogroup` queda sin nombre accesible. Es un tema de accesibilidad, no de fidelidad.
- Siguen igual, como pide la decisión 7: el botón Account sin acción, el título "HOME" con Back en Plot history y `navigate(-1)` en Home.
