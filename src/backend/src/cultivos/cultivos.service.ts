import { Injectable } from '@nestjs/common';
import { AppError, CodigoError } from '../common/errors';
import { Tx } from '../common/transaccion.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CultivosService {
  constructor(private readonly prisma: PrismaService) {}

  listar() {
    return this.prisma.cultivo.findMany({ orderBy: { nombre: 'asc' } });
  }

  /** Falla con un mensaje claro si algún código no está en el catálogo. Va dentro de la transacción que lo usa. */
  async validarCodigos(tx: Tx, codigos: string[]): Promise<void> {
    const pedidos = [...new Set(codigos)];
    if (!pedidos.length) return;
    const existentes = await tx.cultivo.findMany({ where: { codigo: { in: pedidos } }, select: { codigo: true } });
    const desconocidos = pedidos.filter((codigo) => !existentes.some((c) => c.codigo === codigo));
    if (desconocidos.length) {
      throw new AppError(CodigoError.VALIDACION_FALLIDA, `No conocemos estos cultivos: ${desconocidos.join(', ')}.`);
    }
  }
}
