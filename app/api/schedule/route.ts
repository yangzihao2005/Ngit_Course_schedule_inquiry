import { NextResponse } from "next/server";
import { readSchedule, resetSchedule } from "@/lib/storage";

/** GET /api/schedule：读本地存储 */
export async function GET() {
  const schedule = await readSchedule();
  return NextResponse.json(schedule);
}

/** DELETE /api/schedule：重置 */
export async function DELETE() {
  const schedule = await resetSchedule();
  return NextResponse.json(schedule);
}
