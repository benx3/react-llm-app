import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { streamToElement } from "@/lib/stream";
import { startSSE } from "@/lib/sse";
export default function App() {
  const stopRef = useRef<null | (() => void)>(null);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState("");
  const [activeTab, setActiveTab] = useState<"text"|"vision"|"image"|"email">("text");
  
  // ✅ thêm hai state này
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState("");

  const [provider, setProvider] = useState("openai"); // mặc định
  const [model, setModel] = useState("gpt-4o-mini");
  const [text, setText] = useState("");
  const modelsFor = (p) => {
  if (p === "openai") return ["gpt-4o-mini", "gpt-4o"];
  if (p === "deepseek") return ["deepseek-chat", "deepseek-reasoner"];
  return ["llama3.2", "llama3.2-vision"]; // Ollama
};

const onProviderChange = (e) => {
  const p = e.target.value;
  setProvider(p);
  setModel(modelsFor(p)[0]);
};

const sendStream = (task) => {
  const text = inputRef.current?.value || "";
  if (!text.trim()) return;

  const qs = new URLSearchParams({
    provider,
    model,
    task,
    prompt: text,
  });

  const es = new EventSource(`http://localhost:3000/api/llm/sse?${qs}`);

  setStreaming(true);
  setOutput("");

  es.onmessage = (e) => {
    if (e.data === "[END]") { 
      es.close(); 
      setStreaming(false);
      return;
    }
    setOutput((prev) => prev + e.data.replace(/\\n/g, "\n"));
  };

  es.onerror = () => {
    es.close();
    setStreaming(false);
  };
};

const sendOnce = async (task) => {
  const text = inputRef.current?.value || "";
  if (!text.trim()) return;

  const r = await fetch("http://localhost:3000/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, model, task, text }),
  });
  const data = await r.json();
  setOutput(data.result || data.error || "");
};

  // Dark mode toggle (giữ nguyên)
  const [dark, setDark] = useState(
    typeof localStorage !== "undefined" &&
    (localStorage.getItem("theme") === "dark" ||
      (typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches))
  );
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", !!dark);
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("theme", dark ? "dark" : "light");
    }
  }, [dark]);

  // Shared input
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Vision
  const fileRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLImageElement>(null);

  // Image gen
  const [imgPrompt, setImgPrompt] = useState("");
  const [imgN, setImgN] = useState(1);
  const [imgSize, setImgSize] = useState("1024x1024");
  const [imgGrid, setImgGrid] = useState<string[]>([]);

  // Email
  const [emailTo, setEmailTo] = useState("");
  const [emailTone, setEmailTone] = useState("thân thiện");
  const [emailLen, setEmailLen] = useState("vừa");
  const [emailOut, setEmailOut] = useState<{subject?: string, body?: string}>({});

  const textTasks = [
    ["summarize", "Tóm tắt"],
    ["translate_fr", "Dịch sang tiếng Pháp"],
    ["explain_like_5", "Giải thích trẻ 5 tuổi"],
    ["extract_keywords", "Trích suất từ khóa"],
    ["generate_python", "Sinh Python code"],
  ] as const;

  // Actions
  async function runTask(task: string) {
    const text = inputRef.current?.value.trim() || "";
    if (!text) { setStatus("Hãy nhập văn bản trước."); return; }

    // nếu đang có stream trước đó thì dừng
    stopRef.current?.();

    setResult("");
    setStatus("Đang xử lý…");
    
    // gọi SSE backend: /api/llm/sse?task=...&text=...
    stopRef.current = startSSE(
      "/api/llm/sse",
      { task, text, provider, model },
      (acc) => setResult(acc),        // mỗi token ghép vào acc và hiển thị
      () => { setStatus("Done."); stopRef.current = null; },
      (err) => { setStatus("Lỗi stream"); console.error(err); stopRef.current = null; }
    );
  }
  
  function onFileChange() {
    const f = fileRef.current?.files?.[0];
    if (!f || !previewRef.current) return;
    const url = URL.createObjectURL(f);
    previewRef.current.src = url;
    previewRef.current.classList.remove("hidden");
  }

  async function runVision(task: string) {
    setStatus("Đang phân tích ảnh…"); setResult("");
    const form = new FormData();
    form.append("task", task);
    form.append("provider", provider);
    form.append("model", model);
    
    const url = urlRef.current?.value.trim() || "";
    const file = fileRef.current?.files?.[0];
    if (url) form.append("imageUrl", url);
    if (file) form.append("image", file);
    
    try {
      const r = await fetch("/api/vision", { method: "POST", body: form});
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);
      setResult(j.result || "(No content)"); setStatus("Done.");
    } catch (e: any) { setStatus(""); setResult("Error: " + e.message); }
  }

  async function genImage() {
    if (!imgPrompt.trim()) { setStatus("Nhập mô tả ảnh trước đã."); return; }
    setStatus("Đang tạo ảnh…"); setImgGrid([]);
    try {
      const r = await fetch("/api/imagegen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: imgPrompt, n: imgN, size: imgSize, provider, model }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);
      setImgGrid(j.images || []);
      setStatus("Done.");
    } catch (e: any) { setStatus(""); setResult("Error: " + e.message); }
  }

  async function draftEmail() {
    const ctx = inputRef.current?.value.trim() || "";
    if (!ctx) { setStatus("Nhập bối cảnh/nội dung email ở ô văn bản."); return; }
    const meta = `Người nhận: ${emailTo || "(chưa chỉ định)"}\nGiọng điệu: ${emailTone}\nĐộ dài: ${emailLen}`;
    setStatus("Đang soạn email…"); setResult(""); setEmailOut({});
    try {
      const r = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "draft_email", text: `Bối cảnh:\n${ctx}\n\nRàng buộc:\n${meta}`,provider, model }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);
      try {
        const parsed = JSON.parse(j.result);
        setEmailOut({ subject: parsed.subject, body: parsed.body });
      } catch {
        setEmailOut({ body: j.result });
      }
      setStatus("Done.");
    } catch (e: any) { setStatus(""); setResult("Error: " + e.message); }
  }

  async function copy(text?: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setStatus("Đã copy vào clipboard.");
  }

  async function downloadEml() {
    const { subject = "", body = "" } = emailOut;
    if (!subject && !body) return;
    const r = await fetch("/api/email/eml", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: emailTo, subject, body, provider, model }),
    });
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "draft.eml"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4 text-slate-900">
      <header className="flex justify-between items-center">
        <div className="flex flex-col items-start">
          <h1 className="text-2xl font-semibold">React LLM App</h1>
          <nav className="text-sm text-slate-600 dark:text-slate-300">
            2591302 Thanh-Binh Nguyen , 2591303 Dinh-Hiep Huynh, 2591322 Minh-Sang Tran, 2591311 Nguyen-Tuan-Kiet Le
          </nav>
           
        </div>
        <button
          onClick={() => setDark(!dark)}
          className="btn btn-ghost text-xl"
          title="Chuyển giao diện sáng/tối"
        >
          {dark ? "☀️" : "🌙"}
        </button>
      </header>

      {/* Ô nhập dùng chung */}
      <Card>
        <CardHeader><CardTitle>Nhập văn bản: </CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-2">
            <select value={provider} onChange={onProviderChange} className="select">
              <option value="openai">OpenAI</option>
              <option value="deepseek">DeepSeek</option>
              <option value="ollama">Ollama (local)</option>
            </select>

            <select value={model} onChange={(e)=>setModel(e.target.value)} className="select">
              {modelsFor(provider).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <textarea ref={inputRef} rows={8} className="textarea" placeholder="Dán nội dung ở đây nhaa..." />
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: "text", label: "Văn bản" },
          { id: "vision", label: "Thị giác" },
          { id: "image", label: "Tạo ảnh" },
          { id: "email", label: "Soạn email" },
        ]}
        value={activeTab}
        onChange={(id)=>setActiveTab(id as any)}
      />

      <TabPanel id="tab-text" active={activeTab==="text"}>
        <div className="flex flex-wrap gap-2">
          {textTasks.map(([id, label]) => (
            <Button key={id} onClick={() => runTask(id)}>{label}</Button>
          ))}
          <Button variant="primary" onClick={() => { stopRef.current?.(); stopRef.current=null; setStatus("Đã dừng"); }}> Dừng</Button>

        </div>
      </TabPanel>

      <TabPanel id="tab-vision" active={activeTab==="vision"}>
        <div className="space-y-3">
          <div className="flex gap-2 items-center">
            <input ref={fileRef} onChange={onFileChange} type="file" accept="image/*" className="text-sm" />
            <input ref={urlRef} placeholder="hoặc dán URL ảnh..." className="input flex-1" />
          </div>
          <img ref={previewRef} className="max-h-48 rounded-xl hidden" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => runVision("describe_image")}>Mô tả ảnh</Button>
            <Button onClick={() => runVision("extract_text_ocr")}>OCR</Button>
            <Button onClick={() => runVision("detect_objects")}>Đối tượng</Button>
            <Button onClick={() => runVision("write_alt_text")}>ALT text</Button>
          </div>
        </div>
      </TabPanel>

      <TabPanel id="tab-image" active={activeTab==="image"}>
        <div className="space-y-3">
          <textarea value={imgPrompt} onChange={e=>setImgPrompt(e.target.value)} rows={3} className="w-full p-3 input" placeholder="Ví dụ: 'tạo một chiếc xe oto màu hồng, nó đang chạy trên sông ...'" />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label>Ảnh: <select value={imgN} onChange={e=>setImgN(parseInt(e.target.value))} className="input"><option>1</option><option>2</option><option>3</option></select></label>
            <label>Kích thước: <select value={imgSize} onChange={e=>setImgSize(e.target.value)} className="input"><option value="512x512">512x512</option><option value="1024x1024">1024x1024</option></select></label>
            <Button onClick={genImage}>Tạo ảnh</Button>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            {imgGrid.map((src, i)=> (
              <a key={i} href={src} download={`image-${i+1}.png`} title="Nhấn để tải">
                <img src={src} className="w-full rounded-xl border" />
              </a>
            ))}
          </div>
        </div>
      </TabPanel>

      <TabPanel id="tab-email" active={activeTab==="email"}>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <input value={emailTo} onChange={e=>setEmailTo(e.target.value)} className="input" placeholder="Người nhận (tuỳ chọn)" />
            <select value={emailTone} onChange={e=>setEmailTone(e.target.value)} className="input">
              <option value="trang trọng">Trang trọng</option>
              <option value="thân thiện">Thân thiện</option>
              <option value="ngắn gọn">Ngắn gọn</option>
            </select>
            <select value={emailLen} onChange={e=>setEmailLen(e.target.value)} className="input">
              <option value="ngắn">Ngắn</option>
              <option value="vừa">Vừa</option>
              <option value="dài">Dài</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={draftEmail}>Soạn email</Button>
            <Button variant="ghost" onClick={() => copy(emailOut.subject)}>Copy subject</Button>
            <Button variant="ghost" onClick={() => copy(emailOut.body)}>Copy body</Button>
            <Button variant="ghost" onClick={downloadEml}>Tải .eml</Button>
          </div>
          <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl text-sm whitespace-pre-wrap">
            {emailOut.subject ? <><div className="font-semibold">Chủ đề: {emailOut.subject}</div><hr className="my-2"/></> : null}
            <div>{(emailOut.body || "").toString()}</div>
          </div>
        </div>
      </TabPanel>

      <div className="text-sm text-slate-500">{status}</div>
      <article className="whitespace-pre-wrap p-4 card min-h-[120px]">{result}</article>
    </div>
  );

  useEffect(() => {
  return () => {
    // unmount -> đóng SSE nếu còn mở
    stopRef.current?.();
  };
}, []);

}
