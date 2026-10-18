import { NextResponse } from "next/server";
import { JwAuthError, syncFromJw } from "@/lib/jw";
import { readSchedule, writeSchedule } from "@/lib/storage";

interface SyncBody {
  cookie?: string;
  xnm?: number;
  xqm?: number;
}

/** POST /api/sync：Cookie + 学年学期 → 拉教务 kbList → 覆盖 src:"jw" */
export async function POST(req: Request) {
  let body: SyncBody;
  try {
    body = (await req.json()) as SyncBody;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const cookie = String(body.cookie || "").trim();
  if (!cookie) {
    return NextResponse.json({ error: "请先填写教务 Cookie" }, { status: 400 });
  }
  const xnm = Number(body.xnm) || 2026;
  const xqm = Number(body.xqm) || 3;

  try {
    const items = await syncFromJw(cookie, xnm, xqm);
    const schedule = await readSchedule();
    const next = await writeSchedule({
      ...schedule,
      jw: items,
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ schedule: next, count: items.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof JwAuthError ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
