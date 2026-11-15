# API GraphQL

Endpoint `POST /graphql` (única excepción REST: `GET /health`). Esquema completo y siempre al día en
[`schema.graphql`](schema.graphql) (se regenera con `npm run schema` en `src/backend/`).
En desarrollo: `http://localhost:3000/graphql` abre el Sandbox de Apollo. En producción no hay Sandbox ni introspección.

## Estado de las operaciones
| Operación | Estado | Nota |
|---|---|---|
| `salud` | listo | Estado del servidor, base de datos, PostGIS, motor y datos |
| `cultivos` | listo | Catálogo (sin parámetros agronómicos hasta que `agronomo-reglas` los entregue) |
| `crearParcela` | listo | Punto o polígono GeoJSON |
| `parcela` | listo | Con sus preferencias |
| `guardarPreferencias` | listo | Valida que los cultivos existan |
| `recomendaciones`, `simularEscenario` | listo, esperan al motor | Responden `NO_IMPLEMENTADO` / `FUENTE_NO_DISPONIBLE` hasta conectar `motor/` y `datos/` |
| `guardarEscenario`, `escenarios` | listo, esperan al motor | El resultado lo calcula el servidor; el cliente no manda resultados |
| `contextoParcela`, `explicarRotacion`, `preguntarAsistente` | pendiente | Dependen de `docs/contrato-datos.md` y del módulo `ia/` |

## Ejemplos
**Estado del servidor**
```graphql
{ salud { estado fuentes { nombre estado detalle } } }
```

**Crear una parcela desde un punto** (latitud y longitud en grados)
```graphql
mutation {
  crearParcela(input: { nombre: "Greeley (riego)", punto: { latitud: 40.42, longitud: -104.71 } }) {
    id latitud longitud geometria
  }
}
```

**Crear una parcela desde un polígono** (GeoJSON, orden `[longitud, latitud]`, el primer y último punto iguales)
```graphql
mutation($input: CrearParcelaInput!) { crearParcela(input: $input) { id latitud longitud } }
# variables
{ "input": { "poligono": { "type": "Polygon",
    "coordinates": [[[-104.72, 40.41], [-104.70, 40.41], [-104.70, 40.43], [-104.72, 40.43], [-104.72, 40.41]]] } } }
```

**Guardar las prioridades del agricultor**
```graphql
mutation($id: ID!) {
  guardarPreferencias(parcelaId: $id, input: {
    riego: false, prioridad: AGUA, cultivosPreferidos: ["frijol"], cultivosExcluidos: ["maiz"], maquinaria: ["tractor"]
  }) { riego prioridad cultivosPreferidos }
}
```

**Sliders: recalcular sin guardar** (lluvia −20 %, temperatura +2 °C)
```graphql
{ simularEscenario(input: { parcelaId: "…", escenario: { lluviaPct: -20, tempDeltaC: 2 } }) {
    anios puntajes { agua suelo riesgo global } semaforos { global } explicacion criterioHumano } }
```
Rangos de los sliders: lluvia de −100 a 100 %, temperatura de −10 a 10 °C. Objetivo de rendimiento: menos de 300 ms.

## Errores
Todos los errores traen `extensions.codigo` y un `message` en español apto para mostrar al usuario.
En producción un error interno nunca devuelve detalles ni trazas.

| `codigo` | Cuándo |
|---|---|
| `VALIDACION_FALLIDA` | Datos de entrada incorrectos (rango, tipo, id que no es UUID, cultivo desconocido) |
| `GEOMETRIA_INVALIDA` | Forma de parcela mal construida o que se cruza consigo misma |
| `NO_ENCONTRADO` | La parcela no existe |
| `NO_IMPLEMENTADO` | El motor de reglas todavía no está conectado |
| `FUENTE_NO_DISPONIBLE` | Los datos de clima y suelo todavía no están conectados |
| `LIMITE_EXCEDIDO` | Demasiadas consultas seguidas |
| `CONSULTA_DEMASIADO_COMPLEJA` | Consulta más profunda o pesada que el límite |
| `ERROR_INTERNO` | Cualquier otro fallo |

## Protección de la API
- **Profundidad** máxima `GRAPHQL_MAX_DEPTH` (6) y **complejidad** máxima `GRAPHQL_MAX_COMPLEXITY` (400).
- **Rate limiting** por IP: `THROTTLE_LIMIT` (120/min) en general y `THROTTLE_LIMIT_COSTOSO` (20/min) en `recomendaciones`,
  `simularEscenario` y `guardarEscenario`. Detrás de Caddy o un túnel hay que fijar `TRUST_PROXY=1`.
- Introspección y Sandbox **solo en desarrollo**; CSRF prevention de Apollo activo; CORS limitado a `CORS_ORIGIN`; cabeceras de `helmet`.
- Entradas validadas con `class-validator` (`whitelist` y `forbidNonWhitelisted`: un campo no declarado se rechaza).
- SQL siempre parametrizado.
