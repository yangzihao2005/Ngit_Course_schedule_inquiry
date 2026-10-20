/**
 * 本地 JSON 存储：data/schedule.json（原子写入：tmp + rename）。
 * Cookie 与 API Key 绝不落盘，只存浏览器 localStorage。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { inferKind, uniqSorted } from "./parse";
import type { CourseItem, ManualMute } from "./types";
import type { CourseKind, CourseSrc } from "./constants";

export interface ScheduleFile {
  jw: CourseItem[];
  img: CourseItem[];
  /** 手动新增 / 调课生成的课程项（人工校对层，最高优先级） */
  manual: CourseItem[];
  /** 手动停课 / 剔除规则 */
  muted: ManualMute[];
  updatedAt: string | null;
}

const DATA_DIR = path.join(process.cwd(), "data");
const FILE_PATH = path.join(DATA_DIR, "schedule.json");

export function emptySchedule(): ScheduleFile {
  return { jw: [], img: [], manual: [], muted: [], updatedAt: null };
}

function asPositiveInts(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return uniqSorted(
    value
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0),
  );
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sanitizeKind(value: unknown, name: string): CourseKind {
  return value === "theory" || value === "practice" || value === "lab"
    ? value
    : inferKind(name);
}

/** 按数组所在位置强制来源，避免脏数据把 manual 混进 jw 或反过来。 */
function sanitizeCourses(value: unknown, src: CourseSrc): CourseItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): CourseItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const it = raw as Partial<CourseItem>;
    if (typeof it.name !== "string" || !it.name.trim()) return [];
    if (typeof it.day !== "number" || !Number.isInteger(it.day) || it.day < 1 || it.day > 7) {
      return [];
    }
    const periods = asPositiveInts(it.periods);
    const weeks = asPositiveInts(it.weeks);
    if (!periods.length || !weeks.length) return [];

    const item: CourseItem = {
      name: it.name.trim(),
      day: it.day,
      periods,
      weeks,
      place: asString(it.place),
      teacher: asString(it.teacher),
      kind: sanitizeKind(it.kind, it.name),
      src,
    };
    if (typeof it.id === "string" && it.id) item.id = it.id;
    if (typeof it.note === "string" && it.note) item.note = it.note;
    if (typeof it.project === "string" && it.project) item.project = it.project;
    return [item];
  });
}

export function sanitizeMutes(value: unknown): ManualMute[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): ManualMute[] => {
    if (!raw || typeof raw !== "object") return [];
    const it = raw as Partial<ManualMute>;
    if (typeof it.id !== "string" || !it.id) return [];
    if (typeof it.name !== "string" || !it.name.trim()) return [];
    if (typeof it.day !== "number" || !Number.isInteger(it.day) || it.day < 1 || it.day > 7) {
      return [];
    }
    const periods = asPositiveInts(it.periods);
    const weeks = asPositiveInts(it.weeks);
    if (!periods.length || !weeks.length) return [];

    const mute: ManualMute = {
      id: it.id,
      name: it.name.trim(),
      day: it.day,
      periods,
      weeks,
    };
    if (typeof it.reason === "string" && it.reason) mute.reason = it.reason;
    return [mute];
  });
}

/**
 * 统一清洗任意来源的课表数据（纯函数，便于单测）。
 * 旧版 JSON 只有 jw/img 时，manual/muted 自动补 []。
 */
export function normalizeScheduleData(raw: unknown): ScheduleFile {
  const data = (raw && typeof raw === "object" ? raw : {}) as Partial<ScheduleFile>;
  return {
    jw: sanitizeCourses(data.jw, "jw"),
    img: sanitizeCourses(data.img, "img"),
    manual: sanitizeCourses(data.manual, "manual"),
    muted: sanitizeMutes(data.muted),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
  };
}

export async function readSchedule(): Promise<ScheduleFile> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf-8");
    return normalizeScheduleData(JSON.parse(raw));
  } catch {
    return emptySchedule();
  }
}

/** 原子写入：先写 tmp 再 rename，避免中断留下半截 JSON。返回实际写入的内容。 */
export async function writeSchedule(data: ScheduleFile): Promise<ScheduleFile> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const payload = normalizeScheduleData({
    ...data,
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  });
  const tmp = `${FILE_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf-8");
  await fs.rename(tmp, FILE_PATH);
  return payload;
}

export async function resetSchedule(): Promise<ScheduleFile> {
  return writeSchedule(emptySchedule());
}
