import { elegirEscenario, RejillaEscenario } from './escenario';

// 3 lluvias × 2 temperaturas; el valor de la celda 0 es 10·(lluvia/25) + 100·(temp/2) para poder verificar a mano
const rejillas: RejillaEscenario[] = [];
for (const lluviaPct of [-25, 0, 25]) {
  for (const tempDeltaC of [0, 2]) {
    rejillas.push({ lluviaPct, tempDeltaC, valores: [10 * (lluviaPct / 25) + 100 * (tempDeltaC / 2), null, 5] });
  }
}

describe('elegirEscenario', () => {
  it('devuelve la rejilla exacta cuando el escenario está calculado', () => {
    const e = elegirEscenario(rejillas, 25, 2);
    expect(e).toMatchObject({ lluviaPct: 25, tempDeltaC: 2, interpolado: false, recortado: false });
    expect(e.valores).toEqual([110, null, 5]);
  });

  it('interpola de forma bilineal entre los cuatro escenarios vecinos', () => {
    const e = elegirEscenario(rejillas, 12.5, 1);
    expect(e.interpolado).toBe(true);
    expect(e.valores[0]).toBeCloseTo(10 * 0.5 + 100 * 0.5, 6); // 55
    expect(e.valores[2]).toBe(5);
  });

  it('una celda sin dato en un vecino queda sin dato en vez de inventarse', () => {
    expect(elegirEscenario(rejillas, 10, 1).valores[1]).toBeNull();
  });

  it('recorta lo que está fuera del rango y lo avisa', () => {
    const e = elegirEscenario(rejillas, 80, 9);
    expect(e).toMatchObject({ lluviaPct: 25, tempDeltaC: 2, recortado: true, interpolado: false });
    expect(e.valores[0]).toBe(110);
    const bajo = elegirEscenario(rejillas, -90, -5);
    expect(bajo).toMatchObject({ lluviaPct: -25, tempDeltaC: 0, recortado: true });
  });

  it('con un solo escenario (capa sin sliders) siempre devuelve ese', () => {
    const una = [{ lluviaPct: 0, tempDeltaC: 0, valores: [1, 2] }];
    const e = elegirEscenario(una, 40, 3);
    expect(e.valores).toEqual([1, 2]);
    expect(e.recortado).toBe(true);
  });

  it('falla claro si la tabla de escenarios está incompleta o vacía', () => {
    expect(() => elegirEscenario([], 0, 0)).toThrow(/no tiene escenarios/);
    expect(() => elegirEscenario(rejillas.filter((r) => !(r.lluviaPct === 0 && r.tempDeltaC === 0)), 0, 0)).toThrow(/Falta el escenario/);
  });

  it('los resultados no cambian el arreglo de entrada', () => {
    const copia = JSON.stringify(rejillas);
    elegirEscenario(rejillas, 3, 1);
    expect(JSON.stringify(rejillas)).toBe(copia);
  });
});
