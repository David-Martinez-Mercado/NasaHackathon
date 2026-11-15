import { Inject, Injectable } from '@nestjs/common';
import { AppError, CodigoError } from '../common/errors';
import { DATOS, DatosPort } from '../datos/datos.port';
import { Escenario, MOTOR, MotorPort, PreferenciasAgricultor, RotacionEvaluada } from '../motor/motor.port';
import { ParcelasService } from '../parcelas/parcelas.service';
import { PreferenciasService } from '../preferencias/preferencias.service';

/** Junta parcela + preferencias + contexto y se lo pasa al motor. No calcula nada por su cuenta. */
@Injectable()
export class RecomendacionesService {
  constructor(
    private readonly parcelas: ParcelasService,
    private readonly preferencias: PreferenciasService,
    @Inject(DATOS) private readonly datos: DatosPort,
    @Inject(MOTOR) private readonly motor: MotorPort,
  ) {}

  /** Las 3 mejores rotaciones de una parcela, con el escenario de los sliders si se indica. */
  async evaluar(parcelaId: string, escenario?: Escenario): Promise<RotacionEvaluada[]> {
    const parcela = await this.parcelas.obtener(parcelaId);
    const guardadas = await this.preferencias.buscar(parcelaId);
    if (!guardadas) {
      throw new AppError(CodigoError.VALIDACION_FALLIDA, 'Antes de pedir recomendaciones, guarda las preferencias de la parcela.');
    }
    const prefs: PreferenciasAgricultor = {
      riego: guardadas.riego,
      sistemaRiego: guardadas.sistemaRiego,
      aguaRiegoMm: guardadas.aguaRiegoMm ?? undefined,
      tipoSuelo: guardadas.tipoSuelo,
      mesesVacios:
        guardadas.mesesVaciosDesde != null && guardadas.mesesVaciosHasta != null
          ? { desde: guardadas.mesesVaciosDesde, hasta: guardadas.mesesVaciosHasta }
          : undefined,
      maquinaria: guardadas.maquinaria,
      cultivosPreferidos: guardadas.cultivosPreferidos,
      cultivosExcluidos: guardadas.cultivosExcluidos,
      prioridades: guardadas.prioridades,
    };
    const contexto = await this.datos.contexto(parcela.latitud, parcela.longitud);
    return this.motor.recomendar(contexto, prefs, escenario);
  }
}
