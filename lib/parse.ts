/**
 * 宽容解析器：周次 / 节次 / 星期 / 学期周 / 类型推断。
 * 移植自 schedule-tool 的 kb/model.py。
 */
import {
  DAY_CN,
  LAB_KEYS,
  PRACTICE_KEYS,
  SEMESTER_START,
  type CourseKind,
} from "./constants";

const WEEKS_TOKEN = /^(\d+)\s*-\s*(\d+)\s*(单|双)?$/;
const DATE_TOKEN = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;

/** 星期别名表：周一/星期一/1 … 周日/星期日/7 */
const DAY_ALIASES: Record<string, number> = {};
for (const [d, name] of Object.entries(DAY_CN)) {
  const day = Number(d);
  DAY_ALIASES[name] = day;
  DAY_ALIASES[name.replace("周", "星期")] = day; // 星期一 ...
  DAY_ALIASES[String(day)] = day;
}
DAY_ALIASES["周天"] = 7;
DAY_ALIASES["星期天"] = 7;

/** 按课程名判断类型：上机/实验/实训→lab，实践/实习/设计→practice，其余 theory。 */
export function inferKind(name: string): CourseKind {
  const s = String(name || "");
  if (LAB_KEYS.some((k) => s.includes(k))) return "lab";
  if (PRACTICE_KEYS.some((k) => s.includes(k))) return "practice";
  return "theory";
}

/**
 * 把 "1-16周"、"3-16周(单)"、"1,3,5"、[7,11] 解析成周次数组。
 * 仅保留 1-30 周，返回升序去重结果。
 */
export function parseWeeks(text: unknown): number[] {
  let s: string;
  if (Array.isArray(text)) {
    s = text.map((x) => String(x)).join(",");
  } else if (text instanceof Set) {
    s = [...text].map((x) => String(x)).join(",");
  } else {
    s = String(text ?? "").trim();
  }
  s = s
    .replace(/第/g, "")
    .replace(/周/g, "")
    .replace(/\s/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "");

  const out = new Set<number>();
  for (const part of s.split(/[,，;；、]/)) {
    if (!part) continue;
    const m = WEEKS_TOKEN.exec(part);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      const flag = m[3];
      let start: number;
      let step: number;
      if (flag === "单") {
        start = a % 2 === 1 ? a : a + 1;
        step = 2;
      } else if (flag === "双") {
        start = a % 2 === 0 ? a : a + 1;
        step = 2;
      } else {
        start = a;
        step = 1;
      }
      for (let w = start; w <= b; w += step) out.add(w);
    } else if (/^\d+$/.test(part)) {
      out.add(parseInt(part, 10));
    }
  }
  return [...out].filter((w) => w >= 1 && w <= 30).sort((x, y) => x - y);
}

/**
 * 节次容错解析：[3,4] / "3-4" / "第3-4节" / "3" → [3,4]
 * 返回升序去重结果。
 */
export function parsePeriods(v: unknown): number[] {
  if (Array.isArray(v)) {
    return [...new Set(v.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))].sort(
      (a, b) => a - b,
    );
  }
  const s = String(v ?? "").replace(/节/g, "").replace(/第/g, "");
  const range = /(\d+)\s*[-–~]\s*(\d+)/.exec(s);
  if (range) {
    const a = parseInt(range[1], 10);
    const b = parseInt(range[2], 10);
    const out: number[] = [];
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i);
    return out;
  }
  const single = /(\d+)/.exec(s);
  return single ? [parseInt(single[1], 10)] : [];
}

/**
 * 星期容错解析：3 / "3" / "周三" / "星期三" → 3，解析失败返回 0。
 */
export function parseDay(v: unknown): number {
  if (typeof v === "number") {
    return Number.isInteger(v) && v >= 1 && v <= 7 ? v : 0;
  }
  const s = String(v ?? "").trim();
  if (s in DAY_ALIASES) return DAY_ALIASES[s];
  const m = /[周星]期?([一二三四五六日天])/.exec(s);
  if (m) {
    return m[1] === "天" ? 7 : ("一二三四五六日".indexOf(m[1]) % 7) + 1;
  }
  return /^\d+$/.test(s) ? parseDay(parseInt(s, 10)) : 0;
}

/**
 * 日期字符串 → 第几周。如 2026/10/12 → 7（学期第一周周一=2026-08-31）
 * 早于学期起点返回 0。
 */
export function weekOf(
  dateStr: unknown,
  semesterStart: string = SEMESTER_START,
): number {
  const m = DATE_TOKEN.exec(String(dateStr ?? ""));
  if (!m) return 0;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
  );
  const [y, mo, da] = semesterStart.split("-").map(Number);
  const start = new Date(y, mo - 1, da);
  const delta = Math.round((d.getTime() - start.getTime()) / 86400000);
  return delta >= 0 ? Math.floor(delta / 7) + 1 : 0;
}

/** 日期字符串 → 星期几（1-7），解析失败返回 0。 */
export function dayOfDate(dateStr: unknown): number {
  const m = DATE_TOKEN.exec(String(dateStr ?? ""));
  if (!m) return 0;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const iso = d.getDay(); // 0=周日
  return iso === 0 ? 7 : iso;
}

/**
 * 周次数组压缩成 "1-2,7-16" 这类可读串。
 */
export function formatWeeks(weeks: Iterable<number>): string {
  const ws = [...new Set([...weeks].map(Number))]
    .filter((w) => Number.isInteger(w))
    .sort((a, b) => a - b);
  if (!ws.length) return "";
  const parts: string[] = [];
  let i = 0;
  while (i < ws.length) {
    let j = i;
    while (j + 1 < ws.length && ws[j + 1] === ws[j] + 1) j++;
    parts.push(ws[i] === ws[j] ? String(ws[i]) : `${ws[i]}-${ws[j]}`);
    i = j + 1;
  }
  return parts.join(",");
}

/** 节次数组压缩成 "1-2" / "3-4,7-8" 这类可读串。 */
export function formatPeriods(periods: Iterable<number>): string {
  return formatWeeks(periods) || "";
}

/** 数组升序去重 */
export function uniqSorted(xs: Iterable<number>): number[] {
  return [...new Set(xs)].sort((a, b) => a - b);
}
