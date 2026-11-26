import { rng, texture, tileFill } from './materials';
import type { MatKind, Prop } from './config';
import type { Ctx, Rect } from './types';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function castShadow(c: Ctx, r: Rect, blur: number, alpha = 0.7, dy = 3): void {
  c.save();
  c.shadowColor = `rgba(0,0,0,${alpha})`;
  c.shadowBlur = blur;
  c.shadowOffsetX = 1;
  c.shadowOffsetY = dy;
  c.fillStyle = '#000';
  c.fillRect(r.x, r.y, r.w, r.h);
  c.restore();
}

/** 带材质颗粒和顶光/底影的方块（家具的通用底座） */
function boxShadowed(c: Ctx, r: Rect, fill: string, blur = 8, grain: MatKind | null = null): void {
  castShadow(c, r, blur, 0.8);
  c.fillStyle = fill;
  c.fillRect(r.x, r.y, r.w, r.h);

  if (grain) {
    c.save();
    c.beginPath();
    c.rect(r.x, r.y, r.w, r.h);
    c.clip();
    c.globalAlpha = 0.5;
    c.globalCompositeOperation = 'overlay';
    tileFill(c, texture(grain), r, Math.round(r.x * 0.9 + r.y * 1.7));
    c.restore();
  }
  // 顶面受光、底边落影：物体才有厚度，不像贴纸
  c.fillStyle = 'rgba(255,238,210,.06)';
  c.fillRect(r.x + 1, r.y + 1, r.w - 2, Math.max(1.5, r.h * 0.08));
  c.fillStyle = 'rgba(0,0,0,.5)';
  c.fillRect(r.x + 1, r.y + r.h - 2, r.w - 2, 2);
  c.fillStyle = 'rgba(0,0,0,.26)';
  c.fillRect(r.x + r.w - 2, r.y + 1, 2, r.h - 2);
  // 轮廓：俯视图里物体最容易糊成一片，一圈极细的暗边能把它从地面上"提"起来
  c.strokeStyle = 'rgba(0,0,0,.55)';
  c.lineWidth = 1;
  c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}

