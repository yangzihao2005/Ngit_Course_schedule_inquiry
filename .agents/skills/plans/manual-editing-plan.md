# 手动调课与课表编辑 — 实施计划

> 状态：已实施，待人工验收（2026-10-19）
> 来源：`PROMPT2.md` + 现有实现（`lib/*`、`app/api/*`、`components/*`、`test/*`）+ `DESIGN.md`
> 前置阅读：`AGENTS.md`、`DESIGN.md`、`.agents/skills/plans/ai-schedule-sync-plan.md`

## 实施记录（2026-10-19）

- 已完成阶段 A-E 全部步骤。质量检查：`npm run lint` / `npm run typecheck` / `npm test`（109 测试全绿）/ `npm run build` 全部通过。
- 运行时冒烟（production build，端口 3100）：
  - `GET /api/schedule` 旧 JSON 正常返回 `manual: []`、`muted: []`；
  - `PATCH /api/schedule` 写入手动课程 + 停课记录成功；
  - 课表点击空白格预填（周六 / 1-2 节 / 第 8 周）→ 保存 → 卡片与计数即时更新；
  - 点击已有课程打开编辑器，默认「仅第 N 周」，单周调课生成 manual + mute；
  - 「手动校对记录」撤销该调课，联动删除 `mute_<manualId>`，原课周次恢复（计数 4 → 2）；
  - `DELETE ?scope=manual` 清空手动层，`jw/img` 保留（冒烟数据已清理）。
- 与计划的偏差：
  - **降级**：fixer 子代理模型（`opencode/deepseek-v4-flash-free`）不可用，全部实现由主 Agent 顺序完成。
  - 弹窗使用原生 `<dialog>` + 原生 `<select>`（避免 Radix Portal 被 dialog top-layer 遮挡），未新增依赖。
  - `ScheduleFile` 名称保持不变（未改名为 `ScheduleData`），仅扩字段，减少调用面改动。
- 修复记录（2026-10-19，dev 模式弹窗不出现）：
  - 根因是 `CourseEditorDialog` 的 `useEffect` 清理函数调用 `dialog.close()`；React StrictMode 会执行 setup → cleanup → setup，`close()` 同步触发原生 `close` 事件，被 `onClose` 当成用户关闭并把编辑器状态清空，导致弹窗刚打开就被卸载。production build 不双跑 effect，所以此前只在 dev 下复现。
  - 修复：移除清理函数里的 `close()`，由父组件卸载 `<dialog>` 时自动关闭。已在重启后的 dev server（:3000）验证工具栏、空白格、已有课程卡片三种入口均能正常打开，Esc 可关闭。

## 0. 已确认决策

| 项 | 决定 |
|---|---|
| 合并 API | 保持数组签名，追加可选参数：`resolveSchedule(items, muted = [])`，调用方传 `[...jw, ...img, ...manual]` |
| Mute 语义 | 只作用于 `jw`/`img`；`name` 完全相等 + `day` 相等 + `periods` 有交集；只从 `weeks` 减周，不拆分/收窄 `periods`；减空即整条移除 |
| 报告结构 | `trimmed` 增加 `cause: "override" \| "mute"`；新增 `mutes: Array<{ item; mute; lostWeeks; emptied }>`，`removed` 仍只表示"被高优先级吃掉" |
| 撤销联动 | 不扩展 schema：单周/整门调课生成的 `manual.id = m_<uuid>`，其 mute id 固定为 `mute_<manual.id>`；撤销该 manual 时一并删除关联 mute，即恢复原课 |
| 编辑逻辑 | 抽成纯函数 `lib/manual.ts`，UI 只负责表单与提交，便于单测 |
| 导出/合并图 | **纳入 manual 与 muted**，避免"课表改了、导出没变"的不一致 |
| 弹窗 | 不引新依赖，原生 `<dialog>` + `showModal()`，面板 `.sheet`，Esc/点遮罩关闭 |
| 记录面板 | 位于 `TopBar` 与 `ScheduleGrid` 之间（课表上方），`N = manual.length + muted.length`，为 0 时不渲染；支持单条撤销与清空 |
| 空白格 | 空单元格整格为隐藏 `+` 按钮，预填 `day + [lo,hi] + 当前周`；周尺处于"全部周次"时周次预填 `1-16` |
| 数据库 | 无数据库；`data/schedule.json` 原子写入（tmp + rename），不走迁移 |

---

## 1. 现状核对（影响方案的关键点）

