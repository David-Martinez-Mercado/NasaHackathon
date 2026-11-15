import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransaccionService } from '../common/transaccion.service';
import { ParcelasService } from '../parcelas/parcelas.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecomendacionesService } from '../recomendaciones/recomendaciones.service';
import { GuardarEscenarioInput } from './escenarios.model';

@Injectable()
export class EscenariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transaccion: TransaccionService,
    private readonly parcelas: ParcelasService,
    private readonly recomendaciones: RecomendacionesService,
  ) {}

  /**
   * El resultado lo calcula el servidor con el motor (fuera de la transacción: puede tardar); el cliente nunca manda
   * resultados para guardar. Comprobar que la parcela existe y guardar el escenario van juntos en una transacción,
   * así no queda un escenario huérfano si la parcela se borra mientras se calculaba.
   */
  async guardar(input: GuardarEscenarioInput) {
    const resultado = await this.recomendaciones.evaluar(input.parcelaId, {
      lluviaPct: input.lluviaPct,
      tempDeltaC: input.tempDeltaC,
    });
    return this.transaccion.ejecutar(async (tx) => {
      await this.parcelas.obtener(input.parcelaId, tx);
      return tx.escenario.create({
        data: {
          parcelaId: input.parcelaId,
          nombre: input.nombre ?? null,
          lluviaPct: input.lluviaPct,
          tempDeltaC: input.tempDeltaC,
          resultado: resultado as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  listar(parcelaId: string) {
    return this.prisma.escenario.findMany({
      where: { parcelaId },
      orderBy: { creadoEn: 'desc' },
      take: 50,
    });
  }
}
