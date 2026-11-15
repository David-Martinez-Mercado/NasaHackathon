import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { Costoso } from '../common/throttle';
import { uuidPipe } from '../common/uuid.pipe';
import { EscenarioInput } from '../recomendaciones/recomendaciones.model';
import { AppError, CodigoError } from '../common/errors';
import { MlVivoCliente } from './ml-vivo.cliente';
import { CajaMundoInput, ClimaGlobal } from './global.model';
import { PrediccionesVivas } from './ml-vivo.model';
import { MlVivoService } from './ml-vivo.service';

@Resolver()
export class MlVivoResolver {
  constructor(
    private readonly vivo: MlVivoService,
    private readonly cliente: MlVivoCliente,
  ) {}

  /** Cada llamada puede consultar APIs externas: usa el límite de operaciones caras. */
  @Costoso()
  @Query(() => PrediccionesVivas, {
    name: 'prediccionesEnVivo',
    description:
      'Predicciones de los modelos de ml/ con datos recién consultados a NASA POWER para el punto de la parcela (olas de calor, lluvia, ' +
      'humedad del suelo). Si el servicio no responde devuelve el último lote marcado como LOTE y obsoleto. Con `escenario` aplica los sliders.',
  })
  prediccionesEnVivo(
    @Args('parcelaId', { type: () => ID }, uuidPipe()) parcelaId: string,
    @Args('escenario', { type: () => EscenarioInput, nullable: true }) escenario?: EscenarioInput,
  ) {
    return this.vivo.predecir(parcelaId, escenario ?? undefined);
  }

  @Costoso()
  @Query(() => ClimaGlobal, { name: 'climaGlobal', description: 'Modo global: clima observado de la última semana en las celdas del mapa visibles, en cualquier parte del mundo.' })
  async climaGlobal(@Args('caja', { type: () => CajaMundoInput }) caja: CajaMundoInput): Promise<ClimaGlobal> {
    if (!(caja.oeste < caja.este && caja.sur < caja.norte)) throw new AppError(CodigoError.VALIDACION_FALLIDA, 'La caja del mapa no es válida.');
    if (!this.cliente.configurado) throw new AppError(CodigoError.FUENTE_NO_DISPONIBLE, 'El modo global necesita el servicio de ml/ (ML_SERVICE_URL).');
    try {
      const r = await this.cliente.mundo(caja);
      return {
        celdas: r.cells.map((c: any) => ({ latitud: c.lat, longitud: c.lon, tempMediaC: c.temp_mean_c, tempMaxC: c.temp_max_c, lluvia7dMm: c.rain_7d_mm, humedadRelativaPct: c.humidity_pct, humedadSueloPct: c.soil_moisture_pct, datosAl: c.as_of })),
        solicitadas: r.requested, faltantes: r.missing, muestreado: r.subsampled, pasoLatitud: r.lat_step, pasoLongitud: r.lon_step, datosAl: r.as_of,
      };
    } catch (e) {
      throw new AppError(CodigoError.FUENTE_NO_DISPONIBLE, `No se pudo consultar el clima global: ${e instanceof Error ? e.message : 'error'}`);
    }
  }
}
