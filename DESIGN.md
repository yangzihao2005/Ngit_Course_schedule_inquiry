# 设计系统 — 课表校对室（纸面校样）

本项目采用「纸面校样」视觉系统。核心隐喻：**教务课表是一张校样，实验课截图是红笔修改**。
界面应像一张被校对过的学期挂图：纸面、墨字、双色印刷，精确且安静。

---

## 技术栈

- **框架：** Next.js App Router + React + TypeScript
- **样式：** Tailwind CSS v4，通过 `app/globals.css` 中的 `@theme inline` 配置
- **组件：** `components/ui` 下的轻量 primitives（button / input / card / badge / label / select）
- **图标：** Lucide React（仅用于按钮与状态，不用作装饰）
- **字体：** 显示与数字用 Newsreader（衬线，校历感）；界面与表格用 Archivo（无衬线，tabular-nums）
- **主题：** 浅色单主题（纸面）。不使用 next-themes，不做暗色拟态

---

## 视觉方向

- 纸面底、墨色字、靛青与校对红双墨，像印刷的课程表。
- 结构全部来自课表格线与刻度；不使用玻璃拟态、发光、渐变光晕、阴影堆叠。
- 「红笔」的用法：截图修正以左侧红条 + 「截图修正」标签标注，格内不堆周次数字；周次与让位详情放悬停提示与无障碍文本。
- 排除的套路：奶油底+陶土红+衬线模板、全大写眉标、mono 小标签、中点串接的元信息、按钮箭头。

---

## Tokens

语义 token 位于 `app/globals.css`，通过 `@theme inline` 桥接到 Tailwind。

| Token | 值 | 用途 |
| --- | --- | --- |
| `paper` | `#f5f4ee` | 页面底色 |
| `sheet` | `#fbfaf6` | 稿纸/面板底色 |
| `ink` | `#1b1d21` | 正文与主按钮 |
| `indigo` | `#2b4a6f` | 教务数据、结构线、焦点环 |
| `vermilion` | `#c73327` | 截图修正、让位/删除线、今天、危险操作 |
| `rule` | `#d7d4c8` | 发丝线、格线、边框 |
| `muted` | `#6f6f66` | 辅助文字 |

语义映射（组件可混用）：`background=paper`、`foreground=ink`、`card=sheet`、`primary=indigo`、
`accent=vermilion`、`border=rule`、`destructive=vermilion`。

对比度：ink/paper ≈ 13:1，indigo/paper ≈ 8:1，vermilion/paper ≈ 4.8:1（小字号可读）。

---

## 排版

| 角色 | 字体 | 用法 |
| --- | --- | --- |
| 显示 | Newsreader + CJK 回退（Source Han Serif SC / Songti SC / SimSun） | 页题、周数大字、卡片标题 |
| 界面 | Archivo + CJK 回退（PingFang SC / Microsoft YaHei） | 正文、控件、课表内容 |

- 周尺的大周数用 Newsreader 64px，`tabular-nums`；日期、时间、周次、教室号一律 `.tnum`。
- 卡片标题 `font-display text-[19px] font-semibold`；正文 14px / 行高 1.7。
- 辅助文字用 `.label-quiet`（12px、muted）。**不使用全大写眉标，不使用 mono 装饰性小标签。**

---

## 核心工具类

定义于 `app/globals.css`：

- `.sheet`：唯一面板样式——稿纸底、1px 线灰边、2px 圆角、无阴影。
- `.label-quiet`：安静的辅助文字。
- `.red-note`：红笔批注（调整提示文字）。
- `.grid-paper`：灰底 + 1px 缝隙 = 时刻表发丝格线。
- `.stage`：合并图画布（稿纸 + 极淡网格）。
- `.tnum`：表格数字对齐。
- `.settle`（+ `.settle-2/3/4`）：一次性入场「落定」动画。

---

## 组件

- **按钮**：直角（3px 圆角）、13px。`default` 墨色实心，`outline` 细线，`quiet` 文字按钮，`vermilion` 危险操作。无悬浮位移。
- **输入**：稿纸底、1px 线灰边，focus 时靛青描边 + 2px 淡环。
- **课表单元格**：左边 3px 色条承载来源语义（靛青=教务，校对红=截图修正），同时必配文字标签（不单靠颜色）。同一门课只出现一条（`lib/normalize` 把每周一行的碎片收拢为周次并集，教室写法变体归一）；格内不显示周次数字，悬停可见周次与让位详情。
- **周尺**：每格一周的刻度条——有课=墨灰短刻、无课=线灰更短、今天=校对红高刻、选中=墨色。点击刻度即换周。
- **合并图节点**：稿纸卡 + 细线分隔的字段表；连线颜色随语义（靛青=教务流，校对红=修正流，墨=结果）。

---

## 布局

自上而下：页眉（题字 + 工具行）→ 周尺 + 周课表（主角，全宽）→ 实验课截图｜合并过程 → 导出条 → 页脚注记。

- 容器 `max-w-[1440px]`，间距 4/5 的 16-20px 节奏。
- 时刻表 `min-w-[880px]` 横向滚动；周尺窄屏横向滚动保持刻度可读。
- 文案左对齐；数字右对齐或等宽对齐。

---

## 交互与动效

- 入场：整页一次性「落定」（staggered 90ms 级差），无逐卡悬浮动画。
- hover 只做底色/边框变化；focus-visible 靛青描边环必须可见。
- 尊重 `prefers-reduced-motion`。

---

## 无障碍

- 颜色不单独承载语义：红色修正同时带「截图修正」文字标签。
- 课表单元格提供纯文本 `aria-label`（星期 + 时间 + 课程名）。
- 周尺刻度是按钮，带 `aria-label` 与 `aria-pressed`。
- 时刻表与合并图在移动端保持可滚动、可操作。
