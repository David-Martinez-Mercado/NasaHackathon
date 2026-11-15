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
  { codigo: 'frijol', nombre: 'Frijol', familiaBotanica: 'Fabaceae' },
  { codigo: 'maiz', nombre: 'Maíz', familiaBotanica: 'Poaceae' },
  { codigo: 'avena', nombre: 'Avena', familiaBotanica: 'Poaceae' },
  { codigo: 'sorgo', nombre: 'Sorgo', familiaBotanica: 'Poaceae' },
  { codigo: 'trigo', nombre: 'Trigo', familiaBotanica: 'Poaceae' },
  { codigo: 'cebada', nombre: 'Cebada', familiaBotanica: 'Poaceae' },
  { codigo: 'chile', nombre: 'Chile', familiaBotanica: 'Solanaceae' },
  { codigo: 'papa', nombre: 'Papa', familiaBotanica: 'Solanaceae' },
  { codigo: 'alfalfa', nombre: 'Alfalfa', familiaBotanica: 'Fabaceae' },
  { codigo: 'veza', nombre: 'Veza (abono verde)', familiaBotanica: 'Fabaceae' },
  { codigo: 'soya', nombre: 'Soya', familiaBotanica: 'Fabaceae' },
  { codigo: 'girasol', nombre: 'Girasol', familiaBotanica: 'Asteraceae' },
  { codigo: 'remolacha', nombre: 'Remolacha azucarera', familiaBotanica: 'Amaranthaceae' },
];

// Puntos de referencia de la zona de estudio
const PARCELAS = [
  { id: '00000000-0000-4000-8000-000000000001', nombre: 'Greeley (riego)', lat: 40.42, lon: -104.71, riego: true, aguaRiegoMm: 400 },
  { id: '00000000-0000-4000-8000-000000000002', nombre: 'Nunn / CPER (temporal)', lat: 40.82, lon: -104.75, riego: false, aguaRiegoMm: null },
];

async function main() {
  for (const cultivo of CULTIVOS) {
    await prisma.cultivo.upsert({ where: { codigo: cultivo.codigo }, create: cultivo, update: { nombre: cultivo.nombre, familiaBotanica: cultivo.familiaBotanica } });
  }
  console.log(`Cultivos: ${CULTIVOS.length}`);

  for (const p of PARCELAS) {
    const punto = JSON.stringify({ type: 'Point', coordinates: [p.lon, p.lat] });
    await prisma.$executeRaw`
      INSERT INTO "Parcela" ("id", "nombre", "geom", "centroideLat", "centroideLon")
      VALUES (${p.id}::uuid, ${p.nombre}, ST_SetSRID(ST_GeomFromGeoJSON(${punto}), 4326), ${p.lat}, ${p.lon})
      ON CONFLICT ("id") DO NOTHING
    `;
    await prisma.preferencias.upsert({
      where: { parcelaId: p.id },
      create: { parcelaId: p.id, riego: p.riego, aguaRiegoMm: p.aguaRiegoMm, maquinaria: [], cultivosPreferidos: [], cultivosExcluidos: [] },
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
