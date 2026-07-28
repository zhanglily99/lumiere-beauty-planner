const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_MODEL = "glm-5-2-260617";
const DEFAULT_TIMEOUT_MS = 58000;
const DEFAULT_MAX_TOKENS = 1400;

export type ChatTurn = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ArkChatResponse = {
  choices?: { message?: { content?: string } }[];
};

export async function callArkChat(
  messages: ChatTurn[],
  options?: { maxTokens?: number; timeoutMs?: number },
): Promise<string> {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) {
    throw new Error("ARK_API_KEY is not configured");
  }

  const baseUrl = process.env.ARK_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.ARK_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: 0.6,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`ARK API error ${response.status}: ${text.slice(0, 300)}`);
    }

    const data = (await response.json()) as ArkChatResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("ARK API returned an empty reply");
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}
