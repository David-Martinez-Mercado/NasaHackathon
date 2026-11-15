# Bitácora de decisiones técnicas

> Cada agente añade al final; nunca se borra.

## 2026-11-13 — Se elimina el módulo de dron
- El proyecto ya no usa imágenes de dron. Se borró el agente `analista-dron`, la carpeta `RecursosDrone/`,
  el endpoint `POST /rest/dron/imagen`, la query `analisisDron`, la tabla `AnalisisDron` y el `StorageService` de subidas.
- Única excepción REST: `GET /health`.

## 2026-11-13 — Recursos en disco externo
- Los recursos viven en `F:\FieldShift-Recursos\` (`NASA\`, `Externos\`, `enlaces.md`), fuera del repo.
- El código nunca usa esa ruta; en el servidor se configura con la variable de entorno `RESOURCES_DIR`.
- `RecursosNASA/` y `RecursosExternos/` del repo quedan obsoletas.

## 2026-11-13 — Zona de datos: condado de Weld, Colorado (EE. UU.)
- La mitad de los recursos del reto (Web Soil Survey, SSURGO, CropScape, PRISM, NAIP, NLCD, LANDFIRE, OpenET,
  NWIS, QuickStats, AMS, CoCoRaHS) solo cubren EE. UU. Por decisión del usuario se usa la localidad con
  cobertura de los 28 recursos, y lo satelital se recorta a la misma zona.
- Zona: condado de Weld, CO (FIPS 08123); recuadro lon −105.06 a −103.70, lat 39.91 a 41.00.
  Puntos: Greeley (riego, 40.42, −104.71) y Nunn/CPER de USDA-ARS (temporal, 40.82, −104.75).
- Detalle de versiones y estado de cada recurso: `F:\FieldShift-Recursos\enlaces.md`.
- Afecta a: ingeniero-datos (fuentes y coordenadas), agronomo-reglas (cultivos de Weld), frontend (mapa inicial),
  pitch (caso de uso). Pendiente que el equipo decida si el caso de uso del pitch sigue siendo Durango.

## 2026-11-14 — Pipeline de evaluación de modelos de IA (`ml/`)
- Se añade el paquete Python `ml/` (separado del backend) para comparar algoritmos en los 11 conceptos de IA
  con 80 % entrenamiento / 20 % prueba. Ver `ml/README.md`.
- El ML **entrega insumos** al motor de reglas (rendimiento esperado, riesgo de sequía y calor, humedad, estrés);
  la recomendación la sigue dando y explicando el motor. "Sin ML en el núcleo" se mantiene.
- La prueba es siempre el 20 % **final** en el tiempo. La partición aleatoria infla los resultados y solo queda
  como opción para comparar. Todo modelo se reporta contra un modelo base ingenuo.
- Herramientas: uv, Polars + Parquet, DuckDB (QuickStats), scikit-learn, XGBoost, LightGBM, CatBoost, statsforecast,
  Prophet, mlforecast, neuralforecast (PyTorch CUDA), Optuna, MLflow, pandera, SHAP.
- Recurso nuevo: `Externos\24-Census-Condados` (límites de condado, dominio público) para promediar PRISM por condado.
- Sin datos todavía: SMAP, MODIS NDVI, SRTM, IMERG, GLDAS/NLDAS y OpenET. Por eso el concepto 4 usa `GWETROOT` de
  NASA POWER, la pendiente del concepto 6 sale de SSURGO, y los conceptos 9 y 11 quedan pendientes.
- Afecta a: ingeniero-ia e ingeniero-datos (insumos disponibles), agronomo-reglas (qué pronósticos puede usar el motor).

## 2026-11-15 — Revisión del pipeline de ML: bases más exigentes, sin fugas, con intervalos
Aplicada a c02, c03, c04, c05a, c05b y c08b (`ml/`). Para el motor de reglas y quien use estos números:
- **Los skills bajan, y es lo correcto.** Cada concepto se compara con una base más fuerte: c05a y c05b con
  persistencia (`base_persistencia` = P(evento futuro | estado actual), aprendida solo con el entrenamiento) y c02 con
  una cadena de Markov de 2.º orden además de la de 1.º. Antes la sequía y las olas de calor solo se comparaban con la
  frecuencia histórica. El `skill` se calcula contra la mejor base de cada concepto.
- **Sequía a 3 meses (c05a): no hay modelo útil.** El mejor (k-vecinos, ROC-AUC 0.567 [0.51–0.62]) no supera a la
  persistencia (0.539 [0.47–0.59]). El motor no debe depender de un pronóstico de sequía a 3 meses de este modelo.
- **Olas de calor (c05b): sigue siendo útil.** Logística ROC-AUC 0.871 [0.81–0.92] contra 0.557 de la persistencia.
- **Corrección de una fuga en c05b:** `in_wave` (ya calculado) marca los primeros días de una ola cuando se sabe que
  durará 3 días, o sea que mira el futuro; no se puede usar como "estado actual". El estado actual (`heatwave_now`)
  usa solo días pasados (`trailing_run_at_least`).
- **c03 (estrés):** `esi_hist` ya no incluye la etiqueta de la propia fila en entrenamiento (media dejando fuera la
  fecha propia; sin otras fechas, media global de entrenamiento) y la hora local usa America/Denver con horario de
  verano (antes UTC-7 fijo). Resultado casi igual (R² 0.251 contra 0.255): la fuga no inflaba el resultado.
  [POR VERIFICAR] que las marcas de tiempo del nombre de archivo de ECOSTRESS son UTC: los GeoTIFF no traen etiqueta
  de hora.
- **c04 (humedad):** nuevos `lightgbm_exogenas` y `xgboost_exogenas` con lluvia, Tmax y ET semanales desplazadas al menos
  el horizonte (4 semanas); sin clima del futuro y se niegan a pronosticar más lejos que el rezago. **No mejoran** a
  los `*_rezagos` (MASE 0.407 y 0.412 contra 0.414 y 0.406): con ese rezago el clima no añade información sobre la
  propia humedad. El mejor sigue siendo PatchTST (0.353 [0.31–0.41]) y su intervalo se traslapa con el de la
  persistencia (0.396 [0.35–0.44]): la ventaja no es concluyente.
- **c08b (lluvia mensual):** AutoTheta (0.657 [0.53–0.77]) y la climatología (0.686 [0.56–0.79]) no se distinguen.
  No hay ningún índice ENSO/ONI en `F:\FieldShift-Recursos` (se buscó por nombre y en `enlaces.md`); no se añadieron fuentes.
- **Intervalos de confianza al 95 %** (`<métrica>_lo`, `<métrica>_hi`) con bootstrap por bloques de tiempo (años; meses o
  semanas si la prueba es corta; ventanas en pronósticos). `--n-boot 0` los apaga. Con menos de 3 periodos de prueba (c02:
  2 años) se usan bloques espaciales de 10 km y la columna `note` lo avisa: ese intervalo no refleja la variación entre años.
- **c02:** `f1_weighted` y un informe por clase (precisión, recall, F1, soporte) en el JSON de resultados. F1 macro 0.31
  contra F1 ponderado 0.63: las clases pequeñas (sorgo, mijo) casi no se predicen. El texto "CDL 2008–2025" era incorrecto:
  hay 16 años (2008–2023).
- El notebook avisa que `FAST = True` es solo para probar y no para sacar conclusiones.
- Afecta a: agronomo-reglas e ingeniero-ia (qué pronósticos del ML pueden usar y con qué confianza).

## 2026-11-15 — Arranca el backend; el frontend pasa a React
- **Frontend: React** (antes Angular/Ionic). Se actualizaron las reglas del proyecto, `README.md` y el agente `frontend-agricultor`
  (Apollo Client en lugar de Apollo Angular). El resto del stack no cambia: NestJS + GraphQL code-first (Apollo),
  PostgreSQL 16 + PostGIS, Prisma.
- **Carpetas:** el servidor vive en `src/backend/` y el cliente en `src/frontend/` (estructura de las reglas del proyecto, la misma que usa
  la rama `frontend`, para que las ramas se unan sin conflictos de rutas); `ml/` queda aparte en la raíz.
- **Versiones fijadas:** NestJS 11, `@nestjs/graphql` 13 con Apollo Server 5 (requiere `@as-integrations/express5`),
  Prisma 6, TypeScript 5.9 y Node 20 o superior. Existen NestJS 12 y Prisma 7, pero no se usan aún: no se verificó que
  funcionen juntos.
- **Motor y datos como puertos:** `src/backend/src/motor/motor.port.ts` y `src/backend/src/datos/datos.port.ts` definen lo que el
  backend espera de `agronomo-reglas` e `ingeniero-datos`. Mientras no existan, responden `NO_IMPLEMENTADO` o
  `FUENTE_NO_DISPONIBLE`; el backend nunca inventa recomendaciones.
- **`ParcelaContexto` [POR VERIFICAR]:** el backend solo transporta el contexto; su formato lo debe fijar
  `docs/contrato-datos.md`, que aún no existe.
- **Rangos de los sliders (supuesto):** lluvia de −100 a +100 %, temperatura de −10 a +10 °C. Ajustar con el frontend.
- **`guardarEscenario` calcula en el servidor** con el motor; no acepta resultados enviados por el cliente.
- **Sin autenticación todavía:** quien conozca el UUID de una parcela puede leerla. Decidir antes de publicar la demo.
- **Tabla `Cultivo`:** solo nombre y familia botánica; los parámetros agronómicos los aporta `agronomo-reglas` con fuente.
- Afecta a: agronomo-reglas, ingeniero-datos, ingeniero-ia, frontend-agricultor, devops-despliegue (añadir el backend al compose).

## 2026-11-15 — Backend v2: transacciones, predicciones de ml/ en PostgreSQL y rama `backend`
- **Rama `backend`** con `ml/` (modelos para deploy) y `src/backend/`. No se fusionó `frontend` ni se tocó `main`.
  los archivos del asistente no se versionan.
- **Predicciones por lotes:** `ml/` exporta (`fieldshift-ml deploy export`, JSON versionado con sha256 y esquema) y el backend las
  importa con `npm run import:predicciones` en **una transacción**; no hay Python en producción. Una sola versión activa
  (índice único parcial). Reimportar igual = no-op; misma versión con otro contenido = error.
- **Transacciones:** `TransaccionService.ejecutar` (transacción interactiva de Prisma, reintentos ante `P2034`/`40001`/`40P01`,
  tiempo límite). `crearParcela` (parcela + preferencias + historial) es atómica e idempotente (`claveIdempotencia`);
  `actualizarParcela` y `eliminarParcela` usan bloqueo optimista (`version` → `CONFLICTO_VERSION`).
- **Modelo ampliado** para el formulario del frontend: sistema de riego (4), tipo de suelo, meses vacíos, 4 prioridades 0–100,
  historial por año, descripción y cultivo actual. Los nombres GraphQL van en español; la tabla de equivalencias con los tipos del
  frontend está en `docs/api.md`.
- **Pruebas con base real sin Docker:** PGlite + PostGIS expuesto por socket (`@electric-sql/pglite-socket`) y Prisma con
  `connection_limit=1` (`npm run test:int`). Cubre rollback, idempotencia, concurrencia, bloqueo optimista, importación atómica y consultas.
  Limitación: PGlite no es el servidor PostgreSQL de producción; la primera ejecución sobre PostgreSQL 16 real será en el servidor.
- **Qué NO hay (se declara en `datosNoDisponibles`):** erosión, reservas de agua / balance hídrico, elevación. `RotationImpact`
  depende del motor de reglas, aún no conectado.
- **Cuidado con los sliders:** los escenarios de lluvia/temperatura son la **sensibilidad del modelo** (c01, c05b, c08a), no una proyección
  climática; las capas de temperatura, humedad y lluvia son interpolación de 2 puntos de ~50 km y se marcan `interpolada`.
  c05a, c08b y c04 se despliegan como reglas base porque ningún modelo las supera con claridad.
- **Sin autenticación todavía** (sigue pendiente antes de publicar). Datos de Weld, CO (no Durango).
- Afecta a: frontend-agricultor (sustituir `data/index.ts` por `docs/frontend-queries.graphql`), devops-despliegue (compose y migraciones),
  agronomo-reglas, ingeniero-ia.


## 2026-11-15 — Frontend en React y diseño tomado de Figma
- Por decisión del usuario el frontend será **React** (antes Angular/Ionic). Backend sin cambios: NestJS + GraphQL + PostgreSQL.
- El diseño de referencia es el archivo de Figma `2nS935kN9c36rWRDHqbxt7`; capturas en `docs/diseno/figma/`.
  El mapa debe verse lo más parecido posible a ese diseño.
- Las predicciones de `ml/` (repo `NasaHackathon`, rama `validacion-de-datos`) alimentarán los colores de las capas del mapa.
- Propuesto, pendiente de aprobación (ver `docs/plan.md`): MapLibre GL JS en lugar de Leaflet, y predicciones de ML
  exportadas por lotes a PostGIS en lugar de un servicio Python en línea.
- Afecta a: frontend-agricultor (cambia de framework), backend-api (contrato de capas del mapa), ingeniero-datos,
  devops-despliegue (imagen del frontend). Pendiente actualizar las reglas del proyecto y la definición del agente frontend.

## 2026-11-15 — Frontend conectado al backend (`/graphql`)
- La rama `frontend` se integró en `backend`. `src/frontend/src/data/index.ts` ya no lee `mock.ts` (borrado): cada función es una
  consulta o mutación de `docs/frontend-queries.graphql` (cliente `fetch` sencillo en `data/api.ts`, sin Apollo Client por ahora;
  `VITE_API_URL`). Los componentes siguen importando solo de `data/`.
- **Conectado:** capas del mapa con los sliders (con debounce de 300 ms), alertas de sequía y estrés, humedad, resumen de clima,
  precios de mercado (con pronóstico punteado), estadísticas, parcelas, historial por año y "Add field" (`crearParcela` atómica e
  idempotente, polígono dibujado en el mapa).
- **Se quitó lo que no tiene dato (no se inventa):** sensores, puntos de erosión y de reservas de agua, balance hídrico, consejos de
  cultivos y recomendaciones por capa, impacto de rotación (depende del motor de reglas), vecinos del mapa y el slider de humedad
  del suelo (ninguna capa lo usa). Se muestran avisos "no disponible".
- **La capa "Temperature" ahora es riesgo de ola de calor (%)** (modelo c05b), no grados; la de lluvia es probabilidad (%).
  Los sliders solo repintan esas dos capas y se rotula que son sensibilidad del modelo, no proyección climática.
- Los textos que vienen del backend (notas, definiciones, fuentes) están en español y la interfaz en inglés: pendiente i18n.
- Sin autenticación: el frontend lista todas las parcelas del servidor.

## 2026-11-15 — Sugerencias de cultivo, "My fields" y colores del mapa
- **`sugerenciasCultivo(parcelaId)`** (backend): ordena otros cultivos con 40 % rotación observada (tabla c02: qué sembró Weld después del cultivo
  base), 30 % precio esperado (series c10) y 30 % cambio de familia botánica (regla general). Los componentes sin dato se omiten y no se
  inventan. **No usa agua, suelo ni maquinaria** (no hay parámetros agronómicos por cultivo): sigue pendiente el motor de reglas de `agronomo-reglas`.
  Se devuelven datos y no texto: la interfaz arma las razones. El puntaje es un orden relativo, no una probabilidad de éxito.
- **`actualizarParcela` acepta `preferencias`** y guarda nombre, cultivo y preferencias en una sola transacción (bloqueo optimista por `version`).
- **Frontend:** nueva pantalla "My fields" (ver y editar lo capturado con Modify / Save / Cancel; los botones se ven grises y no responden cuando
  la acción no es posible) y botón "Switch to <cultivo>" en las sugerencias (Home, Humidity y My fields). El formulario de alta y el de edición
  comparten el mismo componente. El contorno no se edita (para redibujarlo hay que agregar la parcela de nuevo).
- **Colores:** ninguna capa difumina sus valores bajos hacia transparente (eso hacía ver la humedad baja en olivo en vez de rojo) y el naranja
  de la parcela ya no tiñe la capa; la de lluvia usa una rampa azul clara; los sliders de lluvia y temperatura tienen escala con sentido
  (seco→mojado, frío→calor). Con datos de ~50 km la capa se ve casi uniforme a escala de parcela: es la resolución real, no un error.

## 2026-11-15 — Evaluación con todos los modelos, riesgos de zona y prioridades del agricultor
- **`sugerenciasCultivo`** ahora puntúa cada cultivo con 5 criterios: ingreso (precio c10 + rendimiento c01), suelo (nitrógeno + cambio de familia),
  agua, erosión y práctica local (c02). Los pesos son las 4 prioridades del agricultor, **ajustadas por los riesgos de la zona**: más peso al agua si hay
  sequía o suelo seco, menos si hay riego; más peso a la erosión si la vulnerabilidad es alta. Un criterio sin dato cuenta como neutro (50) y se marca
  `sinDato`: omitirlo inflaba a los cultivos de los que se sabe menos. Se pueden probar prioridades sin guardarlas (`prioridades` opcional).
- **`riesgosParcela`:** 6 riesgos en el punto de la parcela. Umbrales provisionales ([POR VERIFICAR] con el agrónomo): calor 20/40 %, sequía 25/50 %,
  vulnerabilidad 33/66, humedad por percentil (≤25 alto), estrés = puntos críticos de c03 en 10 km.
- **`rasgos-cultivo.json`:** clasificación general (demanda de agua, nitrógeno, cobertura del suelo) de 13 cultivos, en datos y no en código, marcada
  `verificado:false`. Es conocimiento agronómico general, no un dato medido: `agronomo-reglas` debe sustituirla por valores con fuente (INIFAP/FAO).
- **Frontend:** nuevas pantallas Risks (semáforos con ícono y palabra) y Crops (prioridades con presets, comparación contra el cultivo actual,
  desglose por criterio y "Why?"); Data ahora tiene Economy (precios y rendimiento), Climate, Models (cada modelo con su métrica, intervalo y límites)
  y Local practice (rotación c02 y ciclo c07); capas de lluvia y sequía en la barra del mapa; resumen de riesgos en Home.
- **Sigue pendiente:** agua disponible y maquinaria por cultivo, ciclo de 3 años, erosión y reservas de agua (sin dato).

