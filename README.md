# Agentes Field Shift — NASA Space Apps 2026

Equipo de 13 agentes (12 activos + 1 de nube bajo demanda) para construir la herramienta de rotación de cultivos con datos NASA.


## El equipo
| # | Agente | Función |
|---|---|---|
| 0 | **coordinador** | Punto de entrada: divide objetivos, delega, integra, mantiene `docs/plan.md` |
| 1 | **analizador-recursos** | Analiza los recursos NASA → fichas + catálogo |
| 2 | **ingeniero-datos** | Clientes NASA POWER / NDVI / suelo, caché, fixtures |
| 3 | **backend-api** | NestJS + GraphQL, PostgreSQL/PostGIS con Prisma, validación, integración |
| 4 | **agronomo-reglas** | Tabla de cultivos, motor de rotación, puntajes, sliders |
| 5 | **ingeniero-ia** | Asistente y explicador con LLM, captura en lenguaje natural, evals |
| 6 | **frontend-agricultor** | Pantallas, mapa, tarjetas, sliders, UX para el campo |
| 7 | **ciberseguridad** | Auditoría OWASP, LLM, secretos, privacidad |
| 8 | **qa-tester** | Pruebas, casos agronómicos, guion de demo |
| 9 | **devops-despliegue** | Repo, Docker, CI, laptop con Ubuntu Server (seguridad, túnel público, respaldos), plan B |
| 10 | **pitch-presentacion** | Descripción, video, pitch, preguntas de jueces |
| 11 | **revisor-final** | Analizador final contra el reto y los jueces |
| — | **migracion-nube** | **Inactivo.** Solo cuando tú lo llames: evalúa, prepara y migra de la laptop a la nube, con reversa |

## Flujo
```
                       coordinador (dirige todo)
                               │
F:/FieldShift-Recursos ──► analizador-recursos ──► docs/fichas/ + catalogo-datos.md
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
       ingeniero-datos                   agronomo-reglas
              └────────────────┬────────────────┘
                               ▼
                          backend-api
              ┌────────────────┴────────────────┐
              ▼                                 ▼
     frontend-agricultor                  ingeniero-ia
              └────────────────┬────────────────┘
                               ▼
                 qa-tester  +  ciberseguridad
                               ▼
                       devops-despliegue
                               ▼
                      pitch-presentacion
                               ▼
                         revisor-final ──► arreglos de vuelta al agente responsable
```
- Los agentes se comunican por archivos en `docs/`.
- Corran **qa-tester** y **ciberseguridad** al cerrar cada bloque, y **revisor-final** antes de cada entrega.
- **devops-despliegue** también conviene al inicio, para dejar listo el repositorio.

## Trabajo en paralelo
1. **Día 0, todos a la vez:** devops-despliegue (repo y laptop) ∥ analizador-recursos ∥ agronomo-reglas (tabla de cultivos) ∥ pitch (historia).
2. **Contratos:** backend-api + ingeniero-datos + agronomo-reglas congelan `contrato-datos.md` y `schema.graphql`.
3. **Con mocks, todos a la vez:** ingeniero-datos ∥ backend-api ∥ frontend-agricultor ∥ ingeniero-ia ∥ qa-tester (pruebas primero) ∥ ciberseguridad (por PR).
4. **Integración** I1–I4 → QA + seguridad tras cada una → revisor-final.

Cada línea en su rama `feat/<linea>` (o *git worktree*). El coordinador lleva el detalle en `docs/plan.md`.

## Formato de prompt (todos aceptan prompts completos)
Pueden escribir en lenguaje libre, pero para tareas grandes usen esta plantilla. Las secciones tienen prioridad sobre las instrucciones por defecto del agente:
```
OBJETIVO: qué quieren lograr
CONTEXTO: lo que el agente debe saber (pegar texto, enlaces, decisiones previas)
ENTRADAS: archivos o URLs a usar
RESTRICCIONES: tecnología, tiempo, qué NO hacer
SALIDA ESPERADA: archivos, formato, nivel de detalle
```

## Prompts de ejemplo
**Coordinador (para arrancar la semana)**
```
OBJETIVO: Dejar listo para el viernes el núcleo: datos NASA + motor de rotación + API + sliders.
CONTEXTO: Hackatón el 14 de nov. Somos 4. Los recursos NASA están en F:\FieldShift-Recursos\NASA\.
RESTRICCIONES: NestJS + GraphQL + PostgreSQL/PostGIS + Angular. IA solo si sobra tiempo. Sin dron.
SALIDA ESPERADA: docs/plan.md por día y responsable, y las primeras tareas delegadas.
```
**Analizador**
```
OBJETIVO: Analizar todos los recursos de la pestaña Resources del reto.
CONTEXTO: Nos importa sobre todo clima, humedad del suelo y NDVI para Durango, México.
ENTRADAS: F:\FieldShift-Recursos\ completo y estos enlaces: <pegar URLs>
RESTRICCIONES: Solo metadatos, no descargues datasets completos.
SALIDA ESPERADA: Fichas + catálogo con las 4 fuentes mínimas para el MVP.
```
**Backend**
```
Crea la estructura NestJS + GraphQL code-first con los módulos parcelas, recomendaciones,
escenarios, cultivos y salud. PostgreSQL + PostGIS con Prisma, migraciones, seed de Durango,
límite de profundidad en GraphQL y modo DEMO_OFFLINE con fixtures.
```
**Ingeniero de IA**
```
Implementa la mutation explicarRotacion con respaldo de plantillas si no hay llave de LLM.
Crea 15 evals, incluyendo intentos de inyección de prompts, y córrelos.
```
**DevOps (preparar la laptop)**
```
OBJETIVO: Dejar la laptop con Ubuntu Server lista para servir la demo.
CONTEXTO: Ubuntu Server 24.04, x86_64, 16 GB RAM, en la red de la escuela (sin acceso al router).
RESTRICCIONES: Enlace público con Cloudflare Tunnel; SSH solo desde la red local.
SALIDA ESPERADA: Scripts numerados y docs/despliegue.md con el orden exacto.
```
**Migración a la nube (solo cuando decidas)**
```
OBJETIVO: Llama al agente migracion-nube en modo PREPARAR.
CONTEXTO: La demo corre en la laptop; queremos un respaldo en la nube para la entrega.
RESTRICCIONES: Presupuesto 0 o créditos de estudiante; no crees recursos todavía.
SALIDA ESPERADA: Tabla de opciones, recomendación y plan con reversa a la laptop.
```
**Ciberseguridad**
```
OBJETIVO: Auditar el backend y la capa de IA antes de publicar la demo.
RESTRICCIONES: Solo reporta; no modifiques código.
SALIDA ESPERADA: Reporte con hallazgos críticos y altos, con evidencia.
```
**Revisor final**
```
OBJETIVO: Revisión completa antes de grabar el video.
RESTRICCIONES: Ejecuta las pruebas y la app; sé estricto con el uso de datos NASA y los sliders.
SALIDA ESPERADA: Reporte con veredicto y top 3 acciones.
```
