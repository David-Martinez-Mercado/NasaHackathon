import { Injectable } from '@nestjs/common';
import { HistorialParcela } from '@prisma/client';
import { AppError, CodigoError } from '../common/errors';
import { Tx, TransaccionService } from '../common/transaccion.service';
import { CultivosService } from '../cultivos/cultivos.service';
import { PrismaService } from '../prisma/prisma.service';
import { HistorialInput, RegistroHistorial } from './historial.model';

const iso = (fecha: Date | null): string | null => (fecha ? fecha.toISOString().slice(0, 10) : null);

export function aRegistro(fila: HistorialParcela): RegistroHistorial {
  return {
    id: fila.id,
    parcelaId: fila.parcelaId,
    anio: fila.anio,
    cultivo: fila.cultivo,
    fechaSiembra: iso(fila.fechaSiembra),
    descripcion: fila.descripcion,
  };
}

/** Fecha AAAA-MM-DD real (rechaza 2023-02-31) y coherente con el año del registro. */
function fechaDeSiembra(input: HistorialInput): Date | null {
  if (!input.fechaSiembra) return null;
  const fecha = new Date(`${input.fechaSiembra}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime()) || iso(fecha) !== input.fechaSiembra) {
    throw new AppError(CodigoError.VALIDACION_FALLIDA, 'La fecha de siembra no es una fecha real.');
  }
  // El trigo de invierno se siembra el otoño anterior: se acepta el año del registro o el anterior.
  const anio = fecha.getUTCFullYear();
  if (anio !== input.anio && anio !== input.anio - 1) {
    throw new AppError(CodigoError.VALIDACION_FALLIDA, `La fecha de siembra debe ser de ${input.anio - 1} o de ${input.anio}.`);
  }
  return fecha;
}

@Injectable()
export class HistorialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transaccion: TransaccionService,
    private readonly cultivos: CultivosService,
  ) {}

  async listar(parcelaId: string): Promise<RegistroHistorial[]> {
    const filas = await this.prisma.historialParcela.findMany({ where: { parcelaId }, orderBy: { anio: 'desc' } });
    return filas.map(aRegistro);
  }

  /** Crea o reemplaza el registro de ese año, DENTRO de la transacción que ya está abierta. */
  async guardarEn(tx: Tx, parcelaId: string, input: HistorialInput): Promise<RegistroHistorial> {
    const fechaSiembra = fechaDeSiembra(input);
    await this.cultivos.validarCodigos(tx, [input.cultivo]);
    const existe = await tx.$queryRaw<{ existe: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM "Parcela" WHERE "id" = ${parcelaId}::uuid) AS existe
    `;
    if (!existe[0]?.existe) throw new AppError(CodigoError.NO_ENCONTRADO, 'No encontramos esa parcela.');
    const datos = { cultivo: input.cultivo, fechaSiembra, descripcion: input.descripcion ?? null };
    const fila = await tx.historialParcela.upsert({
      where: { parcelaId_anio: { parcelaId, anio: input.anio } },
      create: { parcelaId, anio: input.anio, ...datos },
      update: datos,
    });
    return aRegistro(fila);
  }

  guardar(parcelaId: string, input: HistorialInput): Promise<RegistroHistorial> {
    return this.transaccion.ejecutar((tx) => this.guardarEn(tx, parcelaId, input));
  }

  /** Varios años de una sola vez; si uno falla no se guarda ninguno. */
  guardarVarios(tx: Tx, parcelaId: string, registros: HistorialInput[]): Promise<RegistroHistorial[]> {
    const anios = registros.map((r) => r.anio);
    if (new Set(anios).size !== anios.length) {
      throw new AppError(CodigoError.VALIDACION_FALLIDA, 'El historial repite un año: cada año se declara una sola vez.');
    }
    return registros.reduce<Promise<RegistroHistorial[]>>(
      async (previo, registro) => [...(await previo), await this.guardarEn(tx, parcelaId, registro)],
      Promise.resolve([]),
    );
  }

  async eliminar(parcelaId: string, anio: number): Promise<boolean> {
    const { count } = await this.prisma.historialParcela.deleteMany({ where: { parcelaId, anio } });
    return count > 0;
  }
}
