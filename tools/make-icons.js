/* ===========================================================
   tools/make-icons.js —— 纯 Node zlib 手写 PNG 图标生成器
   -----------------------------------------------------------
   零依赖（不使用 sharp / canvas / PIL），仅用 Node 内置 zlib。
   产物（81×81 PNG，RGBA，透明背景）：
     miniprogram/assets/tabbar/{home,chip,book,compass,more}.png      常态 #86868b
     miniprogram/assets/tabbar/{home,chip,book,compass,more}-on.png   选中 #0071e3
     miniprogram/assets/og-default.png                                分享图 500×400
   绘制方式：几何基元光栅化（圆 / 环 / 折线 / 多边形 / 矩形）
             + 3×3 超采样抗锯齿，线条描边风格 stroke≈1.7（24 单位坐标系）。
   独立运行：node tools/make-icons.js
   =========================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* ---------------- PNG 编码（纯 Node） ---------------- */

/** CRC32 表（延迟构建） */
let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c;
  }
  return CRC_TABLE;
}

/** 计算 CRC32 */
function crc32(buf) {
  const t = crcTable();
  let crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n++) {
    crc = t[(crc ^ buf[n]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** 组装一个 PNG chunk */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/**
 * 将 RGBA 像素缓冲编码为 PNG（8bit RGBA，filter 0）。
 * @param {number} w 宽
 * @param {number} h 高
 * @param {Buffer} rgba 长度 w*h*4
 * @returns {Buffer} PNG 二进制
 */
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter type 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ---------------- 光栅化画布 ---------------- */

/** 简单 RGBA 画布 */
function Canvas(w, h) {
  this.w = w;
  this.h = h;
  this.px = Buffer.alloc(w * h * 4);
}

/** 在 (x,y) 以 source-over 方式混合颜色（0..255 alpha） */
Canvas.prototype.blend = function (x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
  if (a <= 0) return;
  const i = (y * this.w + x) * 4;
  const dstA = this.px[i + 3] / 255;
  const srcA = a / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  const px = this.px;
  px[i] = Math.round((r * srcA + px[i] * dstA * (1 - srcA)) / outA);
  px[i + 1] = Math.round((g * srcA + px[i + 1] * dstA * (1 - srcA)) / outA);
  px[i + 2] = Math.round((b * srcA + px[i + 2] * dstA * (1 - srcA)) / outA);
  px[i + 3] = Math.round(outA * 255);
};

/* ---------------- 几何基元（含 3×3 超采样抗锯齿） ---------------- */

/**
 * 以「形状函数」覆盖绘制：对每个像素做 3×3 子采样，覆盖率作为 alpha。
 * @param {Canvas} cv 画布
 * @param {object} color {r,g,b}
 * @param {(x:number,y:number)=>boolean} inside 形状判定（返回是否在形状内）
 * @param {object} box 包围盒 {x0,y0,x1,y1}（像素坐标）
 * @param {number} [opacity] 不透明度 0..1
 */
function paint(cv, color, inside, box, opacity) {
  const op = opacity == null ? 1 : opacity;
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(cv.w - 1, Math.ceil(box.x1));
  const y1 = Math.min(cv.h - 1, Math.ceil(box.y1));
  const S = 3;
  const step = 1 / S;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let hit = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          if (inside(x + (sx + 0.5) * step, y + (sy + 0.5) * step)) hit++;
        }
      }
      if (hit > 0) {
        cv.blend(x, y, color.r, color.g, color.b, Math.round((hit / (S * S)) * 255 * op));
      }
    }
  }
}

/** 距离点 (px,py) 到线段 (ax,ay)-(bx,by) */
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * 绘制粗线段（圆头，用于描边风格）。
 * @param {Canvas} cv 画布
 * @param {object} color 颜色
 * @param {number} ax,ay,bx,by 端点（像素）
 * @param {number} width 线宽（像素）
 */
function strokeLine(cv, color, ax, ay, bx, by, width) {
  const r = width / 2;
  const box = { x0: Math.min(ax, bx) - r - 1, y0: Math.min(ay, by) - r - 1, x1: Math.max(ax, bx) + r + 1, y1: Math.max(ay, by) + r + 1 };
  paint(cv, color, function (x, y) { return distSeg(x, y, ax, ay, bx, by) <= r; }, box);
}

