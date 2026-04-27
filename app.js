/**
 * CircleCrop Tool — app.js
 * 功能：
 *  1. 去除 Gemini AI 右下角浮水印（Canvas inpainting）
 *  2. 裁切成圓形，支援：
 *     - 滑桿調整直徑（42–72 mm，預設 58 mm）
 *     - 拖動圓框移動位置
 *     - 拖動右側把手縮放大小
 */

// ── GAS 後端 URL（選填）──
const GAS_URL = '';

// ─────────────────────────────────────────
//  DOM refs
// ─────────────────────────────────────────
const dropZone        = document.getElementById('dropZone');
const fileInput       = document.getElementById('fileInput');
const stepOptions     = document.getElementById('step-options');
const stepResult      = document.getElementById('step-result');
const previewCanvas   = document.getElementById('previewCanvas');
const canvasWrapper   = document.getElementById('canvasWrapper');
const cropSvg         = document.getElementById('cropSvg');
const maskCircle      = document.getElementById('maskCircle');
const cropCircleRing  = document.getElementById('cropCircleRing');
const dragHandle      = document.getElementById('dragHandle');
const resizeHandle    = document.getElementById('resizeHandle');
const sizeLabel       = document.getElementById('sizeLabel');
const circleSizeControl = document.getElementById('circleSizeControl');
const circleSizeSlider  = document.getElementById('circleSizeSlider');
const sizeValueBadge    = document.getElementById('sizeValueBadge');
const previewInfo     = document.getElementById('previewInfo');
const optWatermark    = document.getElementById('opt-watermark');
const optCircle       = document.getElementById('opt-circle');
const btnProcess      = document.getElementById('btnProcess');
const btnDownload     = document.getElementById('btnDownload');
const btnReset        = document.getElementById('btnReset');
const resultImg       = document.getElementById('resultImg');
const statusLog       = document.getElementById('statusLog');
const loadingOverlay  = document.getElementById('loadingOverlay');
const loadingText     = document.getElementById('loadingText');

// ─────────────────────────────────────────
//  State
// ─────────────────────────────────────────
let originalFile  = null;
let originalImage = null;
let resultDataURL = '';

// 圓形裁切狀態（以 canvas 像素為單位）
const cropState = {
  cx: 0,      // 圓心 X（canvas px）
  cy: 0,      // 圓心 Y（canvas px）
  r:  0,      // 半徑（canvas px）
  mmPerPx: 1, // mm ÷ canvas px 比例（依圖片解析度計算）
};

// 圓形直徑邊界（以原始圖片像素為單位）
// 滑桿顯示單位：px（420–720px，預設 580px）
const PX_MIN = 420;
const PX_MAX = 720;
const PX_DEFAULT = 580;

// ─────────────────────────────────────────
//  Drag & Drop 上傳
// ─────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') fileInput.click();
});
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) loadImage(f);
  else showError('請上傳圖片檔案（JPG / PNG / WebP）');
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadImage(fileInput.files[0]);
});

// ─────────────────────────────────────────
//  載入圖片
// ─────────────────────────────────────────
function loadImage(file) {
  if (file.size > 10 * 1024 * 1024) {
    showError('圖片大小超過 10MB，請壓縮後再試。');
    return;
  }
  originalFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      originalImage = img;
      drawPreview(img);
      stepOptions.classList.remove('hidden');
      stepOptions.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ─────────────────────────────────────────
//  繪製預覽 canvas
// ─────────────────────────────────────────
function drawPreview(img) {
  const MAX = 560;
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
  if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }

  previewCanvas.width  = w;
  previewCanvas.height = h;
  const ctx = previewCanvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  if (optWatermark.checked) drawWatermarkMarker(ctx, w, h);

  // 計算 mm → canvas px 比例
  // 假設螢幕 96dpi、1inch=25.4mm → 1px=0.2646mm
  // 但使用者說的 mm 是輸出尺寸（印刷），以原始圖片尺寸對應
  // 此處直接以預覽 canvas 的比例呈現，實際輸出再等比換算
  const scaleFactor = w / img.naturalWidth; // preview 縮放比
  cropState.mmPerPx = 1 / (96 / 25.4) / scaleFactor; // canvas px → mm

  // 初始化圓形位置（置中，直徑 58mm）
  // 預設圓形半徑：以原始圖片像素換算到 canvas 尺寸
  const defaultRadiusCanvas = origToCanvasPx(PX_DEFAULT / 2);
  cropState.cx = w / 2;
  cropState.cy = h / 2;
  cropState.r  = Math.min(defaultRadiusCanvas, Math.min(w, h) / 2 - 4);

  updateSvgOverlay();
  syncSliderFromState();
  previewInfo.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
}

