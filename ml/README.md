# Field Shift — evaluación de modelos de IA

Pipeline para comparar algoritmos en los 11 conceptos del proyecto con datos de Weld, Colorado.
El ML entrega insumos al motor de reglas; no lo reemplaza (ver `docs/decisiones.md`).

## Instalación
```powershell
cd ml
# Si el repo está en un disco externo o lento, crea el entorno en el disco interno:
$env:UV_PROJECT_ENVIRONMENT = "$HOME\.venvs\fieldshift-ml"
uv sync --extra dl --extra rl          # todo, con PyTorch CUDA
Copy-Item .env.example .env            # ajustar RESOURCES_DIR y ML_WORK_DIR
uv run python -m ipykernel install --user --name fieldshift-ml --display-name "Field Shift ML"
```
`ML_WORK_DIR` (tablas, resultados, MLflow) también conviene que esté en el disco interno.

## Uso
```powershell
uv run fieldshift-ml status                      # qué conceptos tienen datos
uv run fieldshift-ml build --concept c08a        # arma la tabla de entrenamiento
uv run fieldshift-ml eval  --concept c08a        # entrena y evalúa todos los modelos
uv run fieldshift-ml eval  --concept c01 --tune 30   # con búsqueda de hiperparámetros (Optuna)
uv run fieldshift-ml eval  --all --fast          # prueba rápida de todos los conceptos
uv run fieldshift-ml report                      # tabla comparativa (leaderboard.csv)
uv run mlflow ui --backend-store-uri sqlite:///<ML_WORK_DIR>/mlflow.db
uv run pytest                                    # pruebas
```
**Notebooks (VS Code):** abrir `notebooks/01_evaluacion_modelos.ipynb`, elegir el kernel **Field Shift ML**,
cambiar `CONCEPT` en la primera celda y ejecutar todo. `00_inventario_datos.ipynb` muestra qué hay en disco.
Los notebooks se regeneran con `python scripts/make_notebooks.py`.

## Conceptos
| id | Concepto | Tarea | Datos | Modelo base |
|---|---|---|---|---|
| c01 | Rendimiento por cultivo | regresión | QuickStats + PRISM por condado (8 estados) | promedio histórico del condado |
| c02 | Rotación de cultivos | clasificación | CDL (Weld, un raster por año) | cadena de Markov (`base_markov`) y de 2.º orden (`base_markov2`) |
| c03 | Estrés de vegetación | regresión | ECOSTRESS ESI + NASA POWER + SSURGO | ESI promedio del píxel |
| c04 | Humedad del suelo | pronóstico (4 semanas) | NASA POWER `GWETROOT` (+ lluvia, Tmax y ET como exógenas) | persistencia |
| c05a | Sequía | clasificación | ERA5 mensual 1940–2026 (SPI) | persistencia: P(sequía futura \| ¿sequía ahora?) |
| c05b | Olas de calor | clasificación | NASA POWER diario | persistencia: P(ola próxima \| ¿ola ahora?) |
| c06 | Vulnerabilidad | sin etiqueta | SSURGO + PRISM normales + CDL | índice experto |
| c07 | Duración del ciclo | regresión | avance de cultivos (QuickStats) + PRISM | fórmula de grados-día |
| c08a | Probabilidad de lluvia | clasificación | NASA POWER diario | frecuencia histórica |
| c08b | Lluvia mensual | pronóstico (6 meses) | NASA POWER | climatología |
| c09 | Degradación por monocultivo | — | falta NDVI largo (MODIS/Landsat) | — |
| c10 | Tendencia de mercado | pronóstico (6 meses) | QuickStats precios | persistencia |
| c11 | Salud de parcela | — | falta NDVI largo (MODIS/Landsat) | — |

## Algoritmos
- **Tabulares:** lineal, ridge, elastic net, logística, naive Bayes, k-vecinos, SVM, random forest, extra trees,
  HistGradientBoosting, XGBoost, LightGBM, CatBoost, MLP, proceso gaussiano.
- **Series de tiempo:** AutoARIMA, AutoETS, AutoTheta, Prophet, LightGBM y XGBoost con rezagos, LSTM, GRU,
  N-BEATS, PatchTST.
- **Secuencias (rotación):** LSTM y GRU sobre los cultivos de los años anteriores.
- **Sin etiqueta:** índice experto, PCA, Isolation Forest, k-means, mezcla gaussiana.
- No se usan difusión ni GAN: generan imágenes y ningún concepto lo pide. El aprendizaje por refuerzo
  (PPO/DQN para rotación) queda para cuando el modelo de rendimiento sirva de simulador; sus librerías ya están instaladas.

