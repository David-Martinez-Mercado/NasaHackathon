import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type TipoArchivoExport = 'manifest' | 'layer' | 'points' | 'series' | 'summaries' | 'tables';

/** Versión del contrato que este backend sabe leer (ml/fieldshift_ml/deploy/schema.py: SCHEMA_VERSION). */
export const VERSION_ESQUEMA_SOPORTADA = 1;

/** Dónde buscar el esquema JSON que genera ml/ (`fieldshift-ml deploy schema`). Se puede cambiar con EXPORT_SCHEMA_PATH. */
export function rutaEsquemaPorDefecto(): string {
  return resolve(process.env.EXPORT_SCHEMA_PATH ?? resolve(process.cwd(), '../../ml/deploy/export.schema.json'));
}

/** Valida cada archivo del export contra el MISMO esquema que lo escribió: el contrato vive en un solo lugar. */
export class ValidadorExport {
  private readonly ajv: Ajv2020;

  constructor(esquema: Record<string, unknown>) {
    this.ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(this.ajv);
    this.ajv.addSchema(esquema, 'export');
  }

  static desdeArchivo(ruta: string = rutaEsquemaPorDefecto()): ValidadorExport {
    if (!existsSync(ruta)) {
      throw new Error(`Cannot find the export schema at ${ruta}. Generate it with "fieldshift-ml deploy schema" or set EXPORT_SCHEMA_PATH.`);
    }
    return new ValidadorExport(JSON.parse(readFileSync(ruta, 'utf8')) as Record<string, unknown>);
  }

  /** Lista de problemas (vacía si el archivo es válido). */
  validar(tipo: TipoArchivoExport, dato: unknown): string[] {
    const funcion = this.ajv.getSchema(`export#/$defs/file_${tipo}`);
    if (!funcion) throw new Error(`The schema does not define file_${tipo}`);
    if (funcion(dato)) return [];
    return (funcion.errors ?? []).slice(0, 8).map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`);
  }
}
