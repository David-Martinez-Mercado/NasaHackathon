# Bitácora de decisiones técnicas

> Cada agente añade al final; nunca se borra.

## 2026-11-13 — Se elimina el módulo de dron
- El proyecto ya no usa imágenes de dron. Se borró el agente `analista-dron`, la carpeta `RecursosDrone/`,
  el endpoint `POST /rest/dron/imagen`, la query `analisisDron`, la tabla `AnalisisDron` y el `StorageService` de subidas.
- Única excepción REST: `GET /health`.

## 2026-11-13 — Recursos en disco externo
- Los recursos viven en `F:\FieldShift-Recursos\` (`NASA\`, `Externos\`, `enlaces.md`), fuera del repo.
- El código nunca usa esa ruta; en el servidor se configura con la variable de entorno `RESOURCES_DIR`.
- `RecursosNASA/` y `RecursosExternos/` del repo quedan obsoletas.

## 2026-11-13 — Zona de datos: condado de Weld, Colorado (EE. UU.)
- La mitad de los recursos del reto (Web Soil Survey, SSURGO, CropScape, PRISM, NAIP, NLCD, LANDFIRE, OpenET,
  NWIS, QuickStats, AMS, CoCoRaHS) solo cubren EE. UU. Por decisión del usuario se usa la localidad con
  cobertura de los 28 recursos, y lo satelital se recorta a la misma zona.
- Zona: condado de Weld, CO (FIPS 08123); recuadro lon −105.06 a −103.70, lat 39.91 a 41.00.
  Puntos: Greeley (riego, 40.42, −104.71) y Nunn/CPER de USDA-ARS (temporal, 40.82, −104.75).
- Detalle de versiones y estado de cada recurso: `F:\FieldShift-Recursos\enlaces.md`.
- Afecta a: ingeniero-datos (fuentes y coordenadas), agronomo-reglas (cultivos de Weld), frontend (mapa inicial),
  pitch (caso de uso). Pendiente que el equipo decida si el caso de uso del pitch sigue siendo Durango.

## 2026-11-15 — Frontend en React y diseño tomado de Figma
- Por decisión del usuario el frontend será **React** (antes Angular/Ionic). Backend sin cambios: NestJS + GraphQL + PostgreSQL.
- El diseño de referencia es el archivo de Figma `2nS935kN9c36rWRDHqbxt7`; capturas en `docs/diseno/figma/`.
  El mapa debe verse lo más parecido posible a ese diseño.
- Las predicciones de `ml/` (repo `NasaHackathon`, rama `validacion-de-datos`) alimentarán los colores de las capas del mapa.
- Propuesto, pendiente de aprobación (ver `docs/plan.md`): MapLibre GL JS en lugar de Leaflet, y predicciones de ML
  exportadas por lotes a PostGIS en lugar de un servicio Python en línea.
- Afecta a: frontend-agricultor (cambia de framework), backend-api (contrato de capas del mapa), ingeniero-datos,
  devops-despliegue (imagen del frontend). Pendiente actualizar las reglas del proyecto y la definición del agente frontend.
