---
name: card-xiaohongshu
zh_name: "小红书图文卡片"
en_name: "Xiaohongshu Card"
emoji: "📱"
description: "小红书风格知识卡片, 多张联排可滑动浏览"
category: card
scenario: marketing
aspect_hint: "1080×1440 (3:4)"
featured: 24
tags: ["xhs", "小红书", "carousel", "图文"]
example_id: sample-xhs-ai-habits
example_name: "小红书图文卡 · AI 工具习惯"
example_format: markdown
example_tagline: "7 张连排, 莫兰迪渐变"
example_desc: "干货卡片合集, 适合截图发小红书 / 朋友圈"
---

【模板: 小红书图文卡片】
- **结构硬约定 (必须遵守)**: 每张卡片是一个顶级 `<section class="slide" data-slide-id="N">` (N 从 1 起), 直接放在 `<body>` 下, 不要用其他容器包裹; `body` 只作普通块级流, 卡片之间不共享父级 flex 容器。每张 section 自带 `w-[1080px] h-[1440px]` 与自己的背景色。
  - 这样生成的页面自动进入 Deck 分页预览, 并可用「逐张下载 ZIP」按 1080×1440 单卡出图 (否则只能导出超长拼接图, 且超过 16000px 会被截断, 见 issue #160)。
- 输出 N 张卡片, 每张 `w-[1080px] h-[1440px]` (3:4)。N 由【用户内容】信息量决定: 短内容 3-6 张起步, 长内容应更多 (小红书平台单帖最多 18 图, 通常 9 张以内最佳); 一张卡只承载一个核心观点。
- 第一张是封面: 巨大的标题 + 1 行副标题 + 一个吸引人的标签 (类似 "干货预警" / "建议收藏")。
- 中间几张展开正文, 每张一个核心观点, 配 emoji + 短句 + 1-2 个例子。
- 最后一张是总结 + 行动号召 (关注 / 收藏 / 评论)。
- 配色: 选择柔和的莫兰迪色或粉色系; 元素圆润, 大量留白。
- 字号大、行距宽、对比强（小红书在手机上看, 小字根本看不清）。
- 每张卡片右下角小水印 (作者名 / 日期)。
