import type { ColorStop, GridLayer, Ring } from '../data';

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

function sample(ramp: ColorStop[], t: number): number[] {
  const i = Math.max(1, ramp.findIndex((s) => s.at >= t));
  const a = ramp[i - 1];
  const b = ramp[i] ?? a;
  const k = b.at === a.at ? 0 : (t - a.at) / (b.at - a.at);
  const ca = hex(a.color);
  const cb = hex(b.color);
  return ca.map((v, j) => v + (cb[j] - v) * k);
}

export const rampCss = (ramp: ColorStop[], direction = 'to top') =>
  `linear-gradient(${direction}, ${ramp.map((s) => `${s.color} ${s.at * 100}%`).join(', ')})`;

const SIZE = 640;

/** Paints the value grid with the layer's color ramp and returns a PNG data URL covering grid.bbox. */
export function renderGrid(layer: GridLayer, clip?: Ring[]): string {
  const { cols, rows, values, bbox } = layer.grid;
  const small = document.createElement('canvas');
  small.width = cols;
  small.height = rows;
  const sctx = small.getContext('2d')!;
  const img = sctx.createImageData(cols, rows);
  values.forEach((v, i) => {
    if (v == null) {
      img.data.set([0, 0, 0, 0], i * 4); // no data: leave the cell transparent
      return;
    }
    const t = Math.min(1, Math.max(0, (v - layer.min) / (layer.max - layer.min)));
    const [r, g, b] = sample(layer.ramp, t);
    const alpha = layer.fadeLow ? Math.min(1, Math.max(0, (t - 0.12) / 0.45)) : 1;
    img.data.set([r, g, b, alpha * 255], i * 4);
  });
  sctx.putImageData(img, 0, 0);

  const out = document.createElement('canvas');
  out.width = SIZE;
  out.height = Math.round((SIZE * rows) / cols);
  const ctx = out.getContext('2d')!;
  if (clip) {
    const [w, s, e, n] = bbox;
    ctx.beginPath();
    for (const ring of clip) {
      ring.forEach(([lng, lat], i) => {
        const x = ((lng - w) / (e - w)) * out.width;
        const y = ((n - lat) / (n - s)) * out.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
    ctx.clip();
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = 'blur(8px)';
  ctx.drawImage(small, -8, -8, out.width + 16, out.height + 16);
  return out.toDataURL('image/png');
}
