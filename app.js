/**
 * CircleCrop Tool
 * 功能：
 *  1. 去除 Gemini AI 圖片右下角浮水印（Canvas inpainting）
 *  2. 裁切成圓形（輸出透明背景 PNG）
 *
 * 架構：
 *  - 純前端 Canvas 處理（無需 GAS，圖片不離開瀏覽器）
 *  - 若需 GAS 後端：設定 GAS_URL 並切換 processWithGAS()
 */

// ── 設定 GAS 後端 URL（若使用後端處理時填入）──
const GAS_URL = ''; // e.g. 'https://script.google.com/macros/s/YOUR_ID/exec'

// ── DOM refs ──
const dropZone    = document.getElementById('dropZone');
const fileInput   = document.getElementById('fileInput');
const stepOptions = document.getElementById('step-options');
const stepResult  = document.getElementById('step-result');
const previewCanvas = document.getElementById('previewCanvas');
const circleOverlay = document.getElementById('circleOverlay');
const previewInfo   = document.getElementById('previewInfo');
const optWatermark  = document.getElementById('opt-watermark');
const optCircle     = document.getElementById('opt-circle');
const btnProcess    = document.getElementById('btnProcess');
const btnDownload   = document.getElementById('btnDownload');
const btnReset      = document.getElementById('btnReset');
const resultImg     = document.getElementById('resultImg');
const statusLog     = document.getElementById('statusLog');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText    = document.getElementById('loadingText');

let originalFile = null;
let originalImage = null; // HTMLImageElement
let resultDataURL = '';

// ── Drag & Drop ──
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });

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

// ── Load image ──
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

// ── Preview on canvas ──
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

  // Mark watermark region
  if (optWatermark.checked) {
    drawWatermarkMarker(ctx, w, h);
  }

  updateCircleOverlay();
  previewInfo.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
}

function drawWatermarkMarker(ctx, w, h) {
  // Gemini 浮水印通常在右下角約 12% 寬、6% 高的區域
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

// ── Circle overlay on preview ──
function updateCircleOverlay() {
  if (optCircle.checked) {
    circleOverlay.classList.add('visible');
  } else {
    circleOverlay.classList.remove('visible');
  }
}

// Sync option toggles → preview refresh
optWatermark.addEventListener('change', () => {
  if (originalImage) drawPreview(originalImage);
});
optCircle.addEventListener('change', () => {
  updateCircleOverlay();
});

// ── Process ──
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
    let canvas;

    if (doWatermark && GAS_URL) {
      // 後端 GAS 處理浮水印
      log('🌐 傳送至 GAS 後端去除浮水印…');
      const b64 = await fileToBase64(originalFile);
      const resultB64 = await sendToGAS(b64, originalFile.type, doCircle);
      resultDataURL = resultB64;
      log('✅ 浮水印去除完成（後端）');
    } else {
      // 純前端處理
      canvas = document.createElement('canvas');
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
        canvas = cropCircle(canvas);
        log('✅ 圓形裁切完成');
      }

      resultDataURL = canvas.toDataURL(doCircle ? 'image/png' : 'image/jpeg', 0.95);
    }

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

// ── Gemini Watermark Removal (Canvas inpainting) ──
/**
 * Gemini 浮水印去除邏輯：
 *  - 偵測右下角區域（約佔圖片 14% × 8%）
 *  - 分析浮水印區域邊界的平均像素色彩
 *  - 使用 patch-based 填充：從周圍取樣相似區塊進行填補
 *  - 搭配線性漸層融合使邊緣自然過渡
 */
function removeWatermarkCanvas(ctx, W, H) {
  // 1. 定義浮水印區域（Gemini 右下角帶狀區）
  const pw = Math.round(W * 0.14);  // 浮水印寬度
  const ph = Math.round(H * 0.08);  // 浮水印高度
  const px = W - pw;                // 起始 X
  const py = H - ph;                // 起始 Y

  const imageData = ctx.getImageData(0, 0, W, H);
  const data = imageData.data;

  // 2. 取浮水印正上方的區域作為填充來源
  const sourceY = py - ph; // 從上方一個 ph 的距離取樣

  if (sourceY < 0) {
    // 若圖片太小，改用平均色填充
    fillWithAvgColor(data, W, px, py, pw, ph);
  } else {
    // 3. 垂直 tile 複製（帶 Gaussian blur 柔化）
    for (let y = py; y < py + ph; y++) {
      for (let x = px; x < px + pw; x++) {
        // 取對應的上方像素（帶隨機偏移以避免明顯重複紋理）
        const offsetX = Math.round((Math.random() - 0.5) * 4);
        const srcX = Math.min(W - 1, Math.max(0, x + offsetX));
        const srcY = Math.min(H - 1, Math.max(0, sourceY + (y - py)));

        const si = (srcY * W + srcX) * 4;
        const di = (y   * W + x)    * 4;

        // 融合比例：越靠近浮水印底部越多覆蓋（漸進過渡）
        const blendT = (y - py) / ph; // 0 → 1

        data[di]     = data[di]     * (1 - blendT * 0.3) + data[si]     * (blendT * 0.3 + 0.7);
        data[di + 1] = data[di + 1] * (1 - blendT * 0.3) + data[si + 1] * (blendT * 0.3 + 0.7);
        data[di + 2] = data[di + 2] * (1 - blendT * 0.3) + data[si + 2] * (blendT * 0.3 + 0.7);
      }
    }

    // 4. 對修復區域做快速 box blur 柔化邊緣
    boxBlurRegion(data, W, H, px - 2, py - 2, pw + 4, ph + 4, 3);
  }

  ctx.putImageData(imageData, 0, 0);
}

function fillWithAvgColor(data, W, px, py, pw, ph) {
  // 取周圍 8px 邊框的平均色
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
      data[di]   = r / cnt;
      data[di+1] = g / cnt;
      data[di+2] = b / cnt;
    }
  }
}

// ── Circle Crop ──
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

// ── GAS Backend (optional) ──
async function sendToGAS(base64Data, mimeType, doCircle) {
  const resp = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: base64Data,
      mimeType,
      removeWatermark: true,
      cropCircle: doCircle
    })
  });
  if (!resp.ok) throw new Error(`GAS 回應錯誤：${resp.status}`);
  const json = await resp.json();
  if (json.error) throw new Error(json.error);
  return json.result; // base64 data URL
}

// ── Download ──
btnDownload.addEventListener('click', () => {
  if (!resultDataURL) return;
  const a = document.createElement('a');
  const isCircle = optCircle.checked;
  a.download = `processed_${Date.now()}${isCircle ? '.png' : '.jpg'}`;
  a.href = resultDataURL;
  a.click();
  log('💾 圖片已下載');
});

// ── Reset ──
btnReset.addEventListener('click', () => {
  originalFile  = null;
  originalImage = null;
  resultDataURL = '';
  fileInput.value = '';
  stepOptions.classList.add('hidden');
  stepResult.classList.add('hidden');
  clearLog();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ── Helpers ──
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

function clearLog() {
  statusLog.innerHTML = '';
}

function showError(msg) {
  const prev = document.querySelector('.toast-error');
  if (prev) prev.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-error';
  toast.style.cssText = `
    position:fixed; bottom:32px; left:50%; transform:translateX(-50%);
    background:#ff4d6d; color:#fff; padding:12px 24px; border-radius:100px;
    font-family:var(--font-display); font-size:14px; z-index:200;
    box-shadow:0 8px 24px rgba(255,77,109,0.4);
    animation: fadeUp .3s ease;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
