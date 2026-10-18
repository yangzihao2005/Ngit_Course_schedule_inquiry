/**
 * 核心实体 CourseItem + 供 LLM 输出使用的宽松 Zod schema。
 */
import { z } from "zod";
import type { CourseKind, CourseSrc } from "./constants";
import { inferKind } from "./parse";

/** 一门课的一次开课：某星期几、某几节、哪些周。 */
export interface CourseItem {
  name: string;
  /** 1=周一 … 7=周日 */
  day: number;
  /** 节次集合，如 [1, 2]（升序去重） */
  periods: number[];
  /** 周次集合，如 [1, 2, 7]（升序去重） */
  weeks: number[];
  place: string;
  teacher: string;
  kind: CourseKind;
  src: CourseSrc;
  /** 图片解析附带的实验项目名等元数据 */
  project?: string;
}

export function makeCourseItem(
  partial: Omit<CourseItem, "kind" | "place" | "teacher"> &
    Partial<Pick<CourseItem, "kind" | "place" | "teacher">>,
): CourseItem {
  return {
    place: "",
    teacher: "",
    kind: partial.kind || inferKind(partial.name),
    ...partial,
  };
}

// ---------------------------------------------------------------
// LLM 输出 schema：字段全部可空、允许字符串或数字，之后走容错解析
// ---------------------------------------------------------------

/** 数字或数字串，如 3 / "3" */
export const looseNumber = z.union([z.number(), z.string()]);

/** 节次：[3,4] / "1-2" / 3 */
export const loosePeriods = z.union([
  z.array(looseNumber),
  z.string(),
  looseNumber,
]);

/** 周次：[7,11] / "3-16周(单)" / 7 */
export const looseWeeks = z.union([
  z.array(looseNumber),
  z.string(),
  looseNumber,
]);

/** 单行课表记录（模型输出，宽进严出） */
export const llmRowSchema = z
  .object({
    name: z.union([z.string(), z.null()]).optional(),
    project: z.union([z.string(), z.null()]).optional(),
    kind: z.union([z.string(), z.null()]).optional(),
    date: z.union([z.string(), z.null()]).optional(),
    day: z.union([looseNumber, z.null()]).optional(),
    weekday: z.union([looseNumber, z.null()]).optional(),
    periods: z.union([loosePeriods, z.null()]).optional(),
    weeks: z.union([looseWeeks, z.null()]).optional(),
    place: z.union([z.string(), z.null()]).optional(),
    teacher: z.union([z.string(), z.null()]).optional(),
  })
  .passthrough();

/** 模型应输出的顶层结构：课表行数组 */
export const llmRowsSchema = z.array(llmRowSchema);

export type LlmRow = z.infer<typeof llmRowSchema>;

/** 顶层对象包装（部分模型偏好 {items:[...]}） */
export const llmOutputSchema = z.object({
  items: llmRowsSchema,
});

/** 服务端解析结果 */
export interface ParseImageResult {
  items: CourseItem[];
  /** 被丢弃的无效行数 */
  dropped: number;
}
