/**
 * 赤道式日晷盘面渲染
 *
 * 盘面坐标系：SVG viewBox 360×360，中心 (180,180)。
 * 盘面半径 132，晷针在盘面法线方向高度 H = 52（盘面单位）。
 *
 * 刻度系统：
 *   - 12 地支（子丑寅卯辰巳午未申酉戌亥）对应 12 时辰
 *   - 午时 = 真太阳时 11:00–13:00，中点 12:00 对应时角 0°
 *   - 每个时辰分"初"（前半）和"正"（后半），共 24 个小刻度
 *   - 地支顺时针排：午(12点) → 未 → 申 → 酉 → 戌 → 亥 → 子(6点) → 丑 → 寅 → 卯 → 辰 → 巳
 */

import {
  computeDialAngle,
  computeHourAngle,
  computeShadowLength,
  computeSolarPosition,
  computeTrueSolarTime,
} from "../astronomy/solar";
import { jdFromDate } from "../astronomy/jd";

const SVG_NS = "http://www.w3.org/2000/svg";

// 12 地支，从 12 点方向（时角 0°）开始顺时针排列
// 子时中点 = 00:00 = 时角 -180°（盘面 6 点方向）
// 午时中点 = 12:00 = 时角 0°（盘面 12 点方向）
const BRANCHES = ["午", "未", "申", "酉", "戌", "亥", "子", "丑", "寅", "卯", "辰", "巳"];

// 每个时辰的"初"和"正"标记
const HALF = ["初", "正"];

// 盘面几何参数（与 index.html 保持一致）
export const GEO = {
  CENTER: 180,
  R_FACE: 132,
  R_BRANCH: 96,       // 地支文字的外圈半径
  R_HALF: 110,        // 初/正文字的外圈半径
  R_MINOR_INNER: 116, // 小刻度内端点
  R_MINOR_OUTER: 124, // 小刻度外端点
  GNOMON_H: 52,
};

/** 观测地默认值：深圳 */
export const DEFAULT_LOCATION = {
  name: "深圳",
  longitude: 114.06, // 度
  latitude: 22.55,
  tzOffset: 8,
};

/** 全部计算结果，用于渲染和调试 */
export interface DialState {
  /** 真太阳时（小时） */
  trueSolarHour: number;
  /** 时角（度） */
  hourAngle: number;
  /** 太阳赤纬（度） */
  declination: number;
  /** 均时差（分钟） */
  eqOfTime: number;
  /** 盘面上影子的角度（度） */
  dialAngle: number;
  /** 盘面上影子的长度（盘面单位） */
  shadowLength: number;
  /** 是否上盘（δ ≥ 0） */
  upperDisk: boolean;
  /** 当前地支 */
  currentBranch: string;
  /** 初 / 正 */
  currentHalf: string;
}

/**
 * 真太阳时 → 地支 + 初/正
 * 子时 23:00–01:00, 丑时 01:00–03:00, …… 午时 11:00–13:00
 * 每时辰前半为"初"，后半为"正"
 */
function hourToBranch(hour: number): { branch: string; half: string } {
  // 把小时归一到 [0, 24)
  const h = ((hour % 24) + 24) % 24;
  // 子时特殊：23:00–24:00 和 0:00–1:00 都属子时
  let branchIdx: number;
  if (h >= 23 || h < 1) {
    branchIdx = 6; // BRANCHES[6] = "子"
  } else {
    // 丑=1-3, 寅=3-5, ..., 午=11-13, ...
    // 映射：hour 1-3 → idx 7(丑), 3-5 → 8(寅), ..., 11-13 → 0(午)
    branchIdx = Math.floor((h + 1) / 2) % 12;
  }
  // 初 / 正：时辰前半 → 初，后半 → 正
  // 子时是 2 小时，其中 h∈[23,24) 或 h∈[0,1)
  let localInShichen: number; // 当前时辰内的位置 0-2
  if (h >= 23) {
    localInShichen = h - 22; // 23→1, 24→2
  } else if (h < 1) {
    localInShichen = h + 1; // 0→1, 0.5→1.5
  } else {
    // 丑时起：(h-1)/2 在 [0,2)
    localInShichen = (h - 1) % 2 + 1;
  }
  const halfIdx = localInShichen < 1 ? 0 : 1;

  return { branch: BRANCHES[branchIdx], half: HALF[halfIdx] };
}

