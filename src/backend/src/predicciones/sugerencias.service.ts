import { Injectable } from '@nestjs/common';
import { noEncontrado } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { PrediccionesService } from './predicciones.service';
import { SugerenciasCultivoTipo, SugerenciaCultivoTipo } from './sugerencias.model';

/** Cultivos de la tabla de rotación (CDL) que existen en el catálogo; los demás (mijo, triticale, "otro"…) no se pueden elegir. */
const CDL_A_CATALOGO: Record<string, string> = {
  alfalfa: 'alfalfa', avena: 'avena', cebada: 'cebada', maiz: 'maiz', remolacha: 'remolacha', sorgo: 'sorgo', trigo_invierno: 'trigo',
};
const CATALOGO_A_CDL = Object.fromEntries(Object.entries(CDL_A_CATALOGO).map(([cdl, cat]) => [cat, cdl]));

/** Pesos del puntaje; si falta un componente (p. ej. no hay precio) se reparte entre los que sí hay. */
const PESOS = { rotacion: 0.4, precio: 0.3, familia: 0.3 } as const;
const MAX_SUGERENCIAS = 5;

const limitar = (v: number) => Math.min(1, Math.max(0, v));

@Injectable()
export class SugerenciasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly predicciones: PrediccionesService,
  ) {}

  async sugerir(parcelaId: string): Promise<SugerenciasCultivoTipo> {
    const parcela = await this.prisma.parcela.findUnique({
      where: { id: parcelaId },
      select: { cultivoActual: true, historial: { orderBy: { anio: 'desc' }, take: 1, select: { cultivo: true } } },
    });
    if (!parcela) throw noEncontrado('esa parcela');
    const base = parcela.cultivoActual ?? parcela.historial[0]?.cultivo ?? null;
    const origenBase = parcela.cultivoActual ? 'actual' : base ? 'historial' : null;

    const [catalogo, tabla, series] = await Promise.all([
      this.prisma.cultivo.findMany(),
      this.predicciones.tabla('rotacion'),
      this.predicciones.series('market:'),
    ]);

    // Probabilidad de sembrar cada cultivo después del cultivo base (modelo c02)
    const prob = new Map<string, number>();
    const baseCdl = base ? CATALOGO_A_CDL[base] : undefined;
    for (const fila of (tabla?.filas ?? []) as { prev_crop: string; next_crop: string; probability_pct: number }[]) {
      if (baseCdl && fila.prev_crop === baseCdl && CDL_A_CATALOGO[fila.next_crop]) prob.set(CDL_A_CATALOGO[fila.next_crop], fila.probability_pct);
    }
    // Cambio de precio esperado (c10): del último dato real al último mes pronosticado
    const precio = new Map<string, { cambioPct: number; unidad: string }>();
    for (const s of series) {
      const reales = s.puntos.filter((p) => !p.pronostico && p.a != null);
      const pronos = s.puntos.filter((p) => p.pronostico && p.a != null);
      const ultimo = reales[reales.length - 1]?.a;
      const final = pronos[pronos.length - 1]?.a;
      if (ultimo && final != null) precio.set(s.clave.replace('market:', ''), { cambioPct: ((final - ultimo) / ultimo) * 100, unidad: s.unidad });
    }
    const familiaBase = catalogo.find((c) => c.codigo === base)?.familiaBotanica ?? null;

    const candidatos = catalogo.filter((c) => c.codigo !== base && c.codigo !== 'barbecho' && (prob.has(c.codigo) || precio.has(c.codigo)));
    const sugerencias = candidatos
      .map((c): SugerenciaCultivoTipo => {
        const p = prob.get(c.codigo) ?? null;
        const pr = precio.get(c.codigo) ?? null;
        const otraFamilia = familiaBase && c.familiaBotanica ? familiaBase !== c.familiaBotanica : null;
        const partes: [number, number][] = [];
        if (p != null) partes.push([PESOS.rotacion, limitar(p / 20)]); // 20 % o más = puntaje completo
        if (pr) partes.push([PESOS.precio, limitar((pr.cambioPct + 10) / 30)]); // de -10 % (0) a +20 % (1)
        if (otraFamilia != null) partes.push([PESOS.familia, otraFamilia ? 1 : 0]);
        const peso = partes.reduce((a, [w]) => a + w, 0);
        const puntaje = peso ? Math.round((100 * partes.reduce((a, [w, v]) => a + w * v, 0)) / peso) : 0;
        return {
          cultivo: c.codigo, nombre: c.nombre, puntaje,
          probabilidadSiguientePct: p, cambioPrecioPct: pr ? Math.round(pr.cambioPct * 10) / 10 : null,
          unidadPrecio: pr?.unidad ?? null, otraFamilia,
        };
      })
      .sort((a, b) => b.puntaje - a.puntaje || a.nombre.localeCompare(b.nombre))
      .slice(0, MAX_SUGERENCIAS);

    const advertencias = [
      'Es un orden de opciones calculado con datos de Weld, CO; no sustituye la opinión de tu técnico ni de productores de tu zona.',
      'La probabilidad de siembra describe lo que otros productores hicieron (clasificación satelital CDL), no lo que mejora tu suelo.',
      'El precio es nacional y su pronóstico es solo exploratorio.',
      'Aún no se considera el agua, el suelo ni la maquinaria de tu parcela: faltan parámetros agronómicos por cultivo.',
    ];
    if (!base) advertencias.unshift('Indica el cultivo actual o su historial para usar la rotación; por ahora solo se ve el precio.');
    return {
      cultivoBase: base, origenBase, sugerencias,
      metodo: 'Puntaje 0–100 = 40 % rotación observada (c02) + 30 % precio esperado (c10) + 30 % cambio de familia botánica; los componentes sin dato se omiten.',
      advertencias,
    };
  }
}
