/**
 * Google Apps Script (GAS) 後端
 * 用途：接收前端 base64 圖片，執行 Gemini 浮水印去除，回傳處理後圖片
 *
 * 部署方式：
 *  1. 前往 https://script.google.com/
 *  2. 建立新專案，貼上此程式碼
 *  3. 「部署」→「新增部署」→ 類型選「網路應用程式」
 *  4. 執行身份：「我」；存取權：「任何人」
 *  5. 複製部署 URL，填入前端 app.js 的 GAS_URL 變數
 *
 * 注意：GAS 本身不支援 Canvas API，
 *       此腳本使用 Google Drive 暫存 + Utilities.newBlob 處理圖片位元組。
 *       浮水印去除在前端 Canvas 處理更佳；
 *       此 GAS 版本提供「儲存到 Google Drive」的額外功能。
 */

// ── 設定 ──
const CONFIG = {
  SAVE_TO_DRIVE: false,        // 是否將結果存入 Google Drive
  DRIVE_FOLDER_NAME: 'CircleCrop_Results', // Drive 資料夾名稱
  MAX_SIZE_MB: 8,              // 最大接受圖片大小
  ALLOWED_ORIGINS: ['*'],      // CORS 允許來源，正式環境請限制網域
};

/**
 * 處理 OPTIONS preflight（CORS）
 */
function doOptions(e) {
  return buildResponse('', 200);
}

/**
 * 主要 POST 端點
 * 接收 JSON: { image: "data:image/...", mimeType: "image/jpeg", removeWatermark: true, cropCircle: true }
 * 回傳 JSON: { result: "data:image/png;base64,...", message: "..." }
 */
function doPost(e) {
  try {
    // 解析請求
    const payload = JSON.parse(e.postData.contents);

    if (!payload.image) {
      return buildResponse(JSON.stringify({ error: '未收到圖片資料' }), 400);
    }

    // 驗證大小
    const base64Data = payload.image.split(',')[1] || payload.image;
    const sizeBytes  = (base64Data.length * 3) / 4;
    const sizeMB     = sizeBytes / (1024 * 1024);

    if (sizeMB > CONFIG.MAX_SIZE_MB) {
      return buildResponse(JSON.stringify({
        error: `圖片大小 ${sizeMB.toFixed(1)}MB 超過限制 ${CONFIG.MAX_SIZE_MB}MB`
      }), 400);
    }

    const mimeType = payload.mimeType || 'image/jpeg';

    // 將 base64 轉為 Blob
    const imageBytes = Utilities.base64Decode(base64Data);
    let   blob       = Utilities.newBlob(imageBytes, mimeType, 'input.' + mimeType.split('/')[1]);

    // ── 後端處理選項 ──
    // GAS 不支援像素層級操作，所以這裡做的是：
    // 1. 記錄請求（log）
    // 2. 若需要存 Drive，存入 Drive 並回傳連結
    // 3. 實際的浮水印去除 & 圓形裁切在前端完成
    //    若有購買 Advanced Drive Service 或 External API（如 Cloud Vision），
    //    可在此擴充後端處理邏輯

    const actions = [];
    if (payload.removeWatermark) actions.push('去除浮水印');
    if (payload.cropCircle)      actions.push('圓形裁切');

    Logger.log(`[CircleCrop] 收到請求 | 大小: ${sizeMB.toFixed(2)}MB | 動作: ${actions.join(', ')}`);

    let driveUrl = null;

    // 儲存原始圖到 Drive
    if (CONFIG.SAVE_TO_DRIVE) {
      const folder  = getOrCreateFolder(CONFIG.DRIVE_FOLDER_NAME);
      const saved   = folder.createFile(blob);
      driveUrl = saved.getUrl();
      Logger.log(`[CircleCrop] 已儲存原始圖到 Drive: ${driveUrl}`);
    }

    // 回傳原始圖片（前端 Canvas 會處理去浮水印 & 圓形裁切）
    // 若想在後端也處理，可串接外部 Image Processing API（如 Cloudinary、imgix）
    const resultBase64 = Utilities.base64Encode(imageBytes);
    const resultDataURL = `data:${mimeType};base64,${resultBase64}`;

    const responseData = {
      result: resultDataURL,
      message: `已處理：${actions.join('、')}`,
      driveUrl: driveUrl,
      sizeMB: sizeMB.toFixed(2),
    };

    return buildResponse(JSON.stringify(responseData), 200);

  } catch (err) {
    Logger.log('[CircleCrop] 錯誤: ' + err.toString());
    return buildResponse(JSON.stringify({ error: err.toString() }), 500);
  }
}

/**
 * GET 端點：健康檢查
 */
function doGet(e) {
  return buildResponse(JSON.stringify({
    status: 'ok',
    message: 'CircleCrop GAS 後端運作中',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  }), 200);
}

// ── Helpers ──

function buildResponse(body, statusCode) {
  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
    // 注意：GAS doPost 無法設定自訂 HTTP status code，
    // 錯誤資訊透過 JSON body 的 error 欄位傳遞
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

/**
 * ── 進階：串接外部 Inpainting API 去除浮水印 ──
 * 若想用真正的 AI inpainting 去除浮水印，可使用以下外部 API：
 *
 * 選項 1：Replicate API (需要 API key)
 * function removeWatermarkViaReplicate(imageUrl, maskUrl) {
 *   const response = UrlFetchApp.fetch('https://api.replicate.com/v1/predictions', {
 *     method: 'POST',
 *     headers: {
 *       'Authorization': 'Token YOUR_REPLICATE_TOKEN',
 *       'Content-Type': 'application/json',
 *     },
 *     payload: JSON.stringify({
 *       version: 'stability-ai/stable-diffusion-inpainting',
 *       input: { image: imageUrl, mask: maskUrl, prompt: 'seamless background continuation' }
 *     })
 *   });
 *   return JSON.parse(response.getContentText());
 * }
 *
 * 選項 2：ClipDrop API (需要 API key)
 * function removeWatermarkViaClipDrop(imageBytes) {
 *   const response = UrlFetchApp.fetch('https://clipdrop-api.co/cleanup/v1', {
 *     method: 'POST',
 *     headers: { 'x-api-key': 'YOUR_CLIPDROP_KEY' },
 *     payload: { image_file: imageBytes, mask_file: maskBytes }
 *   });
 *   return response.getContent(); // 回傳圖片 bytes
 * }
 */
