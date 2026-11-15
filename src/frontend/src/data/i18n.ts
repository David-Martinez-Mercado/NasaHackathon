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
  return translateText(note);
}

const SOURCE: [RegExp, string][] = [
  [/\+ modelo /g, '+ model '], [/\+ regla de persistencia /g, '+ persistence rule '], [/mensual/g, 'monthly'],
  [/SRTM reprocesado/g, 'reprocessed SRTM'], [/normales/g, 'normals'], [/nacional, EE\. UU\./g, 'national, U.S.'],
  [/pendiente/g, 'slope'],
];
export const translateSource = (source: string): string => SOURCE.reduce((s, [a, b]) => s.replace(a, b), source);

/* ---------- crops: the catalog and the model tables use Spanish codes and names ---------- */

const CROP_NAMES: Record<string, string> = {
  frijol: 'Bean', maiz: 'Maize', maiz_grano: 'Grain maize', avena: 'Oats', sorgo: 'Sorghum', trigo: 'Wheat', trigo_invierno: 'Winter wheat',
  cebada: 'Barley', chile: 'Chili pepper', papa: 'Potato', alfalfa: 'Alfalfa', veza: 'Vetch (green manure)', soya: 'Soybean',
  girasol: 'Sunflower', remolacha: 'Sugar beet', barbecho: 'Fallow', mijo: 'Millet', triticale: 'Triticale', otro: 'Other', otro_heno: 'Other hay',
};
/** English name of a crop from its code; unknown codes are shown as they came, tidied up. */
export const cropLabel = (code: string, fallback?: string): string =>
  CROP_NAMES[code] ?? fallback ?? code.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Model names as they come from the export. */
const MODEL_NAMES: Record<string, string> = {
  base_persistencia: 'Persistence rule', logistica: 'Logistic regression', indice_experto: 'Expert index',
  base_climatologia: 'Monthly climatology', auto_theta: 'AutoTheta', xgboost: 'XGBoost', catboost: 'CatBoost', patchtst: 'PatchTST',
};
export const translateModelName = (name: string): string => MODEL_NAMES[name] ?? name;

/* ---------- texts that come with the data (titles, units, notes, limits) ---------- */

