import { NextResponse } from "next/server";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, NoOutputGeneratedError, Output } from "ai";
import { PARSE_PROMPT, extractRowsFallback, rowsToItems } from "@/lib/llm";
import { llmOutputSchema } from "@/lib/types";
import { normalizeItems } from "@/lib/normalize";
import { readSchedule, writeSchedule } from "@/lib/storage";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 前端已压缩到长边 ≤2000px，这里兜底
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "xiaomi/mimo-v2.5";

interface LlmConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

/**
 * POST /api/parse-image
 * multipart form-data: image + apiKey + baseURL? + model?
 * → 视觉 LLM 提取结构化行 → 宽容解析成 CourseItem(src:"img") → 追加进本地存储
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求体不是 multipart/form-data" }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少图片文件（字段名 image）" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: `不支持的文件类型：${file.type || "未知"}` }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "图片过大（超过 10MB），请先压缩或裁剪" }, { status: 400 });
  }

  const config: LlmConfig = {
    apiKey: String(form.get("apiKey") || "").trim(),
    baseURL: String(form.get("baseURL") || "").trim() || DEFAULT_BASE_URL,
    model: String(form.get("model") || "").trim() || DEFAULT_MODEL,
  };
  if (!config.apiKey) {
    return NextResponse.json({ error: "缺少 API Key（顶栏 LLM 配置里填写）" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  let rows: unknown[] = [];
  let rawText = "";
  try {
    const model = createOpenAICompatible({
      baseURL: config.baseURL,
      name: "schedule-llm",
      apiKey: config.apiKey,
    }).chatModel(config.model);

    const result = await generateText({
      model,
      system: "你只输出 JSON，不输出其他任何内容。",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PARSE_PROMPT },
            { type: "file", data: bytes, mediaType: file.type, filename: file.name },
          ],
        },
      ],
      output: Output.object({ schema: llmOutputSchema }),
      temperature: 0.1,
      maxOutputTokens: 4096,
    });

    rawText = result.text ?? "";
    rows = result.output?.items ?? [];
    if (!rows.length) rows = extractRowsFallback(rawText);
  } catch (err) {
    // 结构化输出失败（NoOutputGeneratedError 等）→ 从原文兜底提取 JSON
    rawText =
      typeof (err as { text?: unknown }).text === "string"
        ? ((err as { text: string }).text ?? "")
        : "";
    rows = extractRowsFallback(rawText);
    if (!rows.length) {
      const status = (err as { statusCode?: number }).statusCode;
      const responseBody = (err as { responseBody?: unknown }).responseBody;
      const upstream =
        typeof responseBody === "string"
          ? responseBody.slice(0, 300)
          : rawText.slice(0, 300);
      const keyHint = config.apiKey.slice(0, 6);
      const detail =
        `Base URL: ${config.baseURL} · 模型: ${config.model} · ` +
        `Key: ${keyHint}…(${config.apiKey.length} 位)` +
        (status ? ` · HTTP ${status}` : "") +
        (upstream ? ` · 上游返回: ${upstream}` : "");

      // OpenRouter 对「无法识别的 key」会返回 "Missing Authentication header"（文案有误导性）
      let hint = "";
      if (/missing authentication/i.test(String((err as Error).message ?? ""))) {
        if (/openrouter/i.test(config.baseURL) && !config.apiKey.startsWith("sk-or-")) {
          hint =
            "。疑似 key 与 Base URL 不匹配：OpenRouter 的 key 以 sk-or- 开头；" +
            "如果是小米 MiMo 平台的 key，请把 Base URL 改为 https://api.xiaomimimo.com/v1、模型改为 mimo-v2.5";
        } else if (/xiaomimimo/i.test(config.baseURL) && config.apiKey.startsWith("sk-or-")) {
          hint =
            "。疑似 key 与 Base URL 不匹配：这是 OpenRouter 的 key；" +
            "如用 OpenRouter，请把 Base URL 改为 https://openrouter.ai/api/v1、模型改为 xiaomi/mimo-v2.5";
        } else {
          hint = "。请核对 API Key 是否属于所填 Base URL 的平台";
        }
      }

      const message =
        err instanceof NoOutputGeneratedError
          ? "模型没有返回可用的 JSON 结构，请重试或换模型"
          : err instanceof Error
            ? `调用模型失败：${err.message}${hint}（${detail}）`
            : `调用模型失败（${detail}）`;
      return NextResponse.json({ error: message, raw: rawText.slice(0, 500) }, { status: 400 });
    }
  }

  const { items, dropped } = rowsToItems(rows, file.name);
  if (!items.length) {
    return NextResponse.json(
      {
        error: `模型返回了 ${rows.length} 行，但没有一条能解析成课程（丢弃 ${dropped} 行）`,
        raw: rawText.slice(0, 500),
      },
      { status: 400 },
    );
  }

  const schedule = await readSchedule();
  const next = await writeSchedule({
    ...schedule,
    img: normalizeItems([...schedule.img, ...items]),
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ schedule: next, items, dropped });
}
