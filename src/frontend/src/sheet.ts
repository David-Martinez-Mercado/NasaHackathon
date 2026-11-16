import { MOTION } from './layout';

/*
 * Bottom-sheet controller for sheet mode (docs/web/06-motion.md §5).
 * At rest the sheet has a real height (--sheet-h) so its body scrolls and sticky bars work. While it moves, the box is
 * fixed once at the expanded height and only `transform` changes per frame (finger tracking and WAAPI snaps), so the
 * gesture costs two layouts instead of one per frame. No dependencies.
 */

export type Snap = 'peek' | 'half' | 'expanded';
export type SnapSource = 'tap' | 'key' | 'auto';
export const SNAP_ORDER: Snap[] = ['peek', 'half', 'expanded'];

const FLICK = 0.5; // px/ms: a faster release goes to the next snap in that direction
const SLOP = 6; // px of movement before a press counts as a drag instead of a tap
const RUBBER = 0.3; // friction beyond peek / expanded
const RUBBER_MAX = 40; // px of overscroll at most
const DRAWER_SLOPE = 2.25; // initial slope of cubic-bezier(.32,.72,0,1): the sheet leaves at the finger's speed

export interface Follower {
  el: HTMLElement;
  ratio: number;
}

export interface SheetOptions {
  sheet: HTMLElement;
  handle: HTMLElement;
  header: HTMLElement;
  status?: () => HTMLElement | null;
  /** Map overlays anchored to the bottom edge move with the sheet (ratio 1) or half as much (centred zoom, 0.5). */
  followers: () => Follower[];
  /** Receives --sheet-h and --sheet-offset. */
  app: HTMLElement;
  getSnap: () => Snap;
  onSettle: (snap: Snap) => void;
  /** Called when a snap starts, with the destination height and duration, so the map can ease its padding in parallel. */
  onTarget: (heightPx: number, ms: number) => void;
  reduced: () => boolean;
}

export interface SheetController {
  snapTo: (snap: Snap, opts?: { velocity?: number; source?: SnapSource }) => void;
  /** Re-measures the snaps (the peek height depends on the header and the status strip). */
  refresh: () => void;
  destroy: () => void;
}

