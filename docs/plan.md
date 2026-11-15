# Plan de trabajo — Figma a código (Field Shift)

> Creado el 2026-11-15. Estado: **fases 0 a 3 hechas con datos de prueba** (`src/frontend/`). Siguen backend (4), ML (5) e integración (6).

## Estado

- Hecho: las 16 pantallas del Figma revisadas (capturas en `docs/diseno/figma/`, tokens en `docs/diseno/tokens.md`).
- Hecho: frontend React + Vite + TypeScript + MapLibre en `src/frontend/`, interfaz en inglés. Rutas: `/`, `/layers/:tool`
  (temperature, humidity, water, vulnerability), `/history`, `/statistics`, `/data`, `/fields/new`.
- Hecho: todos los datos son variables de prueba en `src/frontend/src/data/mock.ts`; los componentes solo importan de
  `data/index.ts`, que es lo único que cambia al conectar `/graphql`.
- Verificado: compila sin errores y las 12 vistas cargan sin errores de consola (Chrome, 1280×800).
- Pendiente: backend, exportación de ML, Apollo Client, guardar parcela e historial, pruebas, Docker del frontend.
- Para correrlo: `cd src/frontend && npm install && npm run dev`.

## 1. Fuentes revisadas

| Fuente | Qué se revisó | Qué falta |
|---|---|---|
| Figma `2nS935kN9c36rWRDHqbxt7` (página 1) | Estructura completa de capas (16 pantallas de 1280×800 + componentes sueltos) y captura de 10 pantallas, guardadas en `docs/diseno/figma/` | Captura de 6 pantallas y los valores exactos de color, tipografía y espaciado: se alcanzó el límite de llamadas del plan Starter de Figma |
| GitHub `NasaHackathon`, rama `validacion-de-datos`, carpeta `ml/` | `ml/README.md`, `notebooks/01_evaluacion_modelos.ipynb`, `datasets/registry.py` | No se ejecutó nada; no hay modelos entrenados ni resultados en el repo (solo el código para evaluarlos) |

Pantallas con captura: Home, Sequías, Puntos de erosión, Añadir parcela, Ondas de calor, Water balance,
Vulnerabilidad (elevación), Capa de mercado, Estadísticas (humedad), Historial de parcelas.

Pantallas solo con texto de capas (sin captura): Puntos de estrés `46:1533`, Reservas de agua `26:427`,
Humedad `26:486`, Climate prediction Temperature `29:96`, Gráfica de temperatura `30:67`, Climate prediction rain `61:459`.

## 2. Qué muestra el diseño

Todas las pantallas comparten el mismo esqueleto:

- **Barra lateral** (83 px): Home, Plot history, Estadísticas, Datos, Add camp, usuario.
- **Panel izquierdo** (488 px): encabezado de 72 px y tarjetas blancas redondeadas sobre fondo gris claro.
- **Mapa** (709 px, alto completo): imagen satelital, parcela con borde blanco punteado y relleno naranja
  translúcido, linderos vecinos en línea clara, y controles "de vidrio": botón `Parcela +` arriba a la izquierda,
  leyenda vertical arriba a la derecha, zoom +/− a la derecha, y barra inferior con 4 capas
  (termómetro, gota, caja, alerta).

| Pantalla | Panel izquierdo | Mapa |
|---|---|---|
| Home | Sliders "What if?" (precipitación, temperatura, humedad del suelo) + tarjetas de Alertas críticas | Parcela con sensores y leyenda |
| Sequías / Estrés / Erosión | Igual que Home, con la alerta elegida resaltada en amarillo | Mancha de calor difusa (rojo–naranja–amarillo) o marcadores con etiqueta |
| Ondas de calor | Variable, descripción, valor, recomendaciones | Gradiente de temperatura sobre toda la vista, leyenda 0–40 |
| Humedad | Raíz 24 %, superficie 15 %, evaporación 4.8 %, percentil, cultivos recomendados/evitar | Capa de humedad |
| Reservas de agua / Water balance | Agua disponible, demanda, aporte de lluvia, déficit, semáforo de agua | Marcadores de presa, tanque y reservas subterráneas |
| Vulnerabilidad | Variable, descripción, valor, recomendaciones | Gradiente verde–amarillo–rojo **recortado a cada parcela** |
| Climate prediction (temperatura / lluvia) | Riego sí/no, agua disponible, invernadero/campo abierto, maquinaria, máximas/mínimas o lluvia/probabilidad | Capa correspondiente |
| Capa de mercado | Información del cultivo + gráfica "Evolución de precios" por mes | Parcela |
| Añadir parcela | Nombre, descripción, cultivo, meses vacíos, riego, tipo de suelo ("Usar dato satelital"), 4 prioridades en barras verticales | Dibujo del polígono, área calculada |
| Historial | Cultivo sembrado, fecha, descripción, nota nueva | Selector de año `< 2023 >` |
| Estadísticas | Pantalla completa: pestañas Temperature/Humidity y gráfica de líneas 2015–2026 | Sin mapa |

