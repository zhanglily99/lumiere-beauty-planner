import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import handler from "../assistant-chat.js";

const currentDir = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = join(currentDir, "..", "..", ".env.local");
  const content = readFileSync(envPath, "utf-8");
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

type FakeReq = {
  method: string;
  body: unknown;
};

function createFakeRes() {
  let statusCode = 200;
  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      console.log(`[status ${statusCode}]`, JSON.stringify(payload, null, 2));
    },
  };
}

async function main() {
  const req: FakeReq = {
    method: "POST",
    body: {
      message: "我今天要户外运动，皮肤有点起痘，该带什么产品？",
      history: [],
      context: {
        skinState: "起痘较多",
        pace: "日常",
        period: "morning",
        today: "2026-07-28",
        itineraries: [
          { title: "周末爬山", kind: "运动", startTime: "09:00", endTime: "11:30", location: "近郊步道" },
        ],
        products: [
          {
            name: "柔润洁面慕斯",
            brand: "MELORA",
            category: "洁面",
            status: "使用中",
            stock: "约一半",
            tags: ["正常", "偏干"],
            avoidTags: [],
            daysToExpiry: 120,
          },
          {
            name: "轻盈防晒乳",
            brand: "SOLEIL",
            category: "防晒",
            status: "使用中",
            stock: "约一半",
            tags: ["正常", "偏干", "偏油"],
            avoidTags: [],
            daysToExpiry: 60,
          },
        ],
      },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await handler(req as any, createFakeRes() as any);
}

main().catch((error) => {
  console.error("local test failed:", error);
  process.exit(1);
});
