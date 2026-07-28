import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assistantChatHandler from "../api/assistant-chat.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.LOCAL_API_PORT ?? 8787);

function loadEnvLocal() {
  const envPath = join(currentDir, "..", ".env.local");
  let content: string;
  try {
    content = readFileSync(envPath, "utf-8");
  } catch {
    console.warn(`[local-api] 未找到 ${envPath}，请先复制 .env.example 为 .env.local 并填入 ARK_API_KEY`);
    return;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function createVercelStyleResponse(res: ServerResponse) {
  let statusCode = 200;
  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      const body = JSON.stringify(payload);
      res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(body);
    },
  };
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (!req.url?.startsWith("/api/assistant-chat")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  try {
    const rawBody = await readRequestBody(req);
    const parsedBody = rawBody ? JSON.parse(rawBody) : {};
    const fakeReq = { method: req.method, body: parsedBody } as never;
    const fakeRes = createVercelStyleResponse(res) as never;
    await assistantChatHandler(fakeReq, fakeRes);
  } catch (error) {
    console.error("[local-api] request failed:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "local dev server error" }));
  }
});

server.listen(PORT, () => {
  console.log(`[local-api] assistant-chat 本地调试服务已启动: http://localhost:${PORT}/api/assistant-chat`);
  console.log(`[local-api] 请确认 vite.pages.config.ts 已将 /api 代理到该端口`);
});
