import { Injectable } from '@nestjs/common';
import { Prioridad } from '@prisma/client';
import { AppError, CodigoError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { PreferenciasInput } from './preferencias.model';

@Injectable()
export class PreferenciasService {
  constructor(private readonly prisma: PrismaService) {}

  buscar(parcelaId: string) {
    return this.prisma.preferencias.findUnique({ where: { parcelaId } });
  }

  async guardar(parcelaId: string, input: PreferenciasInput) {
    const preferidos = input.cultivosPreferidos ?? [];
    const excluidos = input.cultivosExcluidos ?? [];

    const repetidos = preferidos.filter((codigo) => excluidos.includes(codigo));
    if (repetidos.length) {
      throw new AppError(
        CodigoError.VALIDACION_FALLIDA,
        `Un cultivo no puede estar a la vez entre los preferidos y los excluidos (${repetidos.join(', ')}).`,
      );
    }

    const pedidos = [...new Set([...preferidos, ...excluidos])];
    if (pedidos.length) {
      const existentes = await this.prisma.cultivo.findMany({ where: { codigo: { in: pedidos } }, select: { codigo: true } });
      const desconocidos = pedidos.filter((codigo) => !existentes.some((c) => c.codigo === codigo));
      if (desconocidos.length) {
        throw new AppError(CodigoError.VALIDACION_FALLIDA, `No conocemos estos cultivos: ${desconocidos.join(', ')}.`);
      }
    }

    const existe = await this.prisma.$queryRaw<{ existe: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM "Parcela" WHERE "id" = ${parcelaId}::uuid) AS existe
    `;
    if (!existe[0]?.existe) throw new AppError(CodigoError.NO_ENCONTRADO, 'No encontramos esa parcela.');

    const datos = {
      riego: input.riego,
      aguaRiegoMm: input.aguaRiegoMm ?? null,
      maquinaria: input.maquinaria ?? [],
      cultivosPreferidos: preferidos,
      cultivosExcluidos: excluidos,
      prioridad: input.prioridad ?? Prioridad.BALANCE,
    };
    return this.prisma.preferencias.upsert({
      where: { parcelaId },
      create: { parcelaId, ...datos },
      update: datos,
    });
  }
}
