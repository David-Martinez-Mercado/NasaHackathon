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
      'Predictions of the ml/ models with data freshly queried from NASA POWER for the field point (heat waves, rain, ' +
      'soil moisture). If the service does not respond it returns the last batch marked as LOTE and stale. With `escenario` it applies the sliders.',
  })
  prediccionesEnVivo(
    @Args('parcelaId', { type: () => ID }, uuidPipe()) parcelaId: string,
    @Args('escenario', { type: () => EscenarioInput, nullable: true }) escenario?: EscenarioInput,
  ) {
    return this.vivo.predecir(parcelaId, escenario ?? undefined);
  }

  @Costoso()
  @Query(() => ClimaGlobal, { name: 'climaGlobal', description: 'Global mode: observed weather of the last week in the visible map cells, anywhere in the world.' })
  async climaGlobal(@Args('caja', { type: () => CajaMundoInput }) caja: CajaMundoInput): Promise<ClimaGlobal> {
    if (!(caja.oeste < caja.este && caja.sur < caja.norte)) throw new AppError(CodigoError.VALIDACION_FALLIDA, 'The map box is not valid.');
    if (!this.cliente.configurado) throw new AppError(CodigoError.FUENTE_NO_DISPONIBLE, 'Global mode needs the ml/ service (ML_SERVICE_URL).');
    try {
      const r = await this.cliente.mundo(caja);
      return {
        celdas: r.cells.map((c: any) => ({ latitud: c.lat, longitud: c.lon, tempMediaC: c.temp_mean_c, tempMaxC: c.temp_max_c, lluvia7dMm: c.rain_7d_mm, humedadRelativaPct: c.humidity_pct, humedadSueloPct: c.soil_moisture_pct, datosAl: c.as_of })),
        solicitadas: r.requested, faltantes: r.missing, muestreado: r.subsampled, pasoLatitud: r.lat_step, pasoLongitud: r.lon_step, datosAl: r.as_of,
      };
    } catch (e) {
      throw new AppError(CodigoError.FUENTE_NO_DISPONIBLE, `Could not query the global weather: ${e instanceof Error ? e.message : 'error'}`);
    }
  }
}