/**
 * 绘制折线（多段）。
 * @param {Canvas} cv 画布
 * @param {object} color 颜色
 * @param {Array<{x:number,y:number}>} pts 顶点
 * @param {number} width 线宽
 * @param {boolean} [close] 是否闭合
 */
function strokePolyline(cv, color, pts, width, close) {
  if (pts.length < 2) return;
  for (let i = 0; i < pts.length - 1; i++) {
    strokeLine(cv, color, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, width);
  }
  if (close) strokeLine(cv, color, pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y, width);
}

/**
 * 绘制圆环（描边圆）。
 * @param {Canvas} cv 画布
 * @param {object} color 颜色
 * @param {number} cx,cy 圆心
 * @param {number} R 半径
 * @param {number} width 线宽
 */
function strokeCircle(cv, color, cx, cy, R, width) {
  const r = width / 2;
  const ro = R + r, ri = Math.max(0, R - r);
  const box = { x0: cx - ro - 1, y0: cy - ro - 1, x1: cx + ro + 1, y1: cy + ro + 1 };
  paint(cv, color, function (x, y) {
    const d = Math.hypot(x - cx, y - cy);
    return d <= ro && d >= ri;
  }, box);
}

/**
 * 填充圆。
 * @param {Canvas} cv 画布
 * @param {object} color 颜色
 * @param {number} cx,cy 圆心
 * @param {number} R 半径
 */
function fillCircle(cv, color, cx, cy, R) {
  const box = { x0: cx - R - 1, y0: cy - R - 1, x1: cx + R + 1, y1: cy + R + 1 };
  paint(cv, color, function (x, y) { return Math.hypot(x - cx, y - cy) <= R; }, box);
}

/**
 * 绘制圆角矩形描边。
 * @param {Canvas} cv 画布
 * @param {object} color 颜色
 * @param {number} x0,y0,x1,y1 矩形
 * @param {number} rad 圆角半径
 * @param {number} width 线宽
 */
function strokeRoundRect(cv, color, x0, y0, x1, y1, rad, width) {
  const r = Math.min(rad, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2);
  const pts = [
    { x: x0 + r, y: y0 }, { x: x1 - r, y: y0 },
    { x: x1, y: y1 - r }, { x: x1, y: y0 + r } // placeholder, replaced below
  ];
  // 四段角弧用折线近似（8 段/角）
  const SEG = 6;
  const seq = [];
  // top edge
  seq.push({ x: x0 + r, y: y0 });
  seq.push({ x: x1 - r, y: y0 });
  // top-right arc
  for (let i = 1; i <= SEG; i++) {
    const a = -Math.PI / 2 + (i / SEG) * (Math.PI / 2);
    seq.push({ x: x1 - r + Math.cos(a) * r, y: y0 + r + Math.sin(a) * r });
  }
  // right edge
  seq.push({ x: x1, y: y1 - r });
  // bottom-right arc
  for (let i = 1; i <= SEG; i++) {
    const a = (i / SEG) * (Math.PI / 2);
    seq.push({ x: x1 - r + Math.cos(a) * r, y: y1 - r + Math.sin(a) * r });
  }
  // bottom edge
  seq.push({ x: x0 + r, y: y1 });
  // bottom-left arc
  for (let i = 1; i <= SEG; i++) {
    const a = Math.PI / 2 + (i / SEG) * (Math.PI / 2);
    seq.push({ x: x0 + r + Math.cos(a) * r, y: y1 - r + Math.sin(a) * r });
  }
  // left edge
  seq.push({ x: x0, y: y0 + r });
  // top-left arc
  for (let i = 1; i <= SEG; i++) {
    const a = Math.PI + (i / SEG) * (Math.PI / 2);
    seq.push({ x: x0 + r + Math.cos(a) * r, y: y0 + r + Math.sin(a) * r });
  }
  strokePolyline(cv, color, seq, width, true);
}

/* ---------------- 图标定义（24×24 单位坐标系） ---------------- */

/** 颜色解析 #rrggbb → {r,g,b} */
function hex(c) {
  const s = c.replace("#", "");
  return {
    r: parseInt(s.substr(0, 2), 16),
    g: parseInt(s.substr(2, 2), 16),
    b: parseInt(s.substr(4, 2), 16)
  };
}

