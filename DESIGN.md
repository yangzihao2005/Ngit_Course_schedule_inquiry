# 设计系统

本项目采用 dark-first 的「founder war-room / blueprint desk」视觉系统。界面应像一块编辑式规划台面：戏剧化、战术化、精确，且高度可用。

---

## 技术栈

- **框架：** Next.js App Router + React + TypeScript
- **样式：** Tailwind CSS v4，通过 `app/globals.css` 中的 `@theme inline` 配置
- **组件：** `components/ui` 下的 shadcn-style primitives
- **图标：** Lucide React
- **字体：** UI 用 IBM Plex Sans，展示性标题用 Fraunces，技术标签/代码用 IBM Plex Mono
- **暗色模式：** `next-themes`，class-based，默认 dark
- **工具函数：** `@/lib/utils` 中的 `cn()`

---

## 视觉方向

本应用是一张实时的 AI 规划桌，而非通用 SaaS 仪表盘。

- 使用 dark ink 背景、warm paper 覆盖层、amber 命令强调色、teal 图高亮，以及偶发的 violet 景深。
- 在可见的 blueprint grid 纹理上使用 glassy panels。
- 优先使用大号编辑式展示标题，搭配紧凑字距（tight tracking）。
- 控件要有触感：rounded pills、inner shadows、hover 时轻微上浮、可见 focus rings。
- 避免通用的紫/白渐变、扁平灰色面板，以及默认风格的仪表盘。

---

## Tokens

所有语义 token 位于 `app/globals.css`，并通过 `@theme inline` 桥接到 Tailwind。

| Token | Light | Dark | 用途 |
| --- | --- | --- | --- |
| `background` | `oklch(0.94 0.032 86)` | `oklch(0.15 0.038 252)` | 页面画布 |
| `foreground` | `oklch(0.19 0.029 252)` | `oklch(0.94 0.034 88)` | 主文本 |
| `card` | `oklch(0.985 0.026 92 / 84%)` | `oklch(0.205 0.044 252 / 78%)` | 玻璃/纸质面板 |
| `primary` | `oklch(0.68 0.165 55)` | `oklch(0.78 0.16 61)` | Amber 命令操作 |
| `accent` | `oklch(0.78 0.122 174)` | `oklch(0.77 0.134 178)` | Teal 高亮与图能量 |
| `secondary` | `oklch(0.86 0.055 184 / 80%)` | `oklch(0.25 0.06 244 / 74%)` | 次级表面 |
| `muted` | `oklch(0.88 0.03 84 / 68%)` | `oklch(0.26 0.052 252 / 64%)` | 弱化表面 |
| `muted-foreground` | `oklch(0.42 0.036 252)` | `oklch(0.73 0.042 88)` | 辅助文案 |
| `border` | `oklch(0.24 0.035 252 / 18%)` | `oklch(0.98 0.02 88 / 14%)` | 面板与输入边框 |
| `ring` | `oklch(0.76 0.14 174)` | `oklch(0.8 0.15 178)` | Focus rings |
| `destructive` | `oklch(0.58 0.21 31)` | `oklch(0.68 0.21 31)` | 删除/错误操作 |

图表颜色使用 `chart-1` 至 `chart-5` 的 amber、teal、violet、coral、green 变体。

---

## 排版

| Token | 字体 | 用途 |
| --- | --- | --- |
| `--font-body` | IBM Plex Sans | 正文、控件、表单 |
| `--font-display-family` | Fraunces | Hero 标题、卡片标题、空状态 |
| `--font-code` | IBM Plex Mono | 模型名、标签、代码块、技术元数据 |

指南：

- Hero 标题使用 `font-display`、极紧凑字距、大尺度（`text-5xl` 至 `text-8xl`）。
- 卡片标题使用 `font-display text-xl font-bold tracking-tight`。
- 技术眉标使用 `.micro-label`：mono、uppercase、宽字距。
- 正文应保持可读，使用 `leading-7` 或 `leading-8`。

---

## 核心工具类

定义于 `app/globals.css`：

- `.planner-bg`：分层 blueprint grid、amber orb、teal orb、violet 景深光晕。
- `.glass-panel`：高冲击力的半透明 hero/header 面板，带 inner highlight。
- `.paper-card`：默认卡片处理，半透明表面加 deep shadow。
- `.blueprint-surface`：用于图表与空状态的紧凑网格表面。
- `.command-strip`：amber-to-teal-to-violet 条带，用于命令时刻。
- `.micro-label`：技术性 uppercase 标签样式。

---

## 组件

### Cards

卡片为圆角、半透明、有触感。

使用：

```tsx
<Card className="overflow-hidden">
```

避免纯白/灰色卡片。嵌套 item cards 应使用 `bg-background/30`、边框、backdrop blur 与 inner shadow。

### Buttons

Primary 按钮使用 `.command-strip`、pill 圆角、粗体字，以及 hover 上浮。Outline 按钮为半透明，hover 时应显现 amber/teal。

### Inputs

Inputs 与 textareas 使用 rounded-xl、半透明背景、inner shadows 与强 teal focus rings。它们应感觉像是嵌入在规划台面中。

### Badges

Badges 为 mono、uppercase、宽字距的 pills。用于系统状态、streaming mode 与模型元数据。

### Graphs

图表容器使用 `.blueprint-surface`。React Flow 节点应看起来像 mini glass cards，带 teal edge strokes 与紧凑的 mono 字段列表。

---

## 布局

使用宽阔的规划工作区：

```tsx
<main className="planner-bg min-h-screen flex-1 overflow-hidden">
  <div className="container mx-auto max-w-[1500px] px-4 py-8 lg:py-12">
```

主规划网格使用 sticky 左侧 command/graph rail 与更宽的右侧编辑工作区：

```tsx
grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)]
```

移动端保持单列，无 sticky 行为。

---

## 交互

- Hover 上浮：`hover:-translate-y-0.5`
- Focus：`focus-visible:ring-ring/50 focus-visible:ring-[3px]`
- Disabled：`disabled:pointer-events-none disabled:opacity-50`
- 页面入场：`animate-fade-up` 与 `animate-scale-in`
- 动效保持细微且有目的；避免分散编辑注意力的装饰性循环。

---

## 无障碍

- 所有交互控件保留可见 focus rings。
- 半透明面板上的文本保持高对比度。
- 为图表与生成数据提供文本表示。
- 控件在移动端必须保持可用，尤其是添加/删除/编辑操作。