# PROMPT.md

我们正在构建一个轻量级的「AI 课表同步（AI Schedule Sync）」应用。

这个应用的核心目的是解决一个真实的痛点：大学教务系统里，实验课的教室信息通常是错的。老师往往通过发 Excel 或截图来通知真实的实验教室。

应用应允许用户从教务系统**真实爬取**基础课表（复刻 `schedule-tool` 的 Python 逻辑，改为 Node.js 实现，最多需手动更新 Cookie），再上传实验课截图（利用 Vision LLM 解析），两者合并后，让用户直观地看到修正后的课表。最后，用户可以导出为 `.ics` 或 `.csv`。

保持小范围：不做鉴权，不接数据库（使用本地 JSON 存储），不做支付。使用 Node.js + Next.js (App Router)、Tailwind CSS 和 shadcn/ui。图像解析使用 Vercel AI SDK 配合 OpenRouter（默认选中 MiMo 模型，但允许用户在前端切换 API Key 或模型配置）。

对于 UI，使用 dark-first 的「founder war-room / blueprint desk」视觉系统。包含一个 ReactFlow 可视化，用来展示「教务源数据」与「图片解析数据」之间的冲突与合并过程。

请规划架构、组件、路由、数据流和实施步骤。

## 核心实体与数据模型
- **CourseItem**：基础单元。
  - `name` (string，课程名)
  - `day` (number，1=周一，7=周日)
  - `periods` (number 数组，如 [1, 2] 表示第 1-2 节)
  - `weeks` (number 数组，如 [1, 2, 7] 表示第 1、2、7 周)
  - `place` (string，如 "A406")
  - `teacher` (string)
  - `kind` (string："theory" 理论 | "lab" 实验 | "practice" 实践)
  - `src` (string："jw" 教务来源 | "img" 图片来源)

## 核心功能
1. **教务爬取**：实现 `/api/sync` 路由，向学校教务系统（如 `jwjxnew.njit.edu.cn`）发送 POST 请求，带上用户提供的 Cookie，拉取并解析 `kbList` JSON，作为基础数据（`src: "jw"`）。
2. **图片解析**：上传实验课截图。前端提供 API Key / 模型选择（默认 MiMo），后端使用 OpenRouter 提取结构化 JSON（`src: "img"`）。
3. **冲突合并**：将解析出的 `img` 项与 `jw` 项合并。规则：实验课（`kind: "lab"`）在同 `day`、同 `periods` 且 `weeks` 重叠时，覆盖理论课对应的周次。
4. **可视化**：
   - 周课表网格，展示合并结果。
   - ReactFlow 图表，展示合并过程（原始教务数据 + 图片数据 -> 合并后的数据）。
5. **导出**：支持导出合并后的全量或指定周次的 `.ics` 和 `.csv` 文件。

## 推荐技术栈
- 框架：Next.js (App Router)
- 样式：Tailwind CSS v4
- UI 组件：shadcn/ui, Lucide React
- LLM 集成：Vercel AI SDK + OpenRouter
- 图表可视化：ReactFlow
- 爬虫与解析：原生 Node.js `fetch`（替代 Python 的 `httpx`），参考 `D:\课程表相关\schedule-tool` 的结构。
- 导出工具：原生 JS 生成 ICS 和 CSV。

## 页面/路由
- `/`：主「规划桌（Planning Desk）」工作区。
  - **顶栏**：教务 Cookie 配置输入框、「同步教务课表」按钮、API Key 与模型选择下拉框。
  - **左栏**：图片上传区、AI 解析状态，以及 ReactFlow 数据合并可视化。
  - **右栏**：最终课表网格，附带「导出 ICS」和「导出 CSV」按钮（支持选择全部或指定周次）。

## 实施步骤
1. **初始化**：Next.js 初始化，配置 Tailwind 和 shadcn/ui。
2. **数据模型**：定义 `CourseItem` 接口，创建本地存储机制。
3. **教务爬取**：实现 `/api/sync`，移植 `schedule-tool` 的逻辑，处理教务响应并存入状态（仅覆盖 `src: "jw"`）。
4. **核心逻辑（合并）**：编写 `resolveSchedule(items)`，处理周次裁剪与优先级。
5. **前端 UI（课表）**：构建时间轴网格，渲染合并结果。
6. **AI 集成**：实现 `/api/parse-image`，允许传入 API Key / Model 参数，返回验证后的 `CourseItem[]`。
7. **ReactFlow 可视化**：构建数据流图。
8. **导出功能**：实现前端 ICS 和 CSV 生成（`utf-8-sig`），处理星期/节次到具体日期的映射（第 1 周从 2026-08-31 开始，第 1 节 08:00 开始，45 分钟/节）。

## 风险与边缘情况
- **教务 Cookie 失效**：接口返回 HTML 而非 JSON。需捕获并提示用户更新 Cookie。
- **LLM 幻觉**：Vision 模型可能返回无效 JSON。后端必须用 Zod 等工具校验，丢弃无效项。
- **时区/日期映射**：`Date` 对象跨月、单双周处理极易出错，需仔细测试 ICS 导出逻辑。
- **大图片限制**：前端需限制上传图片尺寸，或依赖模型端限制。

## 最终可复制的 Coding Agent 启动提示词
> 你正在构建「AI Schedule Sync」，一个 Next.js (App Router) 应用，使用 Tailwind CSS、shadcn/ui、ReactFlow，以及 Vercel AI SDK + OpenRouter。
> 
> 首先，定义 TypeScript 接口 `CourseItem`：name, day (1-7), periods (number[]), weeks (number[]), place, teacher, kind ("theory" | "lab" | "practice"), src ("jw" | "img")。
>
> 创建 `resolveSchedule(items: CourseItem[])`：如果 `img` (lab) 与 `jw` (theory) 在 day 和 periods 重叠，lab 优先，从 theory 的 weeks 中减去重叠周次，若减完为空则删除该项。
> 
> 实现 `/api/sync`：接收 Cookie，POST 到 `jwjxnew.njit.edu.cn` 获取 `kbList`，解析字段（kcmc, xqj, jcs, zcd, cdmc, jxb_id 等），返回 `src: "jw"` 的 `CourseItem[]`。
>
> 实现 `/api/parse-image`：接收图片和用户在 UI 上选的 API Key、Model。使用 Vercel AI SDK 和 OpenRouter 提取 `CourseItem[]`，必须经过 Zod 校验。
> 
> UI 采用暗黑蓝图风格。顶部栏有 Cookie 输入、同步按钮、API Key 和模型选择器。左侧边栏用于图片上传和展示合并逻辑的 ReactFlow 图。右侧是周课表网格，支持导出 ICS/CSV。ICS 导出需假设第 1 周从 2026-08-31 开始，第 1 节 08:00 开始，持续 45 分钟。