"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  DAY_CN,
  PERIOD_GROUPS,
  SEMESTER_START,
  sectionTimes,
  type CourseKind,
} from "@/lib/constants";
import { dateOfWeekDay } from "@/lib/ics";
import { dayOfDate, formatWeeks, weekOf } from "@/lib/parse";
import { priority, resolveWithReport } from "@/lib/resolve";
import type { CourseItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_CN: Record<CourseKind, string> = {
  theory: "理论",
  lab: "实验",
  practice: "实践",
};

function fmtMD(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function fmtShort(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function todayString(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/** 日期不订阅外部变化，空订阅即可 */
const emptySubscribe = () => () => {};

export interface ScheduleGridProps {
  jw: CourseItem[];
  img: CourseItem[];
}

export function ScheduleGrid({ jw, img }: ScheduleGridProps) {
  const report = useMemo(() => resolveWithReport([...jw, ...img]), [jw, img]);
  const merged = report.merged;

  const maxWeek = useMemo(
    () => Math.max(20, merged.reduce((n, it) => Math.max(n, ...it.weeks), 0)),
    [merged],
  );
  const courseWeeks = useMemo(
    () => new Set(merged.flatMap((it) => it.weeks)),
    [merged],
  );

  /* 「今天」只在客户端取值（服务端返回空串），避免预渲染期取当前时间 */
  const today = useSyncExternalStore(emptySubscribe, todayString, () => "");
  const todayWeek = today ? weekOf(today) : 0;
  const todayDay = today ? dayOfDate(today) : 0;

  const fallbackWeek: number | "all" =
    todayWeek >= 1 && todayWeek <= maxWeek
      ? todayWeek
      : (merged.flatMap((it) => it.weeks).sort((a, b) => a - b)[0] ?? 1);

  const [selected, setSelected] = useState<number | "all" | null>(null);
  const week = selected ?? fallbackWeek;

  /* 每格的红笔批注：谁在第几周让位给谁 */
  const cellNotes = useMemo(() => {
    const map = new Map<string, { weeks: Set<number>; notes: string[] }>();
    const losers = [
      ...report.trimmed.map((t) => ({ item: t.item, lost: t.lostWeeks })),
      ...report.removed.map((it) => ({ item: it, lost: it.weeks })),
    ];
    for (const { item, lost } of losers) {
      PERIOD_GROUPS.forEach(([lo, hi], gi) => {
        if (!item.periods.some((p) => p >= lo && p <= hi)) return;
        const key = `${item.day}-${gi}`;
        const entry = map.get(key) ?? { weeks: new Set<number>(), notes: [] };
        for (const w of lost) entry.weeks.add(w);
        const winner = merged.find(
          (m) =>
            m.name !== item.name &&
            m.day === item.day &&
            m.periods.some((p) => p >= lo && p <= hi) &&
            priority(m) > priority(item) &&
            lost.some((w) => m.weeks.includes(w)),
        );
        entry.notes.push(
          `第 ${formatWeeks(lost)} 周：${item.name}${winner ? ` 让位给 ${winner.name}` : " 已调整"}`,
        );
        map.set(key, entry);
      });
    }
    return map;
  }, [report, merged]);

  const rangeText =
    week === "all"
      ? `学期第 1–${maxWeek} 周`
      : `${fmtMD(dateOfWeekDay(SEMESTER_START, week, 1))} – ${fmtMD(dateOfWeekDay(SEMESTER_START, week, 7))}`;

  const todayNote =
    todayWeek >= 1 && todayWeek <= maxWeek
      ? `今天是第 ${todayWeek} 周，${DAY_CN[todayDay]}`
      : `学期第 1 周从 ${SEMESTER_START} 开始`;

  return (
    <section className="settle settle-2">
      {/* ── 周尺：本周是第几周，一眼看到 ── */}
      <div className="sheet px-5 py-5 lg:px-6">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="flex items-end gap-4">
            {week === "all" ? (
              <div className="font-display text-[40px] font-semibold leading-none tracking-tight">
                全学期
              </div>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[16px] text-muted">第</span>
                <span className="font-display tnum text-[64px] font-semibold leading-[0.78]">
                  {week}
                </span>
                <span className="font-display text-[16px] text-muted">周</span>
              </div>
            )}
            <div className="pb-1">
              <div className="tnum text-[13px] leading-5">{rangeText}</div>
              <div className="label-quiet">{todayNote}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={week === "all" ? "default" : "outline"}
              onClick={() => setSelected("all")}
            >
              全部周次
            </Button>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => setSelected(todayWeek >= 1 ? todayWeek : 1)}
            >
              回到本周
            </Button>
          </div>
        </div>

        {/* 学期刻度：每格一周，红格是今天所在周；窄屏横向滚动保持刻度可读 */}
        <div className="mt-5 overflow-x-auto pb-1">
          <div
            className="flex min-w-[560px] items-end gap-[3px]"
            role="group"
            aria-label="学期周次刻度"
          >
          {Array.from({ length: maxWeek }, (_, i) => i + 1).map((w) => {
            const isNow = w === todayWeek;
            const isSel = week === w;
            const has = courseWeeks.has(w);
            return (
              <button
                key={w}
                type="button"
                onClick={() => setSelected(w)}
                aria-pressed={isSel}
                aria-label={`第 ${w} 周`}
                className="group flex flex-1 flex-col items-center gap-1.5 focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "block w-full transition-colors",
                    isNow && "h-6 bg-vermilion",
                    !isNow && isSel && "h-5 bg-ink",
                    !isNow && !isSel && has && "h-3 bg-ink/40 group-hover:bg-ink/70 group-focus-visible:bg-ink/70",
                    !isNow && !isSel && !has && "h-1.5 bg-rule group-hover:bg-ink/35 group-focus-visible:bg-ink/35",
                  )}
                />
                <span
                  className={cn(
                    "tnum text-[10px] leading-none",
                    isNow && "font-semibold text-vermilion",
                    !isNow && isSel && "font-semibold text-ink",
                    !isNow && !isSel && "text-muted/70",
                  )}
                >
                  {w}
                </span>
              </button>
            );
          })}
          </div>
        </div>
      </div>

      {/* ── 时刻表 ── */}
      <div className="sheet mt-4 overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-5 py-3">
          <h2 className="font-display text-[19px] font-semibold tracking-tight">周课表</h2>
          <div className="flex items-center gap-4">
            <span className="label-quiet flex items-center gap-1.5">
              <span className="inline-block h-3 w-1.5 bg-indigo" />
              教务课表
            </span>
            <span className="label-quiet flex items-center gap-1.5">
              <span className="inline-block h-3 w-1.5 bg-vermilion" />
              截图修正
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[880px]">
            <div className="grid-paper grid grid-cols-[6.5rem_repeat(7,minmax(0,1fr))]">
              {/* 表头 */}
              <div className="bg-paper px-3 py-2.5">
                <span className="label-quiet">节次</span>
              </div>
              {Object.entries(DAY_CN).map(([dStr, name]) => {
                const day = Number(dStr);
                const dayMD = fmtShort(dateOfWeekDay(SEMESTER_START, week === "all" ? 1 : week, day));
                const isToday =
                  week !== "all" &&
                  today !== "" &&
                  dayMD === `${Number(today.slice(5, 7))}/${Number(today.slice(8, 10))}`;
                return (
                  <div
                    key={day}
                    className={cn("bg-paper px-3 py-2", isToday && "bg-vermilion/8")}
                  >
                    <div
                      className={cn(
                        "font-display text-[15px] font-semibold leading-tight",
                        isToday && "text-vermilion",
                      )}
                    >
                      {name}
                    </div>
                    <div className="tnum label-quiet leading-4">
                      {week === "all" ? "全学期" : dayMD}
                    </div>
                  </div>
                );
              })}

              {/* 五大节 */}
              {PERIOD_GROUPS.map(([lo, hi], gi) => {
                const { start, end } = sectionTimes([lo, hi]);
                return (
                  <div key={lo} className="contents">
                    <div className="bg-paper px-3 py-2.5">
                      <div className="tnum text-[13px] font-medium leading-5">
                        {start}
                      </div>
                      <div className="tnum label-quiet leading-4">
                        {end} · {lo}-{hi} 节
                      </div>
                    </div>

                    {Object.keys(DAY_CN).map((dStr) => {
                      const day = Number(dStr);
                      const key = `${day}-${gi}`;
                      const note = cellNotes.get(key);
                      const items = merged.filter(
                        (it) =>
                          it.day === day &&
                          it.periods.some((p) => p >= lo && p <= hi) &&
                          (week === "all" || it.weeks.includes(week)),
                      );
                      const showNote =
                        note && (week === "all" || note.weeks.has(week));
                      return (
                        <div
                          key={key}
                          className="min-h-[86px] bg-sheet px-2 py-2"
                          aria-label={
                            items.length
                              ? `${DAY_CN[day]} ${start}到${end}：${items
                                  .map((it) =>
                                    `${it.name}（第 ${formatWeeks(it.weeks)} 周${it.lostWeeks?.length ? `，第 ${formatWeeks(it.lostWeeks)} 周已让位` : ""}）`,
                                  )
                                  .join("、")}`
                              : `${DAY_CN[day]} ${start}到${end}：空`
                          }
                        >
                          {items.map((it) => {
                            const lost = it.lostWeeks;
                            return (
                              <div
                                key={`${it.name}-${it.src}-${it.weeks.join("-")}`}
                                title={[
                                  `${it.name}，${week === "all" ? `第 ${formatWeeks(it.weeks)} 周` : `第 ${week} 周`}`,
                                  [it.place, it.teacher].filter(Boolean).join(" "),
                                  lost?.length ? `第 ${formatWeeks(lost)} 周已让位` : "",
                                ]
                                  .filter(Boolean)
                                  .join("，")}
                                className={cn(
                                  "mb-1.5 border-l-[3px] bg-sheet px-2 py-1.5 last:mb-0",
                                  it.src === "img" ? "border-vermilion" : "border-indigo",
                                )}
                              >
                                <p className="text-[12.5px] font-semibold leading-snug">
                                  {it.name}
                                </p>
                                <p className="label-quiet tnum mt-0.5 leading-4">
                                  {[it.place, it.teacher].filter(Boolean).join("  ")}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="rounded-[2px] border border-rule px-1 text-[10px] leading-4 text-muted">
                                    {KIND_CN[it.kind]}
                                  </span>
                                  {it.src === "img" ? (
                                    <span className="rounded-[2px] border border-vermilion/40 px-1 text-[10px] leading-4 text-vermilion">
                                      截图修正
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                          {showNote ? (
                            <p
                              className="red-note px-0.5 text-[10px] leading-4"
                              title={note.notes.join("；")}
                            >
                              {week === "all"
                                ? `第 ${formatWeeks(note.weeks)} 周有调整`
                                : `第 ${week} 周有调整`}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {!merged.length ? (
          <div className="border-t border-rule px-6 py-10 text-center">
            <p className="font-display text-[19px] font-semibold">课表还是空的</p>
            <p className="label-quiet mt-2">
              同步教务课表，或者上传实验课截图，校对结果会出现在这张表上。
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
