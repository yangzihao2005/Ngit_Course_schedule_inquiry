# PROMPT.md — 手动调课与课表编辑（增量功能规格）

我们在现有「AI Schedule Sync · 课表校对室」基础上，新增手动调课与课程增删改（Manual Editing & Override）功能。

这个功能的核心目的是解决「教务同步 + 实验课截图覆盖」之后的最后一公里痛点：**老师临时调课、单周停课、补课、换教室，或实验课截图识别出个别偏差时，用户需要直接在课表上手动增删改某节课（支持单周调整或整门修改）**。

设计原则：**不直接破坏 `jw`（教务底表）和 `img`（截图解析）原始数据**，而是引入最高优先级的「人工校对层（`manual` + `muted`）」。这样即使重新同步教务课表，用户之前手动停掉的周次或调课记录依然保留，且随时可以一键撤销回退。

## 核心实体与数据模型变更

在 `lib/types.ts` 与 `data/schedule.json` 中扩展如下结构：

1. **CourseItem 扩展**：

   * `id?: string`（可选稳定标识，便于手动条目精准编辑与删除）

   * `src`: `"jw" | "img" | "manual"`（新增 `"manual"` 手动调课来源）

   * `note?: string`（可选批注，如 `"国庆调休补课"`、`"临时换至 B204"`）

2. **ManualMute（停课/屏蔽规则）**：
   用于记录对 `jw` 或 `img` 课程的「单周停课」或「整门剔除」，避免重新同步教务时丢失删除状态：

   * `id`: `string`

   * `name`: `string`（目标课程名）

   * `day`: `number`（1=周一 … 7=周日）

   * `periods`: `number[]`（目标节次，如 `[1, 2]`）

   * `weeks`: `number[]`（被人工剔除的周次，如 `[8]` 表示仅第 8 周停课，传入全部周次即整门删除）

   * `reason?: string`（可选原因，如 `"第8周老师出差停课"`）

3. **ScheduleData（`data/schedule.json` 存储结构）**：

   * `jw`: `CourseItem[]`（教务源数据，`/api/sync` 仅覆盖此字段）

   * `img`: `CourseItem[]`（截图解析数据）

   * `manual`: `CourseItem[]`（手动新增或调课生成的课程项，默认 `[]`，向后兼容旧 JSON）

   * `muted`: `ManualMute[]`（手动停课/剔除记录，默认 `[]`，向后兼容旧 JSON）

   * `updatedAt`: `string`

## 核心功能与合并规则

1. **三层校对合并管线（`lib/normalize.ts` + `lib/resolve.ts`）**：

   * **Step 1 — 碎片收拢**：分别对 `jw`、`img`、`manual` 执行 `normalize`，合并同课同时间段的周次碎片。

   * **Step 2 — 停课剔除（Mute 应用）**：遍历 `muted` 列表，若 `jw` 或 `img` 中的课程在 `name + day + periods`（含重叠节次）匹配，则从其 `weeks` 中减去 `muted.weeks`；若 `weeks` 减空则移除该课，并写入裁剪报告（标注为「手动停课/剔除」）。

   * **Step 3 — 优先级占格让位**：

     * 来源与类型优先级调整为：**任何 `src: "manual"` 的课程拥有最高裁决权**（高于 `img` 和 `jw`，无论 `kind` 是 `theory`、`practice` 还是 `lab`）；在非 `manual` 内部，保持原有的 `lab(2) > practice(1) > theory(0)` 且同类型 `img > jw`。

     * 当 `manual` 课程与 `jw` / `img` 在同一 `day` 且 `periods` 重叠时，自动从低优先级课程的 `weeks` 中减去重叠周次，减空即删，并在裁剪报告中记录「被手动调课覆盖」。

2. **四大高频操作场景**：

   * **手动新增课程 / 补课**：点击课表空白格或工具栏「+ 手动加课」，填写课程名、星期、节次（如 `1-2`）、周次（支持 `"8"`、`"1-16(单)"` 等容错语法）、地点、教师、类型、批注，写入 `manual`。

   * **单周临时调课（最常见）**：点击课表网格中的已有课程，选择「仅调整第 N 周（当前选中周）」——系统自动将该课程的第 N 周写入 `muted`，同时以修改后的星期/节次/地点生成一条 `weeks: [N], src: "manual"` 的课程。

   * **修改整门课程**：点击已有课程选择「应用到该课全部周次」——若原课来自 `jw`/`img`，自动将其原周次全部写入 `muted` 并生成新的 `manual` 条目；若原课本身就是 `manual`，直接原地更新该条目。

   * **停课 / 删除**：支持「仅停本周（第 N 周）」或「删除整门课」，以及在调课记录面板中一键「撤销某条手动修改」。

