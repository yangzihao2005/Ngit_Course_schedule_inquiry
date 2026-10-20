import { describe, expect, it } from "vitest";
import { filterByWeek, priority, resolveSchedule, resolveWithReport } from "@/lib/resolve";
import { makeCourseItem, type CourseItem } from "@/lib/types";

function item(over: Partial<CourseItem> & Pick<CourseItem, "name" | "day" | "periods" | "weeks">) {
  return makeCourseItem({ src: "jw", place: "", teacher: "", ...over });
}

describe("priority", () => {
  it("lab > practice > theory；同类型 img > jw", () => {
    expect(priority({ kind: "lab", src: "jw" })).toBeGreaterThan(
      priority({ kind: "practice", src: "img" }),
    );
    expect(priority({ kind: "practice", src: "jw" })).toBeGreaterThan(
      priority({ kind: "theory", src: "img" }),
    );
    expect(priority({ kind: "theory", src: "img" })).toBeGreaterThan(
      priority({ kind: "theory", src: "jw" }),
    );
  });

  it("manual 最高：即使理论课也高于 img 实验课", () => {
    expect(priority({ kind: "theory", src: "manual" })).toBeGreaterThan(
      priority({ kind: "lab", src: "img" }),
    );
    expect(priority({ kind: "theory", src: "manual" })).toBeGreaterThan(
      priority({ kind: "lab", src: "jw" }),
    );
  });
});

