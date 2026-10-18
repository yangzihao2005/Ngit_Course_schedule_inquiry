/**
 * 导出 .ics：按周展开成日历事件（手机日历/Outlook 可导入）。
 * 时间用 floating local time（不带 Z），规避时区换算问题。
 */
import { SEMESTER_START, sectionTimes } from "./constants";
import type { CourseItem } from "./types";
import { DAY_CN } from "./constants";

export interface IcsOptions {
  semesterStart?: string;
  calName?: string;
  /** 只导出这些周（缺省导出全部周） */
  weeks?: number[];
}

const encoder = new TextEncoder();

/** RFC 5545 行折叠：每行不超过 75 字节，续行以单个空格开头。 */
export function foldLine(line: string): string {
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;

  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = encoder.encode(ch).length;
    if (currentBytes + b > limit) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
      limit = 74; // 续行前导空格占 1 字节
    }
    current += ch;
    currentBytes += b;
  }
  if (current) chunks.push(current);
  return chunks.join("\r\n ");
}

function parseStartDate(semesterStart: string): Date {
  const [y, m, d] = semesterStart.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function fmtDateTime(d: Date, hhmm: string): string {
  const [h, mi] = hhmm.split(":").map(Number);
  const hh = String(h).padStart(2, "0");
  const mm = String(mi).padStart(2, "0");
  return `${fmtDate(d)}T${hh}${mm}00`;
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** 某周某星期几的具体日期（学期第一周周一 = semesterStart） */
export function dateOfWeekDay(semesterStart: string, week: number, day: number): Date {
  const start = parseStartDate(semesterStart);
  return new Date(start.getTime() + ((week - 1) * 7 + (day - 1)) * 86400000);
}

/** 生成 ICS 文本。返回日历内容，事件数通过 countEvents 统计。 */
export function exportIcs(items: CourseItem[], opts: IcsOptions = {}): string {
  const semesterStart = opts.semesterStart ?? SEMESTER_START;
  const calName = opts.calName ?? "我的课表";
  const weekFilter = opts.weeks?.length ? new Set(opts.weeks) : null;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ai-schedule-sync//course//CN",
    "CALSCALE:GREGORIAN",
    foldLine(`X-WR-CALNAME:${escapeText(calName)}`),
  ];

  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

  let count = 0;
  for (const it of items) {
    const { start: tStart, end: tEnd } = sectionTimes(it.periods);
    const weeks = it.weeks
      .filter((w) => !weekFilter || weekFilter.has(w))
      .sort((a, b) => a - b);
    for (const week of weeks) {
      const day = dateOfWeekDay(semesterStart, week, it.day);
      const desc =
        [it.project, it.teacher, it.place].filter(Boolean).join(" ").trim() || it.name;
      count += 1;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${count}-${it.day}-${tStart.replace(":", "")}-${week}@ai-schedule-sync`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${fmtDateTime(day, tStart)}`,
        `DTEND:${fmtDateTime(day, tEnd)}`,
        foldLine(`SUMMARY:${escapeText(it.name)}`),
        foldLine(`DESCRIPTION:${escapeText(desc)}`),
        foldLine(`LOCATION:${escapeText(it.place || "")}`),
        foldLine(`CATEGORIES:${escapeText(it.kind === "lab" ? "实验" : it.kind === "practice" ? "实践" : "理论")}`),
        "END:VEVENT",
      );
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** 统计导出的事件数（全部周或指定周） */
export function countIcsEvents(items: CourseItem[], weeks?: number[]): number {
  const weekFilter = weeks?.length ? new Set(weeks) : null;
  return items.reduce(
    (n, it) => n + it.weeks.filter((w) => !weekFilter || weekFilter.has(w)).length,
    0,
  );
}

export { DAY_CN };
