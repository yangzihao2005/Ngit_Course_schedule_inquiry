import { describe, expect, it } from "vitest";
import { extractRowsFallback, rowsToItems } from "@/lib/llm";

describe("rowsToItems", () => {
  it("容错解析模型的自然格式", () => {
    const { items, dropped } = rowsToItems([
      {
        name: "软件需求工程",
        project: "HTML和CSS样式编程",
        kind: "lab",
        date: "2026/10/12",
        day: "周三",
        periods: "1-2",
        weeks: [7],
        place: "A406",
        teacher: "王老师",
      },
    ]);
    expect(dropped).toBe(0);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "软件需求工程",
      day: 3,
      periods: [1, 2],
      weeks: [7],
      place: "A406",
      teacher: "王老师",
      kind: "lab",
      src: "img",
      project: "HTML和CSS样式编程",
    });
  });

  it("没有周次列时按 date 算周次", () => {
    const { items } = rowsToItems([{ name: "上机课", day: 1, periods: [3, 4], weeks: [], date: "2026-10-12" }]);
    expect(items[0].weeks).toEqual([7]);
  });

  it("没有星期时按 date 算星期", () => {
    const { items } = rowsToItems([{ name: "实验课", day: 0, periods: [3, 4], weeks: [7], date: "2026-10-14" }]);
    expect(items[0].day).toBe(3); // 2026-10-14 是周三
  });

  it("img 来源不会产生 theory：无类型列时按 lab", () => {
    const { items } = rowsToItems([{ name: "看不清的课", day: 1, periods: [1, 2], weeks: [1], kind: "" }]);
    expect(items[0].kind).toBe("lab");
  });

  it("课程名含实验词时推断为 lab", () => {
    const { items } = rowsToItems([{ name: "大学物理实验", day: 1, periods: [1, 2], weeks: [1], kind: "theory" }]);
    expect(items[0].kind).toBe("lab");
  });

  it("丢弃缺关键字段的行并计数", () => {
    const { items, dropped } = rowsToItems([
      { name: "", day: 1, periods: [1, 2], weeks: [1] },
      { name: "缺节次", day: 1, periods: [], weeks: [1] },
      { name: "缺周次", day: 1, periods: [1, 2], weeks: [], date: "" },
      { name: "有效", day: 7, periods: [9, 10], weeks: [1] },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("有效");
    expect(dropped).toBe(3);
  });

  it("非法行结构（非对象）被忽略", () => {
    const { items } = rowsToItems([null, 42, "x", { name: "有效", day: 1, periods: [1], weeks: [1] }]);
    expect(items).toHaveLength(1);
  });
});

describe("extractRowsFallback", () => {
  it("提取 markdown 代码块里的数组", () => {
    const text = '```json\n[{"name":"A","day":1,"periods":[1],"weeks":[1]}]\n```';
    expect(extractRowsFallback(text)).toHaveLength(1);
  });

  it("提取 items 包装对象", () => {
    const text = '前缀 {"items":[{"name":"A"}]} 后缀';
    expect(extractRowsFallback(text)).toEqual([{ name: "A" }]);
  });

  it("没有 JSON 时返回空数组", () => {
    expect(extractRowsFallback("完全不是 JSON")).toEqual([]);
    expect(extractRowsFallback("")).toEqual([]);
  });

  it("截断/损坏的 JSON 不抛异常", () => {
    expect(extractRowsFallback('[{"name":"A"')).toEqual([]);
  });
});
