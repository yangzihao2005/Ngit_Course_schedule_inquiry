"use client";

import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SEMESTER_START } from "@/lib/constants";
import { exportCsv } from "@/lib/csv";
import { countIcsEvents, exportIcs } from "@/lib/ics";
import { formatWeeks, parseWeeks } from "@/lib/parse";
import { resolveSchedule } from "@/lib/resolve";
import type { CourseItem } from "@/lib/types";
import { cn } from "@/lib/utils";

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface ExportBarProps {
  jw: CourseItem[];
  img: CourseItem[];
}

export function ExportBar({ jw, img }: ExportBarProps) {
  const merged = useMemo(() => resolveSchedule([...jw, ...img]), [jw, img]);
  const [scope, setScope] = useState<"all" | "custom">("all");
  const [weeksText, setWeeksText] = useState("1-16");
  const [busy, setBusy] = useState<"ics" | "csv" | null>(null);

  const weeks = useMemo(() => {
    if (scope === "all") return undefined;
    const parsed = parseWeeks(weeksText);
    return parsed.length ? parsed : undefined;
  }, [scope, weeksText]);

  const eventCount = useMemo(() => countIcsEvents(merged, weeks), [merged, weeks]);
  const label = scope === "all" ? "全部周次" : weeks ? `第${formatWeeks(weeks)}周` : "未指定周次";

  const run = (kind: "ics" | "csv") => {
    if (!merged.length) {
      toast.error("课表还是空的，先同步教务或上传截图");
      return;
    }
    if (scope === "custom" && !weeks) {
      toast.error("周次没读懂，试试 1-16 或 1,3,5 这样的写法");
      return;
    }
    setBusy(kind);
    try {
      if (kind === "ics") {
        const text = exportIcs(merged, {
          semesterStart: SEMESTER_START,
          calName: `我的课表 · ${label}`,
          weeks,
        });
        download(`课表-${label}.ics`, text, "text/calendar;charset=utf-8");
      } else {
        const text = exportCsv(merged, weeks);
        download(`课表-${label}.csv`, text, "text/csv;charset=utf-8");
      }
      toast.success(`${kind.toUpperCase()} 已导出，${label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="sheet settle settle-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 px-5 py-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="space-y-2">
          <Label>导出范围</Label>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={scope === "all" ? "default" : "outline"}
              onClick={() => setScope("all")}
            >
              全部周次
            </Button>
            <Button
              size="sm"
              variant={scope === "custom" ? "default" : "outline"}
              onClick={() => setScope("custom")}
            >
              指定周次
            </Button>
            <Input
              value={weeksText}
              onChange={(e) => setWeeksText(e.target.value)}
              onFocus={() => setScope("custom")}
              placeholder="1-16 或 1,3,5"
              aria-label="指定周次"
              className={cn("w-36", scope === "all" && "opacity-45")}
              disabled={scope === "all"}
            />
          </div>
        </div>

        <p className="label-quiet tnum pb-1">
          将导出 {merged.length} 节课，共 {eventCount} 个日程（{label}）
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => run("ics")} disabled={busy !== null}>
          {busy === "ics" ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
          导出 ICS
        </Button>
        <Button onClick={() => run("csv")} disabled={busy !== null}>
          {busy === "csv" ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />}
          导出 CSV
        </Button>
      </div>
    </section>
  );
}