/** 一次性初始化：画 24 道小刻度 + 12 地支文字 + 24 初/正文字 */
export function buildDialStatic(layer: SVGGElement): void {
  const { CENTER, R_MINOR_INNER, R_MINOR_OUTER, R_BRANCH, R_HALF } = GEO;

  // 清空
  while (layer.firstChild) layer.removeChild(layer.firstChild);

  // 24 道小刻度，每 15° 一道
  // i=0 → 时角 -180° 方向（6 点，子时中点 00:00）—— 不，让我重新算
  // 盘面 12 点方向 → 时角 0° → 午时中点 12:00
  // 盘面 6 点方向 → 时角 180°/-180° → 子时中点 00:00
  // 所以盘面位置对应的时角 = (盘面角度, 12点=0°顺时针正)
  for (let i = 0; i < 24; i += 1) {
    // 盘面位置角度：12 点 = 0°，顺时针增加，24 道每 15°
    const dialPosDeg = i * 15;
    const rad = ((dialPosDeg - 90) * Math.PI) / 180; // 转成 SVG 坐标（0° 向右）

    // 地支刻度（每 2 小时 = 每 30° = 每 2 个 i）
    const isBranch = i % 2 === 0;
    const rIn = isBranch ? R_MINOR_INNER - 8 : R_MINOR_INNER;
    const rOut = R_MINOR_OUTER;

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(CENTER + rIn * Math.cos(rad)));
    line.setAttribute("y1", String(CENTER + rIn * Math.sin(rad)));
    line.setAttribute("x2", String(CENTER + rOut * Math.cos(rad)));
    line.setAttribute("y2", String(CENTER + rOut * Math.sin(rad)));
    line.setAttribute("class", isBranch ? "tick tick-branch" : "tick tick-half");
    layer.appendChild(line);
  }

  // 12 地支文字：每 30° 一个，位置是"正"刻度（i 偶数）
  for (let j = 0; j < 12; j += 1) {
    const dialPosDeg = j * 30; // 0°(午), 30°(未), 60°(申)...
    const rad = ((dialPosDeg - 90) * Math.PI) / 180;

    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", String(CENTER + R_BRANCH * Math.cos(rad)));
    text.setAttribute("y", String(CENTER + R_BRANCH * Math.sin(rad)));
    text.setAttribute("class", "text-branch");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.textContent = BRANCHES[j];
    layer.appendChild(text);
  }

  // 24 个"初"/"正"小字：每 15° 一个
  for (let i = 0; i < 24; i += 1) {
    const dialPosDeg = i * 15;
    const rad = ((dialPosDeg - 90) * Math.PI) / 180;
    const isZheng = i % 2 === 0; // 偶数位置 = "正"（与地支同位置），奇数 = "初"
    const label = isZheng ? "正" : "初";

    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", String(CENTER + R_HALF * Math.cos(rad)));
    text.setAttribute("y", String(CENTER + R_HALF * Math.sin(rad)));
    text.setAttribute("class", "text-half");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.textContent = label;
    layer.appendChild(text);
  }
}

/** 每帧更新：计算影子角度和长度，更新 <line class="shadow"> */
export function updateShadow(
  shadowLine: SVGLineElement,
  date: Date,
  location = DEFAULT_LOCATION,
): DialState {
  const jd = jdFromDate(date);
  const pos = computeSolarPosition(jd);
  const trueSolarHour = computeTrueSolarTime(jd, location.longitude, location.tzOffset);
  const hourAngle = computeHourAngle(trueSolarHour);
  const dialAngle = computeDialAngle(hourAngle, pos.declination);
  const shadowLength = computeShadowLength(GEO.GNOMON_H, pos.declination);
  const upperDisk = pos.declination >= 0;
  const { branch, half } = hourToBranch(trueSolarHour);

  // 盘面上影子从中心向外延伸
  // dialAngle = 0° 时指向上方（与 12 时刻度对齐），所以 -90° 修正
  const rad = ((dialAngle - 90) * Math.PI) / 180;
  const x2 = GEO.CENTER + shadowLength * Math.cos(rad);
  const y2 = GEO.CENTER + shadowLength * Math.sin(rad);

  shadowLine.setAttribute("x2", String(x2));
  shadowLine.setAttribute("y2", String(y2));

  return {
    trueSolarHour,
    hourAngle,
    declination: pos.declination,
    eqOfTime: pos.eqOfTime,
    dialAngle,
    shadowLength,
    upperDisk,
    currentBranch: branch,
    currentHalf: half,
  };
}

/** 把真太阳时转成可读字符串：时辰 + 真太阳时分秒 */
export function formatShichen(hour: number): string {
  const { branch, half } = hourToBranch(hour);
  const h = Math.floor(hour);
  const mFloat = (hour - h) * 60;
  const m = Math.floor(mFloat);
  return `${branch}${half} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
