// server/server.js
// Node 18+, npm i express cors multer
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PROVIDER = process.env.PROVIDER || "openai";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2-vision";

function taskInstruction(task) {
  switch (task) {
    case "summarize":
      return "Summarize the user's text in 3–5 bullet points. Keep it factual and concise.";
    case "translate_fr":
      return "Translate the user's text to French. Preserve meaning and tone. Output French only.";
    case "explain_like_5":
      return "Giải thích văn bản của người dùng như thể tôi mới 5 tuổi. Sử dụng từ ngữ đơn giản và giọng điệu thân thiện.";
    case "extract_keywords":
      return "Trích xuất 5–12 từ khóa ngắn gọn từ văn bản của người dùng. Trả về một dòng duy nhất, phân cách bằng dấu phẩy, viết thường, không trùng lặp.";
    case "generate_python":
      return "Write Python code that accomplishes what the user's text asks. Output code only; no commentary.";
    case "draft_email":
      return `You are an email writing assistant.
Return valid JSON only:
{"subject": "...", "body": "..."}
Rules:
- Be clear, polite, and concise.
- Use the user's language if obvious; otherwise default to Vietnamese.
- Generate a helpful subject and a professional email body.
- Keep under ~150–180 words unless explicitly asked for longer.`;
    case "describe_image":
      return "Hãy giúp tôi mô tả hình ảnh một cách rõ ràng trong 3–6 câu. trả lời bằng tiếng việt nếu có thể.";
    case "extract_text_ocr":
      return "Read every legible word in the image and return only the text content in reading order.";
    case "detect_objects":
      return 'Liệt kê các đối tượng nổi bật trong hình ảnh với nhãn ngắn. Trả về JSON {"objects":["..."]}.';
    case "write_alt_text":
      return "Viết một văn bản thay thế ngắn gọn, hữu ích (khoảng 160 ký tự) mô tả hình ảnh để dễ tiếp cận.";
    default:
      return "Help with the user's request clearly and briefly.";
  }
}

// ---------- Non-stream OpenAI & Ollama calls ----------
async function callOpenAI(systemPrompt, userText) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing.");
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userText }],
      temperature: 0.2
    })
  });
  if (!resp.ok) throw new Error(`OpenAI error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callOllama(systemPrompt, userText) {
  const prompt = `System: ${systemPrompt}\n\nUser: ${userText}\n\nAssistant:`;
  const resp = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { temperature: 0.2 } })
  });
  if (!resp.ok) throw new Error(`Ollama error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return (data.response || "").trim();
}
// gọi trước: npm i node-fetch (hoặc dùng global fetch trên Node 18+)
// Đảm bảo dotenv.config() đã chạy nếu dùng .env


// SSE: chỉ đẩy text token thay vì JSON thô của OpenAI
// SSE: hỗ trợ OpenAI + Ollama
app.get("/api/llm/sse", async (req, res) => {
  try {
    const provider = String(req.query.provider || process.env.PROVIDER || "openai");
    const model = String(req.query.model || (provider === "ollama" ? OLLAMA_MODEL : OPENAI_MODEL));
    const task = String(req.query.task || "");
    const promptRaw = String(req.query.prompt || req.query.text || "");
    const instruction = taskInstruction(task);
    const userPrompt = promptRaw?.trim()
      ? `System: ${instruction}\n\nUser: ${promptRaw}\n\nAssistant:`
      : `System: ${instruction}\n\nAssistant:`;

    // Header SSE
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // Ping giữ kết nối
    const ping = setInterval(() => {
      try { res.write(`: ping\n\n`); } catch {}
    }, 15000);
    res.on("close", () => clearInterval(ping));

    let upstream;

    if (provider === "openai") {
      if (!OPENAI_API_KEY) {
        res.write(`data: ERROR: OPENAI_API_KEY missing\n\n`);
        res.write(`data: [END]\n\n`);
        return res.end();
      }
      upstream = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages: [
            { role: "system", content: "You are a helpful assistant. Always reply in Vietnamese unless asked otherwise." },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.2
        }),
      });
    } else if (provider === "ollama") {
      upstream = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/x-ndjson", // quan trọng cho NDJSON
        },
        body: JSON.stringify({
          model,
          prompt: userPrompt,
          stream: true,
          options: { temperature: 0.2 }
        }),
      });
    } else {
      res.write(`data: ERROR: Provider không hỗ trợ: ${provider}\n\n`);
      res.write(`data: [END]\n\n`);
      return res.end();
    }

    if (!upstream.ok) {
      const err = await upstream.text().catch(() => `${upstream.statusText}`);
      res.write(`data: ERROR: ${JSON.stringify(err)}\n\n`);
      res.write(`data: [END]\n\n`);
      clearInterval(ping);
      return res.end();
    }

    // Đọc stream
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";

      for (const line of lines) {
        const s = line.trim();
        if (!s) continue;

        // OpenAI: "data: {...}" hoặc "[DONE]"
        if (provider === "openai") {
          if (s === "data: [DONE]" || s === "[DONE]") {
            res.write(`data: [END]\n\n`);
            clearInterval(ping);
            return res.end();
          }
          const jsonStr = s.startsWith("data:") ? s.slice(5).trim() : s;
          try {
            const chunk = JSON.parse(jsonStr);
            const token = chunk?.choices?.[0]?.delta?.content;
            if (token) res.write(`data: ${token.replace(/\n/g, "\\n")}\n\n`);
          } catch {}
          continue;
        }

        // Ollama: NDJSON mỗi dòng là JSON {response, done, error}
        if (provider === "ollama") {
          try {
            const obj = JSON.parse(s);
            if (obj?.error) {
              res.write(`data: ERROR: ${String(obj.error)}\n\n`);
              res.write(`data: [END]\n\n`);
              clearInterval(ping);
              return res.end();
            }
            if (typeof obj?.response === "string") {
              res.write(`data: ${obj.response.replace(/\n/g, "\\n")}\n\n`);
            }
            if (obj?.done) {
              res.write(`data: [END]\n\n`);
              clearInterval(ping);
              return res.end();
            }
          } catch {
            // bỏ qua dòng không phải JSON
          }
        }
      }
    }

    res.write(`data: [END]\n\n`);
    clearInterval(ping);
    res.end();
  } catch (err) {
    try {
      res.write(`data: ERROR: ${JSON.stringify(String(err))}\n\n`);
      res.write(`data: [END]\n\n`);
    } catch {}
    res.end();
  }
});