const TEXT: Record<string, string> = {
  'XGBoost (regresión)': 'XGBoost (regression)', 'XGBoost (clasificación, 17 clases)': 'XGBoost (classification, 17 classes)',
  'PatchTST (pronóstico a 4 semanas)': 'PatchTST (4-week forecast)', 'AutoTheta (pronóstico a 6 meses)': 'AutoTheta (6-month forecast)',
  'Persistencia: P(sequía en 3 meses | ¿sequía ahora?)': 'Persistence: P(drought in 3 months | drought now?)',
  'Regresión logística': 'Logistic regression', 'CatBoost (clasificación)': 'CatBoost (classification)',
  'Índice experto (promedio de variables orientadas y estandarizadas)': 'Expert index (average of oriented, standardized variables)',
  'Climatología mensual (promedio de cada mes)': 'Monthly climatology (average of each month)',
  'R² 0.899 contra 0.900 de Extra Trees (160 MB); el R² de la anomalía respecto al historial del condado es ~0.48':
    'R² 0.899 against 0.900 for Extra Trees (160 MB); the R² of the anomaly relative to the county history is ~0.48',
  'Gana a la cadena de Markov de 2.º orden (F1 macro 0.31 contra 0.22); versión compacta de 120 árboles':
    'Beats the 2nd-order Markov chain (macro F1 0.31 against 0.22); compact version of 120 trees',
  'Ningún modelo supera a la persistencia (el mejor, k-vecinos, 0.567 contra 0.539, intervalos traslapados)':
    'No model beats persistence (the best, k-nearest neighbors, 0.567 against 0.539, overlapping intervals)',
  'Sin etiqueta real; el índice experto y PCA son igual de estables y el primero se explica en una frase':
    'There is no real label; the expert index and PCA are equally stable, and the first can be explained in one sentence',
  'Error de ~8 días contra 10.5 de la duración habitual': 'Error of ~8 days against 10.5 for the usual duration',
  'ROC-AUC 0.77 contra 0.50 de la frecuencia histórica': 'ROC-AUC 0.77 against 0.50 for the historical frequency',
  'AutoTheta (0.657) y la climatología (0.686) no se distinguen; se despliega la regla simple':
    'AutoTheta (0.657) and the climatology (0.686) cannot be told apart; the simple rule is deployed',
  'Temperatura, humedad, lluvia y sequía vienen de reanálisis de 25–50 km: no distinguen parcelas vecinas.':
    'Temperature, moisture, rain and drought come from 25–50 km reanalysis: they cannot tell neighboring fields apart.',
  'Los escenarios ¿y si? son sensibilidades de los modelos, no proyecciones climáticas.': 'The “what if?” scenarios are sensitivities of the models, not climate projections.',
  'El ML entrega insumos; la recomendación final la da y explica el motor de reglas. La herramienta apoya, no reemplaza, la experiencia local.':
    'The ML provides inputs; the final recommendation is given and explained by the rules engine. The tool supports, and does not replace, local experience.',
  'Los modelos se entrenaron con datos de Weld, Colorado (EE. UU.), no de Durango.': 'The models were trained on data from Weld, Colorado (U.S.), not from Durango.',
  'Sequía': 'Drought', 'Puntos de estrés': 'Stress points', 'Puntos de erosión': 'Erosion points',
  'Porcentaje de celdas de ~25 km de la zona en sequía en el último mes de ERA5.': 'Percentage of ~25 km cells in the area in drought in the latest ERA5 month.',
  'Porcentaje de píxeles evaluados con ESI previsto en el 10 % más bajo del ESI observado en 2024–2026.':
    'Percentage of evaluated pixels with a predicted ESI in the lowest 10 % of the ESI observed in 2024–2026.',
  'Porcentaje de píxeles de cultivo muestreados cuyo potencial de erosión (suelo × pendiente × lluvia) es 3 o más veces el de un píxel típico. Es potencial, no erosión medida.':
    'Percentage of sampled cropland pixels whose erosion potential (soil × slope × rain) is 3 or more times that of a typical pixel. It is potential, not measured erosion.',
  'NASA POWER (MERRA-2): GWETROOT, GWETTOP, EVPTRNS; percentil de los últimos 28 días contra los mismos días de años anteriores (Greeley)':
    'NASA POWER (MERRA-2): GWETROOT, GWETTOP, EVPTRNS; percentile of the last 28 days against the same days of previous years (Greeley)',
  'La temperatura es climatología del próximo mes (1991–2020), no un pronóstico: no hay modelo de temperatura.':
    'Temperature is the climatology of next month (1991–2020), not a forecast: there is no temperature model.',
  'La lluvia mensual es la climatología (regla c08b).': 'Monthly rain is the climatology (rule c08b).',
  'Reservas de agua y balance hídrico (no hay fuente con licencia verificada)': 'Water reserves and water balance (there is no source with a verified license)',
  'Recomendaciones agronómicas por capa (las entrega el motor de reglas, no el ML)': 'Agronomic recommendations per layer (they come from the rules engine, not from ML)',
  'El R² global alto se debe sobre todo a distinguir cultivos; el de la anomalía respecto al historial del condado es ~0.48.':
    'The high overall R² is mostly due to telling crops apart; the R² of the anomaly relative to the county history is ~0.48.',
  'Los escenarios de lluvia y temperatura mueven las variables de clima que entran al modelo: es una sensibilidad del modelo, no una proyección climática.':
    'The rain and temperature scenarios shift the climate inputs of the model: it is the model’s sensitivity, not a climate projection.',
  'La respuesta del modelo a la lluvia es una asociación estadística entre estados, no causal: en el maíz de riego los años más secos y soleados rinden más. Usar los escenarios solo como referencia.':
    'The model’s response to rain is a statistical association across states, not a causal one: in irrigated maize the driest, sunniest years yield more. Use the scenarios only as a reference.',
  'Qué se siembra el año 2024 según el cultivo del año anterior': 'What is planted in 2024 given the previous year’s crop',
  'Probabilidad media sobre los píxeles de cultivo muestreados de Weld (CDL), por cultivo del año anterior.':
    'Average probability over the sampled Weld cropland pixels (CDL), by previous-year crop.',
  'CDL es una clasificación de satélite: sus errores entran como ruido.': 'CDL is a satellite classification: its errors enter as noise.',
  'Días de siembra a cosecha': 'Days from planting to harvest', 'días': 'days',
  '`fitted_days` es el ajuste a una temporada que el modelo ya vio al entrenar, no un pronóstico.': '`fitted_days` is the fit to a season the model already saw in training, not a forecast.',
  'Incluye el secado en campo, no solo la madurez fisiológica.': 'It includes field drying, not only physiological maturity.',
  'Ciclo = del 50 % sembrado al 50 % cosechado (avance semanal de NASS, nivel estado).': 'Cycle = from 50 % planted to 50 % harvested (weekly NASS progress, state level).',
  'Riesgo de sequía': 'Drought risk', 'Elevación': 'Elevation', 'Potencial de erosión': 'Erosion potential',
  'Probabilidad de sequía (SPI de 3 meses bajo -1) dentro de 3 meses': 'Chance of drought (3-month SPI below -1) within 3 months',
  'Índice relativo de exposición a la erosión por agua, 0–100': 'Relative index of exposure to water erosion, 0–100',
  'Humedad de la zona de raíces (GWETROOT de MERRA-2) esperada como promedio de las próximas 4 semanas': 'Root-zone moisture (GWETROOT from MERRA-2) expected as the average of the next 4 weeks',
  'Probabilidad de lluvia (1 mm o más) mañana': 'Chance of rain (1 mm or more) tomorrow',
  'Inclinación del terreno (% = metros de subida por cada 100 m): promedio por celda del mapa': 'Slope of the terrain (% = meters of rise per 100 m): average per map cell',
  'Probabilidad media de que empiece una ola de calor (3 o más días seguidos sobre el percentil 90) en los 7 días siguientes, promedio de junio–agosto 2026':
    'Average chance that a heat wave (3 or more days in a row above the 90th percentile) starts within the next 7 days, June–August 2026 average',
  'Índice de vulnerabilidad 0-100: qué tan frágil es cada zona (suelo, clima normal e historial de cultivo)': 'Vulnerability index 0-100: how fragile each area is (soil, normal climate and crop history)',
  'Alto: 3 o más veces lo típico; medio: 1.8 o más. Los umbrales son provisionales ([POR VERIFICAR] con un agrónomo).':
    'High: 3 or more times the typical value; medium: 1.8 or more. The thresholds are provisional ([TO VERIFY] with an agronomist).',
  'veces el potencial de un píxel de cultivo típico (mediana)': 'times the potential of a typical cropland pixel (median)',
  'Potencial de erosión alto': 'High erosion potential', 'Estrés hídrico medio': 'Medium water stress', 'Estrés hídrico alto': 'High water stress',
  'ESI (0 = estrés total, 1 = sin estrés)': 'ESI (0 = total stress, 1 = no stress)',
  'Alto: ESI previsto en el 10 % más bajo del ESI observado por ECOSTRESS en 2024–2026; medio: hasta el 25 % más bajo. Los umbrales no cambian con la fecha.':
    'High: predicted ESI in the lowest 10 % of the ESI observed by ECOSTRESS in 2024–2026; medium: up to the lowest 25 %. The thresholds do not change with the date.',
  'Se evaluaron 2,499 píxeles muestreados de 70 m, no todos los de la zona.': '2,499 sampled 70 m pixels were evaluated, not all of the area.',
  'Precios nominales, sin ajustar por inflación.': 'Nominal prices, not adjusted for inflation.',
  'Los últimos 6 puntos son pronóstico.': 'The last 6 points are a forecast.',
  'El precio entra a la herramienta como dato; este pronóstico es solo exploratorio.': 'The price enters the tool as data; this forecast is only exploratory.',
  'Región (promedio de 2 puntos)': 'Region (average of 2 points)',
  'La zona tiene solo 2 puntos de reanálisis: la \'región\' es su promedio.': 'The area has only 2 reanalysis points: the “region” is their average.',
  'Humedad de raíz media anual': 'Average annual root moisture', 'Temperatura media anual': 'Average annual temperature',
  'Humedad del suelo': 'Soil moisture', 'Probabilidad de lluvia': 'Rain probability', 'Riesgo de ola de calor': 'Heat-wave risk',
  'Condado de Weld, Colorado (EE. UU.)': 'Weld County, Colorado (U.S.)',
  'Rendimiento del condado de Weld, temporada 2025': 'Weld County yield, 2025 season',
  'Greeley (riego)': 'Greeley (irrigated)', 'Nunn / CPER (temporal)': 'Nunn / CPER (rainfed)',
};