| 现状 | 影响 |
|---|---|
| `lib/storage.ts` 只有 `jw/img/updatedAt`，`ScheduleFile` 是全局类型 | 扩展为 5 字段；旧 JSON 读取需兜底 |
| `CourseSrc = "jw" \| "img"`，且 `csv.ts` 有 `Record<CourseSrc, string>`、`constants.ts` 有 `Record<CourseSrc, number>` | 加 `"manual"` 后两处必须同步，否则 typecheck 直接红 |
| `normalizeItems` 合并 key **不含 `src`**，会把同型同教室的 jw/img 提前混并 | 与规格"同 src 内部归并"冲突；需把 `src` 加入 key，并改掉 `test/normalize.test.ts` 中"来源取更高优先级"那条断言 |
| `resolveSchedule(items)` 只吃一个数组，靠 `priority()` 排序裁剪 | 需加 `muted` 入参；mute 必须在优先级排序**之前**应用 |
| `ExportBar`、`MergeFlow` 各自直接 `resolveSchedule([...jw,...img])` | 规格漏项：不改它们，手动调课不会出现在导出和合并图里 |
| `/api/sync`、`/api/parse-image` 都是 `{...schedule, jw/img: ...}` | 天然保留 `manual/muted`，无需改动（仅需类型支持） |
| 无 Radix Dialog 依赖，`components/ui` 只有 button/input/label/card/badge/select | 弹窗用原生 `<dialog>`，不新增依赖 |
| `data/schedule.json` 为旧结构，无 `manual/muted` | 读取兜底 + 原子写入保持 |

---

## 2. 数据模型与合并规则

### 2.1 类型

```ts
// lib/constants.ts
export type CourseSrc = "jw" | "img" | "manual";

// lib/types.ts
export interface CourseItem {
  id?: string;      // 手动条目稳定标识
  note?: string;    // 批注，如"国庆调休补课"
  name: string;
  day: number;      // 1=周一 … 7=周日
  periods: number[];
  weeks: number[];
  place: string;
  teacher: string;
  kind: CourseKind;
  src: CourseSrc;
  project?: string;
}

export interface ManualMute {
  id: string;
  name: string;
  day: number;
  periods: number[];
  weeks: number[];
  reason?: string;
}

// lib/storage.ts
export interface ScheduleFile {
  jw: CourseItem[];
  img: CourseItem[];
  manual: CourseItem[];
  muted: ManualMute[];
  updatedAt: string | null;
}
```

`ScheduleFile` 名称保持不变（页/上传组件已使用），只扩字段。

### 2.2 合并管线

1. **Step 1 碎片收拢**：`normalizeItems` 的合并 key 增加 `src`，只允许同 src 内归并；保留 `id`/`note`（取首个非空）；删除跨 src 的 `src` 归并逻辑。
2. **Step 2 停课剔除**：遍历 `muted`，匹配 `jw/img` 的 `name + day + periods`（含重叠节次），从 `weeks` 中减去 `muted.weeks`；减空即移除，并写入报告。
3. **Step 3 优先级让位**：
   - `priority()` 对 `src === "manual"` 直接返回最高分（高于 `lab/img` 任意组合）；
   - 非 manual 维持 `lab(2) > practice(1) > theory(0)`，同类型 `img > jw`；
   - 高优先级课程与低优先级课程同 `day` 且 `periods` 重叠时，从低优先级 `weeks` 减去重叠周次，减空即删。

### 2.3 报告类型

```ts
export interface MergeReport {
  merged: ResolvedItem[];
  trimmed: Array<{ item: CourseItem; lostWeeks: number[]; cause: "override" | "mute" }>;
  removed: CourseItem[]; // 仅"被高优先级吃掉"
  mutes: Array<{
    item: CourseItem;
    mute: ManualMute;
    lostWeeks: number[];
    emptied: boolean;
  }>;
}
```

---

## 3. API 变更

`app/api/schedule/route.ts`：

- `GET`：返回 `{ jw, img, manual, muted, updatedAt }`，旧文件缺省自动补 `[]`。
- `PATCH`：Zod 校验 `{ manual?: CourseItem[]; muted?: ManualMute[] }`，部分更新；服务端强制 `manual[].src = "manual"`、`uniqSorted(periods/weeks)`；空 `weeks`/`periods`、非法 `day` → 400；复用 `writeSchedule` 原子写入，返回完整 `ScheduleFile`。
- `DELETE`：`?scope=manual` 仅清 `manual`/`muted`；无参数全量重置。
- `/api/sync` 与 `/api/parse-image` 不改逻辑，existing spread 自动保留新字段。

---

## 4. 前端与交互