/**
 * 把 #rrggbb 按百分比提亮/压暗（pct<0 压暗，>0 提亮）。
 * 用于生成同色系的渐变终点色，保证模块分享图彼此可区分。
 * @param {string} c #rrggbb
 * @param {number} pct -100..100
 * @returns {string} #rrggbb
 */
function shadeHex(c, pct) {
  const { r, g, b } = hex(c);
  const f = function (v) {
    return Math.max(0, Math.min(255, Math.round(v + 255 * pct / 100)));
  };
  const to2 = function (v) { return ("0" + v.toString(16)).slice(-2); };
  return "#" + to2(f(r)) + to2(f(g)) + to2(f(b));
}

/** 各模块品牌主色（与 data.js / modules[].color 一致），用于模块分享图 */
const MODULE_COLOR = {
  ai: "#0071e3",
  library: "#bf4800",
  method: "#6e56cf",
  travel: "#0f8a6a",
  words: "#c2405f"
};

/**
 * 每个图标 = 一个绘制函数：接受 (cv, color, scale, off)，在画布上绘制。
 * scale = 画布尺寸 / 24；off 为居中偏移（像素）。
 */
const ICON_PAINTERS = {
  // 首页：房子 —— 屋顶三角 + 墙体矩形
  home: function (cv, color, s, off) {
    const w = 1.7 * s;
    // 屋顶
    strokePolyline(cv, color, [
      { x: off + 3 * s, y: off + 11 * s },
      { x: off + 12 * s, y: off + 3.5 * s },
      { x: off + 21 * s, y: off + 11 * s }
    ], w);
    // 墙体 + 门
    strokePolyline(cv, color, [
      { x: off + 5.5 * s, y: off + 10 * s },
      { x: off + 5.5 * s, y: off + 20 * s },
      { x: off + 18.5 * s, y: off + 20 * s },
      { x: off + 18.5 * s, y: off + 10 * s }
    ], w);
    // 门
    strokePolyline(cv, color, [
      { x: off + 10 * s, y: off + 20 * s },
      { x: off + 10 * s, y: off + 15 * s },
      { x: off + 14 * s, y: off + 15 * s },
      { x: off + 14 * s, y: off + 20 * s }
    ], w);
  },
  // AI 学习：芯片 —— 圆角方 + 引脚
  chip: function (cv, color, s, off) {
    const w = 1.7 * s;
    strokeRoundRect(cv, color, off + 6 * s, off + 6 * s, off + 18 * s, off + 18 * s, 2.5 * s, w);
    // 引脚（8 条短线）
    const pins = [
      [9, 1.5, 9, 5.2], [15, 1.5, 15, 5.2],
      [9, 18.8, 9, 22.5], [15, 18.8, 15, 22.5],
      [1.5, 9, 5.2, 9], [1.5, 15, 5.2, 15],
      [18.8, 9, 22.5, 9], [18.8, 15, 22.5, 15]
    ];
    pins.forEach(function (p) {
      strokeLine(cv, color, off + p[0] * s, off + p[1] * s, off + p[2] * s, off + p[3] * s, w);
    });
  },
  // 图书馆：书 —— 书脊 + 书页
  book: function (cv, color, s, off) {
    const w = 1.7 * s;
    // 外框与书脊
    strokePolyline(cv, color, [
      { x: off + 20 * s, y: off + 3 * s },
      { x: off + 5.5 * s, y: off + 3 * s },
      { x: off + 3.5 * s, y: off + 5 * s },
      { x: off + 3.5 * s, y: off + 21 * s },
      { x: off + 7 * s, y: off + 19 * s },
      { x: off + 20 * s, y: off + 19 * s },
      { x: off + 20 * s, y: off + 3 * s }
    ], w);
    // 书脊竖线
    strokeLine(cv, color, off + 6.5 * s, off + 3.5 * s, off + 6.5 * s, off + 20 * s, w);
    // 两条书页线
    strokeLine(cv, color, off + 10 * s, off + 8 * s, off + 17 * s, off + 8 * s, w);
    strokeLine(cv, color, off + 10 * s, off + 12 * s, off + 15 * s, off + 12 * s, w);
  },
  // 方法论：指南针 —— 圆环 + 菱形指针
  compass: function (cv, color, s, off) {
    const w = 1.7 * s;
    strokeCircle(cv, color, off + 12 * s, off + 12 * s, 10 * s, w);
    strokePolyline(cv, color, [
      { x: off + 16.2 * s, y: off + 7.8 * s },
      { x: off + 13.9 * s, y: off + 13.9 * s },
      { x: off + 7.8 * s, y: off + 16.2 * s },
      { x: off + 10.1 * s, y: off + 10.1 * s }
    ], w, true);
  },
  // 更多：三点
  more: function (cv, color, s, off) {
    fillCircle(cv, color, off + 12 * s, off + 6 * s, 1.7 * s);
    fillCircle(cv, color, off + 12 * s, off + 12 * s, 1.7 * s);
    fillCircle(cv, color, off + 12 * s, off + 18 * s, 1.7 * s);
  }
};

