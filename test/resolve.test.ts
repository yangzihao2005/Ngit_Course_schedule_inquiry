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

describe("filterByWeek", () => {
  it("只保留指定周并收窄 weeks", () => {
    const it1 = item({ name: "高等数学", day: 1, periods: [1, 2], weeks: [1, 2, 3] });
    expect(filterByWeek([it1], 2)).toEqual([{ ...it1, weeks: [2] }]);
    expect(filterByWeek([it1], 9)).toEqual([]);
  });
});