## Partición y métricas
- 80 % entrenamiento / 20 % prueba. La prueba es el 20 % **final** en el tiempo (años o fechas completas).
  Una partición aleatoria infla los resultados; `--split random` existe solo para comparar y `--split group`
  separa bloques espaciales de 10 km (rotación).
- En pronósticos el origen se mueve por el 20 % final sin reentrenar (cada modelo se ajusta una vez).
- Regresión: R², RMSE, MAE. Clasificación: ROC-AUC, F1 macro, exactitud balanceada, Brier. Pronóstico: MASE, MAE,
  RMSE, sMAPE. Sin etiqueta: estabilidad, silueta, acuerdo con el índice experto.
- `skill` = reducción del error frente al **mejor** modelo base. Si es ≤ 0, conviene la regla simple.
- **Intervalo de confianza al 95 %** de la métrica principal (`<métrica>_lo`, `<métrica>_hi`) con bootstrap por bloques de tiempo: se remuestrean años completos (meses o semanas si la prueba es corta; ventanas en los pronósticos), nunca filas sueltas. Por defecto 200 remuestreos (50 con `--fast`); `--n-boot 0` lo apaga. Si los intervalos de dos modelos se traslapan, la diferencia no es concluyente.
- **`--fast` es solo para probar que todo corre**: no saques conclusiones de esa corrida.
- Bases adicionales por concepto (`Dataset.extra_baselines`): el `skill` se calcula contra la mejor de todas.
- c04 tiene modelos con clima (`lightgbm_exogenas`, `xgboost_exogenas`) al lado de los `*_rezagos`. La regla sin fuga: el clima de una semana futura no se conoce en el origen, así que se usa el de `t+k-horizonte`; el modelo se niega a pronosticar más lejos que ese rezago.
- c02 guarda en su JSON un informe por clase (precisión, recall, F1 y soporte) y reporta también `f1_weighted`.
- Umbrales, climatologías y promedios históricos se calculan solo con los años de entrenamiento.

## Estructura
```
fieldshift_ml/
  config.py        rutas por variables de entorno, zona y puntos de referencia
  io/              lectores de cada fuente (nunca escriben en RESOURCES_DIR)
  features/        grados-día, SPI, olas de calor
  datasets/        un constructor por concepto + validación (pandera) + catálogo (registry.py)
  models/          tabular.py, forecast.py, deep.py
  evaluation/      splits, metrics, runner, tuning (Optuna), tracking (MLflow), explain (SHAP), plots, report
  deploy/          modelos para deploy: registry, train, predict, export, schema, validate, grid
  cli.py
deploy/            manifiestos y fichas de modelos, export.schema.json y exports (los .joblib no se versionan)
notebooks/  scripts/make_notebooks.py  tests/
```
Para añadir un concepto: escribir su constructor en `datasets/` (devuelve un `Dataset`) y registrarlo en
`datasets/registry.py`. Para añadir un algoritmo: una línea en `models/tabular.py` o `models/forecast.py`.

## Modelos para deploy
El backend no ejecuta Python: los modelos corren aquí, por lotes, y el backend importa sus predicciones a PostgreSQL
(`npm run import:predicciones` en `src/backend/`). Tres pasos:
```powershell
uv run fieldshift-ml deploy list                       # qué se despliega por concepto y por qué
uv run fieldshift-ml deploy train                      # entrena con el 100 % de las filas -> ml/deploy/models/<concepto>/<versión>/
uv run fieldshift-ml deploy export --version v1        # predice y escribe ml/deploy/exports/v1/ (valida al terminar)
uv run fieldshift-ml deploy validate deploy/exports/v1 # hashes, esquema y tamaños de rejilla, como los leerá el backend
uv run fieldshift-ml deploy schema                     # regenera deploy/export.schema.json (el backend valida con él)
```
- **Qué se despliega:** el modelo evaluado solo donde le gana con claridad a la mejor base; donde no, se despliega la **regla**
  base y se rotula como tal (c05a persistencia, c08b climatología; c04 PatchTST con ventaja no concluyente). Entre algoritmos
  empatados gana el compacto (c03: XGBoost de 2 MB en lugar de Extra Trees de 626 MB). c09 y c11 no se despliegan (sin datos).
