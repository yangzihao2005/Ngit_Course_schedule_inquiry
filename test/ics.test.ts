import { describe, expect, it } from "vitest";
import { countIcsEvents, dateOfWeekDay, exportIcs, foldLine } from "@/lib/ics";
import { makeCourseItem } from "@/lib/types";

const math = makeCourseItem({
  name: "高等数学",
  day: 1, // 周一
  periods: [1, 2],
  weeks: [1, 2],
  place: "A406",
  teacher: "张老师",
  src: "jw",
});

const lab = makeCourseItem({
  name: "大学物理实验",
  day: 3, // 周三
  periods: [5, 6],
  weeks: [7],
  place: "信息楼A216",
  teacher: "李老师",
  src: "img",
});

describe("dateOfWeekDay", () => {
  it("第 1 周周一 = 2026-08-31", () => {
    const d = dateOfWeekDay("2026-08-31", 1, 1);
    expect(d.toISOString().slice(0, 10)).toBe("2026-08-31");
  });

  it("跨月映射：第 7 周周一 = 2026-10-12", () => {
    const d = dateOfWeekDay("2026-08-31", 7, 1);
    expect(d.toISOString().slice(0, 10)).toBe("2026-10-12");
  });

  it("周日 = 同周第 7 天", () => {
    const d = dateOfWeekDay("2026-08-31", 1, 7);
    expect(d.toISOString().slice(0, 10)).toBe("2026-09-06");
  });
});

describe("exportIcs", () => {
  it("按周展开事件，日期与作息时间正确", () => {
    const ics = exportIcs([math, lab], { semesterStart: "2026-08-31" });

    // 高等数学：第 1 周周一 08:00-09:40
    expect(ics).toContain("DTSTART:20260831T080000");
    expect(ics).toContain("DTEND:20260831T094000");
    // 第 2 周周一
    expect(ics).toContain("DTSTART:20260907T080000");
    // 实验：第 7 周周三 13:40-15:20
    expect(ics).toContain("DTSTART:20261014T134000");
    expect(ics).toContain("DTEND:20261014T152000");
    expect(ics).toContain("SUMMARY:高等数学");
    expect(ics).toContain("LOCATION:A406");
    expect(ics).toContain("LOCATION:信息楼A216");
  });

  it("floating local time：不带时区后缀", () => {
    const ics = exportIcs([math], { semesterStart: "2026-08-31" });
    expect(ics).not.toMatch(/DTSTART:[^\r\n]*Z/);
  });

  it("支持单双周（周次集合本身已过滤）", () => {
    const odd = makeCourseItem({
      name: "单周课",
      day: 2,
      periods: [1, 2],
      weeks: [1, 3, 5],
      src: "jw",
    });
    const ics = exportIcs([odd], { semesterStart: "2026-08-31" });
    expect(ics).toContain("DTSTART:20260901T080000"); // 第 1 周周二
    expect(ics).toContain("DTSTART:20260915T080000"); // 第 3 周周二
    expect(ics).toContain("DTSTART:20260929T080000"); // 第 5 周周二
    expect(ics).not.toContain("DTSTART:20260908T080000"); // 第 2 周不导出
  });

  it("指定周次过滤：只导出该周事件", () => {
    const ics = exportIcs([math], { semesterStart: "2026-08-31", weeks: [2] });
    expect(ics).toContain("DTSTART:20260907T080000");
    expect(ics).not.toContain("DTSTART:20260831T080000");
    expect(countIcsEvents([math], [2])).toBe(1);
    expect(countIcsEvents([math])).toBe(2);
  });

  it("跨月与年末边界：第 10 周周一 = 2026-11-02", () => {
    const late = makeCourseItem({
      name: "学期后期课",
      day: 1,
      periods: [1, 2],
      weeks: [10],
      src: "jw",
    });
    const ics = exportIcs([late], { semesterStart: "2026-08-31", weeks: [10] });
    expect(ics).toContain("DTSTART:20261102T080000");
  });

  it("结构合法：VCALENDAR 包裹且事件成对", () => {
    const ics = exportIcs([math], { semesterStart: "2026-08-31" });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(2);
    expect((ics.match(/END:VEVENT/g) || []).length).toBe(2);
  });
});

describe("foldLine", () => {
  it("短行不折叠", () => {
    expect(foldLine("SUMMARY:abc")).toBe("SUMMARY:abc");
  });

  it("长行按 75 字节折叠，续行以空格开头", () => {
    const line = "DESCRIPTION:" + "长".repeat(100);
    const folded = foldLine(line);
    for (const part of folded.split("\r\n")) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded).toContain("\r\n ");
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("不切碎多字节字符", () => {
    const folded = foldLine("SUMMARY:" + "课".repeat(60));
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "课".repeat(60));
  });
});
