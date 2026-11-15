import { Args, Query, Resolver } from '@nestjs/graphql';
import { TipoCapa, TipoPunto } from '@prisma/client';
import { EscenarioInput } from '../recomendaciones/recomendaciones.model';
import {
  AlertaResumenTipo,
  CajaInput,
  CapaMapaTipo,
  ConjuntoPuntosTipo,
  EstadoPrediccionesTipo,
  ResumenClima,
  ResumenHumedad,
  SerieDatosTipo,
  TablaModeloTipo,
} from './predicciones.model';
import { PrediccionesService } from './predicciones.service';

/** Lo que los modelos de ml/ predijeron (cargado por lotes). Solo lectura: nada de esto se escribe desde la API. */
@Resolver()
export class PrediccionesResolver {
  constructor(private readonly predicciones: PrediccionesService) {}

  @Query(() => CapaMapaTipo, {
    name: 'capa',
    nullable: true,
    description:
      'Una capa del mapa para un escenario de lluvia y temperatura (los sliders). Entre los escenarios precalculados se ' +
      'interpola; sin escenario, condiciones normales. null si esa capa no se cargó.',
  })
  capa(@Args('tipo', { type: () => TipoCapa }) tipo: TipoCapa, @Args('escenario', { type: () => EscenarioInput, nullable: true }) escenario?: EscenarioInput) {
    return this.predicciones.capa(tipo, escenario ?? undefined);
  }

  @Query(() => ConjuntoPuntosTipo, { name: 'puntos', nullable: true, description: 'Puntos de alerta (p. ej. estrés), opcionalmente dentro de una caja del mapa.' })
  puntos(@Args('tipo', { type: () => TipoPunto }) tipo: TipoPunto, @Args('caja', { type: () => CajaInput, nullable: true }) caja?: CajaInput) {
    return this.predicciones.puntos(tipo, caja?.bbox);
  }

  @Query(() => [SerieDatosTipo], { name: 'series', description: 'Series para las gráficas: precios por cultivo ("market:") y estadísticas ("statistics:").' })
  series(@Args('prefijo', { type: () => String, nullable: true }) prefijo?: string) {
    return this.predicciones.series(prefijo ?? undefined);
  }

  @Query(() => TablaModeloTipo, { name: 'tablaModelo', nullable: true, description: 'Salidas de modelos sin capa: "rendimiento", "rotacion", "ciclo".' })
  tablaModelo(@Args('clave', { type: () => String }) clave: string) {
    return this.predicciones.tabla(clave);
  }

  @Query(() => [AlertaResumenTipo], { name: 'alertas', description: 'Alertas resumen (sequía y estrés).' })
  alertas() {
    return this.predicciones.alertas();
  }

  @Query(() => ResumenHumedad, { name: 'resumenHumedad', nullable: true })
  resumenHumedad() {
    return this.predicciones.resumenHumedad();
  }

  @Query(() => ResumenClima, { name: 'resumenClima', nullable: true })
  resumenClima() {
    return this.predicciones.resumenClima();
  }

  @Query(() => [String], { name: 'datosNoDisponibles', description: 'Lo que la app pide pero no tiene modelo ni dato (erosión, reservas de agua...): nunca se inventa.' })
  datosNoDisponibles() {
    return this.predicciones.noDisponible();
  }

  @Query(() => EstadoPrediccionesTipo, { name: 'estadoPredicciones', nullable: true, description: 'Versión de predicciones activa, sus modelos y sus límites. null si no hay ninguna.' })
  estadoPredicciones() {
    return this.predicciones.estado();
  }
}
