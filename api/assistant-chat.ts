import type { VercelRequest, VercelResponse } from "@vercel/node";
import { retrieveKnowledge } from "./_lib/retrieval.js";
import { callArkChat, type ChatTurn } from "./_lib/ark.js";

type ProductContext = {
  name: string;
  brand: string;
  category: string;
  status: string;
  stock: string;
  tags: string[];
  avoidTags: string[];
  daysToExpiry: number;
};

type ItineraryContext = {
  title: string;
  kind: string;
  startTime: string;
  endTime: string;
  location: string;
};

type RequestBody = {
  message?: string;
  history?: { role: "user" | "assistant"; text: string }[];
  context?: {
    skinState?: string;
    pace?: string;
    period?: string;
    today?: string;
    itineraries?: ItineraryContext[];
    products?: ProductContext[];
  };
};

const SYSTEM_PROMPT = `你是"露露"，LUMIÈRE 美妆日程管理应用里的贴身护肤助手。
你的风格温柔、简洁、专业，每次回答尽量控制在3到5句以内，不使用夸张的营销话术。
你会收到两部分补充信息："相关护肤知识"（来自平台维护的知识库）和"用户当前数据"（来自用户自己在应用里录入的产品、行程、肤感等真实数据）。回答时请遵守：
1. 只引用"用户当前数据"里真实存在的产品、行程或方案，不要虚构用户没有的信息；
2. 如果"相关护肤知识"里没有直接相关的内容，可以给出常识性的、保守的建议，但不要编造具体成分功效或医学结论；
3. 如果用户描述的皮肤问题比较严重（例如持续泛红、剧烈刺痛、皮肤破损、反复严重的痘痘），建议咨询专业皮肤科医生，而不是自行给出治疗方案；
4. 不需要提及"知识库""知识1"这类内部说法，自然地把结论融入回答即可；
5. 保持轻奢、温暖、克制的语气，像一个懂护肤又了解用户习惯的朋友。`;

function buildContextBlock(context: RequestBody["context"]) {
  const safeContext = context ?? {};

  const productLines =
    (safeContext.products ?? [])
      .slice(0, 20)
      .map((product) => {
        const tags = product.tags.length ? product.tags.join("、") : "无标签";
        const avoid = product.avoidTags.length ? product.avoidTags.join("、") : "无";
        return `- ${product.name}（${product.brand || "无品牌"} / ${product.category}）状态：${product.status}，库存：${product.stock}，适合：${tags}，避免：${avoid}，剩余约${product.daysToExpiry}天`;
      })
      .join("\n") || "（用户梳妆台暂无产品数据）";

  const itineraryLines =
    (safeContext.itineraries ?? [])
      .map(
        (item) =>
          `- ${item.startTime}-${item.endTime} ${item.title}（${item.kind}，${item.location || "地点待定"}）`,
      )
      .join("\n") || "（今天没有行程安排）";

  return [
    `今天日期：${safeContext.today ?? "未知"}`,
    `当前护理时段：${safeContext.period === "evening" ? "晚间" : "早间"}`,
    `当前肤感：${safeContext.skinState ?? "未选择"}`,
    `护理节奏：${safeContext.pace ?? "未选择"}`,
    `今天的行程：\n${itineraryLines}`,
    `用户梳妆台产品：\n${productLines}`,
  ].join("\n");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = (req.body ?? {}) as RequestBody;
  const message = (body.message ?? "").trim();

  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  try {
    const knowledge = retrieveKnowledge(message);
    const knowledgeBlock = knowledge.length
      ? knowledge
          .map((chunk, index) => `【知识${index + 1}：${chunk.title}】${chunk.content}`)
          .join("\n")
      : "（未检索到直接相关的知识条目）";

    const historyTurns: ChatTurn[] = (body.history ?? [])
      .slice(-6)
      .map((turn) => ({ role: turn.role, content: turn.text }));

    const messages: ChatTurn[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: `相关护肤知识：\n${knowledgeBlock}` },
      { role: "system", content: `用户当前数据：\n${buildContextBlock(body.context)}` },
      ...historyTurns,
      { role: "user", content: message },
    ];

    const reply = await callArkChat(messages);

    res.status(200).json({
      reply,
      usedKnowledge: knowledge.map((chunk) => chunk.title),
    });
  } catch (error) {
    console.error("assistant-chat error:", error);
    res.status(502).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
