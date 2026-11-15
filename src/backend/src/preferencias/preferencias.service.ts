import { Injectable } from '@nestjs/common';
import { Preferencias as FilaPreferencias, SistemaRiego } from '@prisma/client';
import { AppError, CodigoError } from '../common/errors';
import { Tx, TransaccionService } from '../common/transaccion.service';
import { CultivosService } from '../cultivos/cultivos.service';
import { PrismaService } from '../prisma/prisma.service';
import { Preferencias, PreferenciasInput } from './preferencias.model';

export function aPreferencias(fila: FilaPreferencias): Preferencias {
  return {
    id: fila.id,
    parcelaId: fila.parcelaId,
    sistemaRiego: fila.sistemaRiego,
    riego: fila.sistemaRiego !== SistemaRiego.TEMPORAL,
    aguaRiegoMm: fila.aguaRiegoMm,
    tipoSuelo: fila.tipoSuelo,
    mesesVaciosDesde: fila.mesesVaciosDesde,
    mesesVaciosHasta: fila.mesesVaciosHasta,
    maquinaria: fila.maquinaria,
    cultivosPreferidos: fila.cultivosPreferidos,
    cultivosExcluidos: fila.cultivosExcluidos,
    prioridades: {
      agua: fila.prioridadAgua,
      suelo: fila.prioridadSuelo,
      erosion: fila.prioridadErosion,
      ingreso: fila.prioridadIngreso,
    },
    actualizadaEn: fila.actualizadaEn,
  };
}

@Injectable()
export class PreferenciasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transaccion: TransaccionService,
    private readonly cultivos: CultivosService,
  ) {}

  async buscar(parcelaId: string): Promise<Preferencias | null> {
    const fila = await this.prisma.preferencias.findUnique({ where: { parcelaId } });
    return fila ? aPreferencias(fila) : null;
  }

  /** Reglas de la captura que no caben en un decorador (cruzan varios campos). */
  validar(input: PreferenciasInput): void {
    const preferidos = input.cultivosPreferidos ?? [];
    const excluidos = input.cultivosExcluidos ?? [];
    const repetidos = preferidos.filter((codigo) => excluidos.includes(codigo));
    if (repetidos.length) {
      throw new AppError(
        CodigoError.VALIDACION_FALLIDA,
        `Un cultivo no puede estar a la vez entre los preferidos y los excluidos (${repetidos.join(', ')}).`,
      );
    }
    if ((input.mesesVaciosDesde == null) !== (input.mesesVaciosHasta == null)) {
      throw new AppError(CodigoError.VALIDACION_FALLIDA, 'Indica los dos meses en que la parcela queda vacía (desde y hasta), o ninguno.');
    }
    if (input.sistemaRiego === SistemaRiego.TEMPORAL && input.aguaRiegoMm != null && input.aguaRiegoMm > 0) {
      throw new AppError(CodigoError.VALIDACION_FALLIDA, 'Una parcela de temporal no tiene agua de riego: quita el agua o elige un sistema de riego.');
    }
  }

  /** Guarda (o reemplaza) las preferencias DENTRO de la transacción que ya está abierta. */
  async guardarEn(tx: Tx, parcelaId: string, input: PreferenciasInput): Promise<Preferencias> {
    this.validar(input);
    await this.cultivos.validarCodigos(tx, [...(input.cultivosPreferidos ?? []), ...(input.cultivosExcluidos ?? [])]);
    const existe = await tx.$queryRaw<{ existe: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM "Parcela" WHERE "id" = ${parcelaId}::uuid) AS existe
    `;
    if (!existe[0]?.existe) throw new AppError(CodigoError.NO_ENCONTRADO, 'No encontramos esa parcela.');
    const prioridades = input.prioridades ?? { agua: 50, suelo: 50, erosion: 50, ingreso: 50 };
    const datos = {
      sistemaRiego: input.sistemaRiego ?? SistemaRiego.TEMPORAL,
      aguaRiegoMm: input.aguaRiegoMm ?? null,
      tipoSuelo: input.tipoSuelo ?? 'SATELITAL',
      mesesVaciosDesde: input.mesesVaciosDesde ?? null,
      mesesVaciosHasta: input.mesesVaciosHasta ?? null,
      maquinaria: input.maquinaria ?? [],
      cultivosPreferidos: input.cultivosPreferidos ?? [],
      cultivosExcluidos: input.cultivosExcluidos ?? [],
      prioridadAgua: prioridades.agua,
      prioridadSuelo: prioridades.suelo,
      prioridadErosion: prioridades.erosion,
      prioridadIngreso: prioridades.ingreso,
    };
    const fila = await tx.preferencias.upsert({ where: { parcelaId }, create: { parcelaId, ...datos }, update: datos });
    return aPreferencias(fila);
  }

  /** Mutación independiente: abre su propia transacción. */
  guardar(parcelaId: string, input: PreferenciasInput): Promise<Preferencias> {
    this.validar(input); // falla rápido, antes de abrir la transacción
    return this.transaccion.ejecutar((tx) => this.guardarEn(tx, parcelaId, input));
  }
}
