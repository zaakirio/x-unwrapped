// The square share card: drawn on a 2D canvas over the ribbon so one renderer serves the live preview, the PNG and the GIF.
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { Ribbon, type Pose } from './ribbon';
import { fmt, yearOf } from './slides';
import { PERSONAS, type Summary } from './stats';

const FONT = '"Inter Variable", Inter, system-ui, sans-serif';
const INK = '#f6f3ee';
const POSE: Pose = [0.08, -0.04, 0.78, 1.05];
export const CARD_SETTLED = 3.6;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 4);
const easeBack = (x: number) => {
  const k = clamp01(x) - 1;
  return 1 + 2.4 * k * k * k + 1.4 * k * k;
};

export class CardRenderer {
  readonly canvas = document.createElement('canvas');
  private glCanvas = document.createElement('canvas');
  private ribbon: Ribbon;
  private ctx: CanvasRenderingContext2D;

  constructor(readonly size: number, private s: Summary, private host = location.host) {
    this.canvas.width = this.canvas.height = this.glCanvas.width = this.glCanvas.height = size;
    this.ribbon = new Ribbon(this.glCanvas, true);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  // t is seconds since the start of the animation; everything has landed by CARD_SETTLED.
  draw(t: number) {
    const { ctx, size, s } = this;
    const u = size / 1080;
    this.ribbon.render(4 + t * 0.5, POSE, easeOut(t / 1.5), 0);
    ctx.drawImage(this.glCanvas, 0, 0);

    const fade = (start: number, dur = 0.6) => easeOut((t - start) / dur);

    const a = fade(0.25);
    ctx.globalAlpha = a;
    ctx.fillStyle = INK;
    ctx.font = `800 ${136 * u}px ${FONT}`;
    ctx.letterSpacing = `${-6 * u}px`;
    ctx.fillText('X Unwrapped', 84 * u, (230 + 40 * (1 - a)) * u);
    ctx.fillText(yearOf(s), 84 * u, (380 + 40 * (1 - a)) * u);
    ctx.globalAlpha = 1;

    const pills: [number, string][] = [
      [s.likes, 'likes'],
      [s.bookmarks, 'bookmarks'],
      [s.accounts, 'accounts'],
    ];
    pills.forEach(([value, label], i) => {
      const start = 0.9 + i * 0.3;
      const p = easeBack((t - start) / 0.7);
      if (t < start) return;
      const x = (84 + 520 * (1 - p)) * u;
      const y = (450 + i * 160) * u;
      ctx.globalAlpha = clamp01((t - start) / 0.3);
      this.glass(x, y, 790 * u, 138 * u, 34 * u);
      const shown = Math.round(value * easeOut((t - start) / 1.3));
      ctx.fillStyle = INK;
      ctx.font = `800 ${86 * u}px ${FONT}`;
      ctx.letterSpacing = `${-3 * u}px`;
      ctx.fillText(`${fmt(shown)} ${label}`, x + 52 * u, y + 100 * u);
      ctx.globalAlpha = 1;
    });

    const chip = fade(2.3, 0.5);
    if (chip > 0) {
      const name = PERSONAS[s.persona.id].name;
      ctx.font = `700 ${42 * u}px ${FONT}`;
      ctx.letterSpacing = '0px';
      const w = ctx.measureText(name).width + 80 * u;
      const cx = 996 * u - w;
      const cy = 930 * u;
      ctx.save();
      ctx.globalAlpha = chip;
      ctx.translate(cx + w / 2, cy + 40 * u);
      ctx.scale(0.8 + 0.2 * easeBack((t - 2.3) / 0.5), 0.8 + 0.2 * easeBack((t - 2.3) / 0.5));
      ctx.translate(-(cx + w / 2), -(cy + 40 * u));
      const g = ctx.createLinearGradient(cx, 0, cx + w, 0);
      g.addColorStop(0, '#1d6bff');
      g.addColorStop(0.5, '#9a3cff');
      g.addColorStop(1, '#ff6a4a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(cx, cy, w, 80 * u, 40 * u);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(name, cx + 40 * u, cy + 55 * u);
      ctx.restore();
    }

    const foot = fade(2.6);
    ctx.globalAlpha = foot;
    ctx.fillStyle = INK;
    ctx.font = `800 ${56 * u}px ${FONT}`;
    ctx.letterSpacing = `${-1.5 * u}px`;
    ctx.fillText(`@${s.handle}`, 84 * u, 985 * u);
    ctx.font = `600 ${32 * u}px ${FONT}`;
    ctx.letterSpacing = '0px';
    ctx.fillStyle = 'rgba(246,243,238,.72)';
    ctx.fillText(`${this.host} · 12 months of likes and bookmarks`, 84 * u, 1036 * u);
    ctx.globalAlpha = 1;
  }

  // Frosted glass: the ribbon behind the panel, blurred and darkened.
  private glass(x: number, y: number, w: number, h: number, r: number) {
    const { ctx } = this;
    const u = this.size / 1080;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.clip();
    ctx.filter = `blur(${28 * u}px)`;
    ctx.drawImage(this.glCanvas, 0, 0);
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(16,16,24,.58)';
    ctx.fillRect(x, y, w, h);
    const sheen = ctx.createLinearGradient(0, y, 0, y + h);
    sheen.addColorStop(0, 'rgba(255,255,255,.10)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.roundRect(x + u, y + u, w - 2 * u, h - 2 * u, r);
    ctx.stroke();
  }
}

export async function fontsReady() {
  await document.fonts.load(`800 100px ${FONT}`);
  await document.fonts.load(`600 100px ${FONT}`);
}

export async function cardPng(s: Summary) {
  await fontsReady();
  const r = new CardRenderer(1080, s);
  r.draw(CARD_SETTLED + 1);
  return new Promise<Blob>((ok) => r.canvas.toBlob((b) => ok(b!), 'image/png'));
}

export async function cardGif(s: Summary, onProgress: (p: number) => void, size = 540, fps = 20) {
  await fontsReady();
  const r = new CardRenderer(size, s);
  const ctx = r.canvas.getContext('2d', { willReadFrequently: true })!;
  const gif = GIFEncoder();
  const frames = Math.ceil(CARD_SETTLED * fps);
  for (let f = 0; f <= frames; f++) {
    r.draw(f / fps);
    const { data } = ctx.getImageData(0, 0, size, size);
    const palette = quantize(data, 256, { format: 'rgb565' });
    const last = f === frames;
    gif.writeFrame(applyPalette(data, palette, 'rgb565'), size, size, { palette, delay: last ? 3000 : 1000 / fps });
    onProgress(f / frames);
    // Let the page paint progress between frames.
    if (f % 4 === 0) await new Promise(requestAnimationFrame);
  }
  gif.finish();
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' });
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
