import { isLocked, isRoomExplored } from '../game/engine';
import { ROOMS, ROOM_MAP, ROOM_EDGE_GAP_TOLERANCE } from '../game/rooms';
import { BULBS, PROPS, ROOM_AMBIENT, ROOM_MATERIAL, ROOM_TINT, WINDOWS, type Bulb, type MatKind, type Prop, type WindowLight } from './scene/config';
import type { GameState, RoomId } from '../game/types';

/**
 * 程序化场景层（俯视角现实主义恐怖场景）。
 *
 * DOM 仍然负责房间名、人物头像和点击热区；地面材质、墙体厚度、家具、血迹、
 * 光照与雾气全部画在 Canvas 上，叠在 DOM 房间下面。ROOMS 里的 rect 百分比
 * 一个都没动，交互位置和以前完全一致。
 *
 * 三层画布：
 *   static  整栋房屋（地面 / 家具 / 墙体 / 门窗 / 血迹）—— 尺寸变化或战局变脏时重绘
 *   dark    全局压暗 + 用 destination-out 打光洞        —— 逐帧
 *   main    静态图 + 黑暗层 + 加色光 + 尘埃              —— 逐帧
 *
 * 关键点：整栋房子当成一个连续的实体来画（地基阴影只画一次、外墙与隔墙是
 * 同一块墙体），而不是十个各自带阴影的方块——否则无论材质多细，都会读成
 * "十张漂浮的卡牌"。
 */

import { rng, texture, tileFill } from './scene/materials';
import { drawProp, roughEllipse } from './scene/props';
import type { Ctx, Rect } from './scene/types';

interface View {
  w: number;
  h: number;
  dpr: number;
}

export interface SceneHandle {
  update(state: GameState): void;
  destroy(): void;
}

interface SceneInstance extends SceneHandle {
  attach(host: HTMLElement, state: GameState): SceneHandle;
}

/** 单例：DOM 重建时把同一张画布搬过去，动画状态不中断 */
let instance: SceneInstance | null = null;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const DARK_SCALE = 0.55;

/* ------------------------------------------------------------------ */
/* 随机数：固定种子，保证每次加载纹理一致，不会闪来闪去               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 基础绘制工具                                                       */
/* ------------------------------------------------------------------ */

function rectOf(id: RoomId, v: View): Rect {
  const r = ROOM_MAP[id].rect;
  return {
    x: (r.left / 100) * v.w,
    y: (r.top / 100) * v.h,
    w: (r.width / 100) * v.w,
    h: (r.height / 100) * v.h,
  };
}

/** 物体投影：先铺一层偏移的暗影，物体才"贴"在地上 */
/* ------------------------------------------------------------------ */
/* 墙体与门                                                           */
/* ------------------------------------------------------------------ */

interface Door {
  side: 'top' | 'bottom' | 'left' | 'right';
  /** 0–1 沿墙位置 */
  p: number;
}

/** 从房间出发，看它和某个邻居之间的那条边（门的朝向与位置） */
function sideTo(id: RoomId, nid: RoomId): Door | null {
  const r = ROOM_MAP[id].rect;
  const nr = ROOM_MAP[nid].rect;
  const right = r.left + r.width;
  const bottom = r.top + r.height;
  const otherRight = nr.left + nr.width;
  const otherBottom = nr.top + nr.height;
  const overlapX = Math.min(right, otherRight) - Math.max(r.left, nr.left);
  const overlapY = Math.min(bottom, otherBottom) - Math.max(r.top, nr.top);
  // 房间尺寸不再相同，不能再用中心点方向猜门在哪一面。
  // 直接判断矩形是否真实共边（布局会在两边之间留一条窄墙缝）。
  // 房间矩形之间保留了 0.72 个网格单位的墙缝，不能用 1% 的容差判断共边。
  const edgeTolerance = ROOM_EDGE_GAP_TOLERANCE;
  if (Math.abs(right - nr.left) <= edgeTolerance && overlapY > 0) {
    const p = ((Math.max(r.top, nr.top) + Math.min(bottom, otherBottom)) / 2 - r.top) / r.height;
    return { side: 'right', p: clamp(p, 0.12, 0.88) };
  }
  if (Math.abs(r.left - otherRight) <= edgeTolerance && overlapY > 0) {
    const p = ((Math.max(r.top, nr.top) + Math.min(bottom, otherBottom)) / 2 - r.top) / r.height;
    return { side: 'left', p: clamp(p, 0.12, 0.88) };
  }
  if (Math.abs(bottom - nr.top) <= edgeTolerance && overlapX > 0) {
    const p = ((Math.max(r.left, nr.left) + Math.min(right, otherRight)) / 2 - r.left) / r.width;
    return { side: 'bottom', p: clamp(p, 0.12, 0.88) };
  }
  if (Math.abs(r.top - otherBottom) <= edgeTolerance && overlapX > 0) {
    const p = ((Math.max(r.left, nr.left) + Math.min(right, otherRight)) / 2 - r.left) / r.width;
    return { side: 'top', p: clamp(p, 0.12, 0.88) };
  }
  return null;
}

function hasNeighborOn(id: RoomId, side: Door['side']): boolean {
  return ROOM_MAP[id].neighbors.some((nid) => sideTo(id, nid)?.side === side);
}

/**
 * 这个方向到最近邻居的距离（px）。墙体厚度就是由房间之间的缝隙决定的：
 * 横向缝隙按图宽算、纵向按图高算，所以必须分别取，不能用一个固定值。
 */
function gapToNeighbor(id: RoomId, side: Door['side'], v: View): number {
  const r = ROOM_MAP[id].rect;
  let best = Infinity;
  for (const nid of ROOM_MAP[id].neighbors) {
    if (sideTo(id, nid)?.side !== side) continue;
    const nr = ROOM_MAP[nid].rect;
    const gap =
      side === 'left'
        ? (r.left - (nr.left + nr.width)) * (v.w / 100)
        : side === 'right'
          ? (nr.left - (r.left + r.width)) * (v.w / 100)
          : side === 'top'
            ? (r.top - (nr.top + nr.height)) * (v.h / 100)
            : (nr.top - (r.top + r.height)) * (v.h / 100);
    best = Math.min(best, Math.max(0, gap));
  }
  return best;
}

/**
 * 房屋实体轮廓：每个房间的矩形按边向外扩——朝邻居的边扩到缝隙中线（正好
 * 把两个房间之间的空隙填满），朝屋外的边扩出墙厚。所有矩形合并成一块连续
 * 的墙体，房屋才是一个整体，而不是十个各自带阴影的方块。
 */