### 4.1 `lib/manual.ts`（纯函数）

- `addManual(state, draft)`
- `editCourse(state, target, scope, draft)`：
  - `manual` 且 `all` → 原地替换；
  - `manual` 且 `week` → 拆分为"原条目减周 + 新条目单周"；
  - `jw/img` 且 `week` → 生成 mute（`weeks:[N]`）+ 新 manual 条目（`weeks:[N]`）；
  - `jw/img` 且 `all` → 生成 mute（`weeks: target.weeks`）+ 新 manual 条目。
- `muteCourse(state, target, scope, reason)`；`removeManual`；`restoreMute`；`clearManual`。
- id 规则：manual `m_<uuid>`；关联 mute `mute_<manualId>`；独立停课 `mute_<uuid>`。
- 撤销 manual 时删除 `mute_<manualId>`，恢复原课周次。

### 4.2 `components/course-editor-dialog.tsx`

- 新建/编辑两态；编辑时顶部 scope 分段"仅第 N 周 / 全部周次"。
- 字段：课程名、星期、节次、周次、地点、教师、类型、批注。
- `periods/weeks` 实时复用 `parsePeriods/parseWeeks`；解析为空 → 红字校验且禁用保存。
- 编辑 `jw/img`：按 scope 显示"停课本周 / 删除整门"；编辑 `manual`：显示"删除"。
- `note` 同时作为 mute 的 `reason`。

### 4.3 `components/schedule-grid.tsx`

- props 增加 `manual`、`muted`、`onCommit`；内部 `resolveWithReport([...], muted)`。
- 卡片改 `<button>`，点击打开编辑器；空单元格加 hover/focus 才显形的 `+`。
- 表头增加"+ 手动加课"按钮与"手动调课"图例。
- manual 卡片：左侧 3px `border-ink` + "手动调课"文字标签 + `.red-note` 批注。
- 红笔批注接入 `cause: "mute"` 与 `report.mutes`，文案"手动停课/剔除"。
- `key` 优先使用 `it.id`。

### 4.4 `components/manual-log.tsx`

- 折叠摘要"手动校对记录（N 处修改）"；展开列出手动课程与停课记录。
- 每条可撤销；底部"清空手动修改"→ `DELETE /api/schedule?scope=manual`（二次确认）。

### 4.5 `components/merge-flow.tsx`

- props 增加 `manual`、`muted`。
- 新增第三个输入节点"手动调课（manual 条目数 + muted 停课数）"，墨色（`ink`）连线汇入"校对合并"。
- 重排坐标与画布高度；空状态判断加入 manual/muted。

### 4.6 `components/export-bar.tsx`

- props 增加 `manual`、`muted`，导出 `resolveSchedule([...jw,...img,...manual], muted)`。

### 4.7 `app/page.tsx`

- `EMPTY_SCHEDULE` 补 `manual: []`、`muted: []`。
- 新增 `commitManual(next) → PATCH` 与 `clearManual() → DELETE?scope=manual`，成功后 `setSchedule`。
- 传给 `ScheduleGrid`、`ManualLog`、`MergeFlow`、`ExportBar`。
- `ImageUploader` 的 `onParsed` 保持接收完整 `ScheduleFile`。

### 4.8 视觉规范（DESIGN.md）

- 不引入第四色；manual 用墨色色条 + 文字标签，不单靠颜色承载语义。
- 弹窗与面板使用 `.sheet`；批注 `.red-note`；危险操作用 `variant="vermilion"`。
- 交互只做底色/边框变化；`focus-visible` 靛青环可见；尊重 `prefers-reduced-motion`。

---

## 5. 实施步骤（按依赖顺序）

### 阶段 A｜数据模型与存储
1. `lib/constants.ts`：`CourseSrc` 加 `"manual"`；`SRC_RANK` 补 `manual`；新增 `MANUAL_RANK`。
2. `lib/types.ts`：`CourseItem` 加 `id?`/`note?`；新增 `ManualMute`；`makeCourseItem` 保持兼容。
3. `lib/csv.ts`：`SRC_CN` 加 `"manual": "手动"`。
4. `lib/storage.ts`：`ScheduleFile` 扩字段；`emptySchedule`/`sanitize` 扩展；导出纯函数 `normalizeScheduleData(raw)` 处理旧文件兜底与 mute 清洗；写入时强制 manual src、排序去重。
5. `data/schedule.json` 不手工改（读取兜底，首次 PATCH 后自然补齐）。

