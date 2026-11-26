import type { MatKind } from './config';
import type { Ctx, Rect } from './types';

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* 材质纹理                                                           */
/* ------------------------------------------------------------------ */

const TEX = 192;
const texCache = new Map<MatKind, HTMLCanvasElement>();

function makeTexture(kind: MatKind): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = TEX;
  cv.height = TEX;
  const c = cv.getContext('2d')!;
  const rand = rng(kind.length * 733 + 17);

  const base: Record<MatKind, string> = {
    wood: '#453122',
    woodV: '#453122',
    carpet: '#352829',
    tile: '#31373a',
    concrete: '#2f3236',
    plaster: '#2e2924',
    grass: '#26331f',
    dirt: '#2e261c',
  };
  c.fillStyle = base[kind];
  c.fillRect(0, 0, TEX, TEX);

  const speckle = (n: number, colors: string[], size: number, alpha: number): void => {
    for (let i = 0; i < n; i++) {
      c.globalAlpha = alpha * (0.25 + rand() * 0.75);
      c.fillStyle = colors[Math.floor(rand() * colors.length)];
      const s = size * (0.4 + rand());
      c.fillRect(rand() * TEX, rand() * TEX, s, s);
    }
    c.globalAlpha = 1;
  };

  if (kind === 'woodV') {
    // 竖向铺板：把同一套木板横过来画
    c.translate(TEX, 0);
    c.rotate(Math.PI / 2);
  }

  if (kind === 'wood' || kind === 'woodV') {
    // 老旧木地板：错缝板材、细长木纹、钉孔与磨损边缘。
    const plank = 24;
    for (let row = 0; row < TEX / plank + 1; row++) {
      const y = row * plank;
      const stagger = row % 2 ? -TEX * 0.22 : 0;
      const tone = Math.floor(rand() * 18);
      c.fillStyle = `rgba(${112 + tone},${78 + tone * 0.65},${49 + tone * 0.45},.18)`;
      c.fillRect(0, y, TEX, plank - 1);
      c.fillStyle = 'rgba(0,0,0,.58)';
      c.fillRect(0, y + plank - 1.2, TEX, 1.2);

      // 板材端缝错开，避免重复的方格纹理。
      for (let seam = stagger + TEX * 0.28; seam < TEX + TEX * 0.3; seam += TEX * 0.48) {
        c.fillStyle = 'rgba(0,0,0,.42)';
        c.fillRect(seam, y + 1, 1.1, plank - 2);
        c.fillStyle = 'rgba(205,163,112,.08)';
        c.fillRect(seam + 1.2, y + 1, 0.7, plank - 2);
      }

      // 木纹并非规则平行线，局部弯曲并在板缝处消失。
      for (let grain = 0; grain < 8; grain++) {
        const gy = y + 2 + rand() * (plank - 4);
        const x0 = rand() * TEX * 0.18;
        const x1 = TEX * (0.65 + rand() * 0.5);
        c.strokeStyle = `rgba(${18 + rand() * 18},${13 + rand() * 13},${9 + rand() * 9},${0.12 + rand() * 0.22})`;
        c.lineWidth = 0.35 + rand() * 0.65;
        c.beginPath();
        c.moveTo(x0, gy);
        c.bezierCurveTo(TEX * 0.32, gy + (rand() - 0.5) * 3, TEX * 0.62, gy + (rand() - 0.5) * 3, x1, gy + (rand() - 0.5) * 1.5);
        c.stroke();
      }

      // 偶尔出现的木结与磨损，不做成装饰性花纹。
      if (rand() > 0.56) {
        const kx = rand() * TEX;
        const ky = y + plank * (0.25 + rand() * 0.5);
        c.strokeStyle = 'rgba(12,8,5,.28)';
        c.lineWidth = 1;
        c.beginPath();
        c.ellipse(kx, ky, 3 + rand() * 4, 1 + rand() * 1.8, rand() * 0.3, 0, Math.PI * 2);
        c.stroke();
      }
      c.fillStyle = 'rgba(255,226,185,.045)';
      c.fillRect(0, y + 0.7, TEX, 0.7);
    }
    // 踩踏形成的细碎划痕与灰尘。
    for (let i = 0; i < 110; i++) {
      const x = rand() * TEX;
      const y = rand() * TEX;
      c.strokeStyle = `rgba(${rand() > 0.5 ? '0,0,0' : '190,153,112'},${0.08 + rand() * 0.16})`;
      c.lineWidth = 0.35 + rand() * 0.55;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (rand() - 0.5) * 9, y + (rand() - 0.5) * 2);
      c.stroke();
    }
    speckle(260, ['#000000', '#5b452f', '#2a1d13', '#786047'], 1.4, 0.3);
  } else if (kind === 'tile') {
    // 老旧瓷砖：每块砖有独立的釉面、暗边和不均匀反光。
    const t = 32;
    for (let y = 0; y < TEX; y += t) {
      for (let x = 0; x < TEX; x += t) {
        const shade = Math.floor(rand() * 12);
        c.fillStyle = `rgba(${132 + shade},${143 + shade},${147 + shade},.16)`;
        c.fillRect(x + 1.8, y + 1.8, t - 3.6, t - 3.6);
        const sheen = c.createLinearGradient(x + 2, y + 2, x + t - 2, y + t - 2);
        sheen.addColorStop(0, 'rgba(225,232,230,.12)');
        sheen.addColorStop(0.42, 'rgba(160,174,177,.025)');
        sheen.addColorStop(1, 'rgba(0,0,0,.12)');
        c.fillStyle = sheen;
        c.fillRect(x + 2, y + 2, t - 4, t - 4);
        c.strokeStyle = 'rgba(0,0,0,.3)';
        c.lineWidth = 0.8;
        c.strokeRect(x + 2, y + 2, t - 4, t - 4);
      }
    }
    c.strokeStyle = 'rgba(7,10,12,.86)';
    c.lineWidth = 2.2;
    for (let i = 0; i <= TEX; i += t) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, TEX);
      c.moveTo(0, i);
      c.lineTo(TEX, i);
      c.stroke();
    }
    c.strokeStyle = 'rgba(205,215,216,.09)';
    c.lineWidth = 0.7;
    for (let i = 0; i <= TEX; i += t) {
      c.beginPath();
      c.moveTo(i + 2, 0);
      c.lineTo(i + 2, TEX);
      c.moveTo(0, i + 2);
      c.lineTo(TEX, i + 2);
      c.stroke();
    }
    // 潮湿环境留下的水垢和细小擦痕。
    for (let i = 0; i < 42; i++) {
      const x = rand() * TEX;
      const y = rand() * TEX;
      c.strokeStyle = `rgba(5,8,10,${0.08 + rand() * 0.16})`;
      c.lineWidth = 0.4 + rand() * 0.8;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (rand() - 0.5) * 8, y + 2 + rand() * 5);
      c.stroke();
    }
    speckle(220, ['#000000', '#565d60', '#33383b', '#a1a7a5'], 1.3, 0.25);
  } else if (kind === 'concrete' || kind === 'plaster') {
    speckle(1100, ['#43474a', '#24272a', '#4d5155', '#1c1e20'], 2.4, 0.3);
    if (kind === 'concrete') {
      // 混凝土的伸缩缝：一整块地面被切成 1 米见方的板块
      c.strokeStyle = 'rgba(0,0,0,.3)';
      c.lineWidth = 1.4;
      c.strokeRect(0.5, 0.5, TEX - 1, TEX - 1);
      c.strokeStyle = 'rgba(255,255,255,.03)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, TEX / 2);
      c.lineTo(TEX, TEX / 2);
      c.moveTo(TEX / 2, 0);
      c.lineTo(TEX / 2, TEX);
      c.stroke();
    }
    // 水渍 / 泛碱
    for (let i = 0; i < 5; i++) {
      const x = rand() * TEX;
      const y = rand() * TEX;
      const r = 16 + rand() * 46;
      const g = c.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, `rgba(${10 + rand() * 14},${12 + rand() * 14},${10 + rand() * 12},${0.1 + rand() * 0.16})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 裂缝
    for (let i = 0; i < 4; i++) {
      c.strokeStyle = `rgba(0,0,0,${0.22 + rand() * 0.28})`;
      c.lineWidth = 0.6 + rand() * 1.1;
      c.beginPath();
      let x = rand() * TEX;
      let y = rand() * TEX;
      c.moveTo(x, y);
      for (let s = 0; s < 7; s++) {
        x += (rand() - 0.5) * 46;
        y += (rand() - 0.5) * 46;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    if (kind === 'plaster') {
      // 墙面的砌块轮廓：极淡，只在近处能看出来
      c.strokeStyle = 'rgba(0,0,0,.16)';
      c.lineWidth = 1;
      for (let y = 24; y < TEX; y += 40) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(TEX, y);
        c.stroke();
        for (let x = ((y / 40) % 2) * 32; x < TEX; x += 64) {
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x, y + 40);
          c.stroke();
        }
      }
    }
  } else if (kind === 'carpet') {
    speckle(2200, ['#3a2c2c', '#1f1818', '#463737'], 1.6, 0.34);
    c.strokeStyle = 'rgba(0,0,0,.22)';
    c.lineWidth = 1;
    for (let i = 0; i < TEX; i += 5) {
      c.beginPath();
      c.moveTo(0, i);
      c.lineTo(TEX, i);
      c.stroke();
    }
    // 磨损：中间被踩秃的一块
    const g = c.createRadialGradient(TEX / 2, TEX / 2, 8, TEX / 2, TEX / 2, TEX / 2);
    g.addColorStop(0, 'rgba(120,104,96,.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, TEX, TEX);
  } else if (kind === 'grass') {
    speckle(800, ['#22301c', '#152010', '#2f3f25'], 2.6, 0.42);
    for (let i = 0; i < 260; i++) {
      c.strokeStyle = `rgba(${34 + rand() * 40},${54 + rand() * 40},${26 + rand() * 30},${0.2 + rand() * 0.4})`;
      c.lineWidth = 0.9;
      const x = rand() * TEX;
      const y = rand() * TEX;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (rand() - 0.5) * 6, y - 3 - rand() * 6);
      c.stroke();
    }
  } else {
    speckle(1000, ['#2f2619', '#191410', '#3d3122'], 2.8, 0.38);
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(${60 + rand() * 34},${56 + rand() * 30},${48 + rand() * 24},${0.12 + rand() * 0.2})`;
      c.beginPath();
      c.arc(rand() * TEX, rand() * TEX, 0.7 + rand() * 1.6, 0, Math.PI * 2);
      c.fill();
    }
  }
  return cv;
}

export function texture(kind: MatKind): HTMLCanvasElement {
  let t = texCache.get(kind);
  if (!t) {
    t = makeTexture(kind);
    texCache.set(kind, t);
  }
  return t;
}

/** 把纹理平铺进一个矩形（各房间给不同偏移，避免看起来是同一块布） */
export function tileFill(c: Ctx, tex: HTMLCanvasElement, r: Rect, offset: number): void {
  c.save();
  c.beginPath();
  c.rect(r.x, r.y, r.w, r.h);
  c.clip();
  const ox = -((offset * 37) % TEX);
  const oy = -((offset * 53) % TEX);
  for (let y = r.y + oy; y < r.y + r.h; y += TEX) {
    for (let x = r.x + ox; x < r.x + r.w; x += TEX) {
      c.drawImage(tex, x, y);
    }
  }
  c.restore();
}

/* ------------------------------------------------------------------ */
/* 房间设定：材质 / 色调 / 光照 / 窗户                                */
/* ------------------------------------------------------------------ */

