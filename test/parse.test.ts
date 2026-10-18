import { describe, expect, it } from "vitest";
import {
  dayOfDate,
  formatPeriods,
  formatWeeks,
  inferKind,
  parseDay,
  parsePeriods,
  parseWeeks,
  weekOf,
} from "@/lib/parse";

describe("parseWeeks", () => {
  it("解析整段周次 '1-16周'", () => {
    expect(parseWeeks("1-16周")).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it("解析单周 '3-16周(单)'", () => {
    expect(parseWeeks("3-16周(单)")).toEqual([3, 5, 7, 9, 11, 13, 15]);
  });

  it("解析双周 '2-16周(双)'", () => {
    expect(parseWeeks("2-16周(双)")).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
  });

  it("解析逗号列表 '1,3,5'", () => {
    expect(parseWeeks("1,3,5")).toEqual([1, 3, 5]);
  });

  it("解析多段混合 '1-2,7-16'", () => {
    expect(parseWeeks("1-2,7-16")).toEqual([1, 2, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it("接受数组输入 [7, 11]", () => {
    expect(parseWeeks([7, 11])).toEqual([7, 11]);
  });

  it("过滤非法周次（0、31）", () => {
    expect(parseWeeks("0-31")).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("空输入返回空数组", () => {
    expect(parseWeeks("")).toEqual([]);
    expect(parseWeeks(null)).toEqual([]);
    expect(parseWeeks("周")).toEqual([]);
  });
});

describe("parsePeriods", () => {
  it("'1-2' → [1,2]", () => {
    expect(parsePeriods("1-2")).toEqual([1, 2]);
  });

  it("'第3-4节' → [3,4]", () => {
    expect(parsePeriods("第3-4节")).toEqual([3, 4]);
  });

  it("'3' → [3]", () => {
    expect(parsePeriods("3")).toEqual([3]);
  });

  it("数组 [3,4] → [3,4]", () => {
    expect(parsePeriods([3, 4])).toEqual([3, 4]);
  });

  it("支持全角/波浪连接符", () => {
    expect(parsePeriods("5–6")).toEqual([5, 6]);
    expect(parsePeriods("7~8")).toEqual([7, 8]);
  });

  it("空输入返回空数组", () => {
    expect(parsePeriods("")).toEqual([]);
  });
});

describe("parseDay", () => {
  it("数字与数字串", () => {
    expect(parseDay(3)).toBe(3);
    expect(parseDay("3")).toBe(3);
  });

  it("中文别名", () => {
    expect(parseDay("周三")).toBe(3);
    expect(parseDay("星期三")).toBe(3);
    expect(parseDay("周日")).toBe(7);
    expect(parseDay("周天")).toBe(7);
    expect(parseDay("星期天")).toBe(7);
    expect(parseDay("周一")).toBe(1);
  });

  it("越界与非法输入返回 0", () => {
    expect(parseDay(0)).toBe(0);
    expect(parseDay(8)).toBe(0);
    expect(parseDay("abc")).toBe(0);
  });
});

describe("weekOf", () => {
  it("学期第一周周一 = 第 1 周", () => {
    expect(weekOf("2026-08-31")).toBe(1);
  });

  it("2026/10/12 → 第 7 周", () => {
    expect(weekOf("2026/10/12")).toBe(7);
    expect(weekOf("2026-10-16")).toBe(7); // 同周周五
  });

  it("周日后半段归属下一周起点之前仍是本周", () => {
    expect(weekOf("2026-10-18")).toBe(7); // 第 7 周周日
    expect(weekOf("2026-10-19")).toBe(8); // 第 8 周周一
  });

  it("早于学期起点返回 0", () => {
    expect(weekOf("2026-08-30")).toBe(0);
  });

  it("非法日期返回 0", () => {
    expect(weekOf("hello")).toBe(0);
    expect(weekOf("")).toBe(0);
  });

  it("自定义学期起点", () => {
    expect(weekOf("2027-03-08", "2027-03-01")).toBe(2);
  });
});

describe("dayOfDate", () => {
  it("2026-10-12 是周一 → 1", () => {
    expect(dayOfDate("2026-10-12")).toBe(1);
  });
  it("2026-10-18 是周日 → 7", () => {
    expect(dayOfDate("2026-10-18")).toBe(7);
  });
});

describe("inferKind", () => {
  it("上机/实验/实训 → lab", () => {
    expect(inferKind("软件工程上机")).toBe("lab");
    expect(inferKind("大学物理实验")).toBe("lab");
    expect(inferKind("嵌入式实训")).toBe("lab");
  });
  it("实践/课程设计 → practice", () => {
    expect(inferKind("软件需求工程课程设计")).toBe("practice");
    expect(inferKind("毕业设计")).toBe("practice");
    expect(inferKind("认识实习")).toBe("practice");
  });
  it("其余 → theory", () => {
    expect(inferKind("高等数学")).toBe("theory");
  });
});

describe("formatWeeks / formatPeriods", () => {
  it("压缩连续段", () => {
    expect(formatWeeks([1, 2, 3, 7])).toBe("1-3,7");
    expect(formatWeeks([5])).toBe("5");
    expect(formatWeeks([])).toBe("");
  });

  it("乱序输入会被排序去重", () => {
    expect(formatWeeks([7, 1, 2, 2])).toBe("1-2,7");
    expect(formatPeriods([2, 1])).toBe("1-2");
  });
});
