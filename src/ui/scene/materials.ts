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
    // 板宽按真实地板条的比例：俯视 1 米约 60px 时，一块板 12–16px 才对
    const plank = 14;
    for (let y = 0; y < TEX; y += plank) {
      c.fillStyle = `rgba(${132 + rand() * 44},${96 + rand() * 28},${62 + rand() * 22},${0.08 + rand() * 0.16})`;
      c.fillRect(0, y, TEX, plank - 1);
      c.fillStyle = 'rgba(0,0,0,.55)';
      c.fillRect(0, y + plank - 1.4, TEX, 1.4);
      for (let i = 0; i < 5; i++) {
        c.strokeStyle = `rgba(${26 + rand() * 26},${16 + rand() * 16},${9 + rand() * 12},${0.18 + rand() * 0.22})`;
        c.lineWidth = 0.4 + rand() * 0.7;
        c.beginPath();
        const gy = y + 2 + rand() * (plank - 5);
        c.moveTo(-8, gy);
        c.bezierCurveTo(TEX * 0.32, gy + (rand() - 0.5) * 2.2, TEX * 0.68, gy + (rand() - 0.5) * 2.2, TEX + 8, gy);
        c.stroke();
      }
      for (let k = 0; k < 2; k++) {
        const seam = rand() * TEX;
        c.fillStyle = 'rgba(0,0,0,.5)';
        c.fillRect(seam, y, 1.2, plank - 1.4);
      }
      c.fillStyle = 'rgba(255,232,198,.035)';
      c.fillRect(0, y + 0.5, TEX, 0.8);
    }
    speckle(160, ['#000000', '#5b452f', '#2a1d13'], 1.6, 0.28);
  } else if (kind === 'tile') {
    // 老旧瓷砖：低饱和灰绿釉面、深色填缝、边缘磨损和局部积垢
    const t = 26;
    for (let y = 0; y < TEX; y += t) {
      for (let x = 0; x < TEX; x += t) {
        const tone = rand();
        const shade = tone > 0.68 ? 13 : tone > 0.34 ? 0 : -12;
        c.fillStyle = `rgba(${112 + shade},${126 + shade},${126 + shade},.24)`;
        c.fillRect(x + 1.5, y + 1.5, t - 3, t - 3);
        // 瓷面釉光：不是亮白格子，而是很弱的冷色反射
        const glaze = c.createLinearGradient(x + 2, y + 2, x + t - 2, y + t - 2);
        glaze.addColorStop(0, 'rgba(190,204,198,.10)');
        glaze.addColorStop(.42, 'rgba(130,148,145,.015)');
        glaze.addColorStop(1, 'rgba(0,0,0,.16)');
        c.fillStyle = glaze;
        c.fillRect(x + 2, y + 2, t - 4, t - 4);
        // 每块砖独立的污渍与水痕
        if (rand() > .48) {
          const sx = x + 4 + rand() * (t - 8);
          const sy = y + 4 + rand() * (t - 8);
          const radius = 3 + rand() * 8;
          const stain = c.createRadialGradient(sx, sy, 0.5, sx, sy, radius);
          stain.addColorStop(0, `rgba(8,13,14,${.08 + rand() * .12})`);
          stain.addColorStop(1, 'rgba(8,13,14,0)');
          c.fillStyle = stain;
          c.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
        }
        // 釉面细划痕
        if (rand() > .72) {
          c.strokeStyle = 'rgba(190,198,188,.10)';
          c.lineWidth = .55;
          c.beginPath();
          c.moveTo(x + 4, y + 5 + rand() * 13);
          c.lineTo(x + 9 + rand() * 10, y + 4 + rand() * 14);
          c.stroke();
        }
      }
    }
    // 填缝线带有积灰与水垢，边缘有轻微高光
    c.strokeStyle = 'rgba(7,11,12,.82)';
    c.lineWidth = 2;
    for (let i = 0; i <= TEX; i += t) {
      c.beginPath();
      c.moveTo(i, 0); c.lineTo(i, TEX);
      c.moveTo(0, i); c.lineTo(TEX, i);
      c.stroke();
    }
    c.strokeStyle = 'rgba(151,164,157,.09)';
    c.lineWidth = .7;
    for (let i = 2; i < TEX; i += t) {
      c.beginPath();
      c.moveTo(i, 0); c.lineTo(i, TEX);
      c.moveTo(0, i); c.lineTo(TEX, i);
      c.stroke();
    }
    // 不规则的地面水渍与磨耗，避免瓷砖看起来像整齐的新地砖
    for (let i = 0; i < 18; i++) {
      const x = rand() * TEX, y = rand() * TEX, radius = 5 + rand() * 24;
      const stain = c.createRadialGradient(x, y, 1, x, y, radius);
      stain.addColorStop(0, `rgba(3,8,9,${.06 + rand() * .1})`);
      stain.addColorStop(.72, 'rgba(14,22,22,.035)');
      stain.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = stain;
      c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    speckle(260, ['#000000', '#565d60', '#33383b', '#78827d'], 1.5, 0.22);
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

