# c08b · base_climatologia

- **Algoritmo:** Climatología mensual (promedio de cada mes) (regla simple, no aprendida)
- **Versión:** `v1` · entrenado el 2026-11-15 con 1,100 filas hasta 2026-10-01
- **Por qué este:** AutoTheta (0.657) y la climatología (0.686) no se distinguen; se despliega la regla simple
- **Variables:** unique_id, ds, y
- **Evaluación 80/20** (time): mase = 0.686 [0.557, 0.788]; mejor base `base_climatologia` = 0.686; skill = +0.000

## Límites
- Entrenado con datos de Weld, Colorado (EE. UU.); no está validado en otras zonas (por ejemplo, Durango).
- Las variables de clima son reanálisis (NASA POWER, ERA5) de ~25–50 km, no mediciones en la parcela.
- Apoya la decisión del agricultor y del técnico; no la reemplaza.

El modelo desplegado se reentrena con el 100 % de las filas: sus métricas son las de la evaluación 80/20, no se pueden recalcular sobre datos que ya vio.