const TEMPLATES: [RegExp, (...g: string[]) => string][] = [
  [/^(\d[\d,]*) puntos críticos de ([\d,]+) píxeles evaluados$/, (a, b) => `${a} critical points out of ${b} evaluated pixels`],
  [/^(\d[\d,]*) de ([\d,]+) píxeles de cultivo con potencial de erosión alto$/, (a, b) => `${a} of ${b} cropland pixels with high erosion potential`],
  [/^(\d[\d,]*) de (\d+) celdas de ERA5 con SPI de 3 meses bajo -1$/, (a, b) => `${a} of ${b} ERA5 cells with a 3-month SPI below -1`],
  [/^Se evaluaron ([\d,]+) píxeles de cultivo muestreados; se muestran los de mayor potencial, separados al menos 2 km\.$/,
    (a) => `${a} sampled cropland pixels were evaluated; the ones with the highest potential are shown, at least 2 km apart.`],
  [/^Clima de ([\d-]+) \(última escena ECOSTRESS disponible\)\.$/, (a) => `Weather of ${a} (latest ECOSTRESS scene available).`],
  [/^El último año llega hasta ([\d-]+)\.$/, (a) => `The latest year runs up to ${a}.`],
  [/^Precio recibido por el productor: (.+)$/, (a) => `Price received by the producer: ${cropLabel(a).toLowerCase()}`],
  [/^Último mes disponible en ERA5: (.+)\.$/, (a) => `Latest month available in ERA5: ${a}.`],
  [/^Exposición media de la temporada de calor más reciente \(([^)]+)\): promedio, sobre todos sus días, de la probabilidad de que empiece una ola en los 7 días siguientes\.$/,
    (a) => `Average exposure over the most recent heat season (${a.replace('junio–agosto', 'June–August')}): the mean, over all its days, of the chance that a heat wave starts within the next 7 days.`],
];

/** Translates a text that comes with the data. Unknown texts are shown as they came, never dropped or altered. */
export function translateText(text: string): string {
  if (!text) return text;
  const known = EXACT[text] ?? TEXT[text];
  if (known) return known;
  for (const [re, fn] of TEMPLATES) {
    const m = text.match(re);
    if (m) return fn(...m.slice(1));
  }
  return text;
}