export function roughEllipse(
  c: Ctx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  rand: () => number,
): void {
  c.beginPath();
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const k = 0.8 + rand() * 0.34;
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

/* ------------------------------------------------------------------ */
/* 家具绘制                                                           */
/* ------------------------------------------------------------------ */

export function drawProp(c: Ctx, p: Prop, room: Rect, seed: number): void {
  const rand = rng(seed);
  const cx = room.x + p.x * room.w;
  const cy = room.y + p.y * room.h;
  const w = p.w * room.w;
  const h = p.h * room.h;

  c.save();
  c.translate(cx, cy);
  if (p.rot) c.rotate((p.rot * Math.PI) / 180);
  const r: Rect = { x: -w / 2, y: -h / 2, w, h };
  const small = Math.min(w, h);

  switch (p.k) {
    case 'rug': {
      const rad = small * 0.05;
      c.save();
      c.beginPath();
      c.roundRect(r.x, r.y, r.w, r.h, rad);
      c.clip();
      // 织物底色 + 织纹：地毯要有绒面，不能是一块平色圆角矩形
      c.fillStyle = 'rgba(44,31,29,.9)';
      c.fillRect(r.x, r.y, r.w, r.h);
      c.globalAlpha = 0.55;
      c.globalCompositeOperation = 'overlay';
      tileFill(c, texture('carpet'), { x: r.x, y: r.y, w: r.w, h: r.h }, 7);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      // 织出的边框花纹：两圈细线 + 角部磨损
      c.strokeStyle = 'rgba(132,96,70,.16)';
      c.lineWidth = 2;
      c.strokeRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12);
      c.strokeStyle = 'rgba(132,96,70,.09)';
      c.lineWidth = 1;
      c.strokeRect(r.x + 11, r.y + 11, r.w - 22, r.h - 22);
      for (let i = 0; i < 5; i++) {
        roughEllipse(
          c,
          r.x + 8 + rand() * (r.w - 16),
          r.y + 8 + rand() * (r.h - 16),
          small * (0.08 + rand() * 0.1),
          small * (0.05 + rand() * 0.06),
          `rgba(0,0,0,${0.1 + rand() * 0.12})`,
          rand,
        );
      }
      // 边缘收暗：地毯的绒边压进地板，而不是描一条线
      const edge = c.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      edge.addColorStop(0, 'rgba(0,0,0,.18)');
      edge.addColorStop(0.5, 'rgba(0,0,0,0)');
      edge.addColorStop(1, 'rgba(0,0,0,.24)');
      c.fillStyle = edge;
      c.fillRect(r.x, r.y, r.w, r.h);
      c.restore();
      break;
    }
    case 'bed': {
      boxShadowed(c, r, '#3d2d21', 11, 'wood');
      // 床垫
      c.fillStyle = '#443d34';
      c.fillRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10);
      // 枕头
      c.fillStyle = '#5c5749';
      c.beginPath();
      c.roundRect(r.x + 7, r.y + 8, r.w * 0.24, r.h - 16, 4);
      c.fill();
      // 被子：褶皱用几条斜向暗线
      c.fillStyle = '#2f2924';
      c.beginPath();
      c.roundRect(r.x + r.w * 0.3, r.y + 5, r.w * 0.64, r.h - 10, 5);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,.45)';
      c.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        const yy = r.y + 10 + i * ((r.h - 20) / 3.6);
        c.moveTo(r.x + r.w * 0.32, yy);
        c.quadraticCurveTo(r.x + r.w * 0.6, yy + (rand() - 0.5) * 8, r.x + r.w * 0.92, yy);
        c.stroke();
      }
      c.fillStyle = 'rgba(255,240,214,.03)';
      c.fillRect(r.x + 5, r.y + 5, r.w - 10, 2);
      break;
    }
    case 'wardrobe':
    case 'crate':
    case 'shelf': {
      boxShadowed(c, r, p.k === 'crate' ? '#41301f' : '#2f2419', 9, 'wood');
      if (p.k === 'crate') {
        // 木箱：横板 + 顶光照亮的一侧
        c.fillStyle = 'rgba(255,236,205,.06)';
        c.fillRect(r.x + 1, r.y + 1, r.w - 2, Math.max(2, r.h * 0.14));
        c.strokeStyle = 'rgba(0,0,0,.42)';
        c.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
          c.beginPath();
          c.moveTo(r.x + 2, r.y + (r.h / 3) * i);
          c.lineTo(r.x + r.w - 2, r.y + (r.h / 3) * i);
          c.stroke();
        }
        c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      } else if (p.k === 'shelf') {
        const rows = 4;
        for (let i = 1; i < rows; i++) {
          c.strokeStyle = 'rgba(0,0,0,.6)';
          c.beginPath();
          c.moveTo(r.x + 2, r.y + (r.h / rows) * i);
          c.lineTo(r.x + r.w - 2, r.y + (r.h / rows) * i);
          c.stroke();
        }
        for (let i = 0; i < 30; i++) {
          const bx = r.x + 4 + rand() * (r.w - 11);
          const by = r.y + 3 + Math.floor(rand() * rows) * (r.h / rows);
          const bw = 2 + rand() * 3.4;
          const bh = r.h / rows - 7;
          c.fillStyle = `rgba(${66 + rand() * 60},${46 + rand() * 40},${36 + rand() * 32},.92)`;
          c.fillRect(bx, by, bw, bh);
        }
      } else {
        // 衣柜：对开门 + 把手
        c.strokeStyle = 'rgba(0,0,0,.55)';
        c.beginPath();
        c.moveTo(0, r.y + 3);
        c.lineTo(0, r.y + r.h - 3);
        c.stroke();
        c.fillStyle = 'rgba(188,166,124,.55)';
        c.fillRect(-4, 0, 2, 6);
        c.fillRect(2, 0, 2, 6);
      }
      break;
    }
    case 'desk':
    case 'table':
    case 'bench': {
      boxShadowed(c, r, '#3a2b1e', 9, 'wood');
      c.fillStyle = 'rgba(255,240,214,.06)';
      c.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h * 0.32);
      if (p.k === 'desk') {
        c.fillStyle = 'rgba(214,204,182,.3)';
        c.fillRect(r.x + r.w * 0.1, r.y + r.h * 0.28, r.w * 0.2, r.h * 0.4);
        c.fillStyle = 'rgba(214,204,182,.2)';
        c.fillRect(r.x + r.w * 0.33, r.y + r.h * 0.4, r.w * 0.14, r.h * 0.3);
        // 台灯底座与灯罩
        c.fillStyle = 'rgba(10,10,12,.7)';
        c.beginPath();
        c.ellipse(r.x + r.w * 0.76, r.y + r.h * 0.42, small * 0.11, small * 0.09, 0, 0, Math.PI * 2);
        c.fill();
      }
      if (p.k === 'bench') {
        c.fillStyle = 'rgba(120,132,142,.45)';
        for (let i = 0; i < 4; i++) c.fillRect(r.x + 5 + i * (r.w / 5), r.y + 4, 3, h * 0.38);
        // 挂在墙上的工具
        c.strokeStyle = 'rgba(150,150,150,.35)';
        c.lineWidth = 1.4;
        for (let i = 0; i < 3; i++) {
          const x = r.x + r.w * (0.24 + i * 0.24);
          c.beginPath();
          c.moveTo(x, r.y + 5);
          c.lineTo(x + 3, r.y + h * 0.5);
          c.stroke();
        }
      }
      break;
    }
    case 'chair': {
      boxShadowed(c, r, '#2f261c', 7, 'wood');
      c.fillStyle = 'rgba(0,0,0,.5)';
      c.fillRect(r.x + r.w * 0.18, r.y + 2, r.w * 0.64, 3);
      break;
    }
    case 'counter': {
      // 厨房操作台：深色柜体、石质台面、嵌入式水槽与磨损边缘
      boxShadowed(c, r, '#252b2c', 11, 'concrete');
      const top = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h * 0.68 };
      const stone = c.createLinearGradient(top.x, top.y, top.x + top.w, top.y + top.h);
      stone.addColorStop(0, '#555a56');
      stone.addColorStop(0.42, '#343b3b');
      stone.addColorStop(1, '#202729');
      c.fillStyle = stone;
      c.beginPath();
      c.roundRect(top.x, top.y, top.w, top.h, 3);
      c.fill();
      c.save();
      c.beginPath();
      c.roundRect(top.x, top.y, top.w, top.h, 3);
      c.clip();
      c.globalAlpha = 0.34;
      c.globalCompositeOperation = 'overlay';
      tileFill(c, texture('concrete'), top, Math.round(r.x + r.y));
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      // 石材细小矿物颗粒与刀痕
      for (let i = 0; i < 24; i++) {
        const x = top.x + rand() * top.w;
        const y = top.y + rand() * top.h;
        c.fillStyle = i % 3 === 0 ? 'rgba(184,190,180,.22)' : 'rgba(0,0,0,.22)';
        c.fillRect(x, y, 1 + rand() * 2.5, 0.7 + rand() * 1.2);
      }
      c.restore();
      // 台面厚度和柜门
      c.fillStyle = 'rgba(0,0,0,.48)';
      c.fillRect(r.x + 2, r.y + r.h * 0.68, r.w - 4, r.h * 0.27);
      c.strokeStyle = 'rgba(154,163,157,.18)';
      c.lineWidth = 1;
      c.strokeRect(r.x + 3, r.y + r.h * 0.72, r.w - 6, r.h * 0.2);
      c.beginPath();
      c.moveTo(r.x + r.w * 0.5, r.y + r.h * 0.72);
      c.lineTo(r.x + r.w * 0.5, r.y + r.h * 0.91);
      c.stroke();
      c.fillStyle = 'rgba(166,171,163,.42)';
      c.fillRect(r.x + r.w * 0.22, r.y + r.h * 0.79, 2, r.h * 0.035);
      c.fillRect(r.x + r.w * 0.72, r.y + r.h * 0.79, 2, r.h * 0.035);
      // 水槽：黑色内盆、金属唇边、排水孔与水痕
      const sx = r.x + r.w * 0.1, sy = r.y + r.h * 0.18, sw = r.w * 0.34, sh = r.h * 0.42;
      c.fillStyle = 'rgba(0,0,0,.68)';
      c.beginPath(); c.roundRect(sx, sy, sw, sh, 3); c.fill();
      c.strokeStyle = 'rgba(157,170,171,.56)'; c.lineWidth = 1.4;
      c.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
      const basin = c.createLinearGradient(sx, sy, sx + sw, sy + sh);
      basin.addColorStop(0, 'rgba(104,120,122,.35)');
      basin.addColorStop(1, 'rgba(12,19,22,.78)');
      c.fillStyle = basin; c.fillRect(sx + 3, sy + 3, sw - 6, sh - 6);
      c.fillStyle = 'rgba(0,0,0,.75)';
      c.beginPath(); c.arc(sx + sw * 0.5, sy + sh * 0.58, Math.max(1.2, small * 0.035), 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(173,185,183,.5)'; c.lineWidth = 1;
      c.beginPath(); c.arc(sx + sw * 0.5, sy + sh * 0.58, Math.max(2.2, small * 0.065), 0, Math.PI * 2); c.stroke();
      // 水龙头与刀具的微弱冷光
      c.strokeStyle = 'rgba(173,184,181,.7)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(sx + sw * 0.52, sy + 1); c.lineTo(sx + sw * 0.52, sy - 3); c.quadraticCurveTo(sx + sw * 0.52 + 4, sy - 5, sx + sw * 0.52 + 6, sy - 1); c.stroke();
      c.fillStyle = 'rgba(164,177,179,.5)';
      for (let i = 0; i < 3; i++) c.fillRect(r.x + r.w * (0.58 + i * 0.065), r.y + r.h * 0.24, 1.6, r.h * 0.25);
      // 台面边缘积垢
      c.strokeStyle = 'rgba(0,0,0,.48)'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(r.x + 2, r.y + r.h * 0.66); c.lineTo(r.x + r.w - 2, r.y + r.h * 0.66); c.stroke();
      break;
    }
    case 'stove': {
      // 老式搪瓷炉灶：玻璃面板、铸铁炉圈、旋钮和烧焦痕迹
      boxShadowed(c, r, '#171d20', 10, 'concrete');
      const panel = c.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      panel.addColorStop(0, '#42494a'); panel.addColorStop(0.45, '#202729'); panel.addColorStop(1, '#111719');
      c.fillStyle = panel;
      c.beginPath(); c.roundRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 3); c.fill();
      c.strokeStyle = 'rgba(178,185,179,.24)'; c.lineWidth = 1;
      c.strokeRect(r.x + 2.5, r.y + 2.5, r.w - 5, r.h - 5);
      for (let i = 0; i < 4; i++) {
        const bx = r.x + r.w * (0.28 + (i % 2) * 0.44);
        const by = r.y + r.h * (0.28 + Math.floor(i / 2) * 0.38);
        const rad = Math.max(3, small * 0.13);
        c.fillStyle = 'rgba(0,0,0,.5)';
        c.beginPath(); c.arc(bx, by, rad + 2, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(145,151,148,.62)'; c.lineWidth = 1.6;
        c.beginPath(); c.arc(bx, by, rad, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = 'rgba(0,0,0,.8)'; c.lineWidth = 1.1;
        c.beginPath(); c.arc(bx, by, rad * 0.56, 0, Math.PI * 2); c.stroke();
        c.fillStyle = 'rgba(0,0,0,.62)';
        c.beginPath(); c.arc(bx, by, 1.3, 0, Math.PI * 2); c.fill();
      }
      // 炉面油污与冷色擦痕
      c.fillStyle = 'rgba(0,0,0,.24)';
      c.beginPath(); c.ellipse(r.x + r.w * 0.52, r.y + r.h * 0.5, r.w * 0.42, r.h * 0.43, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(177,185,182,.16)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(r.x + 4, r.y + r.h * 0.12); c.lineTo(r.x + r.w * 0.42, r.y + 3); c.stroke();
      // 前沿控制旋钮
      for (let i = 0; i < 4; i++) {
        const kx = r.x + r.w * (0.2 + i * 0.2), ky = r.y + r.h * 0.88;
        c.fillStyle = 'rgba(0,0,0,.72)'; c.beginPath(); c.arc(kx, ky, Math.max(1.8, small * 0.055), 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(170,178,173,.52)'; c.lineWidth = 0.8;
        c.beginPath(); c.arc(kx, ky, Math.max(1.8, small * 0.055), 0, Math.PI * 2); c.stroke();
      }
      break;
    }
    case 'fridge': {
      // 老式金属冰箱：厚门体、双层门缝、长把手、冷凝水和锈蚀
      boxShadowed(c, r, '#30383b', 12, 'concrete');
      const shell = c.createLinearGradient(r.x, r.y, r.x + r.w, r.y);
      shell.addColorStop(0, '#11191d'); shell.addColorStop(0.16, '#687174'); shell.addColorStop(0.42, '#3b4548'); shell.addColorStop(0.78, '#252e31'); shell.addColorStop(1, '#111719');
      c.fillStyle = shell;
      c.beginPath(); c.roundRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 3); c.fill();
      // 门板压边与上下冷冻/冷藏分隔
      c.strokeStyle = 'rgba(0,0,0,.74)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(r.x + 3, r.y + r.h * 0.39); c.lineTo(r.x + r.w - 3, r.y + r.h * 0.39); c.stroke();
      c.strokeStyle = 'rgba(190,199,196,.22)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(r.x + 3, r.y + r.h * 0.4); c.lineTo(r.x + r.w - 3, r.y + r.h * 0.4); c.stroke();
      // 纵向拉手
      const hx = r.x + r.w * 0.78;
      c.fillStyle = 'rgba(0,0,0,.55)';
      c.beginPath(); c.roundRect(hx - 1.4, r.y + r.h * 0.12, 4.2, r.h * 0.2, 2); c.fill();
      const handle = c.createLinearGradient(hx, 0, hx + 2.5, 0);
      handle.addColorStop(0, '#8a9695'); handle.addColorStop(0.45, '#3b4546'); handle.addColorStop(1, '#11191b');
      c.fillStyle = handle;
      c.beginPath(); c.roundRect(hx, r.y + r.h * 0.12, 2.4, r.h * 0.2, 1.2); c.fill();
      // 门面冷凝水痕
      for (let i = 0; i < 7; i++) {
        const x = r.x + r.w * (0.12 + i * 0.105);
        const y = r.y + r.h * (0.46 + (i % 3) * 0.08);
        c.strokeStyle = 'rgba(174,192,193,.12)'; c.lineWidth = 0.7;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + (i % 2 ? 1 : -1), y + r.h * (0.1 + (i % 3) * 0.04)); c.stroke();
      }
      // 锈点、凹痕与门边积灰
      for (let i = 0; i < 13; i++) {
        const x = r.x + rand() * r.w, y = r.y + rand() * r.h;
        c.fillStyle = i % 3 === 0 ? 'rgba(116,67,43,.34)' : 'rgba(5,10,12,.3)';
        c.beginPath(); c.ellipse(x, y, 0.7 + rand() * 1.3, 0.6 + rand(), rand(), 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = 'rgba(0,0,0,.34)'; c.fillRect(r.x + 2, r.y + r.h - 3, r.w - 4, 2);
      c.fillStyle = 'rgba(202,212,205,.12)'; c.fillRect(r.x + 3, r.y + 2, 1, r.h - 5);
      break;
    }
    case 'fireplace': {
      boxShadowed(c, r, '#2c2521', 11);
      c.fillStyle = '#171211';
      c.fillRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
      const g = c.createRadialGradient(0, r.h * 0.3, 1, 0, r.h * 0.3, w * 0.44);
      g.addColorStop(0, 'rgba(255,146,64,.8)');
      g.addColorStop(0.45, 'rgba(184,66,26,.4)');
      g.addColorStop(1, 'rgba(52,18,8,0)');
      c.fillStyle = g;
      c.fillRect(r.x, r.y, r.w, r.h);
      // 灰烬与柴
      c.strokeStyle = 'rgba(40,30,24,.8)';
      c.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(r.x + 6 + i * 4, r.y + r.h * 0.55);
        c.lineTo(r.x + r.w - 8 - i * 3, r.y + r.h * 0.5);
        c.stroke();
      }
      break;
    }
    case 'stairs': {
      c.fillStyle = '#2f251b';
      c.fillRect(r.x, r.y, r.w, r.h);
      const steps = 7;
      for (let i = 0; i < steps; i++) {
        c.fillStyle = i % 2 ? 'rgba(255,238,206,.05)' : 'rgba(0,0,0,.28)';
        c.fillRect(r.x, r.y + (r.h / steps) * i, r.w, r.h / steps - 1);
      }
      c.strokeStyle = 'rgba(0,0,0,.6)';
      c.strokeRect(r.x, r.y, r.w, r.h);
      break;
    }
    case 'car': {
      castShadow(c, r, 16, 0.9, 5);
      c.fillStyle = '#1f2226';
      c.beginPath();
      c.roundRect(r.x, r.y, r.w, r.h, small * 0.16);
      c.fill();
      // 车顶与玻璃
      c.fillStyle = 'rgba(255,255,255,.035)';
      c.beginPath();
      c.roundRect(r.x + w * 0.16, r.y + h * 0.24, w * 0.68, h * 0.5, small * 0.1);
      c.fill();
      c.fillStyle = 'rgba(104,130,152,.14)';
      c.beginPath();
      c.roundRect(r.x + w * 0.18, r.y + h * 0.26, w * 0.64, h * 0.18, small * 0.06);
      c.fill();
      c.beginPath();
      c.roundRect(r.x + w * 0.18, r.y + h * 0.56, w * 0.64, h * 0.16, small * 0.06);
      c.fill();
      // 引擎盖高光
      c.fillStyle = 'rgba(255,255,255,.03)';
      c.fillRect(r.x + w * 0.2, r.y + h * 0.06, w * 0.6, h * 0.08);
      // 轮胎
      c.fillStyle = '#0b0c0e';
      for (const [tx, ty] of [
        [r.x + w * 0.08, r.y + h * 0.18],
        [r.x + w * 0.92, r.y + h * 0.18],
        [r.x + w * 0.08, r.y + h * 0.82],
        [r.x + w * 0.92, r.y + h * 0.82],
      ]) {
        c.beginPath();
        c.roundRect(tx - w * 0.05, ty - h * 0.07, w * 0.1, h * 0.14, 3);
        c.fill();
      }
      break;
    }
    case 'boiler': {
      castShadow(c, { x: r.x, y: r.y, w: r.w, h: r.h }, 10, 0.85);
      c.beginPath();
      c.ellipse(0, 0, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
      c.fillStyle = '#494e52';
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,.55)';
      c.stroke();
      c.strokeStyle = 'rgba(150,92,52,.5)';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, small * 0.27, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,.06)';
      c.beginPath();
      c.ellipse(-small * 0.08, -small * 0.1, small * 0.15, small * 0.11, -0.4, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'pipes': {
      c.strokeStyle = 'rgba(104,110,114,.6)';
      c.lineWidth = Math.max(2, h * 0.34);
      c.beginPath();
      c.moveTo(r.x, 0);
      c.lineTo(r.x + r.w, 0);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.1)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(r.x, -h * 0.1);
      c.lineTo(r.x + r.w, -h * 0.1);
      c.stroke();
      c.fillStyle = 'rgba(60,64,68,.9)';
      for (let i = 1; i < 4; i++) {
        c.fillRect(r.x + (r.w / 4) * i - 2, -h * 0.22, 4, h * 0.44);
      }
      break;
    }
    case 'candles': {
      // 仪式蜡烛圈：只留一点暖色，不要奇幻法阵
      const rad = small * 0.4;
      c.strokeStyle = 'rgba(96,38,32,.4)';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, rad, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = 'rgba(96,38,32,.22)';
      c.beginPath();
      c.arc(0, 0, rad * 0.6, 0, Math.PI * 2);
      c.stroke();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.4;
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad;
        c.fillStyle = '#c8bfa6';
        c.fillRect(x - 1.4, y - 3, 2.8, 6);
        c.fillStyle = 'rgba(255,168,78,.92)';
        c.beginPath();
        c.arc(x, y - 4, 1.7, 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
    case 'tree': {
      castShadow(c, { x: r.x, y: r.y, w: r.w, h: r.h }, 18, 0.75, 5);
      c.fillStyle = '#191410';
      c.beginPath();
      c.arc(0, 0, small * 0.28, 0, Math.PI * 2);
      c.fill();
      for (let i = 0; i < 10; i++) {
        c.fillStyle = `rgba(${26 + rand() * 18},${38 + rand() * 20},${24 + rand() * 12},.9)`;
        roughEllipse(c, (rand() - 0.5) * w * 0.9, (rand() - 0.5) * h * 0.9, w * 0.26, h * 0.24, c.fillStyle, rand);
      }
      break;
    }
    case 'bush': {
      for (let i = 0; i < 6; i++) {
        c.fillStyle = `rgba(${24 + rand() * 16},${34 + rand() * 18},${20 + rand() * 12},.94)`;
        roughEllipse(c, (rand() - 0.5) * w * 0.72, (rand() - 0.5) * h * 0.72, w * 0.3, h * 0.3, c.fillStyle, rand);
      }
      break;
    }
    case 'fence': {
      const step = w / 26;
      c.fillStyle = 'rgba(50,42,33,.96)';
      for (let x = r.x; x < r.x + r.w; x += step) {
        c.fillRect(x, r.y, Math.max(2, step * 0.32), r.h);
      }
      c.fillStyle = 'rgba(38,32,25,.96)';
      c.fillRect(r.x, r.y + r.h * 0.16, r.w, r.h * 0.16);
      c.fillRect(r.x, r.y + r.h * 0.7, r.w, r.h * 0.16);
      break;
    }
    case 'trash': {
      c.fillStyle = 'rgba(30,32,30,.92)';
      roughEllipse(c, 0, 0, w * 0.42, h * 0.4, c.fillStyle, rand);
      c.fillStyle = 'rgba(72,74,68,.72)';
      roughEllipse(c, -w * 0.1, -h * 0.12, w * 0.2, h * 0.16, c.fillStyle, rand);
      break;
    }
    case 'tires': {
      for (let i = 0; i < 3; i++) {
        c.strokeStyle = 'rgba(15,16,18,.96)';
        c.lineWidth = Math.max(3, h * 0.13);
        c.beginPath();
        c.ellipse(0, r.y + r.h * (0.2 + i * 0.28), w * 0.38, h * 0.14, 0, 0, Math.PI * 2);
        c.stroke();
      }
      break;
    }
    case 'lamp': {
      // 床头 / 台灯：只有一小圈暖光和灯罩形状
      const g = c.createRadialGradient(0, 0, 1, 0, 0, small * 1.6);
      g.addColorStop(0, 'rgba(255,206,140,.5)');
      g.addColorStop(0.4, 'rgba(255,190,120,.16)');
      g.addColorStop(1, 'rgba(255,180,110,0)');
      c.fillStyle = g;
      c.fillRect(-small * 1.7, -small * 1.7, small * 3.4, small * 3.4);
      c.fillStyle = 'rgba(36,28,22,.9)';
      c.beginPath();
      c.ellipse(0, 0, small * 0.3, small * 0.26, 0, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'plant': {
      c.fillStyle = 'rgba(34,30,24,.9)';
      c.beginPath();
      c.ellipse(0, h * 0.16, w * 0.26, h * 0.16, 0, 0, Math.PI * 2);
      c.fill();
      for (let i = 0; i < 6; i++) {
        c.fillStyle = `rgba(${28 + rand() * 18},${44 + rand() * 20},${26 + rand() * 14},.9)`;
        roughEllipse(c, (rand() - 0.5) * w * 0.5, (rand() - 0.5) * h * 0.5 - h * 0.1, w * 0.22, h * 0.18, c.fillStyle, rand);
      }
      break;
    }
    case 'sheet': {
      // 盖着白布的家具：轮廓不规则、边缘发灰
      castShadow(c, r, 10, 0.75);
      c.fillStyle = 'rgba(74,70,64,.46)';
      c.beginPath();
      c.moveTo(r.x + w * 0.06, r.y + h * 0.2);
      c.quadraticCurveTo(r.x + w * 0.5, r.y - h * 0.06, r.x + w * 0.94, r.y + h * 0.24);
      c.lineTo(r.x + r.w - 2, r.y + h * 0.86);
      c.quadraticCurveTo(r.x + w * 0.5, r.y + h * 1.02, r.x + 2, r.y + h * 0.82);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,.08)';
      c.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(r.x + w * (0.2 + i * 0.24), r.y + h * 0.2);
        c.lineTo(r.x + w * (0.16 + i * 0.26), r.y + h * 0.8);
        c.stroke();
      }
      break;
    }
    case 'puddle': {
      // 积水：深色 + 一条冷色反光
      c.fillStyle = 'rgba(9,12,15,.66)';
      roughEllipse(c, 0, 0, w * 0.44, h * 0.38, c.fillStyle, rand);
      c.strokeStyle = 'rgba(150,180,205,.14)';
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(-w * 0.06, -h * 0.08, w * 0.24, h * 0.16, -0.3, 0, Math.PI * 2);
      c.stroke();
      break;
    }
    case 'clutter': {
      for (let i = 0; i < 10; i++) {
        const bw = 2 + rand() * 6;
        const bh = 1.5 + rand() * 4;
        // 只有纸、木屑和灰：任何一点彩度都会立刻变成"装饰图案"
        const tone = rand();
        c.fillStyle =
          tone > 0.66
            ? `rgba(${92 + rand() * 14},${86 + rand() * 12},${74 + rand() * 10},.5)`
            : tone > 0.33
              ? `rgba(${58 + rand() * 12},${46 + rand() * 10},${34 + rand() * 8},.6)`
              : `rgba(${40 + rand() * 10},${38 + rand() * 8},${34 + rand() * 8},.55)`;
        c.save();
        c.translate((rand() - 0.5) * w, (rand() - 0.5) * h);
        c.rotate(rand() * Math.PI);
        c.fillRect(-bw / 2, -bh / 2, bw, bh);
        c.restore();
      }
      break;
    }
    default:
      break;
  }
  c.restore();
}

