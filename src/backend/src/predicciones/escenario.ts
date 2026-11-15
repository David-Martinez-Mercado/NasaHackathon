/** Interpolación de los escenarios ¿y si? de una capa (los sliders de lluvia y temperatura). */

export interface RejillaEscenario {
  lluviaPct: number;
  tempDeltaC: number;
  valores: (number | null)[];
}

export interface EscenarioElegido {
  lluviaPct: number;
  tempDeltaC: number;
  /** true si el valor pedido no estaba exacto en la tabla y se interpoló entre escenarios vecinos. */
  interpolado: boolean;
  /** true si el valor pedido cayó fuera del rango calculado y se recortó al borde. */
  recortado: boolean;
  valores: (number | null)[];
}

const unicos = (valores: number[]) => [...new Set(valores)].sort((a, b) => a - b);

/** Los dos escenarios calculados que rodean a `x` (o el mismo dos veces si coincide o está fuera del rango). */
function rodear(x: number, ejes: number[]): { bajo: number; alto: number; t: number; recortado: boolean } {
  const primero = ejes[0];
  const ultimo = ejes[ejes.length - 1];
  if (x <= primero) return { bajo: primero, alto: primero, t: 0, recortado: x < primero };
  if (x >= ultimo) return { bajo: ultimo, alto: ultimo, t: 0, recortado: x > ultimo };
  const i = ejes.findIndex((e) => e >= x);
  if (ejes[i] === x) return { bajo: x, alto: x, t: 0, recortado: false };
  const bajo = ejes[i - 1];
  const alto = ejes[i];
  return { bajo, alto, t: (x - bajo) / (alto - bajo), recortado: false };
}

/**
 * Devuelve la rejilla para (lluviaPct, tempDeltaC). Entre los escenarios precalculados interpola de forma bilineal;
 * una celda sin dato en alguno de los cuatro vecinos queda sin dato (no se inventa). Fuera del rango se usa el borde
 * y se avisa con `recortado`.
 */
export function elegirEscenario(rejillas: RejillaEscenario[], lluviaPct: number, tempDeltaC: number): EscenarioElegido {
  if (!rejillas.length) throw new Error('The layer has no scenarios');
  const lluvias = unicos(rejillas.map((r) => r.lluviaPct));
  const temps = unicos(rejillas.map((r) => r.tempDeltaC));
  const porClave = new Map(rejillas.map((r) => [`${r.lluviaPct}|${r.tempDeltaC}`, r]));
  const traer = (lluvia: number, temp: number) => {
    const r = porClave.get(`${lluvia}|${temp}`);
    if (!r) throw new Error(`The scenario ${lluvia} % rain and ${temp} °C is missing in the layer`);
    return r.valores;
  };

  const l = rodear(lluviaPct, lluvias);
  const t = rodear(tempDeltaC, temps);
  const exacto = l.bajo === l.alto && t.bajo === t.alto;
  const n = rejillas[0].valores.length;
  const a = traer(l.bajo, t.bajo);
  const valores: (number | null)[] = new Array(n);
  if (exacto) {
    for (let i = 0; i < n; i++) valores[i] = a[i];
  } else {
    const b = traer(l.alto, t.bajo);
    const c = traer(l.bajo, t.alto);
    const d = traer(l.alto, t.alto);
    for (let i = 0; i < n; i++) {
      if (a[i] == null || b[i] == null || c[i] == null || d[i] == null) {
        valores[i] = null;
        continue;
      }
      const sur = a[i]! * (1 - l.t) + b[i]! * l.t;
      const norte = c[i]! * (1 - l.t) + d[i]! * l.t;
      valores[i] = Math.round((sur * (1 - t.t) + norte * t.t) * 10_000) / 10_000;
    }
  }
  return {
    lluviaPct: Math.min(Math.max(lluviaPct, lluvias[0]), lluvias[lluvias.length - 1]),
    tempDeltaC: Math.min(Math.max(tempDeltaC, temps[0]), temps[temps.length - 1]),
    interpolado: !exacto,
    recortado: l.recortado || t.recortado,
    valores,
  };
}
