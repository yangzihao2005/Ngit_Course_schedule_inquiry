import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { inferKind, uniqSorted } from "@/lib/parse";
import { readSchedule, resetSchedule, writeSchedule } from "@/lib/storage";
import type { CourseItem, ManualMute } from "@/lib/types";

/** GET /api/schedule：读本地存储（旧文件缺 manual/muted 时自动补 []） */
export async function GET() {
  const schedule = await readSchedule();
  return NextResponse.json(schedule);
}

const manualCourseSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "课程名不能为空").max(120),
  day: z.number().int().min(1).max(7),
  periods: z.array(z.number().int().min(1).max(20)).min(1, "节次不能为空"),
  weeks: z.array(z.number().int().min(1).max(30)).min(1, "周次不能为空"),
  place: z.string().max(120).optional(),
  teacher: z.string().max(60).optional(),
  kind: z.enum(["theory", "practice", "lab"]).optional(),
  project: z.string().max(200).optional(),
  note: z.string().max(200).optional(),
});

const muteSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "停课课程名不能为空").max(120),
  day: z.number().int().min(1).max(7),
  periods: z.array(z.number().int().min(1).max(20)).min(1, "节次不能为空"),
  weeks: z.array(z.number().int().min(1).max(30)).min(1, "周次不能为空"),
  reason: z.string().max(200).optional(),
});

const patchSchema = z.object({
  manual: z.array(manualCourseSchema).optional(),
  muted: z.array(muteSchema).optional(),
});

function toCourseItem(raw: z.infer<typeof manualCourseSchema>): CourseItem {
  const item: CourseItem = {
    id: raw.id || `m_${randomUUID()}`,
    name: raw.name,
    day: raw.day,
    periods: uniqSorted(raw.periods),
    weeks: uniqSorted(raw.weeks),
    place: raw.place?.trim() ?? "",
    teacher: raw.teacher?.trim() ?? "",
    kind: raw.kind ?? inferKind(raw.name),
    src: "manual",
  };
  if (raw.project) item.project = raw.project;
  if (raw.note) item.note = raw.note;
  return item;
}

function toMute(raw: z.infer<typeof muteSchema>): ManualMute {
  const mute: ManualMute = {
    id: raw.id,
    name: raw.name,
    day: raw.day,
    periods: uniqSorted(raw.periods),
    weeks: uniqSorted(raw.weeks),
  };
  if (raw.reason) mute.reason = raw.reason;
  return mute;
}

/**
 * PATCH /api/schedule
 * body: { manual?: CourseItem[], muted?: ManualMute[] }（部分更新，原子写入）
 * → 返回最新完整课表
 */
export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.length ? `${issue.path.join(".")}：` : "";
    return NextResponse.json({ error: `手动修改校验失败，${path}${issue.message}` }, { status: 400 });
  }

  const current = await readSchedule();
  const next = await writeSchedule({
    ...current,
    manual: parsed.data.manual ? parsed.data.manual.map(toCourseItem) : current.manual,
    muted: parsed.data.muted ? parsed.data.muted.map(toMute) : current.muted,
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json(next);
}

/**
 * DELETE /api/schedule
 * - ?scope=manual：仅清空手动调课与停课记录，保留教务 / 截图数据；
 * - 不带参数：清空全部本地课表数据。
 */
export async function DELETE(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope");

  if (scope && scope !== "manual") {
    return NextResponse.json({ error: `不支持的 scope：${scope}` }, { status: 400 });
  }

  if (scope === "manual") {
    const current = await readSchedule();
    const next = await writeSchedule({
      ...current,
      manual: [],
      muted: [],
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json(next);
  }

  const schedule = await resetSchedule();
  return NextResponse.json(schedule);
}
