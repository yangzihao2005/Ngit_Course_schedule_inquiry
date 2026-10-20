"use client";

import {
  Background,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { normalizeItems } from "@/lib/normalize";
import { resolveWithReport } from "@/lib/resolve";
import type { CourseItem, ManualMute } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Row {
  label: string;
  value: string;
}

interface FlowNodeData extends Record<string, unknown> {
  title: string;
  rows: Row[];
  tone: "jw" | "img" | "manual" | "resolve" | "merged";
}

function PaperNode({ data }: NodeProps) {
  const d = data as unknown as FlowNodeData;
  return (
    <div
      className={cn(
        "min-w-[196px] rounded-[2px] border bg-sheet",
        d.tone === "jw" && "border-indigo/70",
        d.tone === "img" && "border-vermilion/70",
        d.tone === "manual" && "border-ink/70",
        d.tone === "resolve" && "border-ink/70",
        d.tone === "merged" && "border-ink",
      )}
    >
      <div
        className={cn(
          "border-b px-3 py-2",
          d.tone === "jw" && "border-indigo/25 bg-indigo/6",
          d.tone === "img" && "border-vermilion/25 bg-vermilion/6",
          d.tone === "manual" && "border-rule bg-ink/6",
          d.tone === "resolve" && "border-rule bg-paper",
          d.tone === "merged" && "border-rule bg-ink text-paper",
        )}
      >
        <p
          className={cn(
            "font-display text-[13px] font-semibold leading-tight",
            d.tone === "merged" ? "text-paper" : "text-ink",
          )}
        >
          {d.title}
        </p>
      </div>
      <dl className="divide-y divide-rule">
        {d.rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
            <dt className="label-quiet leading-4">{row.label}</dt>
            <dd className="tnum max-w-[110px] truncate text-right text-[11px] leading-4">{row.value}</dd>
          </div>
        ))}
      </dl>
      <Handle type="target" position={Position.Left} className="!size-2 !border-0 !bg-ink/60" />
      <Handle type="source" position={Position.Right} className="!size-2 !border-0 !bg-ink/60" />
    </div>
  );
}

const nodeTypes = { paper: PaperNode };

export interface MergeFlowProps {
  jw: CourseItem[];
  img: CourseItem[];
  manual: CourseItem[];
  muted: ManualMute[];
}

