/**
 * 全局常量：作息表、学期起点、类型优先级。
 * 移植自 schedule-tool 的 kb/model.py。
 */

export const DAY_CN: Record<number, string> = {
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六",
  7: "周日",
};

/** 学期第一周的周一，换学期改这里 */
export const SEMESTER_START = "2026-08-31";

/** 南工程五大节：1-2 / 3-4 / 5-6 / 7-8 / 9-10 */
export const PERIOD_GROUPS: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [3, 4],
  [5, 6],
  [7, 8],
  [9, 10],
];

/** 每大节开始时间（按起始节号） */
export const SECTION_START: Record<number, string> = {
  1: "08:00",
  3: "10:10",
  5: "13:40",
  7: "15:40",
  9: "18:30",
};

/** 每大节结束时间（按结束节号） */
export const SECTION_END: Record<number, string> = {
  2: "09:40",
  4: "11:20",
  6: "15:20",
  8: "17:00",
  10: "20:10",
};

/** 课程名含这些词 → lab（实验/上机/实训） */
export const LAB_KEYS = ["上机", "实验", "实训"] as const;

/** 课程名含这些词 → practice（实践/实习/设计） */
export const PRACTICE_KEYS = [
  "实践",
  "实习",
  "课程设计",
  "毕业设计",
  "毕业",
  "军训",
] as const;

export type CourseKind = "theory" | "practice" | "lab";
export type CourseSrc = "jw" | "img" | "manual";

/** 覆盖优先级权重：lab > practice > theory */
export const KIND_RANK: Record<CourseKind, number> = {
  theory: 0,
  practice: 1,
  lab: 2,
};

/** 同类型冲突时：图片导入 > 教务。manual 的裁决权在 resolve.priority 里单独处理。 */
export const SRC_RANK: Record<CourseSrc, number> = {
  jw: 0,
  img: 1,
  manual: 2,
};

/** 人工校对层：高于一切教务 / 截图课程，不论 kind。 */
export const MANUAL_RANK = 100;

/** 取一段节次的开始/结束时间（HH:MM），未知节号回落到默认作息 */
export function sectionTimes(periods: readonly number[]): {
  start: string;
  end: string;
} {
  const lo = periods.length ? Math.min(...periods) : 1;
  const hi = periods.length ? Math.max(...periods) : 2;
  return {
    start: SECTION_START[lo] ?? "08:00",
    end: SECTION_END[hi] ?? "09:40",
  };
}
