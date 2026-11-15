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
      'A map layer for a rain and temperature scenario (the sliders). Between the precomputed scenarios it ' +
      'interpolates; without a scenario, normal conditions. null if that layer was not loaded.',
  })
  capa(@Args('tipo', { type: () => TipoCapa }) tipo: TipoCapa, @Args('escenario', { type: () => EscenarioInput, nullable: true }) escenario?: EscenarioInput) {
    return this.predicciones.capa(tipo, escenario ?? undefined);
  }

  @Query(() => ConjuntoPuntosTipo, { name: 'puntos', nullable: true, description: 'Alert points (e.g. stress), optionally inside a map box.' })
  puntos(@Args('tipo', { type: () => TipoPunto }) tipo: TipoPunto, @Args('caja', { type: () => CajaInput, nullable: true }) caja?: CajaInput) {
    return this.predicciones.puntos(tipo, caja?.bbox);
  }

  @Query(() => [SerieDatosTipo], { name: 'series', description: 'Series for the charts: prices per crop ("market:") and statistics ("statistics:").' })
  series(@Args('prefijo', { type: () => String, nullable: true }) prefijo?: string) {
    return this.predicciones.series(prefijo ?? undefined);
  }

  @Query(() => TablaModeloTipo, { name: 'tablaModelo', nullable: true, description: 'Model outputs without a layer: "rendimiento", "rotacion", "ciclo".' })
  tablaModelo(@Args('clave', { type: () => String }) clave: string) {
    return this.predicciones.tabla(clave);
  }

  @Query(() => [AlertaResumenTipo], { name: 'alertas', description: 'Summary alerts (drought and stress).' })
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

  @Query(() => [String], { name: 'datosNoDisponibles', description: 'What the app asks for but has no model or data for (erosion, water reserves...): it is never made up.' })
  datosNoDisponibles() {
    return this.predicciones.noDisponible();
  }

  @Query(() => EstadoPrediccionesTipo, { name: 'estadoPredicciones', nullable: true, description: 'Active predictions version, its models and its limits. null if there is none.' })
  estadoPredicciones() {
    return this.predicciones.estado();
  }
}
