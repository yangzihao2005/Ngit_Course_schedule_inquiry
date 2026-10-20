/**
 * 冲突合并：同一格（同天同节次）被更高优先级的课占用的周次，低优先级让位。
 * 移植自 schedule-tool 的 kb/model.py 的 resolve()，并加入人工校对层。
 *
 * 管线：normalize（同 src 内收拢碎片）→ 应用 muted（停课/剔除）→ 优先级让位。
 */
import {
  KIND_RANK,
  MANUAL_RANK,
  SRC_RANK,
  type CourseKind,
  type CourseSrc,
} from "./constants";
import { normalizeItems } from "./normalize";
import type { CourseItem, ManualMute } from "./types";
import { uniqSorted } from "./parse";

/**
 * 覆盖优先级：
 * - 人工校对层（src="manual"）永远最高，不论 kind；
 * - 其余维持 实验 > 课程设计 > 理论，同类型时图片导入 > 教务。
 */
export function priority(it: Pick<CourseItem, "kind" | "src">): number {
  if (it.src === "manual") return MANUAL_RANK;
  return (KIND_RANK[it.kind as CourseKind] ?? 0) * 10 + (SRC_RANK[it.src as CourseSrc] ?? 0);
}

function minPeriod(it: CourseItem): number {
  return it.periods.length ? Math.min(...it.periods) : 0;
}

function overlaps(a: number[], b: number[]): boolean {
  return a.some((p) => b.includes(p));
}

/** 某条 muted 规则真正剔掉的周次明细 */
export interface MuteCut {
  item: CourseItem;
  mute: ManualMute;
  lostWeeks: number[];
  /** 是否因此整条移出课表 */
  emptied: boolean;
}

function applyMutes(
  items: CourseItem[],
  muted: ManualMute[],
): { items: CourseItem[]; cuts: MuteCut[] } {
  if (!muted.length) return { items, cuts: [] };

  const cuts: MuteCut[] = [];
  const out: CourseItem[] = [];

  for (const item of items) {
    // 人工校对层不参与停课剔除（manual 自身就是最终裁决）
    if (item.src === "manual") {
      out.push(item);
      continue;
    }

    const local: MuteCut[] = [];
    const removed = new Set<number>();
    for (const mute of muted) {
      if (mute.name !== item.name || mute.day !== item.day) continue;
      if (!overlaps(mute.periods, item.periods)) continue;
      const hit = item.weeks.filter((w) => !removed.has(w) && mute.weeks.includes(w));
      if (!hit.length) continue;
      for (const w of hit) removed.add(w);
      local.push({ item, mute, lostWeeks: uniqSorted(hit), emptied: false });
    }

    if (!removed.size) {
      out.push(item);
      continue;
    }

    const remaining = item.weeks.filter((w) => !removed.has(w));
    if (!remaining.length) {
      for (const cut of local) cut.emptied = true;
      cuts.push(...local);
      continue;
    }

    cuts.push(...local);
    out.push(remaining.length === item.weeks.length ? item : { ...item, weeks: remaining });
  }

  return { items: out, cuts };
}

function sortByPriority(items: CourseItem[]): CourseItem[] {
  return [...items].sort(
    (a, b) =>
      priority(b) - priority(a) ||
      a.day - b.day ||
      minPeriod(a) - minPeriod(b) ||
      a.name.localeCompare(b.name, "zh-CN"),
  );
}

/**
 * 合并课表：
 * - 先按 muted 剔除指定周次（减空即删）。
 * - 只裁剪『严格更高』优先级的冲突；同优先级（如两门理论课重排）都保留显示。
 * - 例：理论 1-16 周 + 实验第 7 周同格 → 理论显示 1-6,8-16，第 7 周显示实验。
 * - 低优先级项周次被减空则整条删除。
 */
export function resolveSchedule(
  items: CourseItem[],
  muted: ManualMute[] = [],
): CourseItem[] {
  const { items: active } = applyMutes(normalizeItems(items), muted);
  const ordered = sortByPriority(active);

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
  trimmed: Array<{
    item: CourseItem;
    lostWeeks: number[];
    /** override：让位给更高优先级；mute：被手动停课/剔除 */
    cause: "override" | "mute";
  }>;
  /** 整条被高优先级吃掉的条目 */
  removed: CourseItem[];
  /** 手动停课规则命中的明细（含原因，供面板与红笔批注使用） */
  mutes: MuteCut[];
}

/** 合并结果条目：被裁剪过的条目额外带上让出的周次（红笔删除线用） */
export type ResolvedItem = CourseItem & { lostWeeks?: number[] };

/**
 * 与 resolveSchedule 相同的合并规则，但额外返回裁剪细节，
 * 供合并过程可视化与「红笔」批注使用。
 */
export function resolveWithReport(
  items: CourseItem[],
  muted: ManualMute[] = [],
): MergeReport {
  const mutedResult = applyMutes(normalizeItems(items), muted);
  const ordered = sortByPriority(mutedResult.items);

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
      if (lost.length) trimmed.push({ item: it, lostWeeks: lost, cause: "override" });
    } else {
      removed.push(it);
    }
  }

  // 停课剔除造成的部分裁剪也进报告（整条移除的由 mutes[].emptied 表达）
  for (const cut of mutedResult.cuts) {
    if (cut.emptied) continue;
    trimmed.push({ item: cut.item, lostWeeks: cut.lostWeeks, cause: "mute" });
  }

  const merged = visible.sort(
    (a, b) => a.day - b.day || minPeriod(a) - minPeriod(b) || a.name.localeCompare(b.name, "zh-CN"),
  );
  return { merged, trimmed, removed, mutes: mutedResult.cuts };
}

/** 按指定周次过滤（导出用）：只保留含该周的课，weeks 收窄到该周。 */
export function filterByWeek(items: CourseItem[], week: number): CourseItem[] {
  return items
    .filter((it) => it.weeks.includes(week))
    .map((it) => ({ ...it, weeks: [week] }));
}
