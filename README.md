# CircleCrop Tool 🔵

> 圖片圓形裁切 + Gemini AI 浮水印去除工具
> 純前端運作，圖片不離開瀏覽器

---

## 功能

| 功能 | 說明 |
|------|------|
| ✂️ 圓形裁切 | 輸出透明背景 PNG，適合大頭貼、社群頭像 |
| 🧹 去除 Gemini 浮水印 | 修復 Gemini AI 生圖右下角浮水印區域（Canvas inpainting）|
| 🔒 純前端 | 所有處理在瀏覽器完成，不上傳伺服器 |
| 📁 GAS 後端（選用）| 可啟用 Google Apps Script 存檔至 Google Drive |

---

## 部署到 GitHub Pages

### 1. 建立 GitHub Repository

```bash
git init
git add .
git commit -m "init: CircleCrop Tool"
git remote add origin https://github.com/YOUR_USERNAME/circle-crop-tool.git
git push -u origin main
```

### 2. 啟用 GitHub Pages

1. 進入 Repository → **Settings** → **Pages**
2. Source 選 **Deploy from a branch**
3. Branch 選 `main` / `(root)` → Save
4. 等待約 1 分鐘後，網址格式為：
   `https://YOUR_USERNAME.github.io/circle-crop-tool/`

---

## 設定 GAS 後端（選用）

GAS 後端用途：
- 記錄使用 log
- 將圖片存入 Google Drive
- 未來可串接 AI Inpainting API（如 Replicate、ClipDrop）

### 部署步驟

1. 前往 [Google Apps Script](https://script.google.com/)
2. 建立新專案，命名為 `CircleCrop`
3. 將 `gas-backend.gs` 內容貼入 `Code.gs`
4. 點選「部署」→「新增部署」
5. 設定如下：
   - **類型**：網路應用程式
   - **執行身份**：我（您的帳號）
   - **存取權**：任何人
6. 點「部署」，複製產生的 **部署 URL**

### 連接前端

打開 `app.js`，找到第 20 行：

```js
const GAS_URL = ''; // 填入您的 GAS 部署 URL
```

改為：
```js
const GAS_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

---

## 專案結構

```
circle-crop-tool/
├── index.html       # 主頁面
├── style.css        # 樣式（深色主題）
├── app.js           # 前端邏輯（Canvas 處理）
├── gas-backend.gs   # GAS 後端程式碼
└── README.md        # 說明文件
```

---

## Gemini 浮水印去除原理

Gemini AI 生成的圖片在**右下角約 14% 寬 × 8% 高**的區域有浮水印。

本工具使用 Canvas `ImageData` API 進行修復：

1. **定位**：計算浮水印位置（右下角）
2. **取樣**：從浮水印正上方取對應像素作為來源
3. **融合**：以漸變比例混合，避免硬邊
4. **柔化**：對修復邊界做 Box Blur 消除痕跡

> ⚠️ 純前端 inpainting 效果有限，複雜背景可能有殘影。
> 若需更好效果，可在 `gas-backend.gs` 中串接 [ClipDrop Cleanup API](https://clipdrop.co/apis/docs/cleanup)。

---

## 升級：接入真正的 AI Inpainting

在 `gas-backend.gs` 中已提供範例，串接：

- **[ClipDrop API](https://clipdrop.co/apis)** — 最佳去浮水印效果，月費約 $9
- **[Replicate](https://replicate.com/)** — 可用 Stable Diffusion inpainting，按使用計費

---

## License

MIT License — 自由使用、修改、商業用途
