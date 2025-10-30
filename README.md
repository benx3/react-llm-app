# React LLM App (Streaming + Vision + Image Gen + Email)

Ứng dụng React (Vite + Tailwind) kèm backend Node/Express hỗ trợ:
- **Text**: hỏi đáp, Dịch sang Pháp, Giải thích như 5 tuổi, Tìm Keyword, Sinh mã Python
- **Streaming** cho tác vụ văn bản (`/api/llm/stream`)
- **Vision**: Mô tả ảnh, OCR, Phát hiện đối tượng, ALT text
- **Image Generation (OpenAI)**: Tạo ảnh từ mô tả
- **Email**: Soạn email (JSON) + copy + tải .eml

## 1) Cài đặt

```bash
# frontend deps
npm i
# backend deps
npm i express cors multer -w . # (hoặc cd server && npm i ... nếu tách)
```

> Dự án dùng ES Modules.

## 2) Cấu hình biến môi trường

Tạo file `.env` ở **thư mục gốc backend** (cùng cấp `server/server.js`) hoặc export trong shell. Tham khảo `.env.example`:

```
PROVIDER=xxx

OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o-mini

OLLAMA_MODEL=llama3.2-vision

DEEPSEEK_API_KEY=xxx
DEEPSEEK_MODEL=deepseek-chat

PORT=3000

```

- **OpenAI**: hỗ trợ text/vision + **bắt buộc** cho image gen.
- **Ollama**: hỗ trợ text/vision (stream + base64 upload). `ollama serve` trên 11434.

## 3) Chạy dự án

Trong **hai tab** terminal:

```bash
# Tab 1: Backend
npm run server

# Tab 2: Frontend
npm run dev
# mở http://localhost:5173
```
tải miễn phí:
Truy cập:
👉 https://ollama.com/download
chay lệnh khởi động olama local: 
ollama pull llama3.2  
hoặc 
ollama pull llama3.2-vision
Proxy Vite chuyển `/api/*` → `http://localhost:3000` (cấu hình trong `vite.config.ts`).

## 4) Hướng dẫn dùng

### Text (Streaming)
- Nhập văn bản → bấm nút (Tóm tắt, Dịch, v.v.).
- Kết quả hiển thị theo luồng ở vùng kết quả.

### Vision
- Upload ảnh hoặc dán URL.
- Chọn: **Mô tả ảnh / OCR / Đối tượng / ALT text**.

### Image Generation (OpenAI)
- Nhập mô tả → chọn số lượng & kích thước → Tạo ảnh → click ảnh để tải PNG.

### Email
- Nhập bối cảnh tại ô văn bản.
- Chọn người nhận (tùy), giọng điệu, độ dài → **Soạn email**.
- Dùng **Copy Subject/Body** hoặc **Tải .eml**.
