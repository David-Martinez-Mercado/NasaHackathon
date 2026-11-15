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
| c02 | Rotación de cultivos | clasificación | CDL 2008–2023 | cadena de Markov |
| c03 | Estrés de vegetación | regresión | ECOSTRESS ESI + NASA POWER + SSURGO | ESI promedio del píxel |
| c04 | Humedad del suelo | pronóstico (4 semanas) | NASA POWER `GWETROOT` | persistencia |
| c05a | Sequía | clasificación | ERA5 mensual 1940–2026 (SPI) | frecuencia histórica |
| c05b | Olas de calor | clasificación | NASA POWER diario | frecuencia histórica |
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
  cli.py
notebooks/  scripts/make_notebooks.py  tests/
```
Para añadir un concepto: escribir su constructor en `datasets/` (devuelve un `Dataset`) y registrarlo en
`datasets/registry.py`. Para añadir un algoritmo: una línea en `models/tabular.py` o `models/forecast.py`.

## Límites conocidos
- NASA POWER es reanálisis de ~50 km: dos puntos, no parcelas. ERA5 son 30 celdas muy correlacionadas.
- Los rendimientos son de condado; Weld solo aporta ~25 filas por cultivo, por eso se entrena con 8 estados.
- ECOSTRESS cubre 2024–2026: la prueba de c03 son pocos meses.
- CDL es una clasificación de satélite; sus errores entran como ruido en c02 y c06.
- c06 no tiene etiqueta real: necesita revisión agronómica.
- Todo está entrenado en Colorado; para Durango hay que revalidar con datos locales.
