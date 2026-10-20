"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type SelectHTMLAttributes } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DAY_CN, type CourseKind } from "@/lib/constants";
import type { CourseDraft, EditScope } from "@/lib/manual";
import { toDraft } from "@/lib/manual";
import { formatPeriods, formatWeeks, parsePeriods, parseWeeks } from "@/lib/parse";
import type { CourseItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export type EditorMode =
  | {
      kind: "create";
      prefill: { day: number; periods: number[]; weeks: number[] };
    }
  | { kind: "edit"; item: CourseItem };

export interface EditorSubmitPayload {
  scope: EditScope;
  draft: CourseDraft;
}

export interface CourseEditorDialogProps {
  mode: EditorMode;
  /** 课表当前选中的周；"all" 表示正在看全学期 */
  currentWeek: number | "all";
  onClose: () => void;
  /** 返回 true 表示保存成功，弹窗自动关闭 */
  onSubmit: (action: "save" | "remove", payload: EditorSubmitPayload) => Promise<boolean>;
}

const KIND_OPTIONS: Array<{ value: CourseKind; label: string }> = [
  { value: "theory", label: "理论" },
  { value: "lab", label: "实验" },
  { value: "practice", label: "实践" },
];

function initialDraft(mode: EditorMode): CourseDraft {
  if (mode.kind === "create") {
    return {
      name: "",
      day: mode.prefill.day,
      periods: [...mode.prefill.periods],
      weeks: [...mode.prefill.weeks],
      place: "",
      teacher: "",
      kind: "theory",
      note: "",
    };
  }
  return toDraft(mode.item);
}

function NativeSelect({
  value,
  onChange,
  children,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      value={value}
      onChange={onChange}
      className={cn(
        "h-9 w-full rounded-[3px] border border-rule bg-sheet px-2.5 text-[13px] text-ink transition-colors",
        "focus-visible:outline-none focus-visible:border-indigo focus-visible:ring-2 focus-visible:ring-indigo/25",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function CourseEditorDialog({
  mode,
  currentWeek,
  onClose,
  onSubmit,
}: CourseEditorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const draft = useMemo(() => initialDraft(mode), [mode]);
  const [name, setName] = useState(draft.name);
  const [day, setDay] = useState(draft.day);
  const [kind, setKind] = useState<CourseKind>(draft.kind ?? "theory");
  const [place, setPlace] = useState(draft.place ?? "");
  const [teacher, setTeacher] = useState(draft.teacher ?? "");
  const [note, setNote] = useState(draft.note ?? "");
  const [periodsText, setPeriodsText] = useState(formatPeriods(draft.periods));
  const [weeksText, setWeeksText] = useState(formatWeeks(draft.weeks));

  const isEdit = mode.kind === "edit";
  const sourceWeeks = isEdit ? mode.item.weeks : [];

  const [scopeType, setScopeType] = useState<"week" | "all">(() =>
    isEdit && currentWeek !== "all" && mode.item.weeks.includes(currentWeek) ? "week" : "all",
  );
  const [week, setWeek] = useState<number>(() => {
    if (!isEdit) return currentWeek === "all" ? 1 : currentWeek;
    if (currentWeek !== "all" && mode.item.weeks.includes(currentWeek)) return currentWeek;
    return mode.item.weeks[0] ?? 1;
  });

  const periods = useMemo(() => parsePeriods(periodsText), [periodsText]);
  const weeks = useMemo(() => parseWeeks(weeksText), [weeksText]);
  const useSingleWeek = isEdit && scopeType === "week";
  const effectiveWeeks = useSingleWeek ? [week] : weeks;

  const nameError = name.trim() ? "" : "请填写课程名";
  const periodsError = periods.length ? "" : "节次没读懂，试试 3-4 或 1,2";
  const weeksError = effectiveWeeks.length ? "" : "周次没读懂，试试 1-16 或 1,3,5";
  const valid = !nameError && !periodsError && !weeksError && day >= 1 && day <= 7;

  const [busy, setBusy] = useState<null | "save" | "remove">(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLInputElement>("#course-name")?.focus();
    // 不要在这里 close()：StrictMode 会执行 setup → cleanup → setup，
    // close() 会同步触发 close 事件，被 onClose 当成用户关闭，导致弹窗刚开就被卸载。
    // 父组件卸载弹窗时，元素移出 DOM 会自动关闭。
  }, []);

  const scope: EditScope =
    isEdit && scopeType === "week" ? { type: "week", week } : { type: "all" };

  const submit = async (action: "save" | "remove") => {
    if (action === "save" && !valid) return;
    if (action === "remove" && scopeType === "all") {
      const ok = window.confirm(
        `确定删除「${isEdit ? mode.item.name : ""}」的全部周次？可在「手动校对记录」里撤销。`,
      );
      if (!ok) return;
    }

    const payloadDraft: CourseDraft = {
      name: name.trim(),
      day,
      periods,
      weeks: effectiveWeeks,
      place: place.trim(),
      teacher: teacher.trim(),
      kind,
      note: note.trim(),
    };

    setBusy(action);
    try {
      const ok = await onSubmit(action, { scope, draft: payloadDraft });
      if (ok) onClose();
    } finally {
      setBusy(null);
    }
  };

  const removeLabel = !isEdit
    ? ""
    : scopeType === "week"
      ? mode.item.src === "manual"
        ? `删除第 ${week} 周`
        : `停课第 ${week} 周`
      : "删除整门课";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="course-editor-title"
      onClose={onClose}
      onMouseDown={(e) => {
        // 点遮罩关闭：遮罩上的点击 target 就是 dialog 本身
        if (e.target === e.currentTarget) dialogRef.current?.close();
      }}
      className="m-auto w-[min(640px,calc(100vw-2rem))] rounded-[2px] border border-rule bg-sheet p-0 text-ink backdrop:bg-ink/30"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit("save");
        }}
        className="max-h-[calc(100vh-2rem)] overflow-y-auto"
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
          <div>
            <h2
              id="course-editor-title"
              className="font-display text-[19px] font-semibold tracking-tight"
            >
              {isEdit ? "编辑课程" : "手动加课"}
            </h2>
            <p className="label-quiet mt-1">
              改动写入人工校对层，教务原表与截图数据不会被覆盖。
            </p>
          </div>
          <Button
            type="button"
            variant="quiet"
            size="icon"
            aria-label="关闭"
            onClick={() => dialogRef.current?.close()}
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {isEdit ? (
            <div className="space-y-1.5">
              <Label>作用范围</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={scopeType === "week" ? "default" : "outline"}
                  aria-pressed={scopeType === "week"}
                  onClick={() => setScopeType("week")}
                >
                  仅第 {week} 周
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={scopeType === "all" ? "default" : "outline"}
                  aria-pressed={scopeType === "all"}
                  onClick={() => setScopeType("all")}
                >
                  全部周次
                </Button>
                {scopeType === "week" ? (
                  <NativeSelect
                    aria-label="选择要调整的周次"
                    value={String(week)}
                    onChange={(e) => setWeek(Number(e.target.value))}
                    className="w-24"
                  >
                    {sourceWeeks.map((w) => (
                      <option key={w} value={w}>
                        第 {w} 周
                      </option>
                    ))}
                  </NativeSelect>
                ) : null}
              </div>
              <p className="label-quiet">
                {scopeType === "week"
                  ? "只调整这一周：原课该周停课，新安排以手动调课显示。"
                  : "整门修改：原课全部周次停课，再按下面的设置重新生成。"}
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="course-name">课程名</Label>
            <Input
              id="course-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：软件工程（补课）"
              autoComplete="off"
            />
            {nameError ? <p className="red-note text-[11px]">{nameError}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="course-day">星期</Label>
              <NativeSelect
                id="course-day"
                value={String(day)}
                onChange={(e) => setDay(Number(e.target.value))}
              >
                {Object.entries(DAY_CN).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-kind">类型</Label>
              <NativeSelect
                id="course-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as CourseKind)}
              >
                {KIND_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="course-periods">节次</Label>
              <Input
                id="course-periods"
                value={periodsText}
                onChange={(e) => setPeriodsText(e.target.value)}
                placeholder="如：3-4"
              />
              {periodsError ? <p className="red-note text-[11px]">{periodsError}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-weeks">周次</Label>
              {useSingleWeek ? (
                <div className="flex h-9 items-center rounded-[3px] border border-rule bg-paper px-3 text-[13px]">
                  仅第 {week} 周
                </div>
              ) : (
                <Input
                  id="course-weeks"
                  value={weeksText}
                  onChange={(e) => setWeeksText(e.target.value)}
                  placeholder="如：1-16 或 8(单)"
                />
              )}
              {!weeksError ? null : <p className="red-note text-[11px]">{weeksError}</p>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="course-place">地点</Label>
              <Input
                id="course-place"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="如：信息B204"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-teacher">教师</Label>
              <Input
                id="course-teacher"
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
                placeholder="选填"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="course-note">批注</Label>
            <Textarea
              id="course-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="如：国庆调休补课；停课时会作为停课原因保存"
              className="min-h-16"
            />
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-5 py-4">
          <div>
            {isEdit ? (
              <Button
                type="button"
                variant="vermilion"
                disabled={busy !== null}
                onClick={() => void submit("remove")}
              >
                {busy === "remove" ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {removeLabel}
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="quiet"
              disabled={busy !== null}
              onClick={() => dialogRef.current?.close()}
            >
              取消
            </Button>
            <Button type="submit" disabled={!valid || busy !== null}>
              {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : null}
              保存
            </Button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
