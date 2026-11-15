# Field Shift — backend

API GraphQL con **NestJS** + **PostgreSQL 16 / PostGIS** + **Prisma**. El frontend será **React**.
Documentación (en `docs/` de la raíz): `api.md` (operaciones, errores, transacciones), `modelo-datos.md` (tablas), `schema.graphql` (esquema) y `frontend-queries.graphql` (operaciones para el frontend).

## Levantarlo
```bash
cd src/backend
cp .env.example .env                 # ajustar si hace falta
docker compose up -d db              # PostgreSQL + PostGIS
npm install
npx prisma generate
npm run prisma:migrate               # crea las tablas (y la extensión PostGIS)
npm run seed                         # cultivos y 2 parcelas de ejemplo
npm run import:predicciones -- ../../ml/deploy/exports/v1   # predicciones de ml/ (mapas, series, alertas)
npm run start:dev                    # http://localhost:3000/graphql (Sandbox de Apollo)
```
`GET /health` responde 200 si la base de datos contesta y 503 si no.

## Comandos
| Comando | Qué hace |
|---|---|
| `npm test` | Pruebas unitarias (geometrías, configuración, errores) |
| `npm run test:e2e` | Límites y modo producción (base simulada) |
| `npm run test:int` | **Integración con PostgreSQL + PostGIS reales** embebidos (PGlite por socket, sin Docker): transacciones, rollback, idempotencia, bloqueo optimista, importación atómica y consultas |
| `npm run import:predicciones -- <carpeta>` | Importa un export de `ml/` en una transacción |
| `npm run schema` | Regenera `docs/schema.graphql` (no necesita base de datos) |
| `npm run lint` · `npm run build` | Revisión de estilo y compilación |

## Estructura
```
src/backend/
  prisma/            schema.prisma, migrations/, seed.ts
  scripts/           export-schema.ts, import-predicciones.ts
  src/
    config/          variables de entorno validadas (env.ts)
    common/          errores con código, rate limiting, complejidad, formato de errores
    prisma/          PrismaService y PrismaModule (global); common/transaccion.service.ts = transacciones
    parcelas/ preferencias/ historial/ cultivos/ escenarios/ recomendaciones/ predicciones/ salud/   un módulo por tema
    motor/ datos/    PUERTOS: contratos que implementan agronomo-reglas e ingeniero-datos
  test/              *.int-spec.ts (base real), *.e2e-spec.ts (límites), support/ (arranque de la base embebida)
```

## Cómo se conectan el motor de reglas y los datos
`recomendaciones`, `simularEscenario` y `guardarEscenario` ya están listos pero necesitan dos piezas de otros agentes.
Cada una es una interfaz con una implementación provisional que responde con un error claro en vez de inventar resultados:

- `src/motor/motor.port.ts` → `MotorPort.recomendar(contexto, prefs, escenario)` (agronomo-reglas).
- `src/datos/datos.port.ts` → `DatosPort.contexto(lat, lon)` (ingeniero-datos; con `DEMO_OFFLINE=true` debe usar fixtures).

Para conectarlas, cambiar el `useClass` del proveedor en `MotorModule` / `DatosModule`.
El formato de `ParcelaContexto` está **[POR VERIFICAR]** hasta que exista `docs/contrato-datos.md`.

## Variables de entorno
Ver `.env.example`. Nada de rutas, IPs ni secretos en el código (reglas de portabilidad de las reglas del proyecto).

## Correr todo sin Docker (backend + frontend)
```bash
# terminal 1: PostgreSQL + PostGIS embebido (datos en src/backend/.pglite, ya ignorado por git)
cd src/backend && npm run dev:db
# terminal 2 (con DATABASE_URL que imprime dev:db; el backend NO debe estar corriendo):
npm run prisma:generate && npm run import:predicciones -- ../../ml/deploy/exports/v1 && npm run seed
CORS_ORIGIN=http://localhost:5173 npm run start          # http://localhost:3000/graphql
# terminal 3:
cd src/frontend && npm install && npm run dev            # http://localhost:5173 (VITE_API_URL en .env.development)
```
La base embebida atiende una sola conexión: detén el backend antes de importar o sembrar. Es solo para desarrollo;
el servidor usa PostgreSQL 16 con `docker compose`.

## Predicciones en vivo (servicio de ml/)
`prediccionesEnVivo(parcelaId, escenario?)` llama al servicio de ml/ (`fieldshift-ml serve`) con `ML_SERVICE_URL` y `ML_SERVICE_TOKEN` (cabecera `X-ML-Token`; el
token nunca viaja al navegador). Tiempo límite `ML_SERVICE_TIMEOUT_MS`, circuit breaker (`ML_SERVICE_BREAKER_FAILURES` fallos seguidos abren `ML_SERVICE_BREAKER_RESET_MS`)
y **respaldo al último lote** marcado `LOTE` y `obsoleto`. Sin `ML_SERVICE_URL` se usa siempre el lote. `/health` informa si el servicio responde.
