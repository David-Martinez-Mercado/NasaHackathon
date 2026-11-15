import { Injectable, Module } from '@nestjs/common';
import { AppError, CodigoError } from '../common/errors';

export type Semaforo = 'VERDE' | 'AMARILLO' | 'ROJO';

export interface PuntajesRotacion {
  agua: number;
  suelo: number;
  riesgo: number;
  global: number;
}

/** Salida del motor de reglas (interfaz acordada en el agente `agronomo-reglas`). */
export interface RotacionEvaluada {
  anios: [string, string, string];
  puntajes: PuntajesRotacion;
  semaforos: Record<keyof PuntajesRotacion, Semaforo>;
  explicacion: string;
  criterioHumano: string[];
}

export type SistemaRiegoMotor = 'TEMPORAL' | 'GRAVEDAD' | 'ASPERSION' | 'GOTEO';

/** Lo que el agricultor capturó, tal como lo necesita el motor (las 4 prioridades van de 0 a 100). */
export interface PreferenciasAgricultor {
  riego: boolean;
  sistemaRiego: SistemaRiegoMotor;
  aguaRiegoMm?: number;
  tipoSuelo: 'ARCILLOSO' | 'ARENOSO' | 'FRANCO' | 'SATELITAL';
  mesesVacios?: { desde: number; hasta: number };
  maquinaria: string[];
  cultivosPreferidos: string[];
  cultivosExcluidos: string[];
  prioridades: { agua: number; suelo: number; erosion: number; ingreso: number };
}

export interface Escenario {
  lluviaPct: number;
  tempDeltaC: number;
}

/**
 * Contexto de la parcela (clima, suelo, NDVI...). [POR VERIFICAR]: el formato lo define docs/contrato-datos.md,
 * que todavía no existe; hasta entonces el backend solo lo transporta sin mirar su interior.
 */
export type ParcelaContexto = Record<string, unknown>;

/** Lo que el backend necesita del motor de reglas (módulo `motor/`, de agronomo-reglas). */
export interface MotorPort {
  readonly disponible: boolean;
  recomendar(contexto: ParcelaContexto, prefs: PreferenciasAgricultor, escenario?: Escenario): Promise<RotacionEvaluada[]>;
}

export const MOTOR = Symbol('MOTOR');

/** Sustituto mientras el motor real no exista: responde con un error claro en vez de inventar resultados. */
@Injectable()
export class MotorNoDisponible implements MotorPort {
  readonly disponible = false;

  async recomendar(): Promise<RotacionEvaluada[]> {
    throw new AppError(CodigoError.NO_IMPLEMENTADO, 'El motor de recomendación todavía no está disponible.');
  }
}

/** Para conectar el motor real: cambiar `useClass` por la implementación de agronomo-reglas. */
@Module({
  providers: [{ provide: MOTOR, useClass: MotorNoDisponible }],
  exports: [MOTOR],
})
export class MotorModule {}
