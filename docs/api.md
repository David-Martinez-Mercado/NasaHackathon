# API GraphQL

Endpoint `POST /graphql` (única excepción REST: `GET /health`). Esquema completo y siempre al día en
[`schema.graphql`](schema.graphql) (se regenera con `npm run schema` en `src/backend/`).
En desarrollo: `http://localhost:3000/graphql` abre el Sandbox de Apollo. En producción no hay Sandbox ni introspección.

## Estado de las operaciones
| Operación | Estado | Nota |
|---|---|---|
| `salud` | listo | Servidor, base de datos, PostGIS, motor, datos y versión de predicciones cargada |
| `cultivos` | listo | Catálogo (sin parámetros agronómicos hasta que `agronomo-reglas` los entregue) |
| `crearParcela` | listo, **transaccional** | Parcela + preferencias + historial en una transacción; `claveIdempotencia` permite reintentar sin duplicar |
| `actualizarParcela`, `eliminarParcela` | listo, **bloqueo optimista** | Exigen la `version` que el cliente vio; si cambió, `CONFLICTO_VERSION`. `actualizarParcela` acepta `preferencias` y las guarda en la misma transacción que el nombre y el cultivo |
| `parcela`, `parcelas` | listo | Con preferencias e historial (sin una consulta por parcela) |
| `guardarPreferencias`, `guardarHistorial`, `eliminarHistorial`, `historial` | listo | Reemplazan atómicamente; validan cultivos y reglas entre campos |
| `capa`, `puntos`, `series`, `tablaModelo`, `alertas`, `resumenHumedad`, `resumenClima`, `estadoPredicciones` | listo | Salen de las predicciones de `ml/` ya importadas a PostgreSQL |
| `sugerenciasCultivo(parcelaId, prioridades?)` | listo | Cultivos evaluados con los modelos de ml/ (rotación c02, precio c10, rendimiento c01, ciclo c07), los riesgos de la zona y las 4 prioridades del agricultor (las guardadas o las que se pasen para probar sin guardar). Devuelve el puntaje desglosado por criterio. Las clasificaciones de agua, nitrógeno y cobertura (`rasgos-cultivo.json`) son generales y `rasgosVerificados=false` |
| `riesgosParcela(parcelaId)` | listo | Calor (c05b), sequía (c05a), humedad (c04), estrés cercano (c03), vulnerabilidad (c06) y lluvia (c08b) en el punto de la parcela, con nivel BAJO/MEDIO/ALTO por umbrales provisionales |
| `datosNoDisponibles` | listo | Lo que el frontend pide pero no hay modelo ni dato (erosión, reservas de agua, elevación) |
| `recomendaciones`, `simularEscenario` | listo, esperan al motor | `NO_IMPLEMENTADO` / `FUENTE_NO_DISPONIBLE` hasta conectar `motor/` y `datos/` |
| `guardarEscenario`, `escenarios` | listo, esperan al motor | El resultado lo calcula el servidor; el cliente no manda resultados |
| `contextoParcela`, `explicarRotacion`, `preguntarAsistente` | pendiente | Dependen de `docs/contrato-datos.md` y del módulo `ia/` |

Las operaciones listas para el frontend (las que reemplazan a `src/data/index.ts`) están en
[`frontend-queries.graphql`](frontend-queries.graphql).

## Equivalencia con los tipos del frontend (`src/frontend/src/data/types.ts`, rama `frontend`)
| Frontend (inglés) | API (español) | Notas |
|---|---|---|
| `Field` | `Parcela` + `Preferencias` + `historial` | riego → `preferencias.sistemaRiego` (`TEMPORAL`, `GRAVEDAD`, `ASPERSION`, `GOTEO`); suelo → `tipoSuelo`; prioridades 0–100 en `preferencias.prioridades` |
| `PlotRecord` | `RegistroHistorial` | `anio`, `cultivo`, `fechaSiembra`, `descripcion` |
| `GridLayer` | `capa(tipo, escenario)` | `bbox`, `columnas`, `filas`, `valores` (fila a fila desde el norte, `null` = sin dato), `rampa`, `leyenda`, `interpolada` |
| `MapPoint` | `puntos(tipo: ESTRES)` | `severidad` ALTA/MEDIA |
| `AlertSummary` | `alertas` | Cada una trae su `definicion` |
| `HumiditySummary`, `ClimatePrediction` | `resumenHumedad`, `resumenClima` | Climatología del próximo mes, **no** un pronóstico |
| series de mercado y estadísticas | `series(prefijo: "market:" / "statistics:")` | Los puntos de pronóstico llevan `pronostico: true` |
| `WaterBalance`, erosión, elevación | `datosNoDisponibles` | No hay modelo ni dato: no se inventan |
| `RotationImpact` | `recomendaciones` | Lo calcula el motor de reglas (pendiente) |

