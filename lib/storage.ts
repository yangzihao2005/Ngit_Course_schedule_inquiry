/**
 * 本地 JSON 存储：data/schedule.json（原子写入：tmp + rename）。
 * Cookie 与 API Key 绝不落盘，只存浏览器 localStorage。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { CourseItem } from "./types";

export interface ScheduleFile {
  jw: CourseItem[];
  img: CourseItem[];
  updatedAt: string | null;
}

const DATA_DIR = path.join(process.cwd(), "data");
const FILE_PATH = path.join(DATA_DIR, "schedule.json");

export function emptySchedule(): ScheduleFile {
  return { jw: [], img: [], updatedAt: null };
}

function sanitize(items: unknown): CourseItem[] {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (it): it is CourseItem =>
      !!it &&
      typeof it === "object" &&
      typeof (it as CourseItem).name === "string" &&
      typeof (it as CourseItem).day === "number" &&
      Array.isArray((it as CourseItem).periods) &&
      Array.isArray((it as CourseItem).weeks),
  );
}

export async function readSchedule(): Promise<ScheduleFile> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf-8");
    const data = JSON.parse(raw) as Partial<ScheduleFile>;
    return {
      jw: sanitize(data.jw),
      img: sanitize(data.img),
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    };
  } catch {
    return emptySchedule();
  }
}

/** 原子写入：先写 tmp 再 rename，避免中断留下半截 JSON。返回实际写入的内容。 */
export async function writeSchedule(data: ScheduleFile): Promise<ScheduleFile> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const payload: ScheduleFile = {
    jw: sanitize(data.jw),
    img: sanitize(data.img),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
  const tmp = `${FILE_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf-8");
  await fs.rename(tmp, FILE_PATH);
  return payload;
}

export async function resetSchedule(): Promise<ScheduleFile> {
  return writeSchedule(emptySchedule());
}
