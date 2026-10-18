"use client";

import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { LlmConfig } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScheduleFile } from "@/lib/storage";
import type { CourseItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 2000;

type ParseStatus = "queued" | "compressing" | "parsing" | "done" | "error";

interface PreviewItem {
  id: string;
  name: string;
  url: string;
  status: ParseStatus;
  count?: number;
  error?: string;
}

export interface ImageUploaderProps {
  llm: LlmConfig;
  onParsed: (schedule: ScheduleFile, items: CourseItem[]) => void;
}

/** 长边压到 ≤2000px 的 canvas 压缩（截图优先 PNG 保文字锐度，超限回退 JPEG） */
async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const longEdge = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, MAX_EDGE / longEdge);
  if (scale === 1 && file.size <= MAX_BYTES) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const toBlob = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

  let blob = await toBlob("image/png");
  if (!blob || blob.size > MAX_BYTES) blob = await toBlob("image/jpeg", 0.9);
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, ".png"), {
    type: blob.type || "image/png",
  });
}

const STATUS_TEXT: Record<ParseStatus, string> = {
  queued: "排队中",
  compressing: "压缩中…",
  parsing: "解析中…",
  done: "",
  error: "",
};

export function ImageUploader({ llm, onParsed }: ImageUploaderProps) {
  const [items, setItems] = useState<PreviewItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  const updateItem = useCallback((id: string, patch: Partial<PreviewItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const parseOne = useCallback(
    async (item: PreviewItem, rawFile: File) => {
      try {
        updateItem(item.id, { status: "compressing" });
        const file = await compressImage(rawFile);

        updateItem(item.id, { status: "parsing" });
        const form = new FormData();
        form.append("image", file);
        form.append("apiKey", llm.apiKey);
        form.append("baseURL", llm.baseURL);
        form.append("model", llm.model);

        const res = await fetch("/api/parse-image", { method: "POST", body: form });
        const data = (await res.json()) as {
          schedule?: ScheduleFile;
          items?: CourseItem[];
          error?: string;
        };
        if (!res.ok || !data.schedule) {
          throw new Error(data.error || `解析失败（HTTP ${res.status}）`);
        }
        updateItem(item.id, { status: "done", count: data.items?.length ?? 0 });
        onParsed(data.schedule, data.items ?? []);
        toast.success(`「${item.name}」解析出 ${data.items?.length ?? 0} 条课`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateItem(item.id, { status: "error", error: message });
        toast.error(`「${item.name}」${message}`);
      }
    },
    [llm, onParsed, updateItem],
  );

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length || busyRef.current) return;
      const accepted: Array<{ item: PreviewItem; file: File }> = [];
      for (const file of Array.from(fileList)) {
        if (!file.type.startsWith("image/")) {
          toast.error(`「${file.name}」不是图片文件`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`「${file.name}」超过 8MB，请先裁剪`);
          continue;
        }
        const item: PreviewItem = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          url: URL.createObjectURL(file),
          status: "queued",
        };
        accepted.push({ item, file });
      }
      if (!accepted.length) return;

      setItems((prev) => [...prev, ...accepted.map((a) => a.item)]);
      if (!llm.apiKey.trim()) {
        toast.error("请先在「模型设置」里填写 API Key");
        return;
      }

      busyRef.current = true;
      for (const { item, file } of accepted) {
        await parseOne(item, file);
      }
      busyRef.current = false;
    },
    [llm.apiKey, parseOne],
  );

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((it) => it.id !== id);
    });
  };

  return (
    <Card className="settle settle-3">
      <CardHeader>
        <CardTitle>实验课截图</CardTitle>
        <CardDescription>解析出的课会以红笔修正的方式并入课表</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          aria-label="上传实验课截图"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void handleFiles(e.dataTransfer.files);
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[3px] border border-dashed border-ink/25 bg-paper px-4 py-9 text-center transition-colors hover:border-ink/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/30"
        >
          <UploadCloud className="size-6 text-muted" />
          <p className="text-[13px] font-medium">拖到这里，或者点击选择</p>
          <p className="label-quiet">PNG、JPG，单张不超过 8MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {items.length > 0 ? (
          <ul className="divide-y divide-rule border-t border-rule">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-3 py-2.5">
                {/* blob URL 本地预览，next/image 无法优化对象 URL */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.url}
                  alt={`预览 ${it.name}`}
                  className="size-11 rounded-[2px] border border-rule object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium leading-5">{it.name}</p>
                  <p
                    className={cn(
                      "label-quiet truncate leading-4",
                      it.status === "error" && "red-note",
                    )}
                  >
                    {it.status === "done" ? `已解析 ${it.count ?? 0} 条` : null}
                    {it.status === "error" ? it.error || "解析失败" : null}
                    {STATUS_TEXT[it.status] || null}
                  </p>
                </div>
                {it.status === "compressing" || it.status === "parsing" ? (
                  <Loader2 className="size-3.5 animate-spin text-muted" />
                ) : null}
                <Button
                  variant="quiet"
                  size="icon"
                  aria-label={`移除 ${it.name}`}
                  onClick={() => removeItem(it.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-start gap-2 label-quiet">
            <ImagePlus className="mt-0.5 size-4 shrink-0" />
            老师发来的调课截图放这里，原图不会保存，只保留解析结果。
          </p>
        )}
      </CardContent>
    </Card>
  );
}
