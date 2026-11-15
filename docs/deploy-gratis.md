# Free deployment: Neon + Render + Cloudflare Pages

## 1. Database (Neon)
1. Create a project at https://neon.tech (nearby region, PostgreSQL 16).
2. Run `CREATE EXTENSION IF NOT EXISTS postgis;` in the SQL editor (the init migration also tries it).
3. Copy two connection strings: **direct** (no `-pooler`) for migrations and **pooled** (with `-pooler`) for the API. Both with `?sslmode=require`.

## 2. Migrations and predictions (from a laptop, against Neon)
```bash
cd src/backend
export DATABASE_URL="<DIRECT string>"
npx prisma migrate deploy
npm run import:predicciones -- ../../ml/deploy/exports/v2
npm run seed   # crop catalog (English names)
```

## 3. API (Render)
New → Blueprint → GitHub repo (branch `produccion`); it reads `render.yaml`.
Values to fill in: `DATABASE_URL` (**pooled** string) and `CORS_ORIGIN` (frontend URL, no trailing `/`).
Check: `https://<service>.onrender.com/health`.
The free plan sleeps after 15 min; the first request takes ~30 s.

## 4. Frontend (Cloudflare Pages)
Connect the repo, branch `produccion`:
- Root directory: `src/frontend`
- Build command: `npm ci && npm run build`
- Output directory: `dist`
- Variable: `VITE_API_URL=https://<service>.onrender.com/graphql`

Then put the Pages URL in `CORS_ORIGIN` on Render.
