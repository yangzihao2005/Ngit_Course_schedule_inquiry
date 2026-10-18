/**
 * 图片解析：实验课表截图行 → CourseItem（宽容解析 + 校验）。
 * 移植自 schedule-tool 的 kb/vlm.py 的 rows_to_items()。
 */
import { llmRowsSchema, makeCourseItem, type CourseItem, type LlmRow } from "./types";
import type { CourseKind } from "./constants";
import { dayOfDate, inferKind, parseDay, parsePeriods, parseWeeks, uniqSorted, weekOf } from "./parse";

/** 视觉模型提示词（与 Python 版一致，输出结构改为 {"items":[...]} 以便结构化输出） */
export const PARSE_PROMPT = `你是课表截图解析器。图片是学校的【实验/上机/课程设计课表】截图。
表格列因系统而异，可能包含：日期、周次、星期、节次、地点/教室、班级、教师、课程、实验项目名、类型 等。
注意：有的表没有"周次"列（只有日期），有的没有"类型"列，都正常。

提取每一行课，输出 JSON 对象 {"items":[...]}（只输出 JSON，不要解释、不要 markdown 代码块），items 数组每个元素：
- name: 课程名（如 "软件需求工程"、"软件设计与体系结构"；不要把实验项目名当课程名）
- project: 实验项目名（如 "HTML和CSS样式编程"；没有则空字符串）
- kind: "lab"（实验/上机/实训）或 "practice"（课程设计）；没有类型列时填 "lab"
- date: 该行的日期原文（如 "2026/10/12"、"2026-10-13"；没有日期列则空字符串）
- day: 星期几。可写数字 1-7（周一=1），也可照抄 "周一"、"星期三"；只有日期时留 0
- periods: 节次。可写 [3,4] 或照抄原文 "1-2"、"7-8"
- weeks: 周次数组。有"周次"列就读数字（如 7 → [7]）；**没有周次列就留空数组 []**（会按 date 计算）
- place: 地点/教室，照抄原文（如 "A406"、"信息楼A216"）
- teacher: 教师姓名（可空字符串）

同一门课的每个周次一行就输出一个元素。看不清的字段留空，不要编造。`;

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

/**
 * 模型返回的原始行 → CourseItem（容错解析 + 校验，逐行丢弃无效项）。
 */
export function rowsToItems(rawRows: unknown, sourceName = ""): { items: CourseItem[]; dropped: number } {
  const rows: LlmRow[] = [];
  if (Array.isArray(rawRows)) {
    for (const r of rawRows) {
      const parsed = llmRowsSchema.safeParse([r]);
      if (parsed.success) rows.push(parsed.data[0]);
    }
  }

  const items: CourseItem[] = [];
  let dropped = 0;
  for (const d of rows) {
    const name = str(d.name);
    let day = parseDay(d.day) || parseDay(d.weekday);
    const periods = parsePeriods(d.periods ?? []);
    let weeks = uniqSorted(parseWeeks(d.weeks ?? []));

    if (!weeks.length) {
      // 没有周次列 → 用日期算（2026/10/12 → 第 7 周）
      const w = weekOf(str(d.date));
      weeks = w ? [w] : [];
    }
    if (!day) {
      // 星期也没有 → 从日期算
      day = dayOfDate(str(d.date));
    }
    if (!name || day < 1 || day > 7 || !periods.length || !weeks.length) {
      dropped += 1;
      continue;
    }

    const inferred = inferKind(name);
    const modelKind = str(d.kind).toLowerCase();
    let kind: CourseKind = inferred !== "theory" ? inferred : "lab";
    if (inferred === "theory" && (modelKind === "lab" || modelKind === "practice")) {
      kind = modelKind;
    }

    items.push(
      makeCourseItem({
        name,
        day,
        periods,
        weeks,
        place: str(d.place),
        teacher: str(d.teacher),
        kind,
        src: "img",
        project: str(d.project) || undefined,
      }),
    );
    void sourceName;
  }
  return { items, dropped };
}

/**
 * 结构化输出失败时的兜底：从模型原文里提取 JSON 数组/对象再解析。
 */
export function extractRowsFallback(text: string): unknown[] {
  const cleaned = (text || "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const arrayMatch = /\[[\s\S]*\]/.exec(cleaned);
  const objMatch = /\{[\s\S]*\}/.exec(cleaned);
  for (const m of [arrayMatch, objMatch]) {
    if (!m) continue;
    try {
      const data = JSON.parse(m[0]) as unknown;
      if (Array.isArray(data)) return data;
      if (data && typeof data === "object") {
        const items = (data as { items?: unknown }).items;
        if (Array.isArray(items)) return items;
      }
    } catch {
      // 继续尝试下一个候选
    }
  }
  return [];
}
