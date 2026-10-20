"use client";

import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { ExportBar } from "@/components/export-bar";
import { ImageUploader } from "@/components/image-uploader";
import { ManualLog } from "@/components/manual-log";
import { MergeFlow } from "@/components/merge-flow";
import { ScheduleGrid } from "@/components/schedule-grid";
import { removeManual, restoreMute } from "@/lib/manual";
import { TopBar, type LlmConfig } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import type { ScheduleFile } from "@/lib/storage";

const COOKIE_KEY = "ass.cookie";
const LLM_KEY = "ass.llm";

const DEFAULT_LLM: LlmConfig = {
  apiKey: "",
  baseURL: "https://openrouter.ai/api/v1",
  model: "xiaomi/mimo-v2.5",
};

const EMPTY_SCHEDULE: ScheduleFile = {
  jw: [],
  img: [],
  manual: [],
  muted: [],
  updatedAt: null,
};

function loadLlm(): LlmConfig {
  if (typeof window === "undefined") return DEFAULT_LLM;
  try {
    const raw = window.localStorage.getItem(LLM_KEY);
    if (!raw) return DEFAULT_LLM;
    return { ...DEFAULT_LLM, ...(JSON.parse(raw) as Partial<LlmConfig>) };
  } catch {
    return DEFAULT_LLM;
  }
}

export default function HomePage() {
  const [schedule, setSchedule] = useState<ScheduleFile>(EMPTY_SCHEDULE);
  const [cookie, setCookie] = useState("");
  const [llm, setLlm] = useState<LlmConfig>(DEFAULT_LLM);
  const [year, setYear] = useState(2026);
  const [term, setTerm] = useState<3 | 12>(3);
  const [syncing, setSyncing] = useState(false);
  const [ready, setReady] = useState(false);

  // 挂载：读浏览器配置 + 拉取本地课表（外部系统数据统一在异步任务里回填）
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const savedCookie = window.localStorage.getItem(COOKIE_KEY) ?? "";
      const savedLlm = loadLlm();
      const res = await fetch("/api/schedule");
      if (cancelled) return;
      setCookie(savedCookie);
      setLlm(savedLlm);
      setReady(true);
      if (res.ok) {
        setSchedule((await res.json()) as ScheduleFile);
      } else {
        toast.error("读取本地课表失败");
      }
    }

    void bootstrap().catch(() => {
      if (!cancelled) toast.error("读取本地课表失败");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cookie 与模型配置只存浏览器，不落盘
  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(COOKIE_KEY, cookie);
  }, [cookie, ready]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(LLM_KEY, JSON.stringify(llm));
  }, [llm, ready]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie, xnm: year, xqm: term }),
      });
      const data = (await res.json()) as {
        schedule?: ScheduleFile;
        count?: number;
        error?: string;
      };
      if (!res.ok || !data.schedule) {
        throw new Error(data.error || `同步失败（HTTP ${res.status}）`);
      }
      setSchedule(data.schedule);
      toast.success(`教务课表已同步，${data.count ?? data.schedule.jw.length} 条`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  }, [cookie, year, term]);

  const handleParsed = useCallback((next: ScheduleFile) => {
    setSchedule(next);
  }, []);

  /** PATCH 人工校对层（manual + muted），成功返回 true */
  const commitManual = useCallback(
    async (next: Pick<ScheduleFile, "manual" | "muted">): Promise<boolean> => {
      try {
        const res = await fetch("/api/schedule", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        const data = (await res.json()) as ScheduleFile & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || `保存失败（HTTP ${res.status}）`);
        }
        setSchedule(data);
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "保存手动修改失败");
        return false;
      }
    },
    [],
  );

  const currentManual = schedule.manual;
  const currentMuted = schedule.muted;

  const handleRemoveManual = useCallback(
    (id: string) => commitManual(removeManual({ manual: currentManual, muted: currentMuted }, id)),
    [commitManual, currentManual, currentMuted],
  );

  const handleRestoreMute = useCallback(
    (id: string) => commitManual(restoreMute({ manual: currentManual, muted: currentMuted }, id)),
    [commitManual, currentManual, currentMuted],
  );

  const handleClearManual = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/schedule?scope=manual", { method: "DELETE" });
      const data = (await res.json()) as ScheduleFile & { error?: string };
      if (!res.ok) throw new Error(data.error || "清空失败");
      setSchedule(data);
      toast.success("手动修改已清空，教务与截图数据保留");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "清空手动修改失败");
      return false;
    }
  }, []);

  const handleReset = useCallback(async () => {
    if (!window.confirm("确定清空教务课表和截图解析数据？此操作不可撤销。")) return;
    try {
      const res = await fetch("/api/schedule", { method: "DELETE" });
      if (res.ok) {
        setSchedule((await res.json()) as ScheduleFile);
        toast.success("本地课表数据已清空");
      } else {
        toast.error("重置失败");
      }
    } catch {
      toast.error("重置失败");
    }
  }, []);

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-6 lg:px-8 lg:py-8">
        <TopBar
          cookie={cookie}
          onCookieChange={setCookie}
          year={year}
          term={term}
          onSemesterChange={(xnm, xqm) => {
            setYear(xnm);
            setTerm(xqm);
          }}
          syncing={syncing}
          onSync={() => void handleSync()}
          llm={llm}
          onLlmChange={setLlm}
          updatedAt={schedule.updatedAt}
        />

        <ManualLog
          manual={schedule.manual}
          muted={schedule.muted}
          onRemoveManual={handleRemoveManual}
          onRestoreMute={handleRestoreMute}
          onClear={handleClearManual}
        />

        <ScheduleGrid
          jw={schedule.jw}
          img={schedule.img}
          manual={schedule.manual}
          muted={schedule.muted}
          onCommit={commitManual}
        />

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <ImageUploader llm={llm} onParsed={handleParsed} />
          <MergeFlow
            jw={schedule.jw}
            img={schedule.img}
            manual={schedule.manual}
            muted={schedule.muted}
          />
        </div>

        <ExportBar
          jw={schedule.jw}
          img={schedule.img}
          manual={schedule.manual}
          muted={schedule.muted}
        />

        <footer className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <p className="label-quiet">
            Cookie 与 API Key 只存这台浏览器，课表数据存 data/schedule.json。学期第 1
            周从 2026-08-31 开始。
          </p>
          <Button variant="quiet" size="sm" onClick={() => void handleReset()}>
            <RotateCcw className="size-3.5" />
            重置本地数据
          </Button>
        </footer>
      </div>
      <Toaster theme="light" position="top-right" />
    </main>
  );
}