/**
 * 渲染一个图标为 PNG。
 * @param {string} name 图标名
 * @param {number} size 输出尺寸（正方形）
 * @param {string} colorHex 颜色
 * @returns {Buffer} PNG
 */
function renderIcon(name, size, colorHex) {
  const cv = new Canvas(size, size);
  const color = hex(colorHex);
  const s = size / 24;
  ICON_PAINTERS[name](cv, color, s, 0);
  return encodePNG(size, size, cv.px);
}

/* ---------------- 分享图（渐变 + 圆点） ---------------- */

/**
 * 渲染分享图（OG image）：浅灰底 + 品牌渐变圆角矩形 + 白色圆点。
 * @param {number} w 宽
 * @param {number} h 高
 * @param {{c1?:string, c2?:string}} [palette] 渐变起止色（缺省用站点蓝→紫）
 * @returns {Buffer} PNG
 */
function renderOgDefault(w, h, palette) {
  const cv = new Canvas(w, h);
  const bg = hex("#f5f5f7");
  paint(cv, bg, function () { return true; }, { x0: 0, y0: 0, x1: w - 1, y1: h - 1 });

  // 渐变圆角矩形（近似：逐像素按 x 做插值）
  const bx0 = w * 0.28, by0 = h * 0.34, bx1 = w * 0.72, by1 = h * 0.66;
  const rad = Math.min(bx1 - bx0, by1 - by0) * 0.28;
  const pal = palette || {};
  const c1 = hex(pal.c1 || "#0071e3"), c2 = hex(pal.c2 || "#6e56cf");
  const insetX = w * 0.24, insetY = h * 0.30;
  paint(cv, { r: 0, g: 0, b: 0 }, function (x, y) {
    if (x < bx0 || x > bx1 || y < by0 || y > by1) return false;
    // 圆角裁剪
    const rx = Math.min(x - bx0, bx1 - x), ry = Math.min(y - by0, by1 - y);
    if (rx < rad && ry < rad) {
      if (Math.hypot(rad - rx, rad - ry) > rad) return false;
    }
    return true;
  }, { x0: bx0 - 1, y0: by0 - 1, x1: bx1 + 1, y1: by1 + 1 });
  // 上色覆盖（单独一趟以做渐变）
  for (let y = Math.floor(by0); y <= Math.ceil(by1); y++) {
    for (let x = Math.floor(bx0); x <= Math.ceil(bx1); x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const rx = Math.min(x - bx0, bx1 - x), ry = Math.min(y - by0, by1 - y);
      let inside = true;
      if (rx < rad && ry < rad && Math.hypot(rad - rx, rad - ry) > rad) inside = false;
      if (!inside) continue;
      const t = (x - bx0) / (bx1 - bx0);
      const r = Math.round(c1.r + (c2.r - c1.r) * t);
      const g = Math.round(c1.g + (c2.g - c1.g) * t);
      const b = Math.round(c1.b + (c2.b - c1.b) * t);
      const i = (y * w + x) * 4;
      cv.px[i] = r; cv.px[i + 1] = g; cv.px[i + 2] = b; cv.px[i + 3] = 255;
    }
  }
  // 中心白色圆点
  fillCircle(cv, { r: 255, g: 255, b: 255 }, w / 2, h / 2, Math.min(w, h) * 0.08);
  void insetX; void insetY;
  return encodePNG(w, h, cv.px);
}

/* ---------------- 站点资产（favicon / apple-touch / og） ---------------- */

/**
 * 渲染 favicon / apple-touch-icon：蓝紫渐变圆点。
 * @param {number} size 输出尺寸
 * @returns {Buffer} PNG
 */
