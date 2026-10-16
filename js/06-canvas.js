/* =========================================================================
 * 机甲对决 MECH DUEL · 06-canvas.js
 * 视口自适应:画布分辨率与缩放
 * -------------------------------------------------------------------------
 * 由 index.html 内联脚本按逻辑模块拆分而来。各文件以普通 <script> 顺序加载,
 * 共享同一个全局作用域,故必须保持 index.html 中的引入顺序。
 * ========================================================================= */
'use strict';
/* 画布自适应:实际分辨率 = 480×270 × 整数倍率,窗口/缩放变化时按显示尺寸重建 */
function fitCanvas(){
  const r=cv.getBoundingClientRect();
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const s=Math.max(1,Math.floor(Math.max(480,Math.round(r.width*dpr))/480));
  cv.width=480*s; cv.height=270*s; SC=s;
  buildBackground();
}
addEventListener('resize',fitCanvas);
