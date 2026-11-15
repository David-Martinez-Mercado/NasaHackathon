import { Injectable, Module } from '@nestjs/common';
import { AppError, CodigoError } from '../common/errors';
import { ParcelaContexto } from '../motor/motor.port';

/** Lo que el backend necesita de los datos externos (módulo `datos/`, de ingeniero-datos): NASA POWER, NDVI, suelo. */
export interface DatosPort {
  readonly disponible: boolean;
  /** Contexto de una coordenada. Con DEMO_OFFLINE=true debe responder con fixtures en vez de llamar a las APIs. */
  contexto(latitud: number, longitud: number): Promise<ParcelaContexto>;
}

export const DATOS = Symbol('DATOS');

@Injectable()
export class DatosNoDisponibles implements DatosPort {
  readonly disponible = false;

  async contexto(): Promise<ParcelaContexto> {
    throw new AppError(CodigoError.FUENTE_NO_DISPONIBLE, 'Todavía no hay conexión con los datos de clima y suelo.');
  }
}

/** Para conectar los clientes reales: cambiar `useClass` por la implementación de ingeniero-datos. */
@Module({
  providers: [{ provide: DATOS, useClass: DatosNoDisponibles }],
  exports: [DATOS],
})
export class DatosModule {}