export function MergeFlow({ jw, img, manual, muted }: MergeFlowProps) {
  const report = useMemo(
    () => resolveWithReport([...jw, ...img, ...manual], muted),
    [jw, img, manual, muted],
  );
  const jwItems = useMemo(() => normalizeItems(jw), [jw]);
  const imgItems = useMemo(() => normalizeItems(img), [img]);
  const manualItems = useMemo(() => normalizeItems(manual), [manual]);
  const manualCount = manualItems.length + muted.length;
  const lostWeeks = useMemo(
    () => report.trimmed.reduce((n, t) => n + t.lostWeeks.length, 0),
    [report],
  );
  const topKind = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of report.merged) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "theory";
  }, [report]);

  const sample = (items: CourseItem[]) =>
    items.length ? items.slice(0, 2).map((it) => it.name).join("、") : "—";

  const nodes: Node[] = useMemo(
    () => [
      {
        id: "jw",
        type: "paper",
        position: { x: 0, y: 16 },
        data: {
          title: "教务课表",
          tone: "jw",
          rows: [
            { label: "条目", value: `${jwItems.length} 条` },
            { label: "课程", value: `${new Set(jwItems.map((it) => it.name)).size} 门` },
            { label: "示例", value: sample(jwItems) },
          ],
        } satisfies FlowNodeData,
      },
      {
        id: "img",
        type: "paper",
        position: { x: 0, y: 152 },
        data: {
          title: "截图解析",
          tone: "img",
          rows: [
            { label: "条目", value: `${imgItems.length} 条` },
            { label: "课程", value: `${new Set(imgItems.map((it) => it.name)).size} 门` },
            { label: "示例", value: sample(imgItems) },
          ],
        } satisfies FlowNodeData,
      },
      {
        id: "manual",
        type: "paper",
        position: { x: 0, y: 304 },
        data: {
          title: "手动调课",
          tone: "manual",
          rows: [
            { label: "条目", value: `${manualItems.length} 条` },
            { label: "停课", value: `${muted.length} 条` },
            { label: "示例", value: sample(manualItems) },
          ],
        } satisfies FlowNodeData,
      },
      {
        id: "resolve",
        type: "paper",
        position: { x: 286, y: 152 },
        data: {
          title: "校对合并",
          tone: "resolve",
          rows: [
            { label: "规则", value: "手动调课最高" },
            { label: "让位", value: `${report.trimmed.length} 条` },
            { label: "删去", value: `${report.removed.length} 条` },
          ],
        } satisfies FlowNodeData,
      },
      {
        id: "merged",
        type: "paper",
        position: { x: 572, y: 152 },
        data: {
          title: "校对结果",
          tone: "merged",
          rows: [
            { label: "条目", value: `${report.merged.length} 条` },
            { label: "改动周次", value: `${lostWeeks} 个` },
            { label: "主要类型", value: topKind === "theory" ? "理论" : topKind === "lab" ? "实验" : "实践" },
          ],
        } satisfies FlowNodeData,
      },
    ],
    [jwItems, imgItems, manualItems, muted.length, report, lostWeeks, topKind],
  );

  const edges: Edge[] = useMemo(
    () => [
      {
        id: "jw-resolve",
        source: "jw",
        target: "resolve",
        label: lostWeeks ? `让出 ${lostWeeks} 个周次` : "原样保留",
        labelStyle: { fill: "var(--indigo)", fontSize: 11 },
        labelBgStyle: { fill: "var(--sheet)", fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        style: { stroke: "var(--indigo)" },
      },
      {
        id: "img-resolve",
        source: "img",
        target: "resolve",
        label: lostWeeks ? `覆盖 ${lostWeeks} 个周次` : "待上传",
        labelStyle: { fill: "var(--vermilion)", fontSize: 11 },
        labelBgStyle: { fill: "var(--sheet)", fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        style: { stroke: "var(--vermilion)" },
      },
      {
        id: "manual-resolve",
        source: "manual",
        target: "resolve",
        label: manualCount ? `${manualCount} 处手动修改` : "暂无手动修改",
        labelStyle: { fill: "var(--ink)", fontSize: 11 },
        labelBgStyle: { fill: "var(--sheet)", fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        style: { stroke: "var(--ink)" },
      },
      {
        id: "resolve-merged",
        source: "resolve",
        target: "merged",
        label: `得到 ${report.merged.length} 条`,
        labelStyle: { fill: "var(--ink)", fontSize: 11 },
        labelBgStyle: { fill: "var(--sheet)", fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        style: { stroke: "var(--ink)" },
      },
    ],
    [lostWeeks, manualCount, report.merged.length],
  );

  return (
    <Card className="settle settle-3">
      <CardHeader>
        <CardTitle>合并过程</CardTitle>
        <CardDescription>
          手动调课拥有最高裁决权；其余来源实验课优先于理论课，被替换的周次在结果里让位
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!jw.length && !img.length && !manual.length && !muted.length ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-2 rounded-[3px] border border-dashed border-rule bg-paper px-6 text-center">
            <p className="font-display text-[17px] font-semibold">还没有数据可合并</p>
            <p className="label-quiet max-w-sm">
              先同步教务课表、上传实验课截图，或者手动加一节课，这里会展示各来源如何校对成一张课表。
            </p>
          </div>
        ) : (
          <div className="stage h-[440px] rounded-[3px] border border-rule">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.22 }}
              minZoom={0.4}
              maxZoom={1.4}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
            >
              <Background gap={24} color="color-mix(in oklab, var(--rule) 60%, transparent)" />
            </ReactFlow>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
