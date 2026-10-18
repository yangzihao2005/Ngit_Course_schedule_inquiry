# AI Schedule Sync — 架构与实施计划

> 状态：已实施，待人工链路验收（2026-10-17）
> 来源：`PROMPT.md` + `D:\课程表相关\schedule-tool`（Python 参考实现）+ `DESIGN.md`（视觉系统）

## 实施记录（2026-10-17）

- 已完成 §5 步骤 1-8；验收（步骤 9）：`npm run lint` / `npm run typecheck` / `npm test`（69 测试全绿）/ `npm run build` 全部通过；API 冒烟（sync 失效 Cookie→400 提示、parse-image 缺 Key→400、schedule 读写重置）通过。
- 与计划的偏差：
  - **降级**：designer/fixer 子代理模型（`opencode/deepseek-v4-flash-free`）不可用，UI（globals.css / layout / components/ui / 5 个组件 / page）由主 Agent 顺序实施。
  - `vitest@5` 与 `@types/node@20` peer 冲突 → `@types/node` 升到 `^22`。
  - Next 16 `cacheComponents` 不允许路由段 `export const runtime` → 移除（nodejs 本就是默认）。
  - 实际安装 AI SDK **v7**：结构化输出用 `Output.object`，失败异常为 `NoOutputGeneratedError`（计划中的 `NoObjectGeneratedError` 是旧命名），兜底走原文 JSON 提取。
  - 新增 `test/llm.test.ts`（rowsToItems 容错解析 + 兜底提取）；`parseDay("周天/星期天")→7` 修正了 Python 原实现的映射错误。
- **待人工验收**：真实链路（真实 Cookie 同步教务 → 真实 API Key 上传截图解析 → 合并 → 导出）需要用户凭据，自动化无法覆盖。

---

## 0. 已确认决策（澄清轮，2026-10-17）

| 项 | 决定 |
|---|---|
| ICS 时间映射 | 真实作息表（1-2节 08:00-09:40 … 9-10节 18:30-20:10），移植 Python `SECTION_START/END` |
| LLM 端点 | 默认 OpenRouter，前端可改 Base URL / Key / Model（兼容小米直连等 OpenAI 兼容端点） |
| 存储 | 课表数据落盘 `data/schedule.json`；Cookie 与 API Key 仅存浏览器 localStorage，**不落盘** |
| 学年学期 | UI 可选，默认 2026-2027 第一学期（`xnm=2026&xqm=3`，第二学期 `xqm=12`） |
| 测试 | 引入 vitest，覆盖核心纯逻辑 |
| 其他 | 包管理器 npm（有 package-lock.json）；默认模型 `xiaomi/mimo-v2.5`（omnimodal，支持图像）；原图不持久化，只存解析结果 |

---

## 1. 目录结构与数据流

```
app/
  page.tsx                    # 单页工作区（Planning Desk）
  layout.tsx                  # 字体 + next-themes dark
  api/sync/route.ts           # POST: cookie+xnm+xqm → kbList → CourseItem[] (src:"jw")
  api/parse-image/route.ts    # POST multipart: 图 + key/model/baseURL → CourseItem[] (src:"img")
  api/schedule/route.ts       # GET 读存储 / DELETE 重置
lib/
  types.ts                    # CourseItem + Zod schema（宽松字段，供 LLM 输出）
  constants.ts                # SEMESTER_START=2026-08-31, SECTION_START/END, PERIOD_GROUPS, DAY_CN
  parse.ts                    # parseWeeks/parsePeriods/parseDay/weekOf/inferKind/formatWeeks（移植 model.py）
  resolve.ts                  # resolveSchedule：lab>practice>theory，同格同节次按周次裁剪，减空即删
  jw.ts                       # fetchKbList/parseKbList（移植 jw.py，server-only）
  storage.ts                  # data/schedule.json 原子读写（tmp+rename）
  ics.ts / csv.ts             # 导出（csv 带 utf-8-sig BOM）
  utils.ts                    # cn()
components/
  ui/*                        # shadcn-style primitives
  top-bar.tsx                 # Cookie 输入(密码框) + 学年学期 select + 同步按钮 + LLM 配置
  image-uploader.tsx          # 拖拽上传 + 预览 + 解析状态
  merge-flow.tsx              # ReactFlow：jw 节点 + img 节点 → resolve 节点 → merged 节点
  schedule-grid.tsx           # 周一~周日 × 5 大节网格 + 周次选择 + 冲突徽章
  export-bar.tsx              # 导出 ICS/CSV（全部周 / 指定周）
test/                         # parse / resolve / ics / csv 单测
data/schedule.json            # { jw: [], img: [], updatedAt }（加入 .gitignore）
```

**数据流**：顶栏 Cookie → `POST /api/sync`（服务端 fetch `jwjxnew.njit.edu.cn/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151`，form-urlencoded，同 Python headers）→ 覆盖 `src:"jw"` → 左栏截图 → `POST /api/parse-image` → 追加 `src:"img"` → 前端 `resolveSchedule()` 出合并结果 → 网格 + ReactFlow + 导出。合并是纯前端函数，保证三处（网格/图/导出）一致。

---

## 2. 核心实体与功能（源自 PROMPT.md）

