# Modelo de datos

PostgreSQL 16 + PostGIS, administrado con Prisma. Fuente de verdad: `src/backend/prisma/schema.prisma`;
migraciones en `src/backend/prisma/migrations/`. Los cambios solo se hacen con migraciones.

```
Parcela 1───0..1 Preferencias
   │
   └──0..* Escenario                CacheDatos (sin relaciones)      Cultivo (catálogo)
```

## Tablas
| Tabla | Para qué sirve | Campos principales |
|---|---|---|
| `Parcela` | Parcela del agricultor (punto o polígono) | `id` UUID, `nombre`, `geom` PostGIS `geometry(Geometry, 4326)`, `centroideLat`, `centroideLon`, `creadaEn` |
| `Preferencias` | Prioridades y restricciones (una por parcela) | `parcelaId` único, `riego`, `aguaRiegoMm`, `maquinaria[]`, `cultivosPreferidos[]`, `cultivosExcluidos[]`, `prioridad` (AGUA, SUELO, INGRESO, BALANCE) |
| `Escenario` | Sliders de lluvia y temperatura y su resultado | `parcelaId`, `nombre`, `lluviaPct`, `tempDeltaC`, `resultado` JSONB, `creadoEn` |
| `CacheDatos` | Caché de fuentes externas (la usa `ingeniero-datos`) | `clave` + `fuente` únicas, `respuesta` JSONB, `obtenidaEn`, `expiraEn` |
| `Cultivo` | Catálogo de cultivos | `codigo` único (p. ej. `maiz`), `nombre`, `familiaBotanica`, `parametros` JSONB, `fuente`, `verificado` |

## Decisiones
- **IDs UUID**, no autoincrementales, para que no se puedan enumerar parcelas.
- **Geometría con SQL parametrizado.** Prisma no entiende PostGIS (`Unsupported`), así que `Parcela` se escribe y lee con
  `$queryRaw` y `Prisma.sql`; los valores viajan como parámetros, nunca dentro del texto. La forma se valida dos veces:
  en la API (`src/backend/src/parcelas/geojson.ts`) y en la base (`ST_IsValid`).
- **Índice GIST** sobre `Parcela.geom` para consultas espaciales (parcelas cercanas, intersecciones).
- **Borrado en cascada:** al borrar una parcela se borran sus preferencias y escenarios.
- **`Cultivo.parametros` queda vacío** hasta que `agronomo-reglas` entregue `docs/cultivos/cultivos.json` con fuente por valor.
  Mientras `verificado` sea `false`, esos datos no son confiables. El seed solo trae nombre y familia botánica.
- **Ubicación = dato personal** (LFPDPPP). Se guarda lo mínimo: la geometría que el agricultor dibuja, sin cuenta ni teléfono.
  Todavía no hay autenticación: cualquiera que conozca el UUID de una parcela puede leerla. [POR DECIDIR antes de publicar]

## Comandos
```bash
cd backend
docker compose up -d db              # PostgreSQL 16 + PostGIS en el puerto 5432 local
npm run prisma:migrate               # aplica migraciones (desarrollo)
npm run prisma:deploy                # aplica migraciones (servidor)
npm run seed                         # cultivos y 2 parcelas de ejemplo (Greeley y Nunn)
npm run verify:sql                   # verifica migración y SQL contra PostGIS sin Docker
```
