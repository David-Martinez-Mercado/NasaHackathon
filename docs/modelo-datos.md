# Modelo de datos

PostgreSQL 16 + PostGIS, administrado con Prisma. Fuente de verdad: `src/backend/prisma/schema.prisma`;
migraciones en `src/backend/prisma/migrations/`. Los cambios solo se hacen con migraciones.

```
Parcela 1───0..1 Preferencias
   ├──0..* HistorialParcela   (único por parcela y año)
   └──0..* Escenario                CacheDatos (sin relaciones)      Cultivo (catálogo)

VersionPrediccion 1──* CapaMapa 1──* EscenarioCapa      (rejillas por escenario de lluvia y temperatura)
        ├──* ConjuntoPuntos 1──* PuntoMapa              (geometría Point, índice GIST)
        ├──* SerieDato · TablaModelo · AlertaMapa
        └──0..1 ResumenModelo
```

## Tablas
| Tabla | Para qué sirve | Campos principales |
|---|---|---|
| `Parcela` | Parcela del agricultor (punto o polígono) | `id` UUID, `nombre`, `descripcion`, `cultivoActual`, `geom` PostGIS, centroide, `areaHa`, **`version`** (bloqueo optimista), **`claveIdempotencia`** única, `creadaEn`, `actualizadaEn` |
| `Preferencias` | Prioridades y restricciones (una por parcela) | `sistemaRiego` (TEMPORAL/GRAVEDAD/ASPERSION/GOTEO), `aguaRiegoMm`, `tipoSuelo`, `mesesVaciosDesde/Hasta`, `maquinaria[]`, cultivos preferidos/excluidos, 4 prioridades 0–100 (agua, suelo, erosión, ingreso) |
| `HistorialParcela` | Qué se sembró cada año | `parcelaId` + `anio` únicos, `cultivo`, `fechaSiembra`, `descripcion` |
| `Escenario` | Sliders de lluvia y temperatura y su resultado | `parcelaId`, `lluviaPct`, `tempDeltaC`, `resultado` JSONB |
| `CacheDatos` | Caché de fuentes externas (la usa `ingeniero-datos`) | `clave` + `fuente` únicas, `respuesta` JSONB, `expiraEn` |
| `Cultivo` | Catálogo de cultivos | `codigo` único, `nombre`, `familiaBotanica`, `parametros` JSONB, `verificado` |
| `VersionPrediccion` | Un lote de predicciones importado de `ml/` | `version`, `huella` (sha256 del manifiesto), `activa` (**índice único parcial: solo una activa**), `modelos` JSONB con métricas e intervalos, `limitaciones`, `datosAl` |
| `CapaMapa` / `EscenarioCapa` | Capa del mapa y su rejilla por escenario | bbox, columnas, filas, rampa, leyenda, unidad, `interpolada`, `escenarioAplica`; `valores` JSONB (fila a fila desde el norte, `null` = sin dato) |
| `ConjuntoPuntos` / `PuntoMapa` | Puntos de alerta (estrés) | `geom` Point 4326 con GIST, `severidad`, `valor`, `etiqueta` |
| `SerieDato`, `TablaModelo`, `AlertaMapa`, `ResumenModelo` | Series (mercado, estadísticas), tablas de modelos, alertas y resúmenes | Todo con su fuente, fecha de datos y notas |

## Decisiones
- **IDs UUID**, no autoincrementales, para que no se puedan enumerar parcelas.
- **Geometría con SQL parametrizado.** Prisma no entiende PostGIS (`Unsupported`), así que `Parcela` se escribe y lee con
  `$queryRaw` y `Prisma.sql`; los valores viajan como parámetros, nunca dentro del texto. La forma se valida dos veces:
  en la API (`src/backend/src/parcelas/geojson.ts`) y en la base (`ST_IsValid`).
- **Índice GIST** sobre `Parcela.geom` para consultas espaciales (parcelas cercanas, intersecciones).
- **Borrado en cascada:** al borrar una parcela se borran sus preferencias, historial y escenarios.
- **Predicciones por lotes:** `ml/` genera un export versionado (`ml/deploy/exports/<versión>/`, con hashes y esquema JSON) y
  `npm run import:predicciones` lo carga **en una sola transacción**: valida hashes y esquema antes de escribir; si algo falla
  a mitad no queda nada de esa versión y sigue activa la anterior. Reimportar la misma versión con el mismo contenido no hace nada;
  con otro contenido se rechaza. No hay Python en producción.
- **`Cultivo.parametros` queda vacío** hasta que `agronomo-reglas` entregue `docs/cultivos/cultivos.json` con fuente por valor.
  Mientras `verificado` sea `false`, esos datos no son confiables. El seed solo trae nombre y familia botánica.
- **Ubicación = dato personal** (LFPDPPP). Se guarda lo mínimo: la geometría que el agricultor dibuja, sin cuenta ni teléfono.
  Todavía no hay autenticación: cualquiera que conozca el UUID de una parcela puede leerla. [POR DECIDIR antes de publicar]

## Comandos
```bash
cd src/backend
docker compose up -d db              # PostgreSQL 16 + PostGIS en el puerto 5432 local
npm run prisma:migrate               # aplica migraciones (desarrollo)
npm run prisma:deploy                # aplica migraciones (servidor)
npm run seed                         # cultivos y 2 parcelas de ejemplo (Greeley y Nunn)
npm run import:predicciones -- ../../ml/deploy/exports/v1   # carga las predicciones de ml/
npm run test:int                     # pruebas contra PostgreSQL + PostGIS reales embebidos (sin Docker)
```
