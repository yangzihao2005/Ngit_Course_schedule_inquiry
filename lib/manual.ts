/**
 * 手动调课的纯函数操作层。
 *
 * 设计要点：
 * - 不破坏 jw/img 原始数据：单周/整门修改通过 muted 规则让原课让位；
 * - manual 条目拥有最高优先级（见 lib/resolve.ts）；
 * - 单周/整门调课生成的 mute id 固定为 `mute_<manualId>`，
 *   撤销该 manual 条目时能精准恢复原课对应的周次。
 */
import type { CourseKind } from "./constants";
import { uniqSorted } from "./parse";
import { makeCourseItem, type CourseItem, type ManualMute } from "./types";

export interface ManualState {
  manual: CourseItem[];
  muted: ManualMute[];
}

/** 表单提交的课程草稿（periods / weeks 已由 parsePeriods / parseWeeks 解析） */
export interface CourseDraft {
  name: string;
  day: number;
  periods: number[];
  weeks: number[];
  place?: string;
  teacher?: string;
  kind?: CourseKind;
  note?: string;
}

/** 编辑作用范围：仅当前周，或整门课全部周次 */
export type EditScope = { type: "week"; week: number } | { type: "all" };

function randomToken(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newManualId(): string {
  return `m_${randomToken()}`;
}

/** 调课条目与原始课停课记录的固定关联 id */
export function linkedMuteId(manualId: string): string {
  return `mute_${manualId}`;
}

export function newMuteId(): string {
  return `mute_${randomToken()}`;
}

function withNote(item: CourseItem, note?: string): CourseItem {
  const trimmed = note?.trim();
  if (!trimmed) return item;
  return { ...item, note: trimmed };
}

function buildManual(
  draft: CourseDraft,
  weeks: number[],
  id = newManualId(),
): CourseItem {
  const partial: Parameters<typeof makeCourseItem>[0] = {
    id,
    name: draft.name.trim(),
    day: draft.day,
    periods: uniqSorted(draft.periods),
    weeks: uniqSorted(weeks),
    place: draft.place?.trim() ?? "",
    teacher: draft.teacher?.trim() ?? "",
    src: "manual",
  };
  if (draft.kind) partial.kind = draft.kind;
  return withNote(makeCourseItem(partial), draft.note);
}

function buildMute(
  target: CourseItem,
  weeks: number[],
  id: string,
  reason?: string,
): ManualMute {
  const mute: ManualMute = {
    id,
    name: target.name,
    day: target.day,
    periods: uniqSorted(target.periods),
    weeks: uniqSorted(weeks),
  };
  const trimmed = reason?.trim();
  if (trimmed) mute.reason = trimmed;
  return mute;
}

function sourceWeeks(target: CourseItem, scope: EditScope): number[] {
  return scope.type === "week" ? [scope.week] : [...target.weeks];
}

function replaceManual(
  state: ManualState,
  target: CourseItem,
  draft: CourseDraft,
  weeks: number[],
): ManualState {
  const manual = state.manual.map((it) =>
    it.id === target.id
      ? buildManual(draft, weeks, it.id ?? target.id ?? newManualId())
      : it,
  );
  return { ...state, manual };
}

/**
 * 手动新增课程 / 补课。
 */
export function addManual(state: ManualState, draft: CourseDraft): ManualState {
  return {
    ...state,
    manual: [...state.manual, buildManual(draft, draft.weeks)],
  };
}

/**
 * 修改已有课程。
 *
 * - manual 条目：整门直接原地更新；单周则拆分（原条目减周 + 新条目单周）。
 * - jw/img 条目：生成 `mute_<manualId>` 让原课让位，再生成 manual 条目。
 */
export function editCourse(
  state: ManualState,
  target: CourseItem,
  scope: EditScope,
  draft: CourseDraft,
): ManualState {
  if (target.src === "manual") {
    if (scope.type === "all" || target.weeks.length <= 1) {
      return replaceManual(state, target, draft, scope.type === "week" ? [scope.week] : draft.weeks);
    }

    const week = scope.week;
    if (!target.weeks.includes(week)) return addManual(state, { ...draft, weeks: [week] });

    const manual = state.manual.flatMap((it): CourseItem[] => {
      if (it.id !== target.id) return [it];
      const rest = it.weeks.filter((w) => w !== week);
      const split = buildManual(draft, [week]);
      return rest.length ? [{ ...it, weeks: rest }, split] : [split];
    });
    return { ...state, manual };
  }

  // jw / img：用最高优先级的 manual 覆盖，并把原课对应周次写入 muted
  const manualId = newManualId();
  const next = buildManual(
    draft,
    scope.type === "week" ? [scope.week] : draft.weeks.length ? draft.weeks : target.weeks,
    manualId,
  );
  const mute = buildMute(
    target,
    sourceWeeks(target, scope),
    linkedMuteId(manualId),
    draft.note || (scope.type === "week" ? `第 ${scope.week} 周调课` : "整门修改"),
  );
  return { manual: [...state.manual, next], muted: [...state.muted, mute] };
}

/**
 * 停课 / 删除。
 *
 * - jw/img：写入 muted 规则；
 * - manual：直接减周，减空即删除（manual 不参与 mute 匹配）。
 */
export function muteCourse(
  state: ManualState,
  target: CourseItem,
  scope: EditScope,
  reason?: string,
): ManualState {
  const weeks = uniqSorted(sourceWeeks(target, scope));
  if (!weeks.length) return state;

  if (target.src === "manual") {
    const manual = state.manual.flatMap((it): CourseItem[] => {
      if (it.id !== target.id) return [it];
      const rest = it.weeks.filter((w) => !weeks.includes(w));
      return rest.length ? [{ ...it, weeks: rest }] : [];
    });
    return { ...state, manual };
  }

  const duplicated = state.muted.some(
    (m) =>
      m.name === target.name &&
      m.day === target.day &&
      m.periods.join("-") === uniqSorted(target.periods).join("-") &&
      weeks.every((w) => m.weeks.includes(w)),
  );
  if (duplicated) return state;

  return {
    ...state,
    muted: [...state.muted, buildMute(target, weeks, newMuteId(), reason)],
  };
}

/**
 * 移除一条手动条目；若它是调课生成的，同时删除关联 mute 以恢复原课。
 */
export function removeManual(state: ManualState, manualId: string): ManualState {
  const linked = linkedMuteId(manualId);
  return {
    manual: state.manual.filter((it) => it.id !== manualId),
    muted: state.muted.filter((m) => m.id !== linked),
  };
}

/** 撤销一条停课记录（原课对应周次自动恢复显示） */
export function restoreMute(state: ManualState, muteId: string): ManualState {
  return { ...state, muted: state.muted.filter((m) => m.id !== muteId) };
}

export function clearManual(): ManualState {
  return { manual: [], muted: [] };
}

/** 面板计数：手动条目 + 停课记录 */
export function manualChangeCount(state: ManualState): number {
  return state.manual.length + state.muted.length;
}

/** 从已有课程生成表单草稿 */
export function toDraft(item: CourseItem): CourseDraft {
  return {
    name: item.name,
    day: item.day,
    periods: [...item.periods],
    weeks: [...item.weeks],
    place: item.place,
    teacher: item.teacher,
    kind: item.kind,
    note: item.note ?? "",
  };
}