## 视觉与交互设计（严格遵循 `DESIGN.md` 纸面校样系统）

* **色彩与标识（不引入第四色，复用现有三墨系统）**：

  * 教务原表（`src: "jw"`）：左侧 3px 靛青色条（`indigo #2b4a6f`）+「教务」标签。

  * 截图修正（`src: "img"`）：左侧 3px 校对红色条（`vermilion #c73327`）+「截图修正」标签。

  * 手动调课（`src: "manual"`）：左侧 3px 墨色色条（`ink #1b1d21`）+「手动调课」文字标签（不单靠颜色承载语义），若有 `note` 则以 `.red-note` 样式展示简短批注。

* **课表网格直觉交互（`components/schedule-grid.tsx`）**：

  * 点击任意已有课程卡片 → 弹出轻量的 `.sheet` 风格校对抽屉/弹窗（CourseEditorModal），顶部提供分段切换：**「仅第 X 周（临时调课/停课）」** vs **「全部周次（整门修改/删除）」**。

  * 鼠标悬停空单元格（或点击课表右上角「+ 手动加课」按钮）→ 快速唤起新增课程表单，若从空白格点击则自动预填对应的 `day`、所在大节 `periods`（如第 1-2 节）以及当前周尺选中的周次。

* **合并流图扩展（`components/merge-flow.tsx`）**：

  * 在 ReactFlow 中新增第三个输入节点「手动调课（`manual` 条目数 + `muted` 停课数）」，使用墨色（`ink`）连线汇入「校对合并」中心节点。

## 页面/路由与 API 变更

* **`/api/schedule` 扩展**：

  * `GET /api/schedule`：返回 `{ jw, img, manual, muted, updatedAt }`（兼容旧文件缺省字段自动补 `[]`）。

  * `PATCH /api/schedule`：接收手动编辑操作（或直接提交更新后的 `{ manual, muted }`），通过 `lib/storage.ts` 原子写入 `data/schedule.json` 并返回最新完整状态。

  * `DELETE /api/schedule`：支持 `?scope=manual`（仅清空手动调课与停课记录，保留教务与截图数据）或全量清空。

* **前端工作区（`app/page.tsx`）**：

  * 状态编排新增 `manual` 与 `muted`，传入 `resolveSchedule`、课表网格与合并过程图。

  * 在课表上方或「实验课截图」旁展示简明的「手动校对记录（N 处修改）」，支持单条撤销或一键清空手动修改。

## 实施步骤

1. **数据模型与存储升级**：更新 `lib/types.ts` 与 `lib/storage.ts`，支持 `src: "manual"`、`ManualMute` 以及旧版 `data/schedule.json` 的无损向后兼容读取。

2. **合并核心逻辑升级**：在 `lib/resolve.ts` 中接入 `muted` 周次剔除逻辑，并将 `src: "manual"` 设为最高覆盖优先级，扩充裁剪报告类型。

3. **补充单元测试**：在 `test/resolve.test.ts` 中新增手动加课覆盖、单周停课（Mute）、单周调课拆分、重新同步 `jw` 后保留手动修改等测试用例。

4. **接口实现**：在 `app/api/schedule/route.ts` 中新增 `PATCH` 方法（含 Zod 校验）及 `DELETE ?scope=manual` 支持。

5. **编辑器组件与课表交互**：创建 `components/course-editor-dialog.tsx`，在 `components/schedule-grid.tsx` 中接入点击卡片编辑、点击空格新增、手动调课视觉标签，并在 `components/merge-flow.tsx` 中补齐手动调课节点。

