import { Inject, Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppConfig } from '../config/config.service';
import { DATOS, DatosPort } from '../datos/datos.port';
import { MOTOR, MotorPort } from '../motor/motor.port';
import { PrediccionesService } from '../predicciones/predicciones.service';
import { PrismaService } from '../prisma/prisma.service';
import { EstadoFuente, EstadoServicio, NivelEstado } from './salud.model';

function leerVersion(): string {
  try {
    return (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version?: string }).version ?? 'desconocida';
  } catch {
    return 'desconocida';
  }
}

@Injectable()
export class SaludService {
  private readonly version = leerVersion();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly predicciones: PrediccionesService,
    @Inject(MOTOR) private readonly motor: MotorPort,
    @Inject(DATOS) private readonly datos: DatosPort,
  ) {}

  /** Comprueba la base de datos y PostGIS. Es lo único que hace caer el estado general a NO_DISPONIBLE. */
  async baseDeDatos(): Promise<EstadoFuente[]> {
    try {
      const filas = await this.prisma.$queryRaw<{ postgis: string | null }[]>`
        SELECT (SELECT extversion FROM pg_extension WHERE extname = 'postgis') AS postgis
      `;
      const postgis = filas[0]?.postgis;
      return [
        { nombre: 'base de datos', estado: NivelEstado.OK },
        postgis
          ? { nombre: 'PostGIS', estado: NivelEstado.OK, detalle: `versión ${postgis}` }
          : { nombre: 'PostGIS', estado: NivelEstado.NO_DISPONIBLE, detalle: 'la extensión no está instalada' },
      ];
    } catch {
      return [{ nombre: 'base de datos', estado: NivelEstado.NO_DISPONIBLE, detalle: 'no responde' }];
    }
  }

  /** ¿Hay una versión de predicciones de ml/ cargada? Sin base de datos no se puede saber: se omite la consulta. */
  private async estadoPredicciones(base: EstadoFuente[]): Promise<EstadoFuente> {
    const nombre = 'predicciones de los modelos (ml/)';
    if (base.some((f) => f.estado === NivelEstado.NO_DISPONIBLE)) {
      return { nombre, estado: NivelEstado.NO_DISPONIBLE, detalle: 'sin base de datos' };
    }
    try {
      const version = await this.predicciones.versionActiva();
      return version
        ? { nombre, estado: NivelEstado.OK, detalle: `versión ${version.version}, datos al ${version.datosAl.toISOString().slice(0, 10)}` }
        : { nombre, estado: NivelEstado.NO_DISPONIBLE, detalle: 'aún no se importa ninguna versión (npm run import:predicciones)' };
    } catch {
      return { nombre, estado: NivelEstado.NO_DISPONIBLE, detalle: 'no se pudo consultar' };
    }
  }

  async estado(): Promise<EstadoServicio> {
    const base = await this.baseDeDatos();
    const fuentes: EstadoFuente[] = [
      ...base,
      await this.estadoPredicciones(base),
      {
        nombre: 'motor de reglas',
        estado: this.motor.disponible ? NivelEstado.OK : NivelEstado.NO_DISPONIBLE,
        detalle: this.motor.disponible ? undefined : 'aún no conectado',
      },
      {
        nombre: 'datos de clima y suelo',
        estado: this.datos.disponible ? NivelEstado.OK : NivelEstado.NO_DISPONIBLE,
        detalle: !this.datos.disponible ? 'aún no conectado' : this.config.env.DEMO_OFFLINE ? 'modo demo (fixtures)' : undefined,
      },
    ];
    const baseCaida = base.some((f) => f.estado === NivelEstado.NO_DISPONIBLE);
    const algunaCaida = fuentes.some((f) => f.estado !== NivelEstado.OK);
    return {
      estado: baseCaida ? NivelEstado.NO_DISPONIBLE : algunaCaida ? NivelEstado.DEGRADADO : NivelEstado.OK,
      version: this.version,
      entorno: this.config.env.NODE_ENV,
      demoOffline: this.config.env.DEMO_OFFLINE,
      fuentes,
    };
  }
}