// ─────────────────────────────────────────
//  原始圖片 px ↔ canvas preview px 換算
// ─────────────────────────────────────────
// origPx：原始圖片像素  |  canvasPx：預覽 canvas 像素
function origToCanvasPx(origPx) {
  if (!originalImage || originalImage.naturalWidth === 0) return origPx;
  return origPx * (previewCanvas.width / originalImage.naturalWidth);
}

function canvasToOrigPx(canvasPx) {
  if (!originalImage || previewCanvas.width === 0) return canvasPx;
  return canvasPx * (originalImage.naturalWidth / previewCanvas.width);
}

// 向下相容（部分地方還呼叫舊名）
function mmToCanvasPx(mm) { return origToCanvasPx(mm); }
function canvasPxToMm(px)  { return canvasToOrigPx(px); }

// ─────────────────────────────────────────
//  SVG 圓形 overlay 更新
// ─────────────────────────────────────────
function updateSvgOverlay() {
  if (!optCircle.checked || !originalImage) {
    cropSvg.style.display = 'none';
    return;
  }

  const { cx, cy, r } = cropState;
  const W = previewCanvas.width;
  const H = previewCanvas.height;

  // SVG 尺寸同步 canvas
  cropSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  cropSvg.style.display = 'block';

  // 遮罩圓
  maskCircle.setAttribute('cx', cx);
  maskCircle.setAttribute('cy', cy);
  maskCircle.setAttribute('r',  r);

  // 暗色遮罩底
  document.getElementById('dimRect').setAttribute('width',  W);
  document.getElementById('dimRect').setAttribute('height', H);

  // 裁切圓外框
  cropCircleRing.setAttribute('cx', cx);
  cropCircleRing.setAttribute('cy', cy);
  cropCircleRing.setAttribute('r',  r);

  // 拖曳把手（中心點）
  dragHandle.setAttribute('cx', cx);
  dragHandle.setAttribute('cy', cy);

  // 縮放把手（右側）
  resizeHandle.setAttribute('cx', cx + r);
  resizeHandle.setAttribute('cy', cy);

  // 尺寸標籤
  const origDiam = Math.round(canvasToOrigPx(r) * 2);
  sizeLabel.setAttribute('x', cx);
  sizeLabel.setAttribute('y', cy + r + 18);
  sizeLabel.textContent = `⌀ ${origDiam} px`;
}

// ─────────────────────────────────────────
//  滑桿同步
// ─────────────────────────────────────────
function syncSliderFromState() {
  const origDiam = Math.round(canvasToOrigPx(cropState.r) * 2);
  const clamped  = Math.min(PX_MAX, Math.max(PX_MIN, origDiam));
  circleSizeSlider.value = clamped;
  updateSliderUI(clamped);
}