describe("resolveSchedule", () => {
  it("实验课覆盖同格理论课的重叠周次，减空即删", () => {
    const theory = item({
      name: "软件工程",
      day: 1,
      periods: [3, 4],
      weeks: Array.from({ length: 16 }, (_, i) => i + 1),
    });
    const lab = item({
      name: "软件工程实验",
      day: 1,
      periods: [3, 4],
      weeks: [7],
      src: "img",
    });

    const merged = resolveSchedule([theory, lab]);
    expect(merged).toHaveLength(2);
    const t = merged.find((x) => x.name === "软件工程")!;
    const l = merged.find((x) => x.name === "软件工程实验")!;
    expect(t.weeks).toEqual([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(l.weeks).toEqual([7]);
  });

  it("理论课被完全覆盖时整条删除", () => {
    const theory = item({ name: "课设指导", day: 2, periods: [1, 2], weeks: [5] });
    const lab = item({
      name: "课设指导实验",
      day: 2,
      periods: [1, 2],
      weeks: [5],
      src: "img",
    });
    const merged = resolveSchedule([theory, lab]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("课设指导实验");
  });

  it("同优先级冲突都保留", () => {
    const a = item({ name: "高等数学", day: 1, periods: [1, 2], weeks: [1, 2] });
    const b = item({ name: "大学英语", day: 1, periods: [1, 2], weeks: [1, 2] });
    expect(resolveSchedule([a, b])).toHaveLength(2);
  });

  it("不同天或不同节次互不影响", () => {
    const theory = item({ name: "高等数学", day: 1, periods: [1, 2], weeks: [1] });
    const lab = item({
      name: "高等数学实验",
      day: 3,
      periods: [5, 6],
      weeks: [1],
      src: "img",
    });
    const merged = resolveSchedule([theory, lab]);
    expect(merged.map((x) => x.weeks)).toEqual([[1], [1]]);
  });

  it("节次部分重叠也按格裁剪", () => {
    const theory = item({ name: "理论课", day: 4, periods: [3, 4], weeks: [1, 2, 3] });
    const lab = item({ name: "实验课", day: 4, periods: [4, 5], weeks: [2], src: "img" });
    const merged = resolveSchedule([theory, lab]);
    expect(merged.find((x) => x.name === "理论课")!.weeks).toEqual([1, 3]);
  });

  it("结果按 星期/节次/名称 排序", () => {
    const merged = resolveSchedule([
      item({ name: "B", day: 2, periods: [1, 2], weeks: [1] }),
      item({ name: "A", day: 1, periods: [5, 6], weeks: [1] }),
    ]);
    expect(merged.map((x) => x.name)).toEqual(["A", "B"]);
  });

  it("不修改入参", () => {
    const theory = item({ name: "理论课", day: 1, periods: [1, 2], weeks: [1, 2] });
    const lab = item({ name: "实验课", day: 1, periods: [1, 2], weeks: [2], src: "img" });
    resolveSchedule([theory, lab]);
    expect(theory.weeks).toEqual([1, 2]);
  });
});

describe("resolveWithReport", () => {
  it("报告被裁剪的周次与整条删除项", () => {
    const theory = item({ name: "理论课", day: 1, periods: [1, 2], weeks: [1, 2, 3] });
    const gone = item({ name: "被吃掉", day: 1, periods: [1, 2], weeks: [1] });
    const lab = item({ name: "实验课", day: 1, periods: [1, 2], weeks: [1], src: "img" });

    const report = resolveWithReport([theory, gone, lab]);
    expect(report.merged).toHaveLength(2);
    expect(report.trimmed).toHaveLength(1);
    expect(report.trimmed[0].item.name).toBe("理论课");
    expect(report.trimmed[0].lostWeeks).toEqual([1]);
    expect(report.removed.map((x) => x.name)).toEqual(["被吃掉"]);
  });

  it("让位周次挂在裁剪后的条目上，不串到同名同格的其他条目", () => {
    const jwLab = item({
      name: "软件设计与体系结构",
      day: 1,
      periods: [5, 6],
      weeks: [7],
      kind: "lab",
    });
    const imgLab = item({
      name: "软件设计与体系结构",
      day: 1,
      periods: [5, 6],
      weeks: [7],
      kind: "lab",
      src: "img",
    });
    const theory = item({
      name: "软件设计与体系结构",
      day: 1,
      periods: [5, 6],
      weeks: [7, 8, 9],
      kind: "theory",
    });

    const report = resolveWithReport([jwLab, imgLab, theory]);
    const winner = report.merged.find((x) => x.src === "img")!;
    const loser = report.merged.find((x) => x.kind === "theory")!;
    // 赢家（图片实验课）不该带删除线
    expect(winner.lostWeeks).toBeUndefined();
    expect(winner.weeks).toEqual([7]);
    // 输家（理论课）让出 7 周，保留 8-9
    expect(loser.weeks).toEqual([8, 9]);
    expect(loser.lostWeeks).toEqual([7]);
  });
});

const FULL_TERM = Array.from({ length: 16 }, (_, i) => i + 1);

describe("manual 最高优先级", () => {
  it("manual 理论课覆盖同格 jw 的指定周次", () => {
    const jw = item({ name: "软件工程", day: 1, periods: [1, 2], weeks: FULL_TERM });
    const manual = item({
      name: "软件工程",
      day: 1,
      periods: [1, 2],
      weeks: [8],
      src: "manual",
    });

    const merged = resolveSchedule([jw, manual]);
    expect(merged).toHaveLength(2);
    expect(merged.find((x) => x.src === "jw")!.weeks).toEqual([
      1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    expect(merged.find((x) => x.src === "manual")!.weeks).toEqual([8]);
  });

  it("manual 理论课也覆盖 img 实验课", () => {
    const imgLab = item({
      name: "软件工程",
      day: 2,
      periods: [3, 4],
      weeks: FULL_TERM,
      kind: "lab",
      src: "img",
    });
    const manual = item({
      name: "临时补课",
      day: 2,
      periods: [3, 4],
      weeks: [5, 6],
      kind: "theory",
      src: "manual",
    });

    const merged = resolveSchedule([imgLab, manual]);
    expect(merged.find((x) => x.src === "img")!.weeks).not.toContain(5);
    expect(merged.find((x) => x.src === "img")!.weeks).not.toContain(6);
    expect(merged.find((x) => x.src === "manual")!.weeks).toEqual([5, 6]);
  });

  it("节次部分重叠也按周裁剪", () => {
    const jw = item({ name: "理论课", day: 4, periods: [3, 4], weeks: [1, 2, 3] });
    const manual = item({
      name: "调课",
      day: 4,
      periods: [4, 5],
      weeks: [2],
      src: "manual",
    });
    const merged = resolveSchedule([jw, manual]);
    expect(merged.find((x) => x.name === "理论课")!.weeks).toEqual([1, 3]);
  });
});

describe("muted 停课剔除", () => {
  it("单周停课：只剔除指定周并写入报告", () => {
    const jw = item({ name: "软件工程", day: 1, periods: [1, 2], weeks: FULL_TERM });
    const report = resolveWithReport(
      [jw],
      [{ id: "mu1", name: "软件工程", day: 1, periods: [1, 2], weeks: [8] }],
    );

    expect(report.merged).toHaveLength(1);
    expect(report.merged[0].weeks).toEqual([
      1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    expect(report.mutes).toHaveLength(1);
    expect(report.mutes[0].lostWeeks).toEqual([8]);
    expect(report.mutes[0].emptied).toBe(false);
    const trim = report.trimmed.find((t) => t.cause === "mute")!;
    expect(trim.lostWeeks).toEqual([8]);
  });

  it("全周停课：整条移除且不重复计入 removed", () => {
    const jw = item({ name: "软件工程", day: 1, periods: [1, 2], weeks: [1, 2, 3] });
    const report = resolveWithReport(
      [jw],
      [{ id: "mu2", name: "软件工程", day: 1, periods: [1, 2], weeks: [1, 2, 3] }],
    );

    expect(report.merged).toHaveLength(0);
    expect(report.removed).toHaveLength(0);
    expect(report.mutes).toHaveLength(1);
    expect(report.mutes[0].emptied).toBe(true);
  });

  it("按重叠节次匹配，而不是节次完全相等", () => {
    const jw = item({ name: "软件工程", day: 1, periods: [3, 4], weeks: [1, 2] });
    const hit = resolveSchedule(
      [jw],
      [{ id: "mu3", name: "软件工程", day: 1, periods: [4, 5], weeks: [1] }],
    );
    expect(hit[0].weeks).toEqual([2]);

    const miss = resolveSchedule(
      [jw],
      [{ id: "mu4", name: "软件工程", day: 1, periods: [5, 6], weeks: [1] }],
    );
    expect(miss[0].weeks).toEqual([1, 2]);
  });

  it("不影响 manual 课程", () => {
    const manual = item({
      name: "软件工程",
      day: 1,
      periods: [1, 2],
      weeks: [8],
      src: "manual",
    });
    const merged = resolveSchedule(
      [manual],
      [{ id: "mu5", name: "软件工程", day: 1, periods: [1, 2], weeks: [8] }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].weeks).toEqual([8]);
  });

  it("名称或星期不匹配时不停课", () => {
    const jw = item({ name: "软件工程", day: 1, periods: [1, 2], weeks: [1, 2] });
    const wrongName = resolveSchedule(
      [jw],
      [{ id: "mu6", name: "软件工程实验", day: 1, periods: [1, 2], weeks: [1] }],
    );
    expect(wrongName[0].weeks).toEqual([1, 2]);

    const wrongDay = resolveSchedule(
      [jw],
      [{ id: "mu7", name: "软件工程", day: 2, periods: [1, 2], weeks: [1] }],
    );
    expect(wrongDay[0].weeks).toEqual([1, 2]);
  });
});

describe("单周调课与重新同步", () => {
  const jw = item({ name: "软件工程", day: 1, periods: [1, 2], weeks: FULL_TERM });
  const muted = [{ id: "mute_m1", name: "软件工程", day: 1, periods: [1, 2], weeks: [8] }];
  const moved = item({
    name: "软件工程",
    day: 5,
    periods: [1, 2],
    weeks: [8],
    src: "manual",
  });

  it("第 8 周从周一移到周五，原课让出第 8 周", () => {
    const merged = resolveSchedule([jw, moved], muted);
    const original = merged.find((x) => x.src === "jw")!;
    expect(original.weeks).not.toContain(8);
    expect(original.weeks).toContain(7);
    expect(original.weeks).toContain(9);
    expect(merged.find((x) => x.src === "manual")!.day).toBe(5);
  });

  it("重新同步教务（再次传入同一 jw）后手动修改仍生效", () => {
    const first = resolveSchedule([jw, moved], muted);
    const again = resolveSchedule([{ ...jw, weeks: [...FULL_TERM] }, moved], muted);
    expect(again).toEqual(first);
  });
});

describe("filterByWeek", () => {
  it("只保留指定周并收窄 weeks", () => {
    const it1 = item({ name: "高等数学", day: 1, periods: [1, 2], weeks: [1, 2, 3] });
    expect(filterByWeek([it1], 2)).toEqual([{ ...it1, weeks: [2] }]);
    expect(filterByWeek([it1], 9)).toEqual([]);
  });
});
