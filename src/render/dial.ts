/**
 * 赤道式日晷盘面渲染
 *
 * 盘面坐标系：SVG viewBox 360×360，中心 (180,180)。
 * 盘面半径 132，晷针在盘面法线方向高度 H = 50（盘面单位）。
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

// 盘面几何参数（与 index.html 保持一致）
export const GEO = {
  CENTER: 180,
  R_FACE: 132,
  R_EDGE: 124,
  R_MAJOR: 108,
  R_MINOR: 116,
  // 晷针在盘面法线方向的有效高度
  // 盘面半径 132，取 H ≈ 40% × R 让影子长度在夏至约 100，冬至约 300+
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
}

/** 一次性初始化：在 SVG 里画好刻度和晷针，后续只更新影子 */
export function buildDialStatic(layer: SVGGElement): void {
  const { CENTER, R_EDGE, R_MAJOR, R_MINOR } = GEO;

  // 清空旧刻度
  while (layer.firstChild) layer.removeChild(layer.firstChild);

  for (let i = 0; i < 24; i += 1) {
    // 初始角度：0 时（0° 时角）指向上方（SVG y 轴向下），所以 -90°
    const baseDeg = i * 15 - 90;
    const rad = (baseDeg * Math.PI) / 180;
    const major = i % 2 === 0;
    const inner = major ? R_MAJOR : R_MINOR;

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(CENTER + inner * Math.cos(rad)));
    line.setAttribute("y1", String(CENTER + inner * Math.sin(rad)));
    line.setAttribute("x2", String(CENTER + R_EDGE * Math.cos(rad)));
    line.setAttribute("y2", String(CENTER + R_EDGE * Math.sin(rad)));
    line.setAttribute("class", major ? "tick tick-major" : "tick tick-minor");
    line.setAttribute("data-hour", String(i === 0 ? 24 : i));
    layer.appendChild(line);
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
  };
}

/** 把真太阳时转成可读字符串（HH:MM:SS） */
export function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const mFloat = (hour - h) * 60;
  const m = Math.floor(mFloat);
  const s = Math.floor((mFloat - m) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
