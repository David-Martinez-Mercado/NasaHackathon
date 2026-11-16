# Decisiones del usuario (2026-11-15)

1. Móvil: patrón **bottom sheet** — el mapa ocupa la pantalla y el panel es una hoja deslizable desde abajo. El mapa maplibre sigue siendo uno solo y no se desmonta.
2. Accesibilidad: **priorizar WCAG 2.2 AA**. Se pueden ajustar colores y tamaños del Figma 1280×800 lo mínimo necesario, manteniendo el look general.
3. Idioma: **se queda en inglés**. `i18n.ts` y los textos se conservan literales.
4. Rama: `feat/rediseno-responsive` (creada desde `produccion`). No tocar `seed.ts`, `.env.development` ni `vite.config.ts`.
5. Requisito central: totalmente responsiva (móvil, tablet, escritorio, pantallas bajas) y estados de interacción estándar en todos los controles: hover, active/pressed con cambio de color visible, focus-visible, disabled, selected, loading.
6. No añadir librerías salvo justificación fuerte; CSS plano en `app.css` (se puede dividir o reorganizar).
7. Fuera de alcance: botón Account, título de History, vista de rotación a 3 años (solo se reportan).
8. Pendientes (respuesta por Telegram): P20 dibujo con teclado **no**; P5 "Add field" como enlace **sí**; P6 límites del selector de año **sí**; botón para ocultar el panel en escritorio **sí**.
