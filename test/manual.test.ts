import { describe, expect, it } from "vitest";
import {
  addManual,
  editCourse,
  linkedMuteId,
  manualChangeCount,
  muteCourse,
  removeManual,
  restoreMute,
  type CourseDraft,
  type ManualState,
} from "@/lib/manual";
import { makeCourseItem, type CourseItem } from "@/lib/types";

const FULL_TERM = Array.from({ length: 16 }, (_, i) => i + 1);

function jw(over: Partial<CourseItem> = {}): CourseItem {
  return makeCourseItem({
    name: "软件工程",
    day: 1,
    periods: [1, 2],
    weeks: FULL_TERM,
    place: "信息B201",
    teacher: "王老师",
    kind: "theory",
    src: "jw",
    ...over,
  });
}

function draft(over: Partial<CourseDraft> = {}): CourseDraft {
  return {
    name: "软件工程",
    day: 5,
    periods: [3, 4],
    weeks: [8],
    place: "B204",
    teacher: "王老师",
    kind: "theory",
    note: "临时换教室",
    ...over,
  };
}

function empty(): ManualState {
  return { manual: [], muted: [] };
}

describe("addManual", () => {
  it("生成 manual 条目并排序去重周次/节次", () => {
    const state = addManual(empty(), draft({ periods: [4, 3, 3], weeks: [9, 8, 8] }));
    expect(state.manual).toHaveLength(1);
    const item = state.manual[0];
    expect(item.src).toBe("manual");
    expect(item.id).toMatch(/^m_/);
    expect(item.periods).toEqual([3, 4]);
    expect(item.weeks).toEqual([8, 9]);
    expect(item.note).toBe("临时换教室");
    expect(state.muted).toEqual([]);
  });

  it("不修改原 state", () => {
    const base = empty();
    const next = addManual(base, draft());
    expect(base.manual).toHaveLength(0);
    expect(next.manual).toHaveLength(1);
  });
});

describe("editCourse — jw/img 单周调课", () => {
  it("写入单周 mute 与单周 manual，并用固定 id 关联", () => {
    const target = jw();
    const state = editCourse(empty(), target, { type: "week", week: 8 }, draft());

    expect(state.manual).toHaveLength(1);
    expect(state.muted).toHaveLength(1);

    const manual = state.manual[0];
    const mute = state.muted[0];
    expect(manual.weeks).toEqual([8]);
    expect(manual.day).toBe(5);
    expect(manual.periods).toEqual([3, 4]);
    expect(mute.id).toBe(linkedMuteId(manual.id!));
    expect(mute.weeks).toEqual([8]);
    expect(mute.day).toBe(1);
    expect(mute.periods).toEqual([1, 2]);
    expect(mute.name).toBe("软件工程");
  });

  it("整门修改：原课全部周次进入 mute，manual 使用新周次", () => {
    const target = jw({ weeks: [1, 2, 3] });
    const state = editCourse(
      empty(),
      target,
      { type: "all" },
      draft({ weeks: [1, 2, 3], day: 6 }),
    );

    expect(state.muted[0].weeks).toEqual([1, 2, 3]);
    expect(state.manual[0].weeks).toEqual([1, 2, 3]);
    expect(state.manual[0].day).toBe(6);
    expect(state.muted[0].id).toBe(linkedMuteId(state.manual[0].id!));
  });
});

