"use client";

import { Eye, EyeOff, RefreshCw, Settings2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface LlmConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface TopBarProps {
  cookie: string;
  onCookieChange: (value: string) => void;
  /** 学年（教务 xnm，如 2026 表示 2026-2027 学年） */
  year: number;
  /** 学期（教务 xqm：3=第一学期，12=第二学期） */
  term: 3 | 12;
  onSemesterChange: (xnm: number, xqm: 3 | 12) => void;
  syncing: boolean;
  onSync: () => void;
  llm: LlmConfig;
  onLlmChange: (config: LlmConfig) => void;
  updatedAt: string | null;
}

const YEAR_OPTIONS = [2025, 2026, 2027];

export function TopBar({
  cookie,
  onCookieChange,
  year,
  term,
  onSemesterChange,
  syncing,
  onSync,
  llm,
  onLlmChange,
  updatedAt,
}: TopBarProps) {
  const [showCookie, setShowCookie] = useState(false);
  const [showLlm, setShowLlm] = useState(false);

  return (
    <header className="sheet settle">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 px-5 py-4 lg:px-6">
        <div>
          <h1 className="font-display text-[30px] font-semibold leading-none tracking-tight">
            课表校对室
          </h1>
          <p className="label-quiet mt-2">
            把实验课的真实教室，红笔改进教务课表。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="label-quiet tnum mr-1">
            {updatedAt
              ? `更新于 ${new Date(updatedAt).toLocaleString("zh-CN", { hour12: false })}`
              : "尚未同步"}
          </span>
          <Button variant="outline" onClick={() => setShowLlm((v) => !v)} aria-expanded={showLlm}>
            <Settings2 className="size-3.5" />
            模型设置
          </Button>
          <Button onClick={onSync} disabled={syncing || !cookie.trim()}>
            <RefreshCw className={syncing ? "size-3.5 animate-spin" : "size-3.5"} />
            {syncing ? "同步中…" : "同步教务课表"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 border-t border-rule px-5 py-4 lg:grid-cols-[minmax(0,1fr)_11rem_11rem] lg:px-6">
        <div className="space-y-2">
          <Label htmlFor="jw-cookie">教务 Cookie</Label>
          <div className="flex gap-2">
            <Input
              id="jw-cookie"
              type={showCookie ? "text" : "password"}
              placeholder="登录教务系统后，从 F12 网络请求里复制 Cookie 整行"
              value={cookie}
              onChange={(e) => onCookieChange(e.target.value)}
              autoComplete="off"
            />
            <Button
              variant="quiet"
              size="icon"
              aria-label={showCookie ? "隐藏 Cookie" : "显示 Cookie"}
              onClick={() => setShowCookie((v) => !v)}
            >
              {showCookie ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>学年</Label>
          <Select value={String(year)} onValueChange={(v) => onSemesterChange(Number(v), term)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}-{y + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>学期</Label>
          <Select
            value={String(term)}
            onValueChange={(v) => onSemesterChange(year, Number(v) as 3 | 12)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">第一学期</SelectItem>
              <SelectItem value="12">第二学期</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {showLlm ? (
        <div className="grid gap-3 border-t border-rule bg-paper/50 px-5 py-4 lg:grid-cols-3 lg:px-6">
          <div className="space-y-2">
            <Label htmlFor="llm-key">API Key</Label>
            <Input
              id="llm-key"
              type="password"
              placeholder="与接口地址同平台的密钥"
              value={llm.apiKey}
              onChange={(e) => onLlmChange({ ...llm, apiKey: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="llm-base">接口地址</Label>
            <Input
              id="llm-base"
              value={llm.baseURL}
              onChange={(e) => onLlmChange({ ...llm, baseURL: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="llm-model">模型</Label>
            <Input
              id="llm-model"
              value={llm.model}
              onChange={(e) => onLlmChange({ ...llm, model: e.target.value })}
            />
          </div>
          <p className="label-quiet lg:col-span-3">
            密钥只存在这台浏览器里，不会写入服务器文件。
          </p>
        </div>
      ) : null}
    </header>
  );
}
