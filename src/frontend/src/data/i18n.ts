/**
 * The backend writes its notes in Spanish (they come from the ML export); the screen is in English.
 * Known texts are translated here; anything unknown is shown as it came, never dropped or altered.
 */
const EXACT: Record<string, string> = {
  'Regla de persistencia, no un modelo aprendido: ningún modelo superó a la persistencia.': 'A persistence rule, not a learned model: no model beat persistence.',
  'Celdas nativas de ERA5 (~25 km); la rejilla no está suavizada.': 'Native ERA5 cells (~25 km); the grid is not smoothed.',
  'Es un dato fijo: el relieve se midió en la misión SRTM de febrero de 2000.': 'Fixed data: the terrain was measured by the SRTM mission in February 2000.',
  'Cada celda del mapa (~3.4 km) promedia las celdas de 30 m que contiene.': 'Each map cell (~3.4 km) averages the 30 m cells it contains.',
  'Índice relativo de potencial de erosión por agua: erosionabilidad del suelo (K de SSURGO) × pendiente (RUSLE) × lluvia (normal anual de PRISM como sustituto de la erosividad).':
    'Relative index of water-erosion potential: soil erodibility (SSURGO K) × slope (RUSLE) × rain (PRISM annual normal as a stand-in for erosivity).',
  'Mide lo que la tierra tiene de expuesta por sí misma; no incluye la cobertura ni el manejo del cultivo ni la longitud de la pendiente.':
    'It measures how exposed the land is by itself; it does not include crop cover, management or slope length.',
  'No es pérdida de suelo en toneladas: no hay erosión medida con qué calibrarlo. El valor es el percentil entre los píxeles de cultivo muestreados.':
    'It is not soil loss in tons: there is no measured erosion to calibrate it. The value is the percentile among the sampled cropland pixels.',
  'Cada celda promedia píxeles de cultivo de 30 m muestreados; las celdas vacías no tienen cultivo muestreado.':
    'Each cell averages sampled 30 m cropland pixels; empty cells have no sampled cropland.',
  'Cada celda promedia píxeles de 30 m muestreados; las celdas vacías no tienen cultivo muestreado.':
    'Each cell averages sampled 30 m pixels; empty cells have no sampled cropland.',
  'El clima viene de 2 puntos de reanálisis (~50 km): dentro de una parcela el valor es uno solo y el degradado entre puntos es interpolación, no variación medida.':
    'The climate comes from 2 reanalysis points (~50 km): inside a field there is a single value, and the gradient between points is interpolation, not measured variation.',
  'El modelo usa solo la propia serie de humedad: los sliders no cambian esta capa.': 'The model uses only the moisture series itself: the sliders do not change this layer.',
  'Su ventaja sobre repetir la última semana no es concluyente (intervalos traslapados).': 'Its advantage over repeating last week is not conclusive (overlapping intervals).',
  'Los escenarios de lluvia y temperatura mueven las variables de clima que entran al modelo: es una sensibilidad del modelo, no una proyección climática.':
    'The rain and temperature scenarios shift the climate inputs of the model: it is the model’s sensitivity, not a climate projection.',
  'Calculada celda a celda a 30 m (método de Horn) y promediada en cada celda del mapa.': 'Computed cell by cell at 30 m (Horn’s method) and averaged into each map cell.',
  'El promedio suaviza lomas y cárcavas pequeñas: dentro de una parcela la pendiente puede ser mayor.':
    'Averaging smooths small knolls and gullies: inside a field the slope can be steeper.',
  'Fuera de mayo–septiembre el modelo no se usa: no hay pronóstico de ola de calor para hoy.':
    'Outside May–September the model is not used: there is no heat-wave forecast for today.',
  'La respuesta a la lluvia es una asociación estadística del modelo (más lluvia reciente va con más probabilidad de ola), no un efecto físico comprobado.':
    'The response to rain is a statistical association in the model (more recent rain goes with a higher chance of a heat wave), not a proven physical effect.',
  'Índice relativo (percentil entre los píxeles de cultivo muestreados), no una medida física.': 'Relative index (percentile among the sampled cropland pixels), not a physical measurement.',
  'El modelo usa la pendiente de SSURGO; el DEM de 30 m alimenta las capas de elevación, pendiente y erosión.':
    'The model uses the SSURGO slope; the 30 m elevation model feeds the elevation, slope and erosion layers.',
  'Sin etiqueta real de vulnerabilidad: necesita revisión agronómica.': 'There is no real vulnerability label: it needs agronomic review.',
};

export function translateNote(note: string): string {
  if (EXACT[note]) return EXACT[note];
  let m = note.match(/^Último mes disponible en ERA5: (.+)\.$/);
  if (m) return `Latest month available in ERA5: ${m[1]}.`;
  m = note.match(/^Exposición media de la temporada de calor más reciente \(junio–agosto (\d{4})\)/);
  if (m) return `Average exposure over the most recent heat season (June–August ${m[1]}): the mean, over all its days, of the chance that a heat wave starts within the next 7 days.`;
  return note;
}

const SOURCE: [RegExp, string][] = [
  [/\+ modelo /g, '+ model '], [/\+ regla de persistencia /g, '+ persistence rule '], [/mensual/g, 'monthly'],
  [/SRTM reprocesado/g, 'reprocessed SRTM'], [/normales/g, 'normals'],
];
export const translateSource = (source: string): string => SOURCE.reduce((s, [a, b]) => s.replace(a, b), source);
