/**
 * 导出 .csv：utf-8-sig（带 BOM），Excel 直接双击打开不乱码。
 */
import { DAY_CN, type CourseKind, type CourseSrc } from "./constants";
import { formatPeriods, formatWeeks } from "./parse";
import type { CourseItem } from "./types";

export const CSV_HEADERS = [
  "课程名",
  "星期",
  "节次",
  "周次",
  "地点",
  "教师",
  "类型",
  "来源",
] as const;

const KIND_CN: Record<CourseKind, string> = {
  theory: "理论",
  lab: "实验",
  practice: "实践",
};

const SRC_CN: Record<CourseSrc, string> = {
  jw: "教务",
  img: "图片",
};

function escapeCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function toCsvRow(it: CourseItem, weeks?: number[]): string[] {
  const ws = weeks?.length ? it.weeks.filter((w) => weeks.includes(w)) : it.weeks;
  return [
    it.name,
    DAY_CN[it.day] ?? String(it.day),
    formatPeriods(it.periods),
    formatWeeks(ws),
    it.place,
    it.teacher,
    KIND_CN[it.kind] ?? it.kind,
    SRC_CN[it.src] ?? it.src,
  ];
}

/** 生成 CSV 文本（含 utf-8-sig BOM）。weeks 用于指定周次过滤。 */
export function exportCsv(items: CourseItem[], weeks?: number[]): string {
  const rows = [CSV_HEADERS as unknown as string[], ...items.map((it) => toCsvRow(it, weeks))];
  const body = rows.map((r) => r.map(escapeCell).join(",")).join("\r\n") + "\r\n";
  return "\uFEFF" + body;
}
