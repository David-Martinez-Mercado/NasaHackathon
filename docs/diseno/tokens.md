# Tokens de diseño (Figma → código)

Fuente: exportación CSS (all layers) y SVG de las 16 pantallas del archivo de Figma `2nS935kN9c36rWRDHqbxt7`,
hecha por el usuario el 2026-11-15. Capturas de referencia en `docs/diseno/figma/`.
Implementados como variables CSS en `src/frontend/src/styles/app.css`.

| Token | Valor |
|---|---|
| Lienzo | 1280 × 800: barra lateral 83 px, panel 488 px (encabezado 72 px), mapa el resto |
| Tipografía | Inter (400/500/600/700); Poppins solo en la gráfica de Estadísticas |
| Tamaños de texto | 24/29 títulos, 12/15 cuerpo, 10/12 etiquetas y leyendas |
| Fondo del panel | `#ECF0F3` |
| Tarjeta | `#FFFFFF`, borde `1px rgba(0,0,0,0.1)`, radio 15 px |
| Verde de marca | `#23654E` (título HOME), `#1E6433` (navegación activa), `#098300` (chip activo) |
| Acento de alerta | `#B86200`; alerta seleccionada: fondo `rgba(244,219,92,0.5)` |
| Slider | relleno `linear-gradient(90deg, #FF0202 0%, #FFFC5F 31.73%, #00C4FF 100%)`, perilla `#003488` de 15 px |
| Controles de vidrio | fondo `rgba(217,217,217,0.25)`, borde `rgba(217,217,217,0.5)`, desenfoque 3 px, botones `rgba(217,217,217,0.5)` |
| Leyenda de temperatura | `linear-gradient(#6FFF00 → #FF0000)` |
| Leyenda de sequía | `linear-gradient(#F2EC36 → #D20000)` |
| Sombra | `0 2px 6px rgba(26,36,56,0.07)` |

En el Figma la parcela, los linderos y las manchas de color son parte de una imagen fija; en el código se dibujan
sobre el mapa real (parcela `#E8A531` al 60 % con borde blanco punteado; linderos `#F6E3D6`).