describe("editCourse — manual 条目", () => {
  const existing: CourseItem = makeCourseItem({
    id: "m_existing",
    name: "补课",
    day: 1,
    periods: [1, 2],
    weeks: [1, 2, 3],
    place: "A101",
    teacher: "",
    kind: "theory",
    src: "manual",
  });

  it("整门修改原地更新，保留 id 且不产生 mute", () => {
    const state = editCourse(
      { manual: [existing], muted: [] },
      existing,
      { type: "all" },
      draft({ name: "补课（改）", weeks: [4, 5] }),
    );
    expect(state.manual).toHaveLength(1);
    expect(state.manual[0].id).toBe("m_existing");
    expect(state.manual[0].name).toBe("补课（改）");
    expect(state.manual[0].weeks).toEqual([4, 5]);
    expect(state.muted).toHaveLength(0);
  });

  it("单周修改拆分为原条目减周 + 新条目单周", () => {
    const state = editCourse(
      { manual: [existing], muted: [] },
      existing,
      { type: "week", week: 2 },
      draft({ day: 4, weeks: [2] }),
    );
    expect(state.manual).toHaveLength(2);
    const rest = state.manual.find((it) => it.id === "m_existing")!;
    const split = state.manual.find((it) => it.id !== "m_existing")!;
    expect(rest.weeks).toEqual([1, 3]);
    expect(split.weeks).toEqual([2]);
    expect(split.day).toBe(4);
    expect(state.muted).toHaveLength(0);
  });

  it("只有一周时单周修改等价于原地更新", () => {
    const single = { ...existing, weeks: [5] };
    const state = editCourse(
      { manual: [single], muted: [] },
      single,
      { type: "week", week: 5 },
      draft({ day: 3, periods: [5, 6], weeks: [5] }),
    );
    expect(state.manual).toHaveLength(1);
    expect(state.manual[0].id).toBe("m_existing");
    expect(state.manual[0].day).toBe(3);
    expect(state.manual[0].periods).toEqual([5, 6]);
  });
});

describe("muteCourse", () => {
  it("jw 单周停课写 muted，不生成 manual", () => {
    const state = muteCourse(empty(), jw(), { type: "week", week: 8 }, "老师出差");
    expect(state.manual).toHaveLength(0);
    expect(state.muted).toHaveLength(1);
    expect(state.muted[0].weeks).toEqual([8]);
    expect(state.muted[0].reason).toBe("老师出差");
  });

  it("jw 整门删除写全部周次", () => {
    const state = muteCourse(empty(), jw({ weeks: [1, 2, 3] }), { type: "all" });
    expect(state.muted[0].weeks).toEqual([1, 2, 3]);
  });

  it("重复停课同一周不产生重复记录", () => {
    const once = muteCourse(empty(), jw(), { type: "week", week: 8 });
    const twice = muteCourse(once, jw(), { type: "week", week: 8 });
    expect(twice.muted).toHaveLength(1);
  });

  it("manual 单周停课直接减周，manual 整门删除移除条目", () => {
    const manual = makeCourseItem({
      id: "m_x",
      name: "补课",
      day: 6,
      periods: [1, 2],
      weeks: [1, 2],
      place: "",
      teacher: "",
      kind: "theory",
      src: "manual",
    });
    const oneWeek = muteCourse({ manual: [manual], muted: [] }, manual, { type: "week", week: 1 });
    expect(oneWeek.manual[0].weeks).toEqual([2]);
    expect(oneWeek.muted).toHaveLength(0);

    const all = muteCourse({ manual: [manual], muted: [] }, manual, { type: "all" });
    expect(all.manual).toHaveLength(0);
    expect(all.muted).toHaveLength(0);
  });
});

describe("撤销", () => {
  it("移除调课生成的 manual 时一并删除关联 mute，恢复原课", () => {
    const moved = editCourse(empty(), jw(), { type: "week", week: 8 }, draft());
    const id = moved.manual[0].id!;
    const state = removeManual(moved, id);

    expect(state.manual).toHaveLength(0);
    expect(state.muted).toHaveLength(0);
  });

  it("只删除与该 manual 关联的 mute，不影响其他停课记录", () => {
    const moved = editCourse(empty(), jw(), { type: "week", week: 8 }, draft());
    const other = muteCourse(moved, jw({ name: "高数" }), { type: "week", week: 3 });
    const state = removeManual(other, moved.manual[0].id!);

    expect(state.manual).toHaveLength(0);
    expect(state.muted).toHaveLength(1);
    expect(state.muted[0].name).toBe("高数");
  });

  it("单独撤销 mute 也可恢复原课", () => {
    const stopped = muteCourse(empty(), jw(), { type: "week", week: 8 });
    const state = restoreMute(stopped, stopped.muted[0].id);
    expect(state.muted).toHaveLength(0);
  });
});

describe("manualChangeCount", () => {
  it("统计 manual 条目 + 停课记录", () => {
    const moved = editCourse(empty(), jw(), { type: "week", week: 8 }, draft());
    expect(manualChangeCount(moved)).toBe(2);
  });
});
