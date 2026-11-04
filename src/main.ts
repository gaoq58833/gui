import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  buildDialStatic,
  formatShichen,
  updateShadow,
  DEFAULT_LOCATION,
  type DialState,
} from "./render/dial";

// ---------- 初始化 ----------
const ticks = document.querySelector<SVGGElement>("#ticks");
const shadowLine = document.querySelector<SVGLineElement>(".shadow");
if (!ticks || !shadowLine) {
  console.error("日晷核心 DOM 找不到：#ticks 或 .shadow");
} else {
  buildDialStatic(ticks);
  startAnimation(shadowLine);
}

enableDrag();

// ---------- 动画循环 ----------
let lastTick = 0;
let lastState: DialState | null = null;

function startAnimation(shadowLine: SVGLineElement): void {
  const tick = (now: number) => {
    // 每 30 秒更新一次影子位置就够了（时间精度是秒级，影子每分钟才动 0.25°）
    if (now - lastTick >= 30_000 || lastTick === 0) {
      lastState = updateShadow(shadowLine, new Date(), DEFAULT_LOCATION);
      lastTick = now;
      logState(lastState);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // 立即跑一次，避免首帧空白
  lastState = updateShadow(shadowLine, new Date(), DEFAULT_LOCATION);
  logState(lastState);
}

function logState(s: DialState): void {
  // 开发时在控制台看数据，release 可以关掉
  if (import.meta.env.DEV) {
    console.debug(
      `时辰 ${formatShichen(s.trueSolarHour)} | ` +
      `δ=${s.declination.toFixed(2)}° | ` +
      `EoT=${s.eqOfTime.toFixed(1)}min | ` +
      `盘面=${s.upperDisk ? "上" : "下"} | ` +
      `影角=${s.dialAngle.toFixed(1)}° | ` +
      `影长=${s.shadowLength.toFixed(0)}`,
    );
  }
}

// ---------- 拖动（之前验证过的方案） ----------
function enableDrag(): void {
  const stage = document.querySelector<HTMLElement>(".stage");
  if (!stage) return;

  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    try {
      getCurrentWindow().startDragging().catch(() => undefined);
    } catch {
      // 浏览器预览时忽略
    }
  });
}