function houseMass(v: View, wall: number): Path2D {
  const p = new Path2D();
  for (const room of ROOMS) {
    const r = rectOf(room.id, v);
    const l = hasNeighborOn(room.id, 'left') ? gapToNeighbor(room.id, 'left', v) / 2 + 0.8 : wall;
    const rt = hasNeighborOn(room.id, 'right') ? gapToNeighbor(room.id, 'right', v) / 2 + 0.8 : wall;
    const t = hasNeighborOn(room.id, 'top') ? gapToNeighbor(room.id, 'top', v) / 2 + 0.8 : wall;
    const b = hasNeighborOn(room.id, 'bottom') ? gapToNeighbor(room.id, 'bottom', v) / 2 + 0.8 : wall;
    p.rect(r.x - l, r.y - t, r.w + l + rt, r.h + t + b);
  }
  return p;
}

/** 门的开口：沿墙方向画出洞的位置，同时给出墙体跨度 */
interface DoorHole {
  room: RoomId;
  other: RoomId;
  side: Door['side'];
  /** 洞口沿墙的中心坐标（px） */
  center: number;
  /** 洞口宽度 */
  gap: number;
  /** 墙体外沿 / 内沿坐标（房间边到邻居边） */
  from: number;
  to: number;
}

function doorHoles(v: View): DoorHole[] {
  const out: DoorHole[] = [];
  const seen = new Set<string>();
  const doorGap = clamp(v.w * 0.032, 26, 54);
  for (const room of ROOMS) {
    for (const nid of room.neighbors) {
      const key = [room.id, nid].sort().join('|');
      const side = sideTo(room.id, nid);
      if (!side) continue;
      if (seen.has(key)) {
        // 已经从这个房间的邻居那边记过一次：只重复使用同一个洞口
        continue;
      }
      seen.add(key);
      const a = rectOf(room.id, v);
      const b = rectOf(nid, v);
      const horizontal = side.side === 'left' || side.side === 'right';
      // 只有真正共用一段墙的房间之间才有门。斜对角的邻居（走廊↔地下室）
      // 走位上是通的，但墙上没有洞——硬画一个会砸穿隔壁的墙。
      const overlap = horizontal
        ? Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        : Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      if (overlap < 8) continue;
      let center: number;
      let from: number;
      let to: number;
      if (horizontal) {
        center = a.y + side.p * a.h;
        if (side.side === 'right') {
          from = a.x + a.w;
          to = b.x;
        } else {
          from = b.x + b.w;
          to = a.x;
        }
      } else {
        center = a.x + side.p * a.w;
        if (side.side === 'bottom') {
          from = a.y + a.h;
          to = b.y;
        } else {
          from = b.y + b.h;
          to = a.y;
        }
      }
      out.push({ room: room.id, other: nid, side: side.side, center, gap: doorGap, from, to });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 静态层                                                             */
/* ------------------------------------------------------------------ */

interface SceneRefs {
  canvas: HTMLCanvasElement;
  ctx: Ctx;
  staticCv: HTMLCanvasElement;
  staticCtx: Ctx;
  structCv: HTMLCanvasElement;
  structCtx: Ctx;
  darkCv: HTMLCanvasElement;
  darkCtx: Ctx;
  coneCv: HTMLCanvasElement;
  coneCtx: Ctx;
}

function createCanvases(): SceneRefs {
  const canvas = document.createElement('canvas');
  canvas.className = 'floorplan-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const mk = (): HTMLCanvasElement => document.createElement('canvas');
  const staticCv = mk();
  const structCv = mk();
  const darkCv = mk();
  const coneCv = mk();
  return {
    canvas,
    ctx: canvas.getContext('2d')!,
    staticCv,
    staticCtx: staticCv.getContext('2d')!,
    structCv,
    structCtx: structCv.getContext('2d')!,
    darkCv,
    darkCtx: darkCv.getContext('2d')!,
    coneCv,
    coneCtx: coneCv.getContext('2d')!,
  };
}

export function mountFloorplanScene(initialHost: HTMLElement, initialState: GameState): SceneHandle {
  // 场景画布必须和房间 DOM 共用同一个世界坐标系：镜头缩放/平移时，
  // 地板、墙体、家具、手电光和房间热区必须一起移动，不能把 Canvas 留在视口上。
  const resolveSceneAnchor = (host: HTMLElement): HTMLElement =>
    host.matches('.floorplan') ? host : host.querySelector<HTMLElement>('.floorplan') ?? host;
  if (instance) return instance.attach(resolveSceneAnchor(initialHost), initialState);

  let anchor = resolveSceneAnchor(initialHost);
  const refs = createCanvases();
  const { canvas, ctx } = refs;
  anchor.prepend(canvas);

  let state = initialState;
  let view: View = { w: 0, h: 0, dpr: 1 };
  let staticDirty = true;
  let raf = 0;
  const startTime = performance.now();
  let facing = Math.PI / 2;
  let lastRoom = state.playerRoom;
  let worldKey = '';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const wallThick = (): number => clamp(view.w * 0.0095, 9, 16);
  const doorGap = (): number => clamp(view.w * 0.032, 26, 54);

  function resize(): void {
    // clientWidth/clientHeight are layout-space dimensions. getBoundingClientRect()
    // includes the camera's CSS scale/translation and would resize the world itself
    // every time the camera zooms, desynchronizing Canvas from DOM hit areas.
    const width = anchor.clientWidth;
    const height = anchor.clientHeight;
    if (width < 10 || height < 10) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view = { w: width, h: height, dpr };
    for (const cv of [refs.canvas, refs.staticCv, refs.structCv]) {
      cv.width = Math.round(width * dpr);
      cv.height = Math.round(height * dpr);
    }
    refs.darkCv.width = Math.round(width * dpr * DARK_SCALE);
    refs.darkCv.height = Math.round(height * dpr * DARK_SCALE);
    refs.coneCv.width = refs.darkCv.width;
    refs.coneCv.height = refs.darkCv.height;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    refs.staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    refs.structCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    refs.darkCtx.setTransform(dpr * DARK_SCALE, 0, 0, dpr * DARK_SCALE, 0, 0);
    staticDirty = true;
    if (reduced) drawFrame(performance.now());
  }

  /* ---------------- 屋外 ---------------- */

  function paintYard(c: Ctx): void {
    const { w, h } = view;
    c.fillStyle = '#090a0b';
    c.fillRect(0, 0, w, h);
    tileFill(c, texture('dirt'), { x: 0, y: 0, w, h }, 3);
    // 草地：左下一大片，房屋外侧不该是死黑
    c.save();
    c.beginPath();
    c.ellipse(w * 0.16, h * 0.86, w * 0.34, h * 0.26, -0.2, 0, Math.PI * 2);
    c.ellipse(w * 0.06, h * 0.42, w * 0.16, h * 0.3, 0.1, 0, Math.PI * 2);
    c.clip();
    c.globalAlpha = 0.85;
    tileFill(c, texture('grass'), { x: 0, y: 0, w, h }, 9);
    c.globalAlpha = 1;
    c.restore();

    // 屋外的树 / 灌木 / 篱笆（世界坐标，百分比）
    const items: Prop[] = [
      { k: 'tree', x: 0.055, y: 0.9, w: 0.11, h: 0.18 },
      { k: 'tree', x: 0.2, y: 0.96, w: 0.09, h: 0.14 },
      { k: 'bush', x: 0.32, y: 0.93, w: 0.06, h: 0.09 },
      { k: 'fence', x: 0.16, y: 0.845, w: 0.3, h: 0.016 },
      { k: 'trash', x: 0.42, y: 0.93, w: 0.035, h: 0.045 },
      { k: 'bush', x: 0.5, y: 0.95, w: 0.05, h: 0.07 },
      { k: 'tree', x: 0.985, y: 0.55, w: 0.07, h: 0.13 },
      { k: 'bush', x: 0.94, y: 0.2, w: 0.04, h: 0.06 },
      { k: 'tree', x: 0.02, y: 0.5, w: 0.07, h: 0.12 },
    ];
    for (const it of items) drawProp(c, it, { x: 0, y: 0, w, h }, 700 + it.x * 100);
  }

  /* ---------------- 地面 ---------------- */

  function paintFloors(c: Ctx): void {
    ROOMS.forEach((room, i) => {
      const r = rectOf(room.id, view);
      const mat = ROOM_MATERIAL[room.id];
      c.save();
      c.beginPath();
      c.rect(r.x, r.y, r.w, r.h);
      c.clip();
      tileFill(c, texture(mat), r, i + 1);
      // 环境色：统一压低饱和度，同时给每个房间不同的冷暖
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = ROOM_TINT[room.id];
      c.fillRect(r.x, r.y, r.w, r.h);
      c.globalCompositeOperation = 'source-over';
      // 房角的灰与污渍
      const rand = rng(i * 31 + 7);
      for (let s = 0; s < 4; s++) {
        roughEllipse(
          c,
          r.x + rand() * r.w,
          r.y + rand() * r.h,
          r.w * (0.1 + rand() * 0.16),
          r.h * (0.08 + rand() * 0.14),
          `rgba(8,7,6,${0.05 + rand() * 0.1})`,
          rand,
        );
      }
      // 墙脚的积灰：贴着四边的一条暗带
      const g1 = c.createLinearGradient(0, r.y, 0, r.y + r.h * 0.18);
      g1.addColorStop(0, 'rgba(0,0,0,.34)');
      g1.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g1;
      c.fillRect(r.x, r.y, r.w, r.h * 0.18);
      const g2 = c.createLinearGradient(r.x, 0, r.x + r.w * 0.14, 0);
      g2.addColorStop(0, 'rgba(0,0,0,.3)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g2;
      c.fillRect(r.x, r.y, r.w * 0.14, r.h);
      c.restore();
    });
  }

  /* ---------------- 墙体 ---------------- */

  function paintStructure(c: Ctx): void {
    const { w, h } = view;
    const wall = wallThick();
    const mass = houseMass(view, wall);

    c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    // 墙顶：比地面亮一点点的暖灰。墙体如果跟背景一样黑，就只剩"缝隙"没有"墙"
    c.fillStyle = '#342e26';
    c.fill(mass);
    // 墙体上沿的微弱冷灰高光与下沿阴影，强化墙厚而不改变房间边界。
    c.strokeStyle = 'rgba(190,174,148,.22)';
    c.lineWidth = 1.5;
    c.stroke(mass);

    // 墙面材质（只铺在墙体上）
    c.save();
    c.clip(mass);
    c.globalAlpha = 0.7;
    c.globalCompositeOperation = 'overlay';
    tileFill(c, texture('plaster'), { x: 0, y: 0, w, h }, 21);
    c.restore();

    // 墙顶受光：中间亮、边缘暗，读成一块有厚度的实体
    c.save();
    c.clip(mass);
    c.globalAlpha = 0.05;
    c.fillStyle = '#d8d2c4';
    c.fillRect(0, 0, w, h);
    c.restore();

    // 挖出房间与门窗洞口
    c.globalCompositeOperation = 'destination-out';
    for (const room of ROOMS) {
      const r = rectOf(room.id, view);
      c.fillRect(r.x, r.y, r.w, r.h);
    }
    // 窗洞：外墙上的细长缺口
    for (const room of ROOMS) {
      const wins = WINDOWS[room.id];
      if (!wins) continue;
      const r = rectOf(room.id, view);
      for (const win of wins) {
        const horizontal = win.side === 'top' || win.side === 'bottom';
        const len = (horizontal ? r.w : r.h) * win.w;
        const center = (horizontal ? r.x : r.y) + win.p * (horizontal ? r.w : r.h);
        if (win.side === 'left') c.fillRect(r.x - wall - 1, center - len / 2, wall + 2, len);
        else if (win.side === 'right') c.fillRect(r.x + r.w - 1, center - len / 2, wall + 2, len);
        else if (win.side === 'top') c.fillRect(center - len / 2, r.y - wall - 1, len, wall + 2);
        else c.fillRect(center - len / 2, r.y + r.h - 1, len, wall + 2);
      }
    }
    c.globalCompositeOperation = 'source-over';

    // 墙脚：靠房间一侧压一道暗边，墙和地面才咬得上
    for (const room of ROOMS) {
      const r = rectOf(room.id, view);
      c.strokeStyle = 'rgba(0,0,0,.5)';
      c.lineWidth = 1.6;
      c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      c.strokeStyle = 'rgba(228,216,192,.035)';
      c.lineWidth = 1;
      c.strokeRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3);
    }
  }

  /** 地面使用痕迹：污渍、拖擦和门口积灰，全部固定种子，重绘时不会闪烁。 */
  function paintSurfaceWear(c: Ctx): void {
    ROOMS.forEach((room, i) => {
      const r = rectOf(room.id, view);
      const rand = rng(9107 + i * 173);
      c.save();
      c.beginPath();
      c.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      c.clip();

      // 房间角落的潮气与积灰：边缘有痕迹，中心仍保留地板材质。
      for (let n = 0; n < 5; n++) {
        const corner = n % 4;
        const x = r.x + (corner === 0 || corner === 3 ? 0.06 : 0.94) * r.w;
        const y = r.y + (corner < 2 ? 0.07 : 0.93) * r.h;
        const rx = r.w * (0.08 + rand() * 0.1);
        const ry = r.h * (0.07 + rand() * 0.09);
        const stain = c.createRadialGradient(x, y, 1, x, y, Math.max(rx, ry));
        stain.addColorStop(0, `rgba(5,6,6,${0.11 + rand() * 0.08})`);
        stain.addColorStop(0.62, 'rgba(8,8,7,.055)');
        stain.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = stain;
        c.beginPath();
        c.ellipse(x, y, rx, ry, rand() * 0.5, 0, Math.PI * 2);
        c.fill();
      }

      // 不规则的细划痕和鞋底拖痕，避免地面像一张干净的重复贴图。
      for (let n = 0; n < 13; n++) {
        const x = r.x + (0.12 + rand() * 0.76) * r.w;
        const y = r.y + (0.12 + rand() * 0.76) * r.h;
        const len = Math.min(r.w, r.h) * (0.018 + rand() * 0.045);
        c.strokeStyle = `rgba(4,4,4,${0.12 + rand() * 0.14})`;
        c.lineWidth = 0.45 + rand() * 0.65;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + len * 0.35, y + (rand() - 0.5) * 3, x + len, y + (rand() - 0.5) * 4);
        c.stroke();
      }

      // 门口附近的磨损带，给房间之间的通行路径一点生活痕迹。
      const doors = doorHoles(view).filter((hole) => hole.room === room.id || hole.other === room.id);
      for (const hole of doors) {
        const cx = hole.side === 'left' ? r.x : hole.side === 'right' ? r.x + r.w :
          hole.side === 'top' ? hole.center : hole.center;
        const cy = hole.side === 'top' ? r.y : hole.side === 'bottom' ? r.y + r.h : hole.center;
        const horizontal = hole.side === 'top' || hole.side === 'bottom';
        const wear = c.createRadialGradient(cx, cy, 1, cx, cy, hole.gap * 1.35);
        wear.addColorStop(0, 'rgba(0,0,0,.16)');
        wear.addColorStop(0.55, 'rgba(0,0,0,.055)');
        wear.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = wear;
        c.beginPath();
        c.ellipse(cx, cy, horizontal ? hole.gap * 1.25 : hole.gap * 0.72,
          horizontal ? hole.gap * 0.72 : hole.gap * 1.25, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    });
  }

  /** 灯具本体：画在地面上的一个亮点 + 金属罩 */
  function paintFixtures(c: Ctx): void {
    for (const room of ROOMS) {
      const bulbs = BULBS[room.id];
      if (!bulbs) continue;
      const r = rectOf(room.id, view);
      for (const b of bulbs) {
        const x = r.x + b.x * r.w;
        const y = r.y + b.y * r.h;
        c.save();
        if (b.fixture === 'tube') {
          const len = Math.min(r.w, r.h) * 0.26;
          c.fillStyle = 'rgba(180,212,232,.5)';
          c.beginPath();
          c.roundRect(x - len / 2, y - 2, len, 4, 2);
          c.fill();
          c.fillStyle = 'rgba(255,255,255,.35)';
          c.fillRect(x - len / 2 + 2, y - 0.6, len - 4, 1.2);
        } else {
          // 灯泡：暗色灯口 + 暖白灯芯
          c.fillStyle = 'rgba(20,18,16,.9)';
          c.beginPath();
          c.arc(x, y, 4.2, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = b.power > 0.4 ? 'rgba(255,226,176,.92)' : 'rgba(255,206,150,.7)';
          c.beginPath();
          c.arc(x, y, 2.4, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
      }
    }
  }

  /** 窗：冷色天光、窗台、窗框 */
  function paintWindows(c: Ctx): void {
    const wall = wallThick();
    for (const room of ROOMS) {
      const wins = WINDOWS[room.id];
      if (!wins) continue;
      const r = rectOf(room.id, view);
      for (const win of wins) {
        const horizontal = win.side === 'top' || win.side === 'bottom';
        const len = (horizontal ? r.w : r.h) * win.w;
        const center = (horizontal ? r.x : r.y) + win.p * (horizontal ? r.w : r.h);
        c.save();
        // 窗外的夜色
        let g: CanvasGradient;
        let frame: Rect;
        if (win.side === 'left' || win.side === 'right') {
          const x = win.side === 'left' ? r.x - wall : r.x + r.w;
          frame = { x, y: center - len / 2, w: wall, h: len };
          g = c.createLinearGradient(x, 0, x + wall, 0);
        } else {
          const y = win.side === 'top' ? r.y - wall : r.y + r.h;
          frame = { x: center - len / 2, y, w: len, h: wall };
          g = c.createLinearGradient(0, y, 0, y + wall);
        }
        g.addColorStop(0, 'rgba(136,164,194,.45)');
        g.addColorStop(0.55, 'rgba(98,124,154,.3)');
        g.addColorStop(1, 'rgba(58,78,100,.22)');
        c.fillStyle = g;
        c.fillRect(frame.x, frame.y, frame.w, frame.h);
        // 窗框：中间一根竖梃
        c.fillStyle = 'rgba(14,14,15,.85)';
        if (win.side === 'left' || win.side === 'right') {
          c.fillRect(frame.x, frame.y + frame.h / 2 - 1, frame.w, 2);
          c.fillRect(frame.x, frame.y, 1.5, frame.h);
          c.fillRect(frame.x + frame.w - 1.5, frame.y, 1.5, frame.h);
        } else {
          c.fillRect(frame.x + frame.w / 2 - 1, frame.y, 2, frame.h);
          c.fillRect(frame.x, frame.y, frame.w, 1.5);
          c.fillRect(frame.x, frame.y + frame.h - 1.5, frame.w, 1.5);
        }
        c.restore();
      }
    }
  }

  /** 门槛、门框、被封锁的门的铁链 */
  function paintDoors(c: Ctx): void {
    for (const hole of doorHoles(view)) {
      const verticalWall = hole.side === 'left' || hole.side === 'right';
      const locked = isLocked(state, hole.room) || isLocked(state, hole.other);
      const from = Math.min(hole.from, hole.to);
      const to = Math.max(hole.from, hole.to);
      c.save();
      if (verticalWall) {
        const g = c.createLinearGradient(from, 0, to, 0);
        g.addColorStop(0, 'rgba(26,20,15,.96)');
        g.addColorStop(0.45, 'rgba(52,40,29,.96)');
        g.addColorStop(1, 'rgba(26,20,15,.96)');
        c.fillStyle = g;
        c.fillRect(from, hole.center - hole.gap / 2, to - from, hole.gap);
        // 门框：洞口两端的立柱
        c.fillStyle = 'rgba(14,12,10,.95)';
        c.fillRect(from, hole.center - hole.gap / 2, to - from, 2.5);
        c.fillRect(from, hole.center + hole.gap / 2 - 2.5, to - from, 2.5);
        // 门轴侧的一道暗影，门是往里开的
        const sh = c.createLinearGradient(from, 0, from + (to - from) * 0.55, 0);
        sh.addColorStop(0, 'rgba(0,0,0,.5)');
        sh.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = sh;
        c.fillRect(from, hole.center - hole.gap / 2 + 2, (to - from) * 0.55, hole.gap - 4);
      } else {
        const g = c.createLinearGradient(0, from, 0, to);
        g.addColorStop(0, 'rgba(26,20,15,.96)');
        g.addColorStop(0.45, 'rgba(52,40,29,.96)');
        g.addColorStop(1, 'rgba(26,20,15,.96)');
        c.fillStyle = g;
        c.fillRect(hole.center - hole.gap / 2, from, hole.gap, to - from);
        c.fillStyle = 'rgba(14,12,10,.95)';
        c.fillRect(hole.center - hole.gap / 2, from, 2.5, to - from);
        c.fillRect(hole.center + hole.gap / 2 - 2.5, from, 2.5, to - from);
        const sh = c.createLinearGradient(0, from, 0, from + (to - from) * 0.55);
        sh.addColorStop(0, 'rgba(0,0,0,.5)');
        sh.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = sh;
        c.fillRect(hole.center - hole.gap / 2 + 2, from, hole.gap - 4, (to - from) * 0.55);
      }
      if (locked) {
        // 被封的门：两道交叉的铁条
        c.strokeStyle = 'rgba(146,138,120,.55)';
        c.lineWidth = 2.2;
        c.beginPath();
        if (verticalWall) {
          c.moveTo(from + 1, hole.center - hole.gap / 2 + 3);
          c.lineTo(to - 1, hole.center + hole.gap / 2 - 3);
          c.moveTo(from + 1, hole.center + hole.gap / 2 - 3);
          c.lineTo(to - 1, hole.center - hole.gap / 2 + 3);
        } else {
          c.moveTo(hole.center - hole.gap / 2 + 3, from + 1);
          c.lineTo(hole.center + hole.gap / 2 - 3, to - 1);
          c.moveTo(hole.center + hole.gap / 2 - 3, from + 1);
          c.lineTo(hole.center - hole.gap / 2 + 3, to - 1);
        }
        c.stroke();
      }
      c.restore();
    }
  }

  /** 墙脚投射到地面上的接触阴影 + 踢脚线 */
  function paintWallShading(c: Ctx): void {
    for (const room of ROOMS) {
      const r = rectOf(room.id, view);
      const depth = Math.min(14, Math.min(r.w, r.h) * 0.095);
      const strips: [Rect, [number, number, number, number]][] = [
        [{ x: r.x, y: r.y, w: r.w, h: depth }, [0, r.y, 0, r.y + depth]],
        [{ x: r.x, y: r.y + r.h - depth, w: r.w, h: depth }, [0, r.y + r.h, 0, r.y + r.h - depth]],
        [{ x: r.x, y: r.y, w: depth, h: r.h }, [r.x, 0, r.x + depth, 0]],
        [{ x: r.x + r.w - depth, y: r.y, w: depth, h: r.h }, [r.x + r.w, 0, r.x + r.w - depth, 0]],
      ];
      for (const [rect, [gx0, gy0, gx1, gy1]] of strips) {
        // 有门的一侧不做满，门口会被光冲淡
        const g = c.createLinearGradient(gx0, gy0, gx1, gy1);
        g.addColorStop(0, 'rgba(0,0,0,.55)');
        g.addColorStop(0.55, 'rgba(0,0,0,.22)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
      // 踢脚线：贴着墙的一圈略亮窄带，是现实室内最容易被忽略、又最能出效果的一笔
      c.strokeStyle = 'rgba(214,198,168,.055)';
      c.lineWidth = 1.5;
      c.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }
  }

  function paintBlood(c: Ctx): void {
    const dead = state.people.filter((p) => p.hp <= 0);
    dead.forEach((p, i) => {
      const r = rectOf(p.room, view);
      drawBlood(c, r, i * 47 + 11, p.marked ? 1.2 : 0.85);
    });
    if (state.kills > 0 && !dead.some((p) => p.room === state.playerRoom)) {
      drawBlood(c, rectOf(state.playerRoom, view), 91, 0.5);
    }
  }

  function paintStatic(): void {
    const c = refs.staticCtx;
    c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    c.clearRect(0, 0, view.w, view.h);

    paintYard(c);

    // 整栋房屋只投一次影：这是"十张卡"与"一栋房子"的分界
    const mass = houseMass(view, wallThick());
    c.save();
    c.shadowColor = 'rgba(0,0,0,.92)';
    c.shadowBlur = 30;
    c.shadowOffsetY = 7;
    c.fillStyle = '#000';
    c.fill(mass);
    c.restore();

    paintFloors(c);

    // 家具：画在地面之上、墙体之下，遮挡关系才对
    ROOMS.forEach((room, i) => {
      const r = rectOf(room.id, view);
      c.save();
      c.beginPath();
      c.rect(r.x, r.y, r.w, r.h);
      c.clip();
      PROPS[room.id].forEach((p, j) => drawProp(c, p, r, i * 130 + j * 17 + 5));
      c.restore();
    });

    paintSurfaceWear(c);
    paintFixtures(c);

    // 墙体
    paintStructure(refs.structCtx);
    c.drawImage(refs.structCv, 0, 0, view.w, view.h);

    paintWindows(c);
    paintDoors(c);
    paintWallShading(c);
    paintBlood(c);

    staticDirty = false;
  }

  /* ---------------- 光照 ---------------- */

  /** 在压暗层上"挖"一个柔光洞 */
  function cutLight(target: Ctx, x: number, y: number, radius: number, power: number): void {
    const g = target.createRadialGradient(x, y, radius * 0.06, x, y, Math.max(1, radius));
    g.addColorStop(0, `rgba(0,0,0,${power})`);
    g.addColorStop(0.45, `rgba(0,0,0,${power * 0.62})`);
    g.addColorStop(0.78, `rgba(0,0,0,${power * 0.22})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    target.fillStyle = g;
    target.beginPath();
    target.arc(x, y, Math.max(1, radius), 0, Math.PI * 2);
    target.fill();
  }

  /** 加色光 */
  function addLight(
    target: Ctx,
    x: number,
    y: number,
    radius: number,
    power: number,
    color: [number, number, number],
  ): void {
    const [r, g0, b] = color;
    const g = target.createRadialGradient(x, y, radius * 0.04, x, y, Math.max(1, radius));
    g.addColorStop(0, `rgba(${r},${g0},${b},${power * 0.3})`);
    g.addColorStop(0.4, `rgba(${r},${g0},${b},${power * 0.12})`);
    g.addColorStop(1, `rgba(${r},${g0},${b},0)`);
    target.fillStyle = g;
    target.beginPath();
    target.arc(x, y, Math.max(1, radius), 0, Math.PI * 2);
    target.fill();
  }

  /** 月光落进屋里的光斑（含窗棂的影子） */
  function paintMoonPool(
    c: Ctx,
    room: Rect,
    win: WindowLight,
    alpha: number,
    color: [number, number, number],
  ): void {
    const horizontal = win.side === 'top' || win.side === 'bottom';
    const span = (horizontal ? room.w : room.h) * win.w;
    const depth = (horizontal ? room.h : room.w) * 0.82;
    const along = (horizontal ? room.x : room.y) + win.p * (horizontal ? room.w : room.h);
    const cx =
      (horizontal ? along : win.side === 'left' ? room.x + depth * 0.34 : room.x + room.w - depth * 0.34);
    const cy =
      (horizontal ? (win.side === 'top' ? room.y + depth * 0.34 : room.y + room.h - depth * 0.34) : along);
    const rx = horizontal ? span * 0.9 : depth * 0.72;
    const ry = horizontal ? depth * 0.72 : span * 0.9;
    const [r, g, b] = color;
    const grad = c.createRadialGradient(cx, cy, 1, cx, cy, Math.max(rx, ry));
    grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
    grad.addColorStop(0.45, `rgba(${r},${g},${b},${alpha * 0.42})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    c.save();
    c.beginPath();
    c.rect(room.x + 1, room.y + 1, room.w - 2, room.h - 2);
    c.clip();
    c.fillStyle = grad;
    c.beginPath();
    c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawFrame(now: number): void {
    if (staticDirty || view.w < 10) paintStatic();
    const t = (now - startTime) / 1000;
    const { w, h } = view;

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(refs.staticCv, 0, 0, w, h);

    /* —— 黑暗层：整体压暗，再把有光的地方挖空 —— */
    const d = refs.darkCtx;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, w, h);
    d.fillStyle = 'rgba(3,4,6,.58)';
    d.fillRect(0, 0, w, h);
    d.globalCompositeOperation = 'destination-out';

    // 每个房间的基础环境光：没有灯也要能读出地面材质
    for (const room of ROOMS) {
      const r = rectOf(room.id, view);
      cutLight(d, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * 0.72, ROOM_AMBIENT[room.id]);
    }

    // 灯泡
    const lampPulse = new Map<RoomId, number>();
    for (const room of ROOMS) {
      const bulbs = BULBS[room.id];
      if (!bulbs) continue;
      const r = rectOf(room.id, view);
      bulbs.forEach((b, i) => {
        const wobble =
          1 -
          b.flicker *
            (0.45 + 0.55 * Math.abs(Math.sin(t * 2.7 + i * 3.1))) *
            (0.35 + 0.65 * Math.abs(Math.sin(t * 9.3 + b.x * 13)));
        lampPulse.set(room.id, wobble);
        cutLight(
          d,
          r.x + b.x * r.w,
          r.y + b.y * r.h,
          b.r * Math.min(r.w, r.h),
          clamp(b.power * wobble * 1.25, 0, 1),
        );
      });
    }

    // 月光
    for (const room of ROOMS) {
      const wins = WINDOWS[room.id];
      if (!wins) continue;
      const r = rectOf(room.id, view);
      for (const win of wins) {
        const horizontal = win.side === 'top' || win.side === 'bottom';
        const span = (horizontal ? r.w : r.h) * win.w;
        const depth = (horizontal ? r.h : r.w) * 0.82;
        const along = (horizontal ? r.x : r.y) + win.p * (horizontal ? r.w : r.h);
        const gx =
          (horizontal ? along : win.side === 'left' ? r.x : r.x + r.w);
        const gy =
          (horizontal ? (win.side === 'top' ? r.y : r.y + r.h) : along);
        cutLight(d, gx, gy, Math.max(span * 1.3, depth * 0.95), 0.9);
      }
    }

    // 玩家：手电筒光锥（裁剪到当前房间，光不穿墙）
    const pr = rectOf(state.playerRoom, view);
    // The DOM player marker is centered on this exact room center. Move the
    // flashlight emitter a short distance toward the facing edge so the beam
    // appears to leave the killer, rather than starting underneath the portrait.
    const markerX = pr.x + pr.w / 2;
    const markerY = pr.y + pr.h / 2;
    const torchOffset = Math.min(pr.w, pr.h) * 0.22;
    const px = markerX + Math.cos(facing) * torchOffset;
    const py = markerY + Math.sin(facing) * torchOffset;
    const coneLen = Math.min(Math.max(w, h) * 0.27, Math.hypot(pr.w, pr.h) * 0.7);
    const k = view.dpr * DARK_SCALE;
    const cc = refs.coneCtx;
    cc.setTransform(1, 0, 0, 1, 0, 0);
    cc.clearRect(0, 0, refs.coneCv.width, refs.coneCv.height);
    cc.setTransform(k, 0, 0, k, 0, 0);
    // 深红手电：不画硬边三角形，而是用弧形光束、宽幅漫反射和中心热点叠加。
    // 整束光裁切在当前房间内，墙体仍然阻挡光照。
    cc.save();
    cc.beginPath();
    cc.rect(pr.x + 1, pr.y + 1, pr.w - 2, pr.h - 2);
    cc.clip();
    cc.translate(px, py);
    cc.rotate(facing);

    // 环境漫反射：照到墙面和地板上的宽阔暗红色光晕。
    const halo = cc.createRadialGradient(coneLen * 0.42, 0, coneLen * 0.06, coneLen * 0.42, 0, coneLen * 0.78);
    halo.addColorStop(0, 'rgba(235,24,34,.34)');
    halo.addColorStop(0.42, 'rgba(194,10,24,.20)');
    halo.addColorStop(0.76, 'rgba(130,5,18,.07)');
    halo.addColorStop(1, 'rgba(70,0,8,0)');
    cc.fillStyle = halo;
    cc.beginPath();
    cc.ellipse(coneLen * 0.42, 0, coneLen * 0.72, coneLen * 0.39, 0, 0, Math.PI * 2);
    cc.fill();

    // 主光束采用弧形边缘与渐隐，不会出现机械的直线三角边。
    const beamGradient = cc.createLinearGradient(0, 0, coneLen, 0);
    beamGradient.addColorStop(0, 'rgba(255,54,64,.58)');
    beamGradient.addColorStop(0.18, 'rgba(230,24,38,.42)');
    beamGradient.addColorStop(0.56, 'rgba(178,10,26,.20)');
    beamGradient.addColorStop(0.88, 'rgba(120,4,16,.06)');
    beamGradient.addColorStop(1, 'rgba(80,0,8,0)');
    cc.fillStyle = beamGradient;
    cc.shadowColor = 'rgba(235,18,35,.42)';
    cc.shadowBlur = Math.max(12, coneLen * 0.16);
    cc.beginPath();
    cc.moveTo(0, 0);
    cc.bezierCurveTo(coneLen * 0.18, -coneLen * 0.11, coneLen * 0.68, -coneLen * 0.30, coneLen, -coneLen * 0.045);
    cc.bezierCurveTo(coneLen * 1.04, 0, coneLen * 0.68, coneLen * 0.30, coneLen * 0.18, coneLen * 0.11);
    cc.closePath();
    cc.fill();
    cc.shadowBlur = 0;

    // 光束中心的漫射热点，边缘逐渐融入黑暗。
    const hot = cc.createRadialGradient(coneLen * 0.52, 0, coneLen * 0.025, coneLen * 0.52, 0, coneLen * 0.32);
    hot.addColorStop(0, 'rgba(255,68,72,.30)');
    hot.addColorStop(0.48, 'rgba(218,18,34,.18)');
    hot.addColorStop(1, 'rgba(125,0,14,0)');
    cc.fillStyle = hot;
    cc.beginPath();
    cc.ellipse(coneLen * 0.52, 0, coneLen * 0.43, coneLen * 0.19, 0, 0, Math.PI * 2);
    cc.fill();

    // 手电筒发光口附近的红色溢光。
    const emitter = cc.createRadialGradient(0, 0, 1, 0, 0, coneLen * 0.19);
    emitter.addColorStop(0, 'rgba(255,90,92,.52)');
    emitter.addColorStop(0.38, 'rgba(224,18,32,.28)');
    emitter.addColorStop(1, 'rgba(120,0,10,0)');
    cc.fillStyle = emitter;
    cc.beginPath();
    cc.arc(0, 0, coneLen * 0.19, 0, Math.PI * 2);
    cc.fill();
    cc.restore();

    d.globalCompositeOperation = 'destination-out';
    d.drawImage(refs.coneCv, 0, 0, w, h);
    d.globalCompositeOperation = 'source-over';

    // 玩家脚下一圈
    const flickP = 0.92 + Math.sin(t * 7.3) * 0.03 + Math.sin(t * 17.7) * 0.015;
    cutLight(d, px, py, Math.min(pr.w, pr.h) * 0.6, 0.7 * flickP);

    // 门洞：玩家能走过去的门，门框附近透一点冷光
    const myDoors = doorHoles(view).filter(
      (hole) => hole.room === state.playerRoom || hole.other === state.playerRoom,
    );
    for (const hole of myDoors) {
      const horizontalWall = hole.side === 'left' || hole.side === 'right';
      const mid = (hole.from + hole.to) / 2;
      cutLight(d, horizontalWall ? mid : hole.center, horizontalWall ? hole.center : mid, hole.gap * 0.9, 0.34);
    }

    // 警察所在房间：冷白手电
    const police = state.people.find((p) => p.role === 'police');
    if (police) {
      const rr = rectOf(police.room, view);
      cutLight(d, rr.x + rr.w / 2, rr.y + rr.h / 2, Math.min(rr.w, rr.h) * 0.66, 0.55);
    }

    // 玩家房间：可进入的相邻房间微亮，读得出来往哪走
    for (const nid of ROOM_MAP[state.playerRoom].neighbors) {
      const nr = rectOf(nid, view);
      cutLight(d, nr.x + nr.w / 2, nr.y + nr.h / 2, Math.max(nr.w, nr.h) * 0.4, 0.16);
    }

    /* —— 贴回画面 —— */
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(refs.darkCv, 0, 0, w, h);

    /* —— 战争迷雾：没进过的房间只留一个轮廓，里面的家具和人不给看 —— */
    for (const room of ROOMS) {
      if (isRoomExplored(state, room.id)) continue;
      const r = rectOf(room.id, view);
      ctx.fillStyle = 'rgba(4,5,6,.88)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = 'rgba(126,120,108,.10)';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    }

    /* —— 加色光 —— */
    ctx.globalCompositeOperation = 'lighter';

    // 灯泡暖光
    for (const room of ROOMS) {
      if (!isRoomExplored(state, room.id)) continue;
      const bulbs = BULBS[room.id];
      if (!bulbs) continue;
      const r = rectOf(room.id, view);
      const pulse = lampPulse.get(room.id) ?? 1;
      for (const b of bulbs) {
        addLight(
          ctx,
          r.x + b.x * r.w,
          r.y + b.y * r.h,
          b.r * Math.min(r.w, r.h) * 1.05,
          b.power * pulse,
          b.color,
        );
      }
    }

    // 月光冷调 + 窗棂影
    for (const room of ROOMS) {
      if (!isRoomExplored(state, room.id)) continue;
      const wins = WINDOWS[room.id];
      if (!wins) continue;
      const r = rectOf(room.id, view);
      for (const win of wins) {
        paintMoonPool(ctx, r, win, 0.2, [116, 148, 196]);
      }
    }

    // 手电在地面形成深红光斑；以 screen 混合保留材质纹理，不绘制符号或光源图标。
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.34;
    ctx.drawImage(refs.coneCv, 0, 0, w, h);
    ctx.restore();

    // 空气中的暗红体积光，边缘弥散，不再形成几何三角形。
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.30;
    ctx.beginPath();
    ctx.rect(pr.x + 1, pr.y + 1, pr.w - 2, pr.h - 2);
    ctx.clip();
    ctx.translate(px, py);
    ctx.rotate(facing);
    const volume = ctx.createLinearGradient(0, 0, coneLen, 0);
    volume.addColorStop(0, 'rgba(245,20,34,.18)');
    volume.addColorStop(0.38, 'rgba(200,8,24,.10)');
    volume.addColorStop(1, 'rgba(110,0,12,0)');
    ctx.fillStyle = volume;
    ctx.shadowColor = 'rgba(220,8,25,.18)';
    ctx.shadowBlur = coneLen * 0.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(coneLen * .2, -coneLen * .12, coneLen * .7, -coneLen * .26, coneLen, 0);
    ctx.bezierCurveTo(coneLen * .7, coneLen * .26, coneLen * .2, coneLen * .12, 0, 0);
    ctx.fill();
    ctx.restore();

    // 门缝冷光：门槛上的一条细光，不是一团亮斑
    const spill = 0.075 + 0.018 * Math.sin(t * 2.2);
    for (const hole of myDoors) {
      const horizontalWall = hole.side === 'left' || hole.side === 'right';
      const from = Math.min(hole.from, hole.to) - 2;
      const to = Math.max(hole.from, hole.to) + 2;
      ctx.save();
      if (horizontalWall) {
        const g = ctx.createLinearGradient(from, 0, to, 0);
        g.addColorStop(0, 'rgba(150,190,235,0)');
        g.addColorStop(0.5, `rgba(150,190,235,${spill})`);
        g.addColorStop(1, 'rgba(150,190,235,0)');
        ctx.fillStyle = g;
        ctx.fillRect(from, hole.center - hole.gap / 2 + 1, to - from, hole.gap - 2);
      } else {
        const g = ctx.createLinearGradient(0, from, 0, to);
        g.addColorStop(0, 'rgba(150,190,235,0)');
        g.addColorStop(0.5, `rgba(150,190,235,${spill})`);
        g.addColorStop(1, 'rgba(150,190,235,0)');
        ctx.fillStyle = g;
        ctx.fillRect(hole.center - hole.gap / 2 + 1, from, hole.gap - 2, to - from);
      }
      ctx.restore();
    }

    // 撤离点的绿色指示灯
    const exitR = rectOf('garage', view);
    addLight(ctx, exitR.x + exitR.w * 0.5, exitR.y + exitR.h * 0.5, Math.min(exitR.w, exitR.h) * 0.55, 0.15 + 0.05 * Math.sin(t * 1.6), [110, 190, 140]);

    // 雾：几团缓慢漂移的低亮度灰
    for (let i = 0; i < 3; i++) {
      const fx = w * (0.2 + 0.3 * i) + Math.sin(t * 0.12 + i) * w * 0.06;
      const fy = h * (0.34 + 0.18 * i) + Math.cos(t * 0.09 + i * 2) * h * 0.05;
      addLight(ctx, fx, fy, w * 0.3, 0.05, [130, 140, 155]);
    }

    // 全局光向：整栋房子的光从左上斜下来，右下自然沉下去
    ctx.globalCompositeOperation = 'multiply';
    const dir = ctx.createLinearGradient(0, 0, w * 0.95, h);
    dir.addColorStop(0, '#ffffff');
    dir.addColorStop(0.5, '#eceef1');
    dir.addColorStop(1, '#b4b7bd');
    ctx.fillStyle = dir;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    // 玩家脚底的接触阴影：人站在地上，不能像贴纸浮着
    const ps = Math.min(pr.w, pr.h) * 0.16;
    const sg = ctx.createRadialGradient(px, py + ps * 0.5, 1, px, py + ps * 0.5, ps * 2.1);
    sg.addColorStop(0, 'rgba(0,0,0,.5)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(px, py + ps * 0.5, ps * 2.1, ps * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // 不再把尘埃粒子贴在玩家周围；保持人物标记干净，空气层由柔和雾气承担。

    ctx.globalCompositeOperation = 'source-over';
  }

  // The camera can animate at the browser's refresh rate; the atmospheric
  // lighting layer is intentionally capped at 30fps to leave headroom for input,
  // DOM updates and smooth camera transforms on mid-range devices.
  let lastDrawTime = 0;
  const frameInterval = 1000 / 30;
  function loop(now: number): void {
    if (now - lastDrawTime >= frameInterval) {
      drawFrame(now);
      lastDrawTime = now;
    }
    raf = requestAnimationFrame(loop);
  }

  function update(next: GameState): void {
    state = next;
    if (next.playerRoom !== lastRoom) {
      const a = rectOf(lastRoom, view);
      const b = rectOf(next.playerRoom, view);
      const dx = b.x + b.w / 2 - (a.x + a.w / 2);
      const dy = b.y + b.h / 2 - (a.y + a.h / 2);
      if (Math.abs(dx) + Math.abs(dy) > 1) facing = Math.atan2(dy, dx);
      lastRoom = next.playerRoom;
    }
    const key = `${next.kills}|${next.people.filter((p) => p.hp <= 0).length}|${Object.keys(next.roomLocks).sort().join(',')}`;
    if (key !== worldKey) {
      worldKey = key;
      staticDirty = true;
    }
    if (reduced) {
      drawFrame(performance.now());
      return;
    }
    if (!raf) raf = requestAnimationFrame(loop);
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(anchor);
  resize();
  worldKey = `${state.kills}|${state.people.filter((p) => p.hp <= 0).length}|${Object.keys(state.roomLocks).sort().join(',')}`;
  if (reduced) drawFrame(performance.now());
  else raf = requestAnimationFrame(loop);

  const onVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf && !reduced) {
      raf = requestAnimationFrame(loop);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const handle: SceneInstance = {
    update,
    attach(nextHost: HTMLElement, nextState: GameState): SceneHandle {
      const nextAnchor = resolveSceneAnchor(nextHost);
      if (nextAnchor !== anchor) {
        anchor = nextAnchor;
        ro.disconnect();
        anchor.prepend(canvas);
        ro.observe(anchor);
        resize();
      }
      update(nextState);
      return handle;
    },
    destroy(): void {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.remove();
      if (instance === handle) instance = null;
    },
  };
  instance = handle;
  return handle;
}

/* ------------------------------------------------------------------ */
/* 血迹                                                               */
/* ------------------------------------------------------------------ */

function drawBlood(c: Ctx, r: Rect, seed: number, strength: number): void {
  const rand = rng(seed);
  const cx = r.x + r.w * (0.25 + rand() * 0.5);
  const cy = r.y + r.h * (0.25 + rand() * 0.5);
  const rx = Math.min(r.w, r.h) * (0.1 + rand() * 0.09);
  c.save();
  // 主血泊：偏暗的红，压掉饱和度
  for (let i = 0; i < 3; i++) {
    roughEllipse(
      c,
      cx + (rand() - 0.5) * rx,
      cy + (rand() - 0.5) * rx,
      rx * (0.7 + rand() * 0.6),
      rx * (0.5 + rand() * 0.5),
      `rgba(${48 + rand() * 16},${11 + rand() * 7},${9 + rand() * 5},${0.55 * strength})`,
      rand,
    );
  }
  // 喷溅
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2;
    const d = rx * (1 + rand() * 2.1);
    c.fillStyle = `rgba(${42 + rand() * 20},${12 + rand() * 7},${10 + rand() * 5},${(0.2 + rand() * 0.4) * strength})`;
    c.beginPath();
    c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.82, 0.7 + rand() * 2.2, 0, Math.PI * 2);
    c.fill();
  }
  // 拖拽痕
  c.strokeStyle = `rgba(${38 + rand() * 14},${10 + rand() * 6},${9 + rand() * 4},${0.3 * strength})`;
  c.lineWidth = rx * 0.22;
  c.beginPath();
  c.moveTo(cx, cy);
  c.quadraticCurveTo(cx + rx * 1.4, cy + rx * 0.6, cx + rx * 2.6, cy + rx * 0.2);
  c.stroke();
  c.restore();
}