### CourseItem
- `name` (string，课程名)
- `day` (number，1=周一，7=周日)
- `periods` (number[]，如 [1, 2])
- `weeks` (number[]，如 [1, 2, 7])
- `place` (string，如 "A406")
- `teacher` (string)
- `kind` ("theory" | "lab" | "practice")
- `src` ("jw" | "img")

### 核心功能
1. **教务爬取**：`/api/sync`，POST 带用户 Cookie，拉取解析 `kbList` JSON → `src:"jw"`
2. **图片解析**：截图上传，前端配 API Key/模型（默认 MiMo），后端 OpenRouter 提取结构化 JSON → `src:"img"`
3. **冲突合并**：lab 在同 `day`、同 `periods` 且 `weeks` 重叠时，覆盖 theory 对应周次
4. **可视化**：周课表网格 + ReactFlow 合并过程图（jw + img → merged）
5. **导出**：全量或指定周次的 `.ics` / `.csv`

---

## 3. 关键实现要点

- **教务解析**：按 `(jxb_id, xqj, jcs, zcd)` 去重；`kcmc/xqj/jcs/zcd/cdmc|jxdd/xm` 容错解析，跳过无星期节次的课；响应非 JSON → 返回 400 +「Cookie 已失效」提示。
- **LLM 解析**：`generateText` + `Output.object`（**不用已废弃的 generateObject**）+ `createOpenAICompatible({ baseURL, apiKey })`；schema 字段用 `.nullable()`，day/periods/weeks 允许 string|number，之后走 Python `rows_to_items` 的宽容解析（`"周三"`→3、`"1-2"`→[1,2]、无周次列按 date 算周）；`NoObjectGeneratedError` 时回退提取 JSON 数组再解析；逐行校验丢弃无效项。
- **合并规则**：`KIND_RANK lab(2)>practice(1)>theory(0)`，严格更高优先级才裁剪；`img` 实验课从 `jw` 理论课的 weeks 中减去重叠周，减空删除（同 Python `resolve()`）。
- **ICS**：floating local time（不带 Z，规避时区）；`start_day + (week-1) 周 + (day-1) 天`；VEVENT 逐周展开，SUMMARY/LOCATION/DESCRIPTION；行折叠 75 字节。
- **ReactFlow**（`@xyflow/react` v12）：节点为 DESIGN.md 的 mini glass card 风格，边标注冲突周次数，`.blueprint-surface` 容器。
- **图片限制**：前端 ≤8MB、长边 ≤2000px canvas 压缩；服务端校验 base64 长度。
- **导出 CSV**：`utf-8-sig`（BOM），字段：课程名/星期/节次/周次/地点/教师/类型/来源。

---

## 4. 依赖增量

- deps：`zod` `ai` `@ai-sdk/openai-compatible` `@xyflow/react` `lucide-react` `clsx` `tailwind-merge` `class-variance-authority` `next-themes` `sonner` + 按需 `@radix-ui/react-*`
- devDeps：`vitest`
- 字体：`next/font/google`（IBM Plex Sans、IBM Plex Mono、Fraunces）

---

## 5. 实施步骤（按依赖排序）

1. **初始化**：装依赖、shadcn primitives、`globals.css` 按 DESIGN.md 重写 tokens/工具类、字体、`.gitignore` 加 `data/`
2. **核心纯逻辑**：`types/parse/constants/resolve` + vitest 单测（含单双周、`week_of`）
3. **存储**：`storage.ts` + `/api/schedule`
4. **教务爬取**：`jw.ts` + `/api/sync` + 顶栏 UI
5. **AI 集成**：`/api/parse-image` + 图片上传区
6. **课表网格**：合并渲染 + 周次选择
7. **ReactFlow 合并可视化**
8. **导出**：ICS/CSV + 单测（跨月、单双周、指定周过滤）
9. **验收**：`npm run lint` → `npx tsc --noEmit` → `npm test` → `npm run build` 全绿 + 手工链路（同步→上传→合并→导出）；回填 AGENTS.md「项目」节命令（此步需用户再次确认）

---

## 6. 自审发现（oracle 子代理被环境拒绝，由主 Agent 完成审查）

- **风险**
  - Cookie 失效 → 响应 HTML 而非 JSON：已兜底（try/catch + 明确提示）
  - LLM 幻觉/无效 JSON：回退提取 + 逐行 Zod 校验丢弃
  - ICS 日期映射（跨月、单双周）：vitest 覆盖 + floating local time
  - 大图片：客户端 canvas 压缩 + 服务端长度校验
  - `next/font/google` 构建需联网：离线时降级 system font
  - 教务接口为 `http://`：服务端 fetch，无混合内容问题
- **遗漏依赖**：见 §4；`date-fns` 不引入，手写日期映射
- **架构冲突**：无。`@/*` 别名已存在；`globals.css` 目前是 create-next-app 默认，需整体替换为 DESIGN.md token 体系
- **降级说明**：深度研究子代理调用被环境拒绝（"considered high risk"），审查由主 Agent 顺序完成

---

## 7. 页面/路由（源自 PROMPT.md）

- `/`：主「规划桌（Planning Desk）」工作区
  - **顶栏**：教务 Cookie 配置、「同步教务课表」按钮、学年学期选择、API Key 与模型选择
  - **左栏**：图片上传区、AI 解析状态、ReactFlow 数据合并可视化
  - **右栏**：最终课表网格，「导出 ICS」「导出 ICS」「导出 CSV」（全部或指定周次）
