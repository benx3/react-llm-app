export async function streamToElement(url: string, body: any, onToken: (text: string) => void) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok || !resp.body) {
    const errText = await resp.text();
    throw new Error(errText || resp.statusText);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onToken(text);
  }
  onToken(text + decoder.decode());
}