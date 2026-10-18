/**
 * 冲突合并：同一格（同天同节次）被更高优先级的课占用的周次，低优先级让位。
 * 移植自 schedule-tool 的 kb/model.py 的 resolve()。
 */
import { KIND_RANK, SRC_RANK, type CourseKind, type CourseSrc } from "./constants";
import { normalizeItems } from "./normalize";
import type { CourseItem } from "./types";
import { uniqSorted } from "./parse";

/** 覆盖优先级：实验 > 课程设计 > 理论；同类型时图片导入 > 教务。 */
export function priority(it: Pick<CourseItem, "kind" | "src">): number {
  return (KIND_RANK[it.kind as CourseKind] ?? 0) * 10 + (SRC_RANK[it.src as CourseSrc] ?? 0);
}

function minPeriod(it: CourseItem): number {
  return it.periods.length ? Math.min(...it.periods) : 0;
}

function overlaps(a: number[], b: number[]): boolean {
  return a.some((p) => b.includes(p));
}

/**
 * 合并课表：
 * - 只裁剪『严格更高』优先级的冲突；同优先级（如两门理论课重排）都保留显示。
 * - 例：理论 1-16 周 + 实验第 7 周同格 → 理论显示 1-6,8-16，第 7 周显示实验。
 * - 低优先级项周次被减空则整条删除。
 */
export function resolveSchedule(items: CourseItem[]): CourseItem[] {
  const ordered = normalizeItems(items).sort(
    (a, b) =>
      priority(b) - priority(a) ||
      a.day - b.day ||
      minPeriod(a) - minPeriod(b) ||
      a.name.localeCompare(b.name, "zh-CN"),
  );

  const visible: CourseItem[] = [];
  for (const it of ordered) {
    const remaining = new Set(it.weeks);
    for (const v of visible) {
      if (v.day === it.day && overlaps(v.periods, it.periods) && priority(v) > priority(it)) {
        for (const w of v.weeks) remaining.delete(w);
      }
    }
    if (remaining.size > 0) {
      const weeks = uniqSorted(remaining);
      visible.push(weeks.length === it.weeks.length ? it : { ...it, weeks });
    }
  }

  return visible.sort(
    (a, b) => a.day - b.day || minPeriod(a) - minPeriod(b) || a.name.localeCompare(b.name, "zh-CN"),
  );
}

export interface MergeReport {
  merged: ResolvedItem[];
  /** 被裁剪的条目及让出的周次 */
  trimmed: Array<{ item: CourseItem; lostWeeks: number[] }>;
  /** 整条被吃掉的条目 */
  removed: CourseItem[];
}

/** 合并结果条目：被裁剪过的条目额外带上让出的周次（红笔删除线用） */
export type ResolvedItem = CourseItem & { lostWeeks?: number[] };

/**
 * 与 resolveSchedule 相同的合并规则，但额外返回裁剪细节，
 * 供合并过程可视化与「红笔」批注使用。
 */
export function resolveWithReport(items: CourseItem[]): MergeReport {
  const ordered = normalizeItems(items).sort(
    (a, b) =>
      priority(b) - priority(a) ||
      a.day - b.day ||
      minPeriod(a) - minPeriod(b) ||
      a.name.localeCompare(b.name, "zh-CN"),
  );

  const visible: ResolvedItem[] = [];
  const trimmed: MergeReport["trimmed"] = [];
  const removed: CourseItem[] = [];

  for (const it of ordered) {
    const remaining = new Set(it.weeks);
    for (const v of visible) {
      if (v.day === it.day && overlaps(v.periods, it.periods) && priority(v) > priority(it)) {
        for (const w of v.weeks) remaining.delete(w);
      }
    }
    const lost = it.weeks.filter((w) => !remaining.has(w));
    if (remaining.size > 0) {
      const weeks = uniqSorted(remaining);
      visible.push(lost.length ? { ...it, weeks, lostWeeks: lost } : it);
      if (lost.length) trimmed.push({ item: it, lostWeeks: lost });
    } else {
      removed.push(it);
    }
  }

  const merged = visible.sort(
    (a, b) => a.day - b.day || minPeriod(a) - minPeriod(b) || a.name.localeCompare(b.name, "zh-CN"),
  );
  return { merged, trimmed, removed };
}

/** 按指定周次过滤（导出用）：只保留含该周的课，weeks 收窄到该周。 */
export function filterByWeek(items: CourseItem[], week: number): CourseItem[] {
  return items
    .filter((it) => it.weeks.includes(week))
    .map((it) => ({ ...it, weeks: [week] }));
}