6. **质量检查验收**：依次执行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`，确保全绿通过。

## 风险与边缘情况

* **旧版 `data/schedule.json` 兼容**：已有本地文件只有 `jw` 和 `img` 字段，`lib/storage.ts` 读取时必须默认兜底 `manual: []` 和 `muted: []`，严禁抛错。

* **单周调课后再改回原样**：当用户把某门课的第 8 周改到周五，会在 `muted` 产生一条第 8 周屏蔽记录，并在 `manual` 产生一条周五第 8 周记录；若用户随后删除周五这条 `manual` 课，UI 应提示或支持在「手动校对记录」中一并恢复原课第 8 周。

* **周次与节次输入容错**：用户在编辑弹窗手填周次（如 `"1-8, 10-16(双)"`）或节次（如 `"3-4"`）时，必须直接复用 `lib/parse.ts` 的 `parseWeeks` / `parsePeriods` 解析，若解析为空则在表单内给出即时红字校验提示，禁止写入空周次或空节次。

* **换教室碎片归一**：`lib/normalize.ts` 只应在同 `src` 内部归并碎片，绝不能把 `src: "manual"` 和 `src: "jw"` 的课在 `normalize` 阶段提前混并，必须留给 `lib/resolve.ts` 按优先级裁剪并生成让位报告。

## 最终可复制的 Coding Agent 启动提示词

> 你正在为现有的「AI Schedule Sync · 课表校对室」（Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS v4 + `@xyflow/react`）增量开发「手动调课与课表编辑」功能。请严格阅读并遵守项目根目录下的 `AGENTS.md` 与 `DESIGN.md`（浅色「纸面校样」设计系统）。
>
> ### 1. 数据模型与存储（`lib/types.ts` & `lib/storage.ts`）
>
> * 将 `CourseItem["src"]` 扩展为 `"jw" | "img" | "manual"`，并为 `CourseItem` 增加可选字段 `id?: string` 与 `note?: string`。
>
> * 新增 `ManualMute` 接口：`{ id: string; name: string; day: number; periods: number[]; weeks: number[]; reason?: string }`，用于记录对 `jw`/`img` 课程的停课或剔除周次。
>
> * 将 `data/schedule.json` 的存储结构扩展为 `{ jw: CourseItem[]; img: CourseItem[]; manual: CourseItem[]; muted: ManualMute[]; updatedAt: string }`。读取旧版 JSON 时若缺少 `manual` 或 `muted` 需自动回退为 `[]`；`/api/sync` 同步教务时仅覆盖 `jw`，保留 `img`、`manual` 和 `muted`。
>
> ### 2. 合并与让位规则（`lib/normalize.ts` & `lib/resolve.ts`）
>
> * `normalize` 保持按同 `src` 内部收拢碎片，不跨 `src` 混并。
>
> * 在 `resolveSchedule` 中：
>
>   1. 先应用 `muted`：对匹配的 `jw` / `img` 课程剔除 `muted.weeks` 中指定的周次（减空则删除），并在裁剪报告中记录。
>
>   2. 优先级排序：`src === "manual"` 的课程拥有最高优先级（高于一切 `img` 和 `jw`，不论 `kind` 为何）；非 `manual` 课程维持原有的 `lab(2) > practice(1) > theory(0)` 及同类型 `img > jw`。
>
>   3. 当高优先级课程与低优先级课程在同 `day` 且 `periods` 重叠时，从低优先级课程的 `weeks` 中减去重叠周次，减空即删。
>
> ### 3. 接口变更（`app/api/schedule/route.ts`）
>
> * 新增 `PATCH /api/schedule`：使用 Zod 校验请求体，支持更新 `manual` 与 `muted` 数组并原子写入 `data/schedule.json`。
>
> * 扩展 `DELETE /api/schedule`：当传入 `?scope=manual` 时仅清空 `manual` 与 `muted`；不带参数时清空全部本地课表数据。
>
> ### 4. UI 与交互（遵循 `DESIGN.md`「纸面校样」规范）
>
> * **视觉标识**：`src: "manual"` 的课表单元格使用左侧 3px 墨色色条（`border-ink`）并配 `「手动调课」` 文字标签，不引入设计系统之外的新颜色。
>
> * **编辑与新增弹窗**：
>
>   * 点击课表网格上的已有课程卡片可打开编辑面板，支持切换 **「仅当前选中周（第 N 周临时调课/停课）」** 与 **「该课全部周次（整门修改/删除）」** 两种作用范围。
>
>   * 支持点击课表空白格（自动带入对应星期、大节与当前周次）或顶栏/课表工具栏「+ 手动加课」按钮新增自定义课程，周次与节次输入复用 `lib/parse.ts` 容错解析。
>
>   * 提供简明的「手动校对记录」列表（展示已添加的手动课程与停课批注），支持单条撤销与一键清空手动修改。
>
> * **ReactFlow 合并图（`components/merge-flow.tsx`）**：新增「手动调课」输入节点，用墨色连线汇入合并节点。
>
> ### 5. 测试与验收
>
> * 在 `test/resolve.test.ts` 中补充针对 `manual` 最高优先级覆盖、`muted` 单周/全周停课剔除、单周调课拆分的 Vitest 单元测试。
>
> * 完成后依次运行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`，确保全部通过。