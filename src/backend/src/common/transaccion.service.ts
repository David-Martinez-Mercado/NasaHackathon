import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError, CodigoError } from './errors';
import { PrismaService } from '../prisma/prisma.service';

/** Cliente de Prisma dentro de una transacción: es lo que reciben los servicios para que todo vaya en la misma. */
export type Tx = Prisma.TransactionClient;

export interface OpcionesTransaccion {
  /** Por defecto ReadCommitted. Serializable detecta anomalías de concurrencia a costa de reintentos. */
  aislamiento?: Prisma.TransactionIsolationLevel;
  /** Cuántas veces reintentar si PostgreSQL aborta por serialización o interbloqueo (por defecto 3). */
  reintentos?: number;
  /** Tiempo máximo de la transacción completa en ms (por defecto 15 s; importar predicciones pide más). */
  timeoutMs?: number;
}

/** Códigos de PostgreSQL que indican "vuelve a intentar": fallo de serialización e interbloqueo. */
const REINTENTABLES = new Set(['40001', '40P01']);

export function codigoPostgres(error: unknown): string | undefined {
  const meta = (error as { meta?: { code?: string } })?.meta;
  const mensaje = (error as Error)?.message ?? '';
  return meta?.code ?? /Code: `(\w{5})`/.exec(mensaje)?.[1];
}

/** true si el error es de Prisma que dice "escritura en conflicto" (P2034) o de PostgreSQL 40001 / 40P01. */
export function esReintentable(error: unknown): boolean {
  const e = error as { code?: string };
  if (e?.code === 'P2034') return true;
  const pg = codigoPostgres(error);
  return pg !== undefined && REINTENTABLES.has(pg);
}

/** Violación de llave única (23505), venga de una consulta del ORM (P2002) o de SQL crudo. */
export function esLlaveDuplicada(error: unknown): boolean {
  return (error as { code?: string })?.code === 'P2002' || codigoPostgres(error) === '23505';
}

/**
 * Ejecuta un bloque de trabajo como UNA transacción: o se guarda todo o no se guarda nada.
 * Es el único lugar que abre transacciones, así el aislamiento, el tiempo máximo y los reintentos son los mismos
 * en toda la API.
 */
@Injectable()
export class TransaccionService {
  private readonly logger = new Logger(TransaccionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ejecutar<T>(trabajo: (tx: Tx) => Promise<T>, opciones: OpcionesTransaccion = {}): Promise<T> {
    const { aislamiento = Prisma.TransactionIsolationLevel.ReadCommitted, reintentos = 3, timeoutMs = 15_000 } = opciones;
    for (let intento = 0; ; intento++) {
      try {
        return await this.prisma.$transaction(trabajo, { isolationLevel: aislamiento, timeout: timeoutMs, maxWait: 5_000 });
      } catch (error) {
        if (esReintentable(error) && intento < reintentos) {
          this.logger.warn(`Transacción abortada por concurrencia; reintento ${intento + 1} de ${reintentos}`);
          await new Promise((resolver) => setTimeout(resolver, 20 * 2 ** intento));
          continue;
        }
        if (esReintentable(error)) {
          throw new AppError(
            CodigoError.CONFLICTO_CONCURRENCIA,
            'Otra operación modificó los mismos datos al mismo tiempo. Intenta de nuevo en un momento.',
          );
        }
        if ((error as { code?: string })?.code === 'P2028') {
          throw new AppError(CodigoError.ERROR_INTERNO, 'La operación tardó demasiado y se canceló sin guardar nada.');
        }
        throw error;
      }
    }
  }
}
