import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ParcelasService } from '../parcelas/parcelas.service';
import { RecomendacionesService } from '../recomendaciones/recomendaciones.service';
import { GuardarEscenarioInput } from './escenarios.model';

@Injectable()
export class EscenariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parcelas: ParcelasService,
    private readonly recomendaciones: RecomendacionesService,
  ) {}

  /** El resultado lo calcula el servidor con el motor; el cliente nunca manda resultados para guardar. */
  async guardar(input: GuardarEscenarioInput) {
    await this.parcelas.obtener(input.parcelaId);
    const resultado = await this.recomendaciones.evaluar(input.parcelaId, {
      lluviaPct: input.lluviaPct,
      tempDeltaC: input.tempDeltaC,
    });
    return this.prisma.escenario.create({
      data: {
        parcelaId: input.parcelaId,
        nombre: input.nombre ?? null,
        lluviaPct: input.lluviaPct,
        tempDeltaC: input.tempDeltaC,
        resultado: resultado as unknown as Prisma.InputJsonValue,
      },
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
