/**
 * Datos iniciales: catálogo de cultivos y dos parcelas de ejemplo en Weld, CO (docs/decisiones.md, 2026-11-13).
 * Uso: npm run seed   (necesita DATABASE_URL y las migraciones aplicadas). Se puede repetir sin duplicar.
 *
 * Los cultivos llevan solo nombre y familia botánica. Los parámetros agronómicos (agua, temperaturas, ciclo)
 * los aporta agronomo-reglas con fuente desde docs/cultivos/cultivos.json; hasta entonces `verificado` es false.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CULTIVOS: { codigo: string; nombre: string; familiaBotanica: string }[] = [
  { codigo: 'frijol', nombre: 'Bean', familiaBotanica: 'Fabaceae' },
  { codigo: 'maiz', nombre: 'Maize', familiaBotanica: 'Poaceae' },
  { codigo: 'avena', nombre: 'Oats', familiaBotanica: 'Poaceae' },
  { codigo: 'sorgo', nombre: 'Sorghum', familiaBotanica: 'Poaceae' },
  { codigo: 'trigo', nombre: 'Wheat', familiaBotanica: 'Poaceae' },
  { codigo: 'cebada', nombre: 'Barley', familiaBotanica: 'Poaceae' },
  { codigo: 'chile', nombre: 'Chili pepper', familiaBotanica: 'Solanaceae' },
  { codigo: 'papa', nombre: 'Potato', familiaBotanica: 'Solanaceae' },
  { codigo: 'alfalfa', nombre: 'Alfalfa', familiaBotanica: 'Fabaceae' },
  { codigo: 'veza', nombre: 'Vetch (green manure)', familiaBotanica: 'Fabaceae' },
  { codigo: 'soya', nombre: 'Soybean', familiaBotanica: 'Fabaceae' },
  { codigo: 'girasol', nombre: 'Sunflower', familiaBotanica: 'Asteraceae' },
  { codigo: 'remolacha', nombre: 'Sugar beet', familiaBotanica: 'Amaranthaceae' },
  { codigo: 'barbecho', nombre: 'Fallow', familiaBotanica: 'None' },
];

// Puntos de referencia de la zona de estudio
const PARCELAS = [
  { id: '00000000-0000-4000-8000-000000000001', nombre: 'Greeley (irrigated)', lat: 40.42, lon: -104.71, sistemaRiego: 'ASPERSION' as const, aguaRiegoMm: 400 },
  { id: '00000000-0000-4000-8000-000000000002', nombre: 'Nunn / CPER (rainfed)', lat: 40.82, lon: -104.75, sistemaRiego: 'TEMPORAL' as const, aguaRiegoMm: null },
];

async function main() {
  for (const cultivo of CULTIVOS) {
    await prisma.cultivo.upsert({ where: { codigo: cultivo.codigo }, create: cultivo, update: { nombre: cultivo.nombre, familiaBotanica: cultivo.familiaBotanica } });
  }
  console.log(`Crops: ${CULTIVOS.length}`);

  for (const p of PARCELAS) {
    const punto = JSON.stringify({ type: 'Point', coordinates: [p.lon, p.lat] });
    await prisma.$executeRaw`
      INSERT INTO "Parcela" ("id", "nombre", "geom", "centroideLat", "centroideLon")
      VALUES (${p.id}::uuid, ${p.nombre}, ST_SetSRID(ST_GeomFromGeoJSON(${punto}), 4326), ${p.lat}, ${p.lon})
      ON CONFLICT ("id") DO NOTHING
    `;
    await prisma.preferencias.upsert({
      where: { parcelaId: p.id },
      create: { parcelaId: p.id, sistemaRiego: p.sistemaRiego, aguaRiegoMm: p.aguaRiegoMm, maquinaria: [], cultivosPreferidos: [], cultivosExcluidos: [] },
      update: {},
    });
  }
  console.log(`Parcelas de ejemplo: ${PARCELAS.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