## 3. Modelos de `ml/` y qué capa del diseño alimentan

| Concepto | Pregunta | Pantalla / capa | Resolución real del dato |
|---|---|---|---|
| c05b Olas de calor | ¿Ola de calor en 7 días? | Capa termómetro, Ondas de calor | NASA POWER, ~50 km (un valor por parcela) |
| c04 Humedad del suelo | ¿Agua en raíces en 4 semanas? | Capa gota, Humedad, slider de humedad | NASA POWER `GWETROOT`, ~50 km |
| c05a Sequía | ¿Sequía en 3 meses? | Alerta y mapa de Sequías | ERA5, celdas de ~30 km |
| c03 Estrés de vegetación | ¿Dónde sufren las plantas? | Alerta y mapa de Puntos de estrés | ECOSTRESS ESI, ~70 m (sí varía dentro de la parcela) |
| c06 Vulnerabilidad | ¿Qué zonas son más frágiles? | Capa alerta, Vulnerabilidad | SSURGO + CDL, 30 m o polígonos de suelo |
| c08a / c08b Lluvia | ¿Lloverá? ¿Cuánto en 6 meses? | Climate prediction rain, slider de precipitación | NASA POWER, ~50 km |
| c10 Mercado | ¿Hacia dónde va el precio? | Capa de mercado | Precios por estado/país, sin mapa |
| c02 Rotación, c01 Rendimiento, c07 Ciclo | ¿Qué sigue? ¿Cuánto rinde? ¿Cuántos días? | Tarjeta "Impacto y rotación sugerida", recomendaciones | Insumos del motor de reglas |
| c09, c11 | Degradación, salud a largo plazo | — | Sin datos (falta NDVI largo) |

Sin modelo en `ml/`: **puntos de erosión**, **reservas de agua / water balance** y **elevación**. Necesitan
fuente propia o regla (ver preguntas abiertas).

**Aviso sobre el parecido del mapa.** El Figma dibuja gradientes suaves dentro de una parcela de pocas hectáreas.
Solo ECOSTRESS (c03) y SSURGO/CDL (c06) tienen detalle a esa escala. Temperatura, humedad, lluvia y sequía vienen
de celdas de 30–50 km: dentro de una parcela el valor real es uno solo. Se puede lograr el mismo aspecto visual,
pero en esas capas el gradiente sería interpolación entre celdas vecinas, no variación medida, y la interfaz debe
decirlo (regla del proyecto: no inventar datos).

## 4. Arquitectura propuesta

```
ml/ (Python, por lotes)  ──►  PostgreSQL + PostGIS  ◄──►  NestJS + GraphQL  ◄──►  React
   predicciones por celda        tablas de capas            /graphql                Apollo Client
```

- **Frontend:** React + Vite + TypeScript, Apollo Client, React Router. Mapa con MapLibre GL JS
  (capa de calor nativa, imágenes ráster suavizadas, marcadores HTML). Gráficas con Recharts.
- **Backend:** NestJS + GraphQL code-first, Prisma, PostGIS. REST solo en `/health`.
- **ML:** el backend no ejecuta Python. Un comando de `ml/` escribe las predicciones en la base
  (tabla por capa: celda, fecha, valor) y el backend solo las lee. Evita un segundo servicio en la demo.
