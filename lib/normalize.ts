/**
 * 课表数据规范化：把「同一门课每周一行」之类的碎片收拢成一条。
 *
 * 合并键：来源 + 课程名 + 星期 + 节次 + 类型 + 教室（归一化）。
 * 只在同 src 内部归并——manual / jw / img 之间的覆盖关系必须留给 resolve 处理，
 * 否则手动调课会在归一化阶段被提前混进教务课表、丢失让位报告。
 * 教室文本常有变体（"A406" / "信息楼A406" / "本部校区信息楼A406房间"），
 * 归一化取房间号；真正换了教室（A406 → B201）的课不会被合并。
 */
import { uniqSorted } from "./parse";
import type { CourseItem } from "./types";

/** 提取房间标识："信息楼A406房间" → "A406"；取不到就用原文 */
function roomKey(place: string): string {
  const s = String(place || "").trim();
  const m = /[A-Za-z]\s?\d{2,4}/.exec(s);
  return (m ? m[0].replace(/\s/g, "") : s).toUpperCase();
}

/** 取出现次数最多的非空值，平局取更长者 */
function majority(values: string[]): string {
  const count = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    count.set(v, (count.get(v) ?? 0) + 1);
  }
  const ranked = [...count.entries()].sort(
    (a, b) => b[1] - a[1] || b[0].length - a[0].length,
  );
  return ranked[0]?.[0] ?? "";
}

export function normalizeItems(items: CourseItem[]): CourseItem[] {
  const groups = new Map<string, CourseItem[]>();
  for (const it of items) {
    const key = [
      it.src,
      it.name,
      it.day,
      it.periods.join("-"),
      it.kind,
      roomKey(it.place),
    ].join("|");
    const bucket = groups.get(key);
    if (bucket) bucket.push(it);
    else groups.set(key, [it]);
  }

  const out: CourseItem[] = [];
  for (const bucket of groups.values()) {
    const first = bucket[0];
    if (bucket.length === 1) {
      out.push(first);
      continue;
    }
    out.push({
      ...first,
      weeks: uniqSorted(bucket.flatMap((it) => it.weeks)),
      place: majority(bucket.map((it) => it.place)),
      teacher: majority(bucket.map((it) => it.teacher)),
      project: bucket.map((it) => it.project).find((p) => p) ?? undefined,
      id: bucket.map((it) => it.id).find((id) => id) ?? undefined,
      note: bucket.map((it) => it.note).find((n) => n) ?? undefined,
    });
  }
  return out;
}
