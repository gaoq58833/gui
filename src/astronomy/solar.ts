/**
 * 太阳位置与真太阳时计算
 *
 * 算法基于 Jean Meeus "Astronomical Algorithms" 第 22/24 章，简化公式。
 * 对赤道式日晷来说，精度到 0.1° 就够了，下面这套精度远高于此。
 */

// 常量
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const J2000 = 2451545.0; // 2000-01-01 12:00 UTC 的儒略日
const EARTH_OBLIQUITY_DEG = 23.4397; // 2000.0 年黄赤交角

/** 太阳位置计算结果 */
export interface SolarPosition {
  /** 太阳赤纬（度），北正南负 */
  declination: number;
  /** 均时差（分钟），正 = 真太阳快于平太阳 */
  eqOfTime: number;
  /** 太阳视黄经（度，0–360） */
  lambda: number;
}

/**
 * 从儒略日计算太阳的赤纬、均时差和视黄经。
 */
export function computeSolarPosition(jd: number): SolarPosition {
  // 1. J2000 起的儒略世纪数
  const T = (jd - J2000) / 36525;

  // 2. 太阳平黄经 L（度），归算到 [0, 360)
  let L = (280.46646 + 36000.76983 * T) % 360;
  if (L < 0) L += 360;

  // 3. 太阳平近点角 M（度）
  let M = (357.52911 + 35999.05029 * T) % 360;
  if (M < 0) M += 360;

  // 4. 中心差 C（度）
  const C =
    (1.914602 - 0.004817 * T) * Math.sin(M * DEG) +
    0.019993 * Math.sin(2 * M * DEG) +
    0.000289 * Math.sin(3 * M * DEG);

  // 5. 真黄经 = 平黄经 + 中心差
  let lambda = (L + C) % 360;
  if (lambda < 0) lambda += 360;

  // 6. 黄赤交角 ε（度），线性近似足够
  const epsilon = EARTH_OBLIQUITY_DEG - 0.0130042 * T;

  // 7. 赤纬 δ = asin(sin ε · sin λ)
  const sinDecl = Math.sin(epsilon * DEG) * Math.sin(lambda * DEG);
  const declination = Math.asin(clamp(sinDecl, -1, 1)) * RAD;

  // 8. 均时差 EoT（分钟）
  //    公式：EoT = 4 × (L - 0.0057183 - λ)
  //    这里用弧度算，最后转分钟
  const L_rad = L * DEG;
  const lambda_rad = lambda * DEG;
  let eqOfTimeRad = L_rad - 0.0057183 - lambda_rad;
  // 归一到 [-π, π]
  while (eqOfTimeRad > Math.PI) eqOfTimeRad -= 2 * Math.PI;
  while (eqOfTimeRad < -Math.PI) eqOfTimeRad += 2 * Math.PI;
  const eqOfTime = eqOfTimeRad * 4 * RAD; // 弧度 → 分钟（4min/度）

  return { declination, eqOfTime, lambda };
}

/**
 * 计算真太阳时（小时，本地时间）。
 *
 * 真太阳时 = 地方标准时 + 经度修正 + 均时差
 *
 * @param jd          儒略日（对应要计算的那个时间点）
 * @param longitude   观测地经度（度，东正西负）
 * @param tzOffset    时区相对于 UTC 的偏移（小时，中国是 +8）
 */
export function computeTrueSolarTime(
  jd: number,
  longitude: number,
  tzOffset = 8,
): number {
  const { eqOfTime } = computeSolarPosition(jd);

  // JD 已经包含日期和小数天；提取小数天部分得到 UTC 小时
  const fracDay = (jd - Math.floor(jd - 0.5) + 0.5) % 1;
  const stdHourUTC = fracDay * 24;
  const stdHourLocal = (stdHourUTC + tzOffset + 24) % 24;

  // 经度修正：1° ≈ 4 min，东加西减
  const meridianCorrection = (longitude - tzOffset * 15) * 4 / 60; // 小时

  // 均时差转小时
  const eotHours = eqOfTime / 60;

  let trueSolarHour = stdHourLocal + meridianCorrection + eotHours;
  // 归一到 [0, 24)
  trueSolarHour = ((trueSolarHour % 24) + 24) % 24;

  return trueSolarHour;
}

/**
 * 时角（度）：太阳在当地子午圈以东/以西的角度。
 * 正午 12 时角 = 0°，上午为负，下午为正。
 */
export function computeHourAngle(trueSolarHour: number): number {
  return 15 * (trueSolarHour - 12);
}

/**
 * 赤道式日晷盘面上的影子角度（度）。
 *
 * 因为盘面平行于赤道，晷针平行于地轴，
 * 太阳的时角 H 直接就是盘面投影上的角度。
 *
 * @param hourAngle 时角（度），来自 computeHourAngle()
 * @param declination 太阳赤纬（度），负表示太阳在南半球（下盘）
 */
export function computeDialAngle(
  hourAngle: number,
  declination: number,
): number {
  const upperDisk = declination >= 0;
  // 上盘：影子在盘面"下午"方向（时角正 = 影子顺时针转）
  // 下盘：刻度镜像，时角方向也镜像
  return upperDisk ? hourAngle : -hourAngle;
}

/**
 * 计算影子在盘面上的长度（盘面坐标单位）。
 *
 * 赤道式日晷：盘面上影长 = 晷针有效高度 × cot(|δ|)
 * 其中 δ 是太阳赤纬。
 *
 * @param gnomonHeight 晷针在盘面法线方向的高度（盘面单位）
 * @param declination  太阳赤纬（度）
 * @returns 影子长度（盘面单位，可能超过盘面半径——意味着影子跑出边缘）
 */
export function computeShadowLength(
  gnomonHeight: number,
  declination: number,
): number {
  const d = Math.abs(declination) * DEG;
  if (d < 0.001) {
    // 春秋分附近，cot 极大 → 影长超过盘面
    return gnomonHeight / Math.tan(0.001 * DEG);
  }
  return gnomonHeight / Math.tan(d);
}

/**
 * 工具函数：数值夹紧。
 */
function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