- **Contrato de capa** (lo que el backend entrega para pintar):
  `MapLayer { kind, unit, min, max, colorRamp, legend[], grid { bbox, cols, rows, values[] }, points[] { lat, lon, kind, label, severity }, source, resolutionMeters, interpolated }`.
  El frontend aplica la rampa de color, así los sliders repintan sin pedir imágenes nuevas y la leyenda siempre coincide.
- **Sliders "What if?":** `scenario(parcelId, rainPct, tempDelta, soilMoisture)` devuelve capas y alertas recalculadas.

## 5. Fases

| # | Fase | Entregable | Depende de |
|---|---|---|---|
| 0 | Cerrar diseño | Las 6 capturas faltantes y los tokens exactos (colores, tipografía, radios) en `docs/diseno/tokens.md` | Límite de Figma o exportación manual |
| 1 | Base del frontend | Proyecto React, tokens como variables CSS, esqueleto (barra lateral, panel, mapa), rutas | Fase 0 (se puede empezar con valores aproximados) |
| 2 | Mapa igual al Figma | Satélite, parcela punteada, linderos, controles de vidrio, leyenda, barra de capas, zoom; capas con datos de prueba: mancha de calor, gradiente recortado, marcadores | Fase 1 |
| 3 | Pantallas del panel | Home + alertas, Añadir parcela (dibujo y área), las 4 capas, mercado, historial, estadísticas | Fase 1 |
| 4 | Contrato y backend | `docs/api.md`, `docs/modelo-datos.md`, esquema GraphQL, Prisma + PostGIS, resolvers con datos de prueba | Puede ir en paralelo a 2 y 3 |
| 5 | ML a la base | Comando que exporta predicciones por celda; backend sirve capas reales | Modelos evaluados en `ml/` |
| 6 | Integración | Frontend contra `/graphql`, sliders en vivo, estados de carga, vacío y error | Fases 3 y 4 |
| 7 | Revisión | Comparación pantalla por pantalla contra las capturas, pruebas, accesibilidad, Docker | Fase 6 |

Orden recomendado si el tiempo aprieta: fases 1 → 2 → Home/Sequías/Vulnerabilidad/Añadir parcela → 4 con datos de
prueba → 6. Lo demás (mercado, historial, estadísticas, ML real) entra después.

## 6. Diferencias con lo ya decidido en el proyecto

- las reglas del proyecto dice Angular/Ionic + Leaflet; ahora es **React**. Registrado en `docs/decisiones.md`.
  Falta actualizar las reglas del proyecto y el agente `frontend-agricultor`.
- las reglas del proyecto dice "sin machine learning en el núcleo". `ml/README.md` lo mantiene (el ML entrega insumos al motor
  de reglas), pero pintar el mapa directo con predicciones es un uso nuevo.
- Los datos son de Weld, Colorado; el Figma muestra Durango.
- El Figma no tiene el aviso "apoya, no reemplaza la experiencia local" ni la vista de las 3 mejores rotaciones
  con semáforos (solo el componente "Impacto y rotación sugerida"). Ambos son requisitos del reto.
- Textos del Figma por corregir al pasar a código: mezcla de inglés y español, "eroción", "serquia",
  "Tavel de agua", tarjeta "Sequias" duplicada, etiquetas "+4% °C" en el slider de precipitación, leyenda de
  erosión titulada "Zonas de sequía", valores repetidos en la leyenda de temperatura.

## 7. Decisiones del usuario (2026-11-15)

- **Gradientes en capas de 30–50 km:** se pintan interpolados, igual que el Figma, con un aviso visible de que
  el detalle dentro de la parcela es interpolación.
- **Datos de todas las capas (incluidas erosión, reservas de agua y elevación):** los enviará el backend.
  El frontend los deja como variables tipadas con datos de prueba en un solo lugar (`src/frontend/src/data/`),
  y después se sustituyen por las consultas a `/graphql` sin tocar los componentes.
- **Idioma de la interfaz:** todo en inglés. Se traducen los textos en español del Figma y se corrigen sus errores.

## 8. Preguntas abiertas

1. **Mapa base satelital:** se usa Esri World Imagery por variable de entorno (`VITE_BASEMAP_TILES_URL`); falta confirmar su licencia de uso `[POR VERIFICAR]`.
