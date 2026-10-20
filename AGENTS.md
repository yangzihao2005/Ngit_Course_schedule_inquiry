# AGENTS.md

## 关键规则（必须遵守）

### 响应
- 回复简洁、切中要点，除非用户要求详细说明

### 规划模式
- 先做一轮澄清，列出关键未知项；随后给出"默认假设"并继续，用户未反对即视为接受
- 不自行假设技术栈、设计方向或核心功能范围
- 复杂计划在呈现前，用深度研究子代理从以下维度审查：可行性、风险、遗漏依赖、与现有架构的冲突
- 审查发现的问题必须并入计划，或转为向用户的提问

### 变更/编辑模式
- 优先把实现任务交给子代理，主 Agent 负责拆分、协调和验收
- 识别可并行的变更并行执行；有依赖的按顺序执行
- 按任务复杂度选择模型：编码/架构用高级模型，文档/简单改动用中端模型
- 若当前环境不支持子代理或指定模型，由主 Agent 顺序执行，并在回复中说明降级原因
- 每次改动后运行项目定义的质量检查命令（见"项目"节），全部通过才算完成

### 数据库模式变更
- 修改数据库 schema 后，按项目定义的方式生成并应用迁移（见"项目"节）
- 禁止使用任何会绕过迁移流程、直接改动数据库的命令
- 迁移文件生成后需人工确认再提交

### 测试
- 使用项目现有的测试工具和脚本
- 不得假设改动可用，必须运行相关测试
- 若无可用测试工具/脚本，先询问用户是否跳过，并记录跳过原因

### UI 设计
- 创建或审查组件/页面时，遵循项目定义的设计系统（见"项目"节）
- 若设计系统文件不存在或无法读取，停止 UI 改动并询问用户
- Design System:@DESIGN.md

## 项目
- 技术栈：Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + AI SDK v7 + @xyflow/react
- 包管理器：npm
- 命令：
  - 安装：`npm install`
  - 开发：`npm run dev`
  - Lint：`npm run lint`
  - 类型检查：`npm run typecheck`
  - 测试：`npm test`
  - 构建：`npm run build`
- 数据库迁移方式：无数据库（`data/schedule.json` 本地 JSON 存储，不走迁移）
- 设计系统文件路径：`DESIGN.md`

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
