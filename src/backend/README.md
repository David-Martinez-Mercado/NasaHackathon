# Field Shift — backend

API GraphQL con **NestJS** + **PostgreSQL 16 / PostGIS** + **Prisma**. El frontend será **React**.
Documentación: `docs/api.md` (operaciones y errores), `docs/modelo-datos.md` (tablas), `docs/schema.graphql` (esquema).

## Levantarlo
```bash
cd backend
cp .env.example .env                 # ajustar si hace falta
docker compose up -d db              # PostgreSQL + PostGIS
npm install
npx prisma generate
npm run prisma:migrate               # crea las tablas (y la extensión PostGIS)
npm run seed                         # cultivos y 2 parcelas de ejemplo
npm run start:dev                    # http://localhost:3000/graphql (Sandbox de Apollo)
```
`GET /health` responde 200 si la base de datos contesta y 503 si no.

## Comandos
| Comando | Qué hace |
|---|---|
| `npm test` | Pruebas unitarias (geometrías, configuración, errores) |
| `npm run test:e2e` | Pruebas de la API completa con base de datos simulada |
| `npm run verify:sql` | Aplica la migración y prueba el SQL contra PostGIS real (PGlite), sin Docker |
| `npm run schema` | Regenera `docs/schema.graphql` (no necesita base de datos) |
| `npm run lint` · `npm run build` | Revisión de estilo y compilación |

## Estructura
```
src/backend/
  prisma/            schema.prisma, migrations/, seed.ts
  scripts/           export-schema.ts, verify-sql.ts
  src/
    config/          variables de entorno validadas (env.ts)
    common/          errores con código, rate limiting, complejidad, formato de errores
    prisma/          PrismaService
    parcelas/ preferencias/ cultivos/ escenarios/ recomendaciones/ salud/   un módulo por tema
    motor/ datos/    PUERTOS: contratos que implementan agronomo-reglas e ingeniero-datos
  test/              pruebas e2e
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