// ---------- Streaming proxies ----------
app.post("/api/llm/stream", async (req, res) => {
  try {
    const { task, text } = req.body || {};
    if (!text || typeof text !== "string") return res.status(400).end("Missing 'text'");
    const instruction = taskInstruction(task);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

   if (PROVIDER === "ollama") {
  // Ghép prompt như trước
  const prompt = `System: ${instruction}\n\nUser: ${text}\n\nAssistant:`;

  const r = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: true,                 // nhớ chữ thường
      options: { temperature: 0.2 },
    }),
  });

  if (!r.ok) {
    res.write(`Error: ${await r.text()}`);
    res.end();
    return;
  }

  // Ollama trả NDJSON: mỗi dòng là 1 JSON có field .response
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // tách theo dòng và parse
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? ""; // giữ lại mẩu dang dở
    for (const line of lines) {
      const s = line.trim();
      if (!s) continue;
      try {
        const obj = JSON.parse(s);
        if (obj.response) res.write(obj.response); // chỉ đẩy text
      } catch {
        // bỏ qua dòng không phải JSON
      }
    }
  }
  // flush mẩu cuối (nếu còn) – thường không cần, vì done:true không có response
  res.end();
  return;
}

    // OpenAI streaming
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing.");
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        stream: true,
        messages: [{ role: "system", content: instruction }, { role: "user", content: text }]
      })
    });
    if (!r.ok) {
      res.status(500);
      res.end(await r.text());
      return;
    }
    for await (const chunk of r.body) res.write(chunk);
    res.end();
  } catch (e) {
    res.status(500).end(String(e));
  }
});

// ---------- Non-stream endpoints (vision, image, email) ----------

const upload = multer({ storage: multer.memoryStorage() });

async function callOpenAIWithImage(systemPrompt, imageUrlOrBase64) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing.");
  const imageContent = { type: "image_url", image_url: { url: imageUrlOrBase64 } };
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: [imageContent] }],
      temperature: 0.2
    })
  });
  if (!resp.ok) throw new Error(`OpenAI error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callOllamaWithImage(systemPrompt, imageBase64) {
  const prompt = `System: ${systemPrompt}\n\nAssistant:`;
  const resp = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      images: [imageBase64.replace(/^data:.*;base64,/, "")],
      stream: false,
      options: { temperature: 0.2 }
    })
  });
  if (!resp.ok) throw new Error(`Ollama error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return (data.response || "").trim();
}

app.post("/api/vision", upload.single("image"), async (req, res) => {
  try {
    const { task, imageUrl } = req.body || {};
    const instruction = taskInstruction(task);
    if (imageUrl && imageUrl.trim()) {
      if (PROVIDER !== "openai") return res.status(400).json({ error: "For Ollama, please upload file." });
      const out = await callOpenAIWithImage(instruction, imageUrl.trim());
      return res.json({ result: out });
    }
    if (req.file?.buffer) {
      const mime = req.file.mimetype || "image/png";
      const dataUri = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
      const out = PROVIDER === "ollama" ?
        await callOllamaWithImage(instruction, dataUri) :
        await callOpenAIWithImage(instruction, dataUri);
      return res.json({ result: out });
    }
    res.status(400).json({ error: "Provide 'imageUrl' or upload 'image' file." });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

async function callOpenAIImage(prompt, { n = 1, size = "1024x1024" } = {}) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing.");
  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size, n })
  });
  if (!resp.ok) throw new Error(`OpenAI image error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return (data.data || []).map((d) => `data:image/png;base64,${d.b64_json}`);
}

app.post("/api/imagegen", async (req, res) => {
  try {
    const { prompt, n = 1, size = "1024x1024" } = req.body || {};
    if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "Thiếu 'prompt'." });
    if (PROVIDER !== "openai") return res.status(400).json({ error: "Chuyển qua  PROVIDER=openai để sinh ảnh tự động." });
    const images = await callOpenAIImage(prompt, { n, size });
    res.json({ images });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post("/api/llm", async (req, res) => {
  try {
    const { task, text } = req.body || {};
    if (!text || typeof text !== "string") return res.status(400).json({ error: "Missing 'text'." });
    const instruction = taskInstruction(task);
    const out = PROVIDER === "ollama" ? await callOllama(instruction, text) : await callOpenAI(instruction, text);
    res.json({ result: out });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post("/api/email/eml", (req, res) => {
  const { to = "", from = "no-reply@example.com", subject = "", body = "" } = req.body || {};
  const now = new Date().toUTCString();
  const eml = `From: ${from}
To: ${to}
Subject: ${subject}
Date: ${now}
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 8bit

${body}
`;
  res.setHeader("Content-Type", "message/rfc822");
  res.setHeader("Content-Disposition", `attachment; filename="draft.eml"`);
  res.send(eml);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server http://localhost:${PORT} (provider=${PROVIDER})`));