- **Artefactos** por modelo: `model.joblib` (no se versiona; se regenera y su sha256 está en el manifiesto), `manifest.json`
  (algoritmo, variables, filas, ventana, huella de los datos, **métricas de la evaluación 80/20 con intervalo**, versiones de
  paquetes, commit) y `model_card.md` (límites). El modelo se reentrena con todas las filas, así que sus métricas son las de la
  evaluación 80/20, no se recalculan sobre datos que ya vio.
- **Export** (`deploy/exports/<versión>/`): capas de mapa (5 tipos × escenarios de lluvia −50…+50 % y temperatura −2…+4 °C),
  puntos de estrés, series (precios, estadísticas), resúmenes (alertas, humedad, clima) y tablas (rendimiento, rotación, ciclo).
  Todo con `as_of`, fuente, resolución real y bandera `interpolated`. Lo que no existe (erosión, reservas de agua, elevación)
  va en `unavailable`, no se inventa.
- **Los escenarios ¿y si?** mueven las variables de clima que entran al modelo (c05b, c08a, c01); es una *sensibilidad del
  modelo*, no una proyección climática. En c01 la respuesta a la lluvia es inversa en el maíz de riego (asociación, no causa).
- Los constructores de datos aceptan `inference=True` (c05a, c05b, c08a) para conservar los días más recientes, sin etiqueta,
  con exactamente las mismas variables que en el entrenamiento.

## Límites conocidos
- NASA POWER es reanálisis de ~50 km: dos puntos, no parcelas. ERA5 son 30 celdas muy correlacionadas.
- Los rendimientos son de condado; Weld solo aporta ~25 filas por cultivo, por eso se entrena con 8 estados.
- ECOSTRESS cubre 2024–2026: la prueba de c03 son pocos meses.
- CDL es una clasificación de satélite; sus errores entran como ruido en c02 y c06.
- c06 no tiene etiqueta real: necesita revisión agronómica.
- Todo está entrenado en Colorado; para Durango hay que revalidar con datos locales.

## ¿Cuántos años de historia hacen falta? (estudio de ventanas)
```powershell
uv run fieldshift-ml windows --concept c05b --modes recent,old,random --reps 8   # un concepto
uv run fieldshift-ml windows --all --modes recent                                 # todos los medibles
uv run fieldshift-ml windows-report                                               # ml/reports/ventanas.md + gráficas
```
Entrena de nuevo el modelo desplegado y las bases con los **últimos N años** (`recent`), N años de **hace 10+ años** (`old`) o N años
**al azar** (`random`), y lo mide siempre en la **misma prueba reciente** (el último 20 %), con intervalo de confianza y una diferencia
pareada contra «toda la historia». Medibles: c01, c04, c05a, c05b, c07, c08a, c08b y c10 (c02, c03, c06, c09 y c11 no tienen historia suficiente).
Resultados y lectura: [`reports/ventanas.md`](reports/ventanas.md). Código: `fieldshift_ml/evaluation/windows.py` y `windows_report.py`.

## Servicio de predicciones en vivo
```powershell
$env:ML_SERVICE_TOKEN = "un-secreto-largo"      # obligatorio si ML_SERVICE_ENV=production
uv run fieldshift-ml serve                       # http://127.0.0.1:8001  (interno: solo lo llama el backend)
```
`POST /predict {lat, lon, scenario?}` consulta **NASA POWER** (sin llave) para la celda del punto, arma las mismas tablas que el entrenamiento y predice con los
modelos desplegados: c05b (olas de calor, mayo–septiembre), c08a (lluvia mañana), c08b (lluvia mensual) y c04 (humedad a 4 semanas). Cada resultado trae su
fecha de datos y, si no se puede calcular, el motivo. La primera consulta de una celda baja toda la historia (≈ 4 s); las siguientes usan caché en disco y
piden solo los últimos días (≈ 50 ms). Si POWER falla se sirve la última copia marcada `stale`. `GET /health` y `GET /fuentes`.
Variables: `ML_SERVICE_TOKEN`, `ML_SERVICE_ENV` (development | production), `ML_SERVICE_MAX_CONCURRENCY`, `ML_SERVICE_CACHE_TTL_HOURS`, `ML_SERVICE_POWER_URL`.
Lo que llega por cola (ERA5, ECOSTRESS, SMAP) o una vez al año (NASS, CDL) sigue por lotes (`deploy export`).
