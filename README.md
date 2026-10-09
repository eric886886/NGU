# NaxaStudio 动态首页（Motion 版）

把 naxastudio.com 首页的全部内容重新设计成一部自动播放的"短片"：打开网页就从头开始播放，依次展示每一部分内容，约 2 分 50 秒。

## 创意

官网 Logo 本身就讲了一个故事：一串散开的小点（想法）汇成波浪，组成 N，最后变成向上的箭头（行动），对应口号 "Turn ideas into action"。

整部短片由一群粒子贯穿始终。所有粒子都从 Logo 图片里采样，每个粒子都保留了 Logo 上对应位置的颜色。每一章，它们变成一种不同的形态：

| 章节 | 页面内容 | 粒子形态 |
| --- | --- | --- |
| Intro | 品牌名、纳想 | 一个"想法"光点炸开，拼成 Logo |
| Turn ideas into action | 首屏标题、介绍、两个按钮 | Logo 移到右侧，一道光从左到右扫过 |
| Live execution flow | 五个步骤 Capture → Improve | 粒子流穿过五道关口：散乱 → 收拢 → 分成三条 → 拼成块 → 汇成一束 |
| Owner pain points | 六个痛点 | 粒子风暴，痛点像通知一样一条条弹出，风暴越来越乱 |
| AI solutions | 六个 AI 方案和按钮 | 风暴平静成一个圆环，再从中心向六个方案"派出"数据流 |
| Business outcomes | 六项成果 | 卡片排成上升的台阶，一条光线沿台阶爬升，末端变成箭头 |
| ROI potential | 2x-5x、5x-10x、3 levers | 数字滚动计数，每张卡片里升起光柱 |
| For founders | 三个起步步骤 | "想法"光点沿路径逐个点亮步骤，最后落到按钮上 |
| Start practical | 三个入门项目 | 粒子搭成一个旋转的立方体（"一个系统"） |
| 结尾 | 标题、按钮、页脚 | 粒子重新拼回 Logo |

原首页的文字全部保留，一字未改，所有链接也指向原来的页面（`business-review.html`、`demo-center.html`、`zh.html` 等）。只多了三处衔接文字：开场光点旁的 "Idea"、开场的 "AI execution systems"（取自原页头），以及在痛点和方案两章之间重复了一次原标题里的 "It’s not as hard as you think."。

## 怎么看

直接用浏览器打开 `index.html` 即可，所有代码、样式和 Logo 数据都已经打包在这一个文件里。字体 Instrument Sans 从 Google Fonts 加载，没网时会自动换成系统字体。

## 播放控制

- 底部播放条：播放 / 暂停、上一章 / 下一章；点击或拖动进度条可以跳到任意位置，鼠标悬停会显示章节名
- 点击画面空白处：暂停 / 继续
- 键盘：空格暂停，← → 切换章节，Home / End 跳到开头 / 结尾
- 滚轮（电脑）或上下滑动（手机）：切换章节
- 倍速：1× / 1.5× / 2×
- "Read as page"（按页面阅读）：切换成普通的滚动网页，所有内容一次全部显示。系统开了"减少动态效果"的访客会直接看到这个模式；禁用 JavaScript 时也显示这个版本。
- 网址后面加 `?t=60` 可以从第 60 秒开始播放，加 `?read` 直接进入阅读模式

## 文件结构

```
index.html             构建好的单文件页面（直接用这个）
src/index.html         页面内容和每个元素的出场时间
src/motion.css         样式
src/motion.js          播放引擎和粒子
assets/                官网 Logo 原图，以及从中采样的粒子坐标、页头小图标
tools/build.js         把 src/ 和 assets/ 打包成 index.html
tools/sample-logo.js   从 Logo 图片采样粒子坐标（需要 Playwright）
```

## 怎么改

改完 `src/` 下的文件后，运行：

```
node tools/build.js
```

时间都写在 `src/index.html` 里：

- 每一章 `<section>` 上的 `data-dur` 是这一章的时长（秒）
- 元素上的 `data-at` 是它在本章第几秒出现，`data-dur` 是出现动画的时长
- `data-out` 是它在第几秒淡出；`data-outm` 也是淡出时间，但只在手机上生效（手机屏幕放不下时，先淡出段落，再让卡片接替它的位置）
- `data-forms="storm@0"` 指定粒子在本章第几秒变成哪种形态

例如想让某一章多停留几秒，把这一章的 `data-dur` 调大就行。