function renderDot(size) {
  const cv = new Canvas(size, size);
  const c1 = hex("#0071e3"), c2 = hex("#6e56cf");
  const R = size * 0.44;
  const cx = size / 2, cy = size / 2;
  const box = { x0: 0, y0: 0, x1: size - 1, y1: size - 1 };
  // 用覆盖率绘制，再按 y 做渐变
  const S = 3, step = 1 / S;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          if (Math.hypot(x + (sx + 0.5) * step - cx, y + (sy + 0.5) * step - cy) <= R) hit++;
        }
      }
      if (!hit) continue;
      const a = Math.round((hit / (S * S)) * 255);
      const t = y / size;
      const r = Math.round(c1.r + (c2.r - c1.r) * t);
      const g = Math.round(c1.g + (c2.g - c1.g) * t);
      const b = Math.round(c1.b + (c2.b - c1.b) * t);
      cv.blend(x, y, r, g, b, a);
    }
  }
  void box;
  return encodePNG(size, size, cv.px);
}

/* ---------------- 主流程 ---------------- */

/** 确保目录存在 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * 生成全部图标与站点资产。
 * @param {object} [opts] { root }
 * @returns {object} 生成结果 { files: string[] }
 */
function makeAll(opts) {
  const root = (opts && opts.root) || path.join(__dirname, "..");
  const tabDir = path.join(root, "miniprogram", "assets", "tabbar");
  const assetsDir = path.join(root, "site", "assets");
  const miniAssetsDir = path.join(root, "miniprogram", "assets");
  ensureDir(tabDir);
  ensureDir(assetsDir);
  ensureDir(miniAssetsDir);

  const files = [];
  const NORMAL = "#86868b";
  const ACTIVE = "#0071e3";
  const ICONS = ["home", "chip", "book", "compass", "more"];
  const SIZE = 81;

  ICONS.forEach(function (name) {
    const normal = renderIcon(name, SIZE, NORMAL);
    const active = renderIcon(name, SIZE, ACTIVE);
    const fp = path.join(tabDir, name + ".png");
    const fpa = path.join(tabDir, name + "-on.png");
    fs.writeFileSync(fp, normal);
    fs.writeFileSync(fpa, active);
    files.push(fp, fpa);
  });

  // 站点 favicon / apple-touch-icon
  const fav = renderDot(32);
  const apple = renderDot(180);
  fs.writeFileSync(path.join(assetsDir, "favicon-32.png"), fav);
  fs.writeFileSync(path.join(assetsDir, "apple-touch-icon.png"), apple);
  files.push(path.join(assetsDir, "favicon-32.png"), path.join(assetsDir, "apple-touch-icon.png"));

  // 默认分享图（1200×630）+ 5 张模块图（各自品牌色）+ 小程序 500×400
  const og = renderOgDefault(1200, 630);
  fs.writeFileSync(path.join(assetsDir, "og-image.png"), og);
  files.push(path.join(assetsDir, "og-image.png"));
  // 各模块分享图用该模块的主色 + 深一档同色系，保证 6 张图内容不同
  Object.keys(require("./seo").MODULE_SEO).forEach(function (m) {
    const color = MODULE_COLOR[m];
    const ogMod = color
      ? renderOgDefault(1200, 630, { c1: color, c2: shadeHex(color, -28) })
      : og;
    fs.writeFileSync(path.join(assetsDir, "og-" + m + ".png"), ogMod);
    files.push(path.join(assetsDir, "og-" + m + ".png"));
  });
  const ogMini = renderOgDefault(500, 400);
  fs.writeFileSync(path.join(miniAssetsDir, "og-default.png"), ogMini);
  files.push(path.join(miniAssetsDir, "og-default.png"));

  return { files: files };
}

/* ---------------- CLI ---------------- */

if (require.main === module) {
  try {
    const res = makeAll();
    console.log("[icons] 已生成 " + res.files.length + " 个资源：");
    res.files.forEach(function (f) { console.log("        - " + path.relative(path.join(__dirname, ".."), f)); });
    process.exit(0);
  } catch (e) {
    console.error("[icons] 生成失败：" + e.message);
    process.exit(1);
  }
}

module.exports = {
  encodePNG: encodePNG,
  crc32: crc32,
  renderIcon: renderIcon,
  renderOgDefault: renderOgDefault,
  renderDot: renderDot,
  makeAll: makeAll,
  ICON_PAINTERS: ICON_PAINTERS
};