function updateSliderUI(px) {
  sizeValueBadge.textContent = `${px} px`;
  circleSizeSlider.style.setProperty('--val', px);
  const pct = ((px - PX_MIN) / (PX_MAX - PX_MIN) * 100).toFixed(1);
  circleSizeSlider.style.background =
    `linear-gradient(to right, var(--accent) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
}

circleSizeSlider.addEventListener('input', () => {
  const px = parseInt(circleSizeSlider.value, 10);
  updateSliderUI(px);
  // 半徑 = 原始圖片 px 換算到 canvas 尺寸
  cropState.r = origToCanvasPx(px / 2);
  clampCropState();
  updateSvgOverlay();
});

// ─────────────────────────────────────────
//  拖動圓框（移動位置）
// ─────────────────────────────────────────
let isDraggingMove   = false;
let isDraggingResize = false;
let dragStartX = 0, dragStartY = 0;
let dragStartCx = 0, dragStartCy = 0;
let dragStartR = 0;

dragHandle.addEventListener('mousedown',  startMove);
dragHandle.addEventListener('touchstart', startMove, { passive: false });

resizeHandle.addEventListener('mousedown',  startResize);
resizeHandle.addEventListener('touchstart', startResize, { passive: false });

function startMove(e) {
  e.preventDefault();
  isDraggingMove = true;
  const pos = getEventPos(e);
  dragStartX  = pos.x;
  dragStartY  = pos.y;
  dragStartCx = cropState.cx;
  dragStartCy = cropState.cy;
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   endDrag);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend',  endDrag);
}

function startResize(e) {
  e.preventDefault();
  isDraggingResize = true;
  const pos = getEventPos(e);
  dragStartX = pos.x;
  dragStartR = cropState.r;
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   endDrag);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend',  endDrag);
}

function onMove(e) {
  e.preventDefault();
  const pos  = getEventPos(e);
  const svgPt = clientToSvg(pos.x, pos.y);

  if (isDraggingMove) {
    const startSvgPt = clientToSvg(dragStartX, dragStartY);
    cropState.cx = dragStartCx + (svgPt.x - startSvgPt.x);
    cropState.cy = dragStartCy + (svgPt.y - startSvgPt.y);
  }

  if (isDraggingResize) {
    // 計算新半徑 = 目前把手 X 與圓心距
    const dx = svgPt.x - cropState.cx;
    const newR = Math.abs(dx);
    // mm 限制
    const newOrigPx = canvasToOrigPx(newR) * 2;
    if (newOrigPx >= PX_MIN && newOrigPx <= PX_MAX) {
      cropState.r = newR;
    } else if (newOrigPx < PX_MIN) {
      cropState.r = origToCanvasPx(PX_MIN / 2);
    } else {
      cropState.r = origToCanvasPx(PX_MAX / 2);
    }
    syncSliderFromState();
  }

  clampCropState();
  updateSvgOverlay();
}

function endDrag() {
  isDraggingMove   = false;
  isDraggingResize = false;
  document.removeEventListener('mousemove', onMove);
  document.removeEventListener('mouseup',   endDrag);
  document.removeEventListener('touchmove', onMove);
  document.removeEventListener('touchend',  endDrag);
  syncSliderFromState();
}

// client 座標 → SVG viewBox 座標
function clientToSvg(clientX, clientY) {
  const rect = cropSvg.getBoundingClientRect();
  const W    = previewCanvas.width;
  const H    = previewCanvas.height;
  return {
    x: (clientX - rect.left) / rect.width  * W,
    y: (clientY - rect.top)  / rect.height * H,
  };
}

function getEventPos(e) {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

// 確保圓形不超出 canvas 邊界
function clampCropState() {
  const W = previewCanvas.width;
  const H = previewCanvas.height;
  const r = cropState.r;
  cropState.cx = Math.min(W - r, Math.max(r, cropState.cx));
  cropState.cy = Math.min(H - r, Math.max(r, cropState.cy));
}

// ─────────────────────────────────────────
//  option 切換
// ─────────────────────────────────────────
optWatermark.addEventListener('change', () => {
  if (originalImage) drawPreview(originalImage);
});

optCircle.addEventListener('change', () => {
  const on = optCircle.checked;
  circleSizeControl.style.display = on ? 'block' : 'none';
  if (on && originalImage) {
    updateSvgOverlay();
    updateSliderUI(parseInt(circleSizeSlider.value, 10));
  } else {
    cropSvg.style.display = 'none';
  }
});

// ─────────────────────────────────────────
//  浮水印標記（紅框）
// ─────────────────────────────────────────
function drawWatermarkMarker(ctx, w, h) {
  const mw = Math.round(w * 0.14);
  const mh = Math.round(h * 0.08);
  const mx = w - mw - 4;
  const my = h - mh - 4;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,77,109,0.85)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.strokeRect(mx, my, mw, mh);
  ctx.fillStyle = 'rgba(255,77,109,0.15)';
  ctx.fillRect(mx, my, mw, mh);
  ctx.setLineDash([]);
  ctx.font = `bold ${Math.max(10, Math.round(w * 0.02))}px Syne, sans-serif`;
  ctx.fillStyle = 'rgba(255,77,109,0.9)';
  ctx.textAlign = 'right';
  ctx.fillText('浮水印', mx + mw - 4, my + Math.round(mh * 0.7));
  ctx.restore();
}

// ─────────────────────────────────────────
//  開始處理
// ─────────────────────────────────────────
btnProcess.addEventListener('click', async () => {
  if (!originalImage) return;

  const doWatermark = optWatermark.checked;
  const doCircle    = optCircle.checked;

  if (!doWatermark && !doCircle) {
    showError('請至少勾選一個處理選項！');
    return;
  }

  showLoading('處理中，請稍候…');
  clearLog();

  try {
    let canvas = document.createElement('canvas');
    const img = originalImage;
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    if (doWatermark) {
      log('🎨 正在去除 Gemini 浮水印…');
      removeWatermarkCanvas(ctx, canvas.width, canvas.height);
      log('✅ 浮水印區域已修復');
    }

    if (doCircle) {
      log('⭕ 正在裁切圓形…');
      const origDiam = Math.round(canvasToOrigPx(cropState.r) * 2);
      const origCx   = Math.round(canvasToOrigPx(cropState.cx));
      const origCy   = Math.round(canvasToOrigPx(cropState.cy));
      log(`   直徑：${origDiam} px，圓心：(${origCx}px, ${origCy}px)`);
      canvas = cropCircleWithState(canvas);
      log('✅ 圓形裁切完成');
    }

    resultDataURL = canvas.toDataURL(doCircle ? 'image/png' : 'image/jpeg', 0.95);
    resultImg.src = resultDataURL;
    stepResult.classList.remove('hidden');
    stepResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
    log('🎉 處理完成，點擊下載按鈕保存圖片');

  } catch (err) {
    log('❌ 處理失敗：' + err.message, true);
    console.error(err);
  } finally {
    hideLoading();
  }
});

// ─────────────────────────────────────────
//  圓形裁切（依 cropState 位置與大小）
// ─────────────────────────────────────────
function cropCircleWithState(srcCanvas) {
  const scaleX = srcCanvas.width  / previewCanvas.width;
  const scaleY = srcCanvas.height / previewCanvas.height;

  // 換算到原始圖片座標
  const cx = cropState.cx * scaleX;
  const cy = cropState.cy * scaleY;
  const r  = cropState.r  * Math.min(scaleX, scaleY);
  const diameter = Math.round(r * 2);

  const out = document.createElement('canvas');
  out.width  = diameter;
  out.height = diameter;
  const ctx = out.getContext('2d');

  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.clip();

  // 從原圖對應區域畫入
  ctx.drawImage(
    srcCanvas,
    cx - r, cy - r, diameter, diameter, // 來源區域
    0, 0, diameter, diameter             // 目標區域
  );

  return out;
}

// 相容舊的 cropCircle（全圖置中裁切）
function cropCircle(srcCanvas) {
  const size = Math.min(srcCanvas.width, srcCanvas.height);
  const out  = document.createElement('canvas');
  out.width  = size;
  out.height = size;
  const ctx  = out.getContext('2d');
  const ox = (srcCanvas.width  - size) / 2;
  const oy = (srcCanvas.height - size) / 2;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(srcCanvas, -ox, -oy, srcCanvas.width, srcCanvas.height);
  return out;
}

// ─────────────────────────────────────────
//  浮水印去除（Canvas inpainting）
// ─────────────────────────────────────────
function removeWatermarkCanvas(ctx, W, H) {
  const pw = Math.round(W * 0.14);
  const ph = Math.round(H * 0.08);
  const px = W - pw;
  const py = H - ph;

  const imageData = ctx.getImageData(0, 0, W, H);
  const data = imageData.data;
  const sourceY = py - ph;

  if (sourceY < 0) {
    fillWithAvgColor(data, W, px, py, pw, ph);
  } else {
    for (let y = py; y < py + ph; y++) {
      for (let x = px; x < px + pw; x++) {
        const offsetX = Math.round((Math.random() - 0.5) * 4);
        const srcX = Math.min(W - 1, Math.max(0, x + offsetX));
        const srcY = Math.min(H - 1, Math.max(0, sourceY + (y - py)));
        const si = (srcY * W + srcX) * 4;
        const di = (y   * W + x)    * 4;
        const blendT = (y - py) / ph;
        data[di]   = data[di]   * (1 - blendT * 0.3) + data[si]   * (blendT * 0.3 + 0.7);
        data[di+1] = data[di+1] * (1 - blendT * 0.3) + data[si+1] * (blendT * 0.3 + 0.7);
        data[di+2] = data[di+2] * (1 - blendT * 0.3) + data[si+2] * (blendT * 0.3 + 0.7);
      }
    }
    boxBlurRegion(data, W, H, px - 2, py - 2, pw + 4, ph + 4, 3);
  }

  ctx.putImageData(imageData, 0, 0);
}

function fillWithAvgColor(data, W, px, py, pw, ph) {
  let r = 0, g = 0, b = 0, count = 0;
  const sample = (x, y) => {
    if (x < 0 || x >= W || y < 0) return;
    const i = (y * W + x) * 4;
    r += data[i]; g += data[i+1]; b += data[i+2]; count++;
  };
  for (let x = px; x < px + pw; x++) sample(x, py - 1);
  for (let y = py; y < py + ph; y++) sample(px - 1, y);
  if (count > 0) { r /= count; g /= count; b /= count; }
  for (let y = py; y < py + ph; y++) {
    for (let x = px; x < px + pw; x++) {
      const i = (y * W + x) * 4;
      data[i] = r; data[i+1] = g; data[i+2] = b;
    }
  }
}

function boxBlurRegion(data, W, H, x0, y0, bw, bh, radius) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0);
  const x1 = Math.min(W, x0 + bw);
  const y1 = Math.min(H, y0 + bh);
  const temp = new Uint8ClampedArray(data.length);
  temp.set(data);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let r = 0, g = 0, b = 0, cnt = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.min(W - 1, Math.max(0, x + dx));
          const ny = Math.min(H - 1, Math.max(0, y + dy));
          const i = (ny * W + nx) * 4;
          r += temp[i]; g += temp[i+1]; b += temp[i+2]; cnt++;
        }
      }
      const di = (y * W + x) * 4;
      data[di] = r/cnt; data[di+1] = g/cnt; data[di+2] = b/cnt;
    }
  }
}

// ─────────────────────────────────────────
//  下載 / 重置
// ─────────────────────────────────────────
btnDownload.addEventListener('click', () => {
  if (!resultDataURL) return;
  const a = document.createElement('a');
  a.download = `circlecrop_${Date.now()}${optCircle.checked ? '.png' : '.jpg'}`;
  a.href = resultDataURL;
  a.click();
  log('💾 圖片已下載');
});

btnReset.addEventListener('click', () => {
  originalFile  = null;
  originalImage = null;
  resultDataURL = '';
  fileInput.value = '';
  cropSvg.style.display = 'none';
  circleSizeControl.style.display = 'none';
  stepOptions.classList.add('hidden');
  stepResult.classList.add('hidden');
  clearLog();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ─────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function showLoading(text) {
  loadingText.textContent = text;
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

function log(msg, isError = false) {
  const line = document.createElement('div');
  line.className = 'log-line' + (isError ? ' error' : '');
  line.textContent = msg;
  statusLog.appendChild(line);
}

function clearLog() { statusLog.innerHTML = ''; }

function showError(msg) {
  const prev = document.querySelector('.toast-error');
  if (prev) prev.remove();
  const toast = document.createElement('div');
  toast.className = 'toast-error';
  toast.style.cssText = `
    position:fixed; bottom:32px; left:50%; transform:translateX(-50%);
    background:#ff4d6d; color:#fff; padding:12px 24px; border-radius:100px;
    font-family:var(--font-display); font-size:14px; z-index:200;
    box-shadow:0 8px 24px rgba(255,77,109,0.4); animation:fadeUp .3s ease;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ─────────────────────────────────────────
//  初始化滑桿 UI
// ─────────────────────────────────────────
updateSliderUI(PX_DEFAULT);
