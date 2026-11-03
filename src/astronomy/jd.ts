/**
 * 儒略日计算
 *
 * 儒略日（Julian Day）是天文学上用来表示日期的单一数字系统。
 * 这里实现从 JavaScript Date 对象到儒略日的转换。
 *
 * 算法来源：Jean Meeus, Astronomical Algorithms, Chapter 7
 */

/**
 * 把一个 Date 对象转换成儒略日（JD）。
 * 精度：UTC 时间（不是本地时间）。
 *
 * @param date 任意 Date（UTC 或本地都可以，内部按 UTC 处理）
 * @returns 儒略日，例如 2451545.0 表示 2000-01-01 12:00 UTC
 */
export function jdFromDate(date: Date): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1; // 0→12, 1→1, ..., 11→12
  const d = date.getUTCDate();
  const h = date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3_600_000;

  // 1. 把 1 月、2 月当作上一年的 13 月、14 月
  const year = m <= 2 ? y - 1 : y;
  const month = m <= 2 ? m + 12 : m;

  // 2. 公历（Gregorian）修正项
  const a = Math.floor(year / 100);
  const b = 2 - a + Math.floor(a / 4);

  // 3. Meeus 公式
  const jd = Math.floor(365.25 * (year + 4716)) +
    Math.floor(30.6001 * (month + 1)) +
    d + b - 1524.5 + h / 24;

  return jd;
}

/**
 * 把儒略日转回 Date（UTC）。主要用于调试/验证。
 */
export function dateFromJd(jd: number): Date {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;

  let A = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    A = z + 1 + alpha - Math.floor(alpha / 4);
  }

  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);

  const day = B - D - Math.floor(30.6001 * E) + f;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;

  const hh = (day - Math.floor(day)) * 24;
  const mm = (hh - Math.floor(hh)) * 60;
  const ss = (mm - Math.floor(mm)) * 60;
  const ms = Math.round((ss - Math.floor(ss)) * 1000);

  return new Date(Date.UTC(
    year, month - 1, Math.floor(day),
    Math.floor(hh), Math.floor(mm), Math.floor(ss), ms,
  ));
}
