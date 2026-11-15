# Deploy gratuito: Neon + Render + Cloudflare Pages

## 1. Base de datos (Neon)
1. Crear proyecto en https://neon.tech (región cercana, PostgreSQL 16).
2. `CREATE EXTENSION IF NOT EXISTS postgis;` en el editor SQL (la migración init también lo intenta).
3. Copiar dos cadenas: **directa** (sin `-pooler`) para migraciones y **pooled** (con `-pooler`) para la API. Ambas con `?sslmode=require`.

## 2. Migraciones y predicciones (desde la laptop, contra Neon)
```bash
cd src/backend
export DATABASE_URL="<cadena DIRECTA>"
npx prisma migrate deploy
npm run import:predicciones -- ../../ml/deploy/exports/v2
```

## 3. API (Render)
New → Blueprint → repo de GitHub (rama `produccion`); lee `render.yaml`.
Variables a rellenar: `DATABASE_URL` (cadena **pooled**) y `CORS_ORIGIN` (URL del frontend, sin `/` final).
Verificar: `https://<servicio>.onrender.com/health`.
El plan gratuito se duerme tras 15 min; la primera petición tarda ~30 s.

## 4. Frontend (Cloudflare Pages)
Conectar el repo, rama `produccion`:
- Root directory: `src/frontend`
- Build command: `npm ci && npm run build`
- Output directory: `dist`
- Variable: `VITE_API_URL=https://<servicio>.onrender.com/graphql`

Después, poner la URL de Pages en `CORS_ORIGIN` en Render.