export function createSheet(o: SheetOptions): SheetController {
  let anims: Animation[] = [];
  let box = 0; // height fixed while moving
  let rest = 0; // height at rest (= --sheet-offset)
  let pointerId: number | null = null;
  let startY = 0;
  let startV = 0;
  let dragging = false;
  let raf = 0;
  let nextV = 0;
  let samples: { t: number; y: number }[] = [];
  let suppressClick = false;

  const heights = (): Record<Snap, number> => {
    const expanded = parseFloat(getComputedStyle(o.sheet).maxHeight) || window.innerHeight * 0.8;
    const peek = Math.min(expanded, o.handle.offsetHeight + o.header.offsetHeight + (o.status?.()?.offsetHeight ?? 0));
    const half = Math.max(peek, Math.min(expanded, Math.max(240, Math.round((expanded + 64) / 2))));
    return { peek, half, expanded };
  };

  // Visible height right now, including a running animation (getComputedStyle reflects WAAPI).
  const visible = () => {
    const t = getComputedStyle(o.sheet).transform;
    const ty = t && t !== 'none' ? new DOMMatrixReadOnly(t).m42 : 0;
    return o.sheet.offsetHeight - ty;
  };

  const paint = (v: number) => {
    o.sheet.style.transform = `translateY(${box - v}px)`;
    for (const f of o.followers()) f.el.style.transform = `translateY(${(rest - v) * f.ratio}px)`;
  };

  // Freezes the current position (interruption) and fixes the box: one layout.
  const prepare = () => {
    const v = visible();
    anims.forEach((a) => a.cancel());
    anims = [];
    box = heights().expanded;
    o.sheet.style.height = `${box}px`;
    o.sheet.classList.add('is-moving');
    paint(v);
    return v;
  };

  const settle = (snap: Snap) => {
    const h = heights()[snap];
    rest = h;
    // Written straight to the DOM (not through React state) so no frame shows the old height without the transform.
    o.app.style.setProperty('--sheet-h', `${h}px`);
    o.app.style.setProperty('--sheet-offset', `${h}px`);
    o.sheet.style.height = '';
    o.sheet.style.transform = '';
    for (const f of o.followers()) f.el.style.transform = '';
    o.sheet.classList.remove('is-moving');
    o.onSettle(snap);
  };

  const rubber = (raw: number, H: Record<Snap, number>) => {
    if (raw > H.expanded) return H.expanded + Math.min(RUBBER_MAX, (raw - H.expanded) * RUBBER);
    if (raw < H.peek) return H.peek - Math.min(RUBBER_MAX, (H.peek - raw) * RUBBER);
    return raw;
  };

  function snapTo(snap: Snap, opts: { velocity?: number; source?: SnapSource } = {}) {
    const from = prepare();
    const H = heights();
    const to = H[snap];
    const dist = Math.abs(to - from);
    let ms: number;
    if (o.reduced()) ms = 0;
    else if (opts.velocity && Math.abs(opts.velocity) > 0.1)
      ms = Math.min(MOTION.sheetMaxMs, Math.max(MOTION.sheetMinMs, (DRAWER_SLOPE * dist) / Math.abs(opts.velocity)));
    else ms = opts.source === 'key' ? MOTION.sheetKeyMs : MOTION.sheetMs;

    o.onTarget(to, dist < 1 ? 0 : ms);
    if (ms === 0 || dist < 1) {
      settle(snap);
      return;
    }

    const timing: KeyframeAnimationOptions = { duration: ms, easing: MOTION.easeDrawer };
    const sheetAnim = o.sheet.animate(
      [{ transform: `translateY(${box - from}px)` }, { transform: `translateY(${box - to}px)` }],
      timing,
    );
    anims = [
      sheetAnim,
      ...o.followers().map((f) =>
        f.el.animate(
          [{ transform: `translateY(${(rest - from) * f.ratio}px)` }, { transform: `translateY(${(rest - to) * f.ratio}px)` }],
          timing,
        ),
      ),
    ];
    paint(to); // the base style is already the end state: no fill: 'forwards'
    sheetAnim.finished.then(
      () => {
        anims = [];
        settle(snap);
      },
      () => undefined, // cancelled by an interruption
    );
  }

  // ---- Drag: only from the handle and the header (never from the scrolling body) ----
  function onDown(e: PointerEvent) {
    if (!e.isPrimary || e.button !== 0 || pointerId !== null) return; // ignores a second finger
    if ((e.target as Element).closest('a, button:not(.sheet-handle), input, select, textarea')) return;
    pointerId = e.pointerId;
    startY = e.clientY;
    samples = [{ t: e.timeStamp, y: e.clientY }];
    e.stopPropagation();
    if (anims.length) {
      startV = prepare();
      dragging = true;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } else {
      dragging = false;
    }
  }
  function onMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    if (!dragging) {
      if (Math.abs(e.clientY - startY) < SLOP) return;
      startV = prepare();
      startY = e.clientY;
      dragging = true;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }
    samples.push({ t: e.timeStamp, y: e.clientY });
    while (samples.length > 2 && e.timeStamp - samples[0].t > 100) samples.shift();
    nextV = rubber(startV + (startY - e.clientY), heights());
    if (!raf)
      raf = requestAnimationFrame(() => {
        raf = 0;
        paint(nextV);
      });
  }
  function onUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (!dragging) return; // a tap: the handle/title onClick resolves it
    dragging = false;
    suppressClick = true;
    cancelAnimationFrame(raf);
    raf = 0;
    const H = heights();
    const v = visible();
    const a = samples[0];
    const b = samples[samples.length - 1];
    const vel = e.type === 'pointercancel' ? 0 : (a.y - b.y) / Math.max(1, b.t - a.t); // px/ms, positive = upwards
    let target: Snap;
    if (Math.abs(vel) > FLICK) {
      const up = vel > 0;
      target = (up ? SNAP_ORDER.find((s) => H[s] > v + 1) : [...SNAP_ORDER].reverse().find((s) => H[s] < v - 1))
        ?? (up ? 'expanded' : 'peek');
    } else {
      target = SNAP_ORDER.reduce((best, s) => (Math.abs(H[s] - v) < Math.abs(H[best] - v) ? s : best), 'peek' as Snap);
    }
    snapTo(target, { velocity: vel });
  }
  const onClickCapture = (e: MouseEvent) => {
    if (!suppressClick) return;
    e.stopPropagation();
    e.preventDefault();
    suppressClick = false;
  };

  const zones = [o.handle, o.header];
  for (const z of zones) {
    z.addEventListener('pointerdown', onDown);
    z.addEventListener('pointermove', onMove);
    z.addEventListener('pointerup', onUp);
    z.addEventListener('pointercancel', onUp);
    z.addEventListener('click', onClickCapture, true);
  }
  const refresh = () => {
    if (pointerId === null && !anims.length) settle(o.getSnap());
  };
  window.addEventListener('resize', refresh);

  // Mount: place without animating (the sheet remounts on every route), and align the map padding.
  settle(o.getSnap());
  o.onTarget(rest, 0);

  return {
    snapTo,
    refresh,
    destroy() {
      anims.forEach((a) => a.cancel());
      anims = [];
      cancelAnimationFrame(raf);
      for (const z of zones) {
        z.removeEventListener('pointerdown', onDown);
        z.removeEventListener('pointermove', onMove);
        z.removeEventListener('pointerup', onUp);
        z.removeEventListener('pointercancel', onUp);
        z.removeEventListener('click', onClickCapture, true);
      }
      window.removeEventListener('resize', refresh);
      o.app.style.removeProperty('--sheet-h');
      o.app.style.removeProperty('--sheet-offset');
      o.sheet.style.height = '';
      o.sheet.style.transform = '';
      o.sheet.classList.remove('is-moving');
      for (const f of o.followers()) f.el.style.transform = '';
    },
  };
}