### 阶段 B｜合并核心
6. `lib/normalize.ts`：key 加 `src`；保留 `id`/`note`；移除跨 src 归并。
7. `lib/resolve.ts`：`priority()` 处理 manual；抽出 `applyMutes`；`resolveSchedule`/`resolveWithReport` 接 `muted`；报告扩容；保证不改入参。

### 阶段 C｜API
8. `app/api/schedule/route.ts`：`PATCH`（Zod + 原子写）与 `DELETE ?scope=manual`。

### 阶段 D｜编辑逻辑与 UI
9. 新建 `lib/manual.ts`。
10. 新建 `components/course-editor-dialog.tsx`。
11. 新建 `components/manual-log.tsx`。
12. 改 `components/schedule-grid.tsx`。
13. 改 `components/merge-flow.tsx`。
14. 改 `components/export-bar.tsx`。
15. 改 `app/page.tsx`。

### 阶段 E｜测试与验收
16. `test/resolve.test.ts` 新增：manual 最高优先级、manual 单周覆盖、muted 单周/全周/重叠节次、muted 不作用于 manual、单周调课拆分、重新传入同一 jw 后 mute 仍生效、报告 `cause/mutes`。
17. `test/normalize.test.ts`：改跨 src 断言，新增"同 src 仍归并 / 跨 src 不归并 / id·note 保留"。
18. 新建 `test/manual.test.ts`：新增、单周调课、整门改、停课、撤销联动恢复、manual 单周拆分。
19. 新建 `test/storage.test.ts`（纯函数）：旧 JSON 缺字段兜底、脏数据清洗、mute 缺字段丢弃。
20. 依次 `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`，全绿才算完成。

---

## 6. 测试用例清单

### resolve
- `priority({ src: "manual" })` 高于任意 lab/img 组合。
- manual 理论课覆盖同格 img 实验课的周次；manual 优先于 lab。
- manual 与 jw 部分节次重叠 → 按周裁剪。
- mute 单周：jw 1-16 → 1-7,9-16，报告 `cause: "mute"`。
- mute 全周：整条移除，`emptied: true`。
- mute 按重叠节次匹配（mute `[4,5]` 命中课程 `[3,4]`）。
- mute 不影响 manual。
- 单周调课组合：mute `[8]` + manual 周五 `[8]`。
- 同一 jw 重新传入 + muted 保持不变 → 结果稳定。

### normalize
- 同 src 碎片仍归并，周次取并集。
- 跨 src（jw vs img）同型同教室不归并。
- `id`/`note` 在归并时保留首个非空。

### manual
- 手动新增。
- 单周调课生成 mute + manual，且 id 关联正确。
- 整门修改生成整门 mute。
- 停课单周/整门。
- 撤销 manual 时删除关联 mute，原课恢复。
- manual 单周拆分（原条目减周 + 新条目单周）。

### storage
- 旧 JSON 缺 `manual`/`muted` → `[]`。
- 脏条目（缺 name/day/periods/weeks）被过滤。
- mute 缺必填字段被丢弃。

---

## 7. 风险与已知限制

- **normalize 行为变更**：跨 src 合并取消后，同格同型课程交由 `resolve` 按 `img > jw` 裁剪；可见结果不变，但合并报告会多出"让位"记录，`normalize.test.ts` 需同步调整。
- **同名同天同节多门课**：mute 按 `name+day+periods` 匹配会同时命中；符合规格，面板文案需提示"同名课程会一起停"。
- **编辑的是已让位后的周次**：网格点击拿到 resolved 条目（weeks 已裁剪），整门修改/停课按显示周次处理；原课若被 img 覆盖，mute 不含已被覆盖的周。
- **manual 单周拆分后撤销**：原条目已减周，撤销新建条目不会自动补回该周（无历史栈）；规格只要求 jw/img 调课可联动恢复，本轮按此实现并在面板文案提示。
- **并发 PATCH**：本地单用户，read-modify-write 足够；同一时刻多次提交由 UI 串行（保存中禁用按钮）。
- **无新增依赖**，不触碰数据库/迁移。
- **待人工验收**：真实教务 Cookie 同步后手动调课、截图重新解析后手动修改仍保留，需要用户凭据/真实链路。

---

## 8. 验收口径

- 旧 `data/schedule.json` 启动不报错，页面正常渲染。
- 新增/调课/停课后刷新页面，改动仍在；重新同步 `/api/sync` 后手动修改仍在。
- 导出 ICS/CSV 与课表显示一致（含 manual，排除被 mute 的周）。
- 合并图出现"手动调课"节点与墨色连线。
- `npm run lint`、`npm run typecheck`、`npm test`、`npm run build` 全部通过。