## Sliders: cómo funciona `capa(tipo, escenario)`
`ml/` calcula una rejilla por cada combinación de lluvia (−50…+50 %) y temperatura (−2…+4 °C). El servidor devuelve la
exacta o **interpola** (bilineal) entre las vecinas; `escenario.interpolado` y `escenario.recortado` lo avisan, y
`escenario.aplica = false` en las capas a las que los sliders no les cambian nada (sequía, humedad, vulnerabilidad).
Es una **sensibilidad del modelo ("¿y si?"), no una proyección climática**.

## Ejemplos
**Estado del servidor**
```graphql
{ salud { estado fuentes { nombre estado detalle } } }
```

**Crear una parcela completa, de forma atómica y reintentable**
```graphql
mutation($input: CrearParcelaInput!) {
  crearParcela(input: $input) { id version areaHa preferencias { sistemaRiego } historial { anio cultivo } }
}
# variables
{ "input": { "claveIdempotencia": "movil-2026-11-15-0001", "nombre": "Greeley", "cultivoActual": "maiz",
    "punto": { "latitud": 40.42, "longitud": -104.71 },
    "preferencias": { "sistemaRiego": "GOTEO", "aguaRiegoMm": 350, "tipoSuelo": "FRANCO",
                      "prioridades": { "agua": 40, "suelo": 80, "erosion": 25, "ingreso": 90 } },
    "historial": [ { "anio": 2023, "cultivo": "maiz", "fechaSiembra": "2023-04-20" } ] } }
```
Si algún dato falla (cultivo desconocido, año repetido, forma inválida), **no queda nada guardado**.
El polígono se manda como GeoJSON en `poligono` (orden `[longitud, latitud]`, primer y último punto iguales).

**Editar sin pisar a otro**
```graphql
mutation { actualizarParcela(id: "…", input: { version: 1, nombre: "Nuevo nombre" }) { version } }
```
`null` borra un campo; omitirlo lo deja igual.

**Capa del mapa con los sliders** (lluvia −20 %, +2 °C)
```graphql
{ capa(tipo: TEMPERATURA, escenario: { lluviaPct: -20, tempDeltaC: 2 }) {
    titulo unidad rampa { en color } rejilla { bbox columnas filas valores } escenario { interpolado recortado } } }
```
Rangos de los sliders: lluvia de −100 a 100 %, temperatura de −10 a 10 °C (se recorta a lo calculado por `ml/`).

## Errores
Todos los errores traen `extensions.codigo` y un `message` en español apto para mostrar al usuario.
En producción un error interno nunca devuelve detalles ni trazas.

| `codigo` | Cuándo |
|---|---|
| `VALIDACION_FALLIDA` | Datos de entrada incorrectos (rango, tipo, id que no es UUID, cultivo desconocido) |
| `GEOMETRIA_INVALIDA` | Forma de parcela mal construida o que se cruza consigo misma |
| `NO_ENCONTRADO` | La parcela no existe |
| `CONFLICTO_VERSION` | La parcela cambió desde que el cliente la leyó: volver a leerla y reintentar |
| `CONFLICTO_CONCURRENCIA` | Dos operaciones chocaron y se agotaron los reintentos automáticos: reintentar |
| `SIN_PREDICCIONES` | Aún no se importó ninguna versión de predicciones (`npm run import:predicciones`) |
| `NO_IMPLEMENTADO` | El motor de reglas todavía no está conectado |
| `FUENTE_NO_DISPONIBLE` | Los datos de clima y suelo todavía no están conectados |
| `LIMITE_EXCEDIDO` | Demasiadas consultas seguidas |
| `CONSULTA_DEMASIADO_COMPLEJA` | Consulta más profunda o pesada que el límite |
| `ERROR_INTERNO` | Cualquier otro fallo |

## Protección de la API
- **Profundidad** máxima `GRAPHQL_MAX_DEPTH` (6) y **complejidad** máxima `GRAPHQL_MAX_COMPLEXITY` (400).
- **Rate limiting** por IP: `THROTTLE_LIMIT` (120/min) en general y `THROTTLE_LIMIT_COSTOSO` (20/min) en `recomendaciones`,
  `simularEscenario` y `guardarEscenario`. Detrás de Caddy o un túnel hay que fijar `TRUST_PROXY=1`.
- Introspección y Sandbox **solo en desarrollo**; CSRF prevention de Apollo activo; CORS limitado a `CORS_ORIGIN`; cabeceras de `helmet`.
- Entradas validadas con `class-validator` (`whitelist` y `forbidNonWhitelisted`: un campo no declarado se rechaza).
- SQL siempre parametrizado.

## Transacciones
Cada mutación que toca más de una tabla corre en **una sola transacción** (`TransaccionService.ejecutar`: transacción
interactiva de Prisma con tiempo límite y reintento ante interbloqueos o conflictos de serialización). O se guarda todo o no se guarda nada.
`crearParcela` es además idempotente (`claveIdempotencia`) y las ediciones usan bloqueo optimista (`version`).
