import { describe, expect, it } from "vitest";
import { normalizeItems } from "@/lib/normalize";
import { makeCourseItem, type CourseItem } from "@/lib/types";

function row(over: Partial<CourseItem> & Pick<CourseItem, "name" | "day" | "periods" | "weeks">) {
  return makeCourseItem({ place: "", teacher: "", src: "img", ...over });
}

describe("normalizeItems", () => {
  it("同一门课每周一行收拢成一条，周次取并集", () => {
    const rows = [7, 8, 9, 10].map((w) =>
      row({
        name: "软件设计与体系结构",
        day: 2,
        periods: [1, 2],
        weeks: [w],
        place: "信息楼A406",
        teacher: "郑翔天",
        kind: "lab",
      }),
    );
    const out = normalizeItems(rows);
    expect(out).toHaveLength(1);
    expect(out[0].weeks).toEqual([7, 8, 9, 10]);
    expect(out[0].src).toBe("img");
    expect(out[0].place).toBe("信息楼A406");
    expect(out[0].teacher).toBe("郑翔天");
  });

  it("教室写法变体合并为一条，显示多数写法", () => {
    const out = normalizeItems([
      row({ name: "课", day: 1, periods: [1, 2], weeks: [7], place: "信息楼A406", kind: "lab" }),
      row({ name: "课", day: 1, periods: [1, 2], weeks: [8], place: "信息楼A406", kind: "lab" }),
      row({ name: "课", day: 1, periods: [1, 2], weeks: [9], place: "A406", kind: "lab" }),
      row({
        name: "课",
        day: 1,
        periods: [1, 2],
        weeks: [10],
        place: "本部校区信息楼A406房间",
        kind: "lab",
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].weeks).toEqual([7, 8, 9, 10]);
    expect(out[0].place).toBe("信息楼A406");
  });

  it("真正换教室的课不合并", () => {
    const out = normalizeItems([
      row({ name: "课", day: 1, periods: [1, 2], weeks: [7], place: "A406", kind: "lab" }),
      row({ name: "课", day: 1, periods: [1, 2], weeks: [8], place: "B201", kind: "lab" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("不同类型的课不合并（理论课与实验课并存）", () => {
    const out = normalizeItems([
      row({ name: "课", day: 1, periods: [1, 2], weeks: [7], place: "A406", kind: "theory", src: "jw" }),
      row({ name: "课", day: 1, periods: [1, 2], weeks: [7], place: "A406", kind: "lab", src: "img" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("跨来源不合并：jw 与 img 同型同教室也各自保留", () => {
    const out = normalizeItems([
      row({ name: "课", day: 3, periods: [3, 4], weeks: [1], place: "A406", teacher: "", kind: "lab", src: "jw" }),
      row({ name: "课", day: 3, periods: [3, 4], weeks: [2], place: "A406", teacher: "李老师", kind: "lab", src: "img" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((it) => it.src).sort()).toEqual(["img", "jw"]);
  });

  it("同来源内仍归并，教师名缺失时取非空", () => {
    const out = normalizeItems([
      row({ name: "课", day: 3, periods: [3, 4], weeks: [1], place: "A406", teacher: "", kind: "lab", src: "img" }),
      row({ name: "课", day: 3, periods: [3, 4], weeks: [2], place: "信息楼A406", teacher: "李老师", kind: "lab", src: "img" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].teacher).toBe("李老师");
    expect(out[0].src).toBe("img");
    expect(out[0].weeks).toEqual([1, 2]);
  });

  it("归并时保留首个 id 与非空 note", () => {
    const out = normalizeItems([
      row({ name: "课", day: 1, periods: [1, 2], weeks: [1], place: "A406", kind: "lab", src: "manual", id: "m_1" }),
      row({ name: "课", day: 1, periods: [1, 2], weeks: [2], place: "A406", kind: "lab", src: "manual", note: "补课" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("m_1");
    expect(out[0].note).toBe("补课");
  });

  it("无重复时原样返回", () => {
    const rows = [
      row({ name: "A", day: 1, periods: [1, 2], weeks: [1] }),
      row({ name: "B", day: 2, periods: [3, 4], weeks: [2] }),
    ];
    expect(normalizeItems(rows)).toHaveLength(2);
  });
});
