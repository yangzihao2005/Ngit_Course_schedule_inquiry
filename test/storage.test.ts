import { describe, expect, it } from "vitest";
import { normalizeScheduleData } from "@/lib/storage";

describe("normalizeScheduleData（旧版 JSON 兼容）", () => {
  it("缺少 manual / muted 时自动补空数组", () => {
    const out = normalizeScheduleData({
      jw: [{ name: "高数", day: 1, periods: [1, 2], weeks: [1], place: "", teacher: "", kind: "theory", src: "jw" }],
      img: [],
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(out.manual).toEqual([]);
    expect(out.muted).toEqual([]);
    expect(out.jw).toHaveLength(1);
    expect(out.updatedAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("非对象或脏数据不会抛错", () => {
    expect(normalizeScheduleData(null)).toEqual({
      jw: [],
      img: [],
      manual: [],
      muted: [],
      updatedAt: null,
    });
    expect(normalizeScheduleData("oops")).toEqual({
      jw: [],
      img: [],
      manual: [],
      muted: [],
      updatedAt: null,
    });
  });

  it("过滤缺 name/day/periods/weeks 的脏课程，并清洗数字", () => {
    const out = normalizeScheduleData({
      jw: [
        { name: "", day: 1, periods: [1], weeks: [1] },
        { name: "正常课", day: 1, periods: [2, 1, 1], weeks: [3, 2, 2] },
        { name: "脏节次", day: 1, periods: [], weeks: [1] },
        { name: "脏星期", day: 9, periods: [1], weeks: [1] },
      ],
    });
    expect(out.jw).toHaveLength(1);
    expect(out.jw[0].name).toBe("正常课");
    expect(out.jw[0].periods).toEqual([1, 2]);
    expect(out.jw[0].weeks).toEqual([2, 3]);
  });

  it("manual 数组内的 src 被强制为 manual，id/note 保留", () => {
    const out = normalizeScheduleData({
      manual: [
        {
          id: "m_1",
          note: "国庆补课",
          name: "补课",
          day: 6,
          periods: [1, 2],
          weeks: [8],
          place: "B204",
          teacher: "",
          kind: "theory",
          src: "jw",
        },
      ],
    });
    expect(out.manual[0].src).toBe("manual");
    expect(out.manual[0].id).toBe("m_1");
    expect(out.manual[0].note).toBe("国庆补课");
  });

  it("muted 缺必填字段被丢弃，合法项清洗周次与节次", () => {
    const out = normalizeScheduleData({
      muted: [
        { id: "mu1", name: "高数", day: 1, periods: [2, 1, 1], weeks: [8, 9, 9] },
        { id: "", name: "高数", day: 1, periods: [1], weeks: [8] },
        { id: "mu2", name: "高数", day: 8, periods: [1], weeks: [8] },
        { id: "mu3", name: "高数", day: 1, periods: [], weeks: [8] },
        { id: "mu4", name: "高数", day: 1, periods: [1], weeks: [] },
        { id: "mu5", name: "高数", day: 1, periods: [1], weeks: [8], reason: "出差" },
      ],
    });
    expect(out.muted).toHaveLength(2);
    expect(out.muted[0].periods).toEqual([1, 2]);
    expect(out.muted[0].weeks).toEqual([8, 9]);
    expect(out.muted[1].reason).toBe("出差");
  });
});
