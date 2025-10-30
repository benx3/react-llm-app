export function startSSE(
  url: string,
  params: Record<string, string>,
  onToken: (t: string) => void,
  onEnd?: () => void,
  onError?: (e: any) => void
) {
  // ghép query ?a=...&b=...
  const qs = new URLSearchParams(params).toString();
  const es = new EventSource(`${url}?${qs}`);

  let acc = "";

  es.onmessage = (e) => {
    if (e.data === "[END]") {
      es.close();
      onEnd?.();
      return;
    }
    // server đã escape \n thành \\n, trả lại newline thật để hiển thị đẹp
    acc += e.data.replace(/\\n/g, "\n");
    onToken(acc);
  };

  es.onerror = (err) => {
    es.close();
    onError?.(err);
  };

  // trả hàm đóng kết nối để bạn gọi khi cần
  return () => es.close();
}
