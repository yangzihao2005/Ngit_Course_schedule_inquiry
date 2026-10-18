import { describe, expect, it } from "vitest";
import { CSV_HEADERS, exportCsv, toCsvRow } from "@/lib/csv";
import { makeCourseItem } from "@/lib/types";

const math = makeCourseItem({
  name: "高等数学",
  day: 1,
  periods: [1, 2],
  weeks: [1, 2, 3],
  place: "A406",
  teacher: "张老师",
  src: "jw",
});

const lab = makeCourseItem({
  name: "大学物理实验",
  day: 3,
  periods: [5, 6],
  weeks: [7],
  place: '教学楼"B座',
  teacher: "李老师",
  src: "img",
});

describe("toCsvRow", () => {
  it("输出八列：课程名/星期/节次/周次/地点/教师/类型/来源", () => {
    expect(toCsvRow(math)).toEqual([
      "高等数学",
      "周一",
      "1-2",
      "1-3",
      "A406",
      "张老师",
      "理论",
      "教务",
    ]);
    expect(toCsvRow(lab)[6]).toBe("实验");
    expect(toCsvRow(lab)[7]).toBe("图片");
  });

  it("指定周次过滤只输出该周", () => {
    expect(toCsvRow(math, [2])[3]).toBe("2");
    expect(toCsvRow(math, [9])[3]).toBe("");
  });
});

describe("exportCsv", () => {
  it("以 utf-8-sig BOM 开头", () => {
    expect(exportCsv([math]).charCodeAt(0)).toBe(0xfeff);
  });

  it("表头 + 数据行", () => {
    const csv = exportCsv([math]);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe([...CSV_HEADERS].join(","));
    expect(lines[1]).toBe("高等数学,周一,1-2,1-3,A406,张老师,理论,教务");
  });

  it("含逗号/引号/换行的字段加引号转义", () => {
    const tricky = makeCourseItem({
      name: '数据结构,进阶',
      day: 2,
      periods: [1, 2],
      weeks: [1],
      place: '教"室',
      teacher: "王\n老师",
      src: "jw",
    });
    const csv = exportCsv([tricky]);
    expect(csv).toContain('"数据结构,进阶"');
    expect(csv).toContain('"教""室"');
    expect(csv).toContain('"王\n老师"');
  });

  it("指定周次过滤", () => {
    const csv = exportCsv([math], [3]);
    expect(csv.slice(1)).toContain("高等数学,周一,1-2,3,A406,张老师,理论,教务");
  });
});
