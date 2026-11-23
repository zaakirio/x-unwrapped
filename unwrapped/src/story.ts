import { Ribbon, type Pose } from './ribbon';
import { CardRenderer, cardGif, cardPng, download, fontsReady } from './share';
import { buildSlides, fmt } from './slides';
import type { Summary } from './stats';

const SLIDE_MS = 7000;

export function playStory(root: HTMLElement, s: Summary, shareUrl: string, onExit: () => void) {
  const slides = buildSlides(s, '<canvas class="card-canvas" width="540" height="540"></canvas>');
  root.innerHTML = `
    <div class="stage">
      <div class="frame">
        <canvas class="ribbon"></canvas>
        <div class="progress">${slides.map(() => '<span><i></i></span>').join('')}</div>
        <button class="close" aria-label="Close">✕</button>
        ${slides.map((sl) => `<section class="slide slide-${sl.id}">${sl.html}</section>`).join('')}
      </div>
    </div>`;

  const frame = root.querySelector<HTMLElement>('.frame')!;
  const canvas = root.querySelector<HTMLCanvasElement>('canvas.ribbon')!;
  const sections = [...root.querySelectorAll<HTMLElement>('.slide')];
  const bars = [...root.querySelectorAll<HTMLElement>('.progress span')];
  const ribbon = new Ribbon(canvas);
  const pose: Pose = [...slides[0].pose];
  let index = -1;
  let alive = true;
  const start = performance.now();

  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio);
    canvas.width = Math.round(frame.clientWidth * dpr);
    canvas.height = Math.round(frame.clientHeight * dpr);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(frame);
  resize();

  // Live share card on the last slide.
  const cardCanvas = root.querySelector<HTMLCanvasElement>('.card-canvas')!;
  const cardCtx = cardCanvas.getContext('2d')!;
  let card: CardRenderer | null = null;
  let cardStart = 0;
  fontsReady().then(() => (card = new CardRenderer(540, s)));

  const loop = (now: number) => {
    if (!alive) return;
    const target = slides[Math.max(0, index)].pose;
    for (let i = 0; i < 4; i++) pose[i] += (target[i] - pose[i]) * 0.045;
    ribbon.render((now - start) / 1000, pose);
    if (card && slides[index]?.hold) {
      card.draw((now - cardStart) / 1000);
      cardCtx.drawImage(card.canvas, 0, 0);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  function countUp(el: HTMLElement) {
    const target = Number(el.dataset.count);
    const t0 = performance.now() + 350;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / 1400));
      el.textContent = fmt(Math.round(target * (1 - Math.pow(1 - p, 4))));
      if (p < 1 && alive) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  }

  function go(next: number) {
    if (next < 0 || next >= slides.length || next === index) return;
    index = next;
    sections.forEach((el, i) => {
      el.classList.toggle('active', i === index);
      el.classList.toggle('past', i < index);
    });
    bars.forEach((b, i) => {
      b.className = i < index ? 'done' : i === index ? 'now' : '';
      b.style.setProperty('--ms', `${slides[i].hold ? 0 : SLIDE_MS}ms`);
    });
    sections[index].querySelectorAll<HTMLElement>('[data-count]').forEach(countUp);
    cardStart = performance.now();
  }

  bars.forEach((b, i) =>
    b.querySelector('i')!.addEventListener('animationend', () => {
      if (i === index && !slides[i].hold) go(index + 1);
    }),
  );

  // Tap left/right to move, hold to pause.
  let downAt = 0;
  frame.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    downAt = performance.now();
    frame.classList.add('paused');
  });
  frame.addEventListener('pointerup', (e) => {
    frame.classList.remove('paused');
    if (!downAt || (e.target as HTMLElement).closest('button, a')) return;
    const held = performance.now() - downAt;
    downAt = 0;
    if (held > 300) return;
    const x = e.clientX - frame.getBoundingClientRect().left;
    go(x < frame.clientWidth * 0.3 ? index - 1 : index + 1);
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === ' ') go(index + 1);
    else if (e.key === 'ArrowLeft') go(index - 1);
    else if (e.key === 'Escape') exit();
  };
  addEventListener('keydown', onKey);

  function exit() {
    alive = false;
    ro.disconnect();
    removeEventListener('keydown', onKey);
    onExit();
  }
  root.querySelector('.close')!.addEventListener('click', exit);

  const file = (ext: string) => `x-unwrapped-${s.handle}-${s.to.slice(0, 4)}.${ext}`;
  root.querySelector('.actions')!.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!btn || btn.disabled) return;
    const label = btn.textContent!;
    const flash = (text: string) => {
      btn.textContent = text;
      setTimeout(() => (btn.textContent = label), 1800);
    };
    switch (btn.dataset.action) {
      case 'copy':
        await navigator.clipboard.writeText(shareUrl);
        flash('Link copied');
        break;
      case 'png':
        download(await cardPng(s), file('png'));
        break;
      case 'gif':
        btn.disabled = true;
        try {
          download(await cardGif(s, (p) => (btn.textContent = `Rendering ${Math.round(p * 100)}%`)), file('gif'));
        } finally {
          btn.disabled = false;
          btn.textContent = label;
        }
        break;
      case 'replay':
        go(0);
        break;
    }
  });

  go(0);
}
