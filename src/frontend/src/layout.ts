/*
 * Layout modes and motion constants shared by React and the stylesheet.
 * Keep these queries and timings in sync with src/styles/app.css (same literals there).
 */

/** Sheet mode: phones and narrow portrait tablets. The panel becomes a bottom sheet over a full-screen map. */
export const Q_SHEET = '(max-width: 599px), (max-width: 767px) and (orientation: portrait)';
/** Charts switch tick size, stroke and margins at the same width as the type scale. */
export const Q_WIDE = '(min-width: 600px)';
export const Q_REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export const MOTION = {
  sheetMs: 240,
  sheetKeyMs: 160,
  sheetMinMs: 160,
  sheetMaxMs: 300,
  easeDrawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
  flyMs: 800,
} as const;

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia(Q_REDUCED_MOTION).matches;
