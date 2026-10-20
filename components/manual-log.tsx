"use client";

import { ChevronDown, RotateCcw, Undo2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DAY_CN } from "@/lib/constants";
import { formatPeriods, formatWeeks } from "@/lib/parse";
import type { CourseItem, ManualMute } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ManualLogProps {
  manual: CourseItem[];
  muted: ManualMute[];
  onRemoveManual: (id: string) => Promise<boolean>;
  onRestoreMute: (id: string) => Promise<boolean>;
  onClear: () => Promise<boolean>;
}

export function ManualLog({
  manual,
  muted,
  onRemoveManual,
  onRestoreMute,
  onClear,
}: ManualLogProps) {
  const [open, setOpen] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const count = manual.length + muted.length;

  if (!count) return null;

  const run = async (id: string, action: () => Promise<boolean>) => {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  };

  const clearAll = async () => {
    if (!window.confirm(`确定清空全部 ${count} 处手动修改？教务与截图数据会保留。`)) return;
    setBusyId("__clear__");
    try {
      await onClear();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="sheet settle settle-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/35"
        >
          <ChevronDown
            className={cn("size-3.5 text-muted transition-transform", !open && "-rotate-90")}
          />
          <span className="font-display text-[15px] font-semibold tracking-tight">
            手动校对记录
          </span>
          <span className="label-quiet tnum">（{count} 处修改）</span>
        </button>
        <Button
          variant="vermilion"
          size="sm"
          disabled={busyId !== null}
          onClick={() => void clearAll()}
        >
          <RotateCcw className="size-3.5" />
          清空手动修改
        </Button>
      </div>

      {open ? (
        <div className="grid gap-4 border-t border-rule px-5 py-3 lg:grid-cols-2">
          <div>
            <p className="label-quiet">手动课程（{manual.length}）</p>
            {manual.length ? (
              <ul className="mt-1 divide-y divide-rule">
                {manual.map((it, i) => (
                  <li key={it.id ?? `${it.name}-${it.day}-${i}`} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium leading-5">
                        {it.name}
                        <span className="label-quiet tnum ml-2">
                          第 {formatWeeks(it.weeks)} 周
                        </span>
                      </p>
                      <p className="label-quiet tnum leading-4">
                        {DAY_CN[it.day]} · 第 {formatPeriods(it.periods)} 节
                        {it.place ? ` · ${it.place}` : ""}
                      </p>
                      {it.note ? <p className="red-note text-[11px] leading-4">{it.note}</p> : null}
                    </div>
                    <Button
                      variant="quiet"
                      size="sm"
                      aria-label={`撤销手动课程 ${it.name}`}
                      disabled={!it.id || busyId !== null}
                      onClick={() => {
                        if (it.id) void run(it.id, () => onRemoveManual(it.id!));
                      }}
                    >
                      <Undo2 className="size-3.5" />
                      撤销
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="label-quiet mt-1">暂无手动课程。</p>
            )}
          </div>

          <div>
            <p className="label-quiet">停课 / 剔除（{muted.length}）</p>
            {muted.length ? (
              <ul className="mt-1 divide-y divide-rule">
                {muted.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium leading-5">
                        {m.name}
                        <span className="label-quiet tnum ml-2">
                          第 {formatWeeks(m.weeks)} 周
                        </span>
                      </p>
                      <p className="label-quiet tnum leading-4">
                        {DAY_CN[m.day]} · 第 {formatPeriods(m.periods)} 节
                      </p>
                      {m.reason ? <p className="red-note text-[11px] leading-4">{m.reason}</p> : null}
                    </div>
                    <Button
                      variant="quiet"
                      size="sm"
                      aria-label={`恢复 ${m.name} 第 ${formatWeeks(m.weeks)} 周`}
                      disabled={busyId !== null}
                      onClick={() => void run(m.id, () => onRestoreMute(m.id))}
                    >
                      <Undo2 className="size-3.5" />
                      撤销
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="label-quiet mt-1">暂无停课记录。</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
