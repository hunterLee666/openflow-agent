---
name: ppt-generation
description: 当用户请求生成、创建或制作演示文稿（PPT/PPTX）时使用此技能。通过为每张幻灯片生成图像并将其组合成 PowerPoint 文件来创建视觉丰富的幻灯片。
---

# PPT 生成技能

## 概述

此技能通过为每张幻灯片生成 AI 生成的图像并将其组合成 PPTX 文件来生成专业的 PowerPoint 演示文稿。工作流程包括使用一致的视觉风格规划演示文稿结构、按顺序生成幻灯片图像（使用上一张幻灯片作为风格参考）以及将它们组装成最终演示文稿。

## 核心能力

- 使用统一视觉风格规划和构建多幻灯片演示文稿
- 支持多种演示风格：商业、学术、极简、Apple Keynote、创意
- 使用图像生成技能为每张幻灯片生成独特的 AI 图像
- 通过使用上一张幻灯片作为参考图像来保持视觉一致性
- 将图像组合成专业的 PPTX 文件

## 演示风格

创建演示计划时选择以下风格之一：

| 风格 | 描述 | 适用于 |
|-------|-------------|----------|
| **glassmorphism** | 带模糊效果的磨砂玻璃面板、浮动半透明卡片、充满活力的渐变背景、通过分层创造的深度 | 科技产品、AI/SaaS 演示、未来感十足的演示 |
| **dark-premium** | 丰富的黑色背景（#0a0a0a）、发光强调色、微妙的光晕效果、奢侈品美学 | 高端产品、高管演示、高端品牌 |
| **gradient-modern** | 大胆的网格渐变、流畅的色调过渡、当代排版、活泼但精致 | 初创公司、创意机构、品牌发布 |
| **neo-brutalist** | 原始大胆的排版、高对比度、刻意的"丑陋"美学、反设计作为设计、受孟菲斯启发 | 边缘品牌、Z世代定位、颠覆性初创公司 |
| **3d-isometric** | 干净的等距插图、浮动3D元素、柔和阴影、科技感美学 | 科技解释器、产品功能、SaaS 演示 |
| **editorial** | 杂志级布局、精致的排版层次、戏剧性摄影、Vogue/Bloomberg 美学 | 年报、奢侈品牌、思想领导力 |
| **minimal-swiss** | 基于网格的精确度、受 Helvetica 启发的排版、大胆使用负空间、永恒的现代主义 | 建筑、设计公司、高端咨询 |
| **keynote** | Apple 启发的美学、大胆排版、戏剧性影像、高对比度、电影感 | 主题演讲、产品发布、激励演讲 |

## 工作流程

### 步骤1：了解需求

当用户请求演示文稿生成时，识别：

- 主题/主题：演示文稿的内容
- 幻灯片数量：需要多少张幻灯片（默认：5-10）
- **风格**：商业/学术/极简/keynote/创意
- 宽高比：标准（16:9）或经典（4:3）
- 内容大纲：每张幻灯片的要点
- 你不需要检查 `/mnt/user-data` 下的文件夹

### 步骤2：创建演示计划

在 `/mnt/user-data/workspace/` 中创建一个 JSON 文件，包含演示文稿结构。**重要**：包含 `style` 字段来定义整体视觉一致性。

```json
{
  "title": "Presentation Title",
  "style": "keynote",
  "style_guidelines": {
    "color_palette": "Deep black backgrounds, white text, single accent color (blue or orange)",
    "typography": "Bold sans-serif headlines, clean body text, dramatic size contrast",
    "imagery": "High-quality photography, full-bleed images, cinematic composition",
    "layout": "Generous whitespace, centered focus, minimal elements per slide"
  },
  "aspect_ratio": "16:9",
  "slides": [
    {
      "slide_number": 1,
      "type": "title",
      "title": "Main Title",
      "subtitle": "Subtitle or tagline",
      "visual_description": "Detailed description for image generation"
    },
    {
      "slide_number": 2,
      "type": "content",
      "title": "Slide Title",
      "key_points": ["Point 1", "Point 2", "Point 3"],
      "visual_description": "Detailed description for image generation"
    }
  ]
}
```

### 步骤3：按顺序生成幻灯片图像

**重要**：**严格按顺序一张一张地生成**幻灯片。不要并行化或批量生成图像。每张幻灯片都依赖于上一张幻灯片的输出作为参考图像。并行生成幻灯片会破坏视觉一致性，不允许。

1. 阅读图像生成技能：`/mnt/skills/public/image-generation/SKILL.md`

2. **对于第一张幻灯片（幻灯片1）**，创建一个建立视觉风格的提示：

```json
{
  "prompt": "Professional presentation slide. [style_guidelines from plan]. Title: 'Your Title'. [visual_description]. This slide establishes the visual language for the entire presentation.",
  "style": "[Based on chosen style - e.g., Apple Keynote aesthetic, dramatic lighting, cinematic]",
  "composition": "Clean layout with clear text hierarchy, [style-specific composition]",
  "color_palette": "[From style_guidelines]",
  "typography": "[From style_guidelines]"
}
```

```bash
python /mnt/skills/public/image-generation/scripts/generate.py \
  --prompt-file /mnt/user-data/workspace/slide-01-prompt.json \
  --output-file /mnt/user-data/outputs/slide-01.jpg \
  --aspect-ratio 16:9
```

3. **对于后续幻灯片（幻灯片2+）**，使用上一张幻灯片作为参考图像：

```json
{
  "prompt": "Professional presentation slide continuing the visual style from the reference image. Maintain the same color palette, typography style, and overall aesthetic. Title: 'Slide Title'. [visual_description]. Keep visual consistency with the reference.",
  "style": "Match the style of the reference image exactly",
  "composition": "Similar layout principles as reference, adapted for this content",
  "color_palette": "Same as reference image",
  "consistency_note": "This slide must look like it belongs in the same presentation as the reference image"
}
```

```bash
python /mnt/skills/public/image-generation/scripts/generate.py \
  --prompt-file /mnt/user-data/workspace/slide-02-prompt.json \
  --reference-images /mnt/user-data/outputs/slide-01.jpg \
  --output-file /mnt/user-data/outputs/slide-02.jpg \
  --aspect-ratio 16:9
```

4. **继续生成所有剩余幻灯片**，始终引用上一张幻灯片：

```bash
# 幻灯片3引用幻灯片2
python /mnt/skills/public/image-generation/scripts/generate.py \
  --prompt-file /mnt/user-data/workspace/slide-03-prompt.json \
  --reference-images /mnt/user-data/outputs/slide-02.jpg \
  --output-file /mnt/user-data/outputs/slide-03.jpg \
  --aspect-ratio 16:9

# 幻灯片4引用幻灯片3
python /mnt/skills/public/image-generation/scripts/generate.py \
  --prompt-file /mnt/user-data/workspace/slide-04-prompt.json \
  --reference-images /mnt/user-data/outputs/slide-03.jpg \
  --output-file /mnt/user-data/outputs/slide-04.jpg \
  --aspect-ratio 16:9
```

### 步骤4：组合 PPT

所有幻灯片图像生成后，调用组合脚本：

```bash
python /mnt/skills/public/ppt-generation/scripts/generate.py \
  --plan-file /mnt/user-data/workspace/presentation-plan.json \
  --slide-images /mnt/user-data/outputs/slide-01.jpg /mnt/user-data/outputs/slide-02.jpg /mnt/user-data/outputs/slide-03.jpg \
  --output-file /mnt/user-data/outputs/presentation.pptx
```

参数：

- `--plan-file`：演示计划 JSON 文件的绝对路径（必填）
- `--slide-images`：按顺序排列的幻灯片图像的绝对路径（必填，空格分隔）
- `--output-file`：输出 PPTX 文件的绝对路径（必填）

[!NOTE]
不要读取 Python 文件，只需用参数调用它。

## 完整示例：玻璃态风格（最现代前卫）

用户请求："创建一个关于 AI 产品发布的演示文稿"

### 步骤1：创建演示计划

创建 `/mnt/user-data/workspace/ai-product-plan.json`：
```json
{
  "title": "Introducing Nova AI",
  "style": "glassmorphism",
  "style_guidelines": {
    "color_palette": "Vibrant purple-to-cyan gradient background (#667eea→#00d4ff), frosted glass panels with 15-20% white opacity, electric accents",
    "typography": "SF Pro Display style, bold 700 weight white titles with subtle text-shadow, clean 400 weight body text, excellent contrast on glass",
    "imagery": "Abstract 3D glass spheres, floating translucent geometric shapes, soft luminous orbs, depth through layered transparency",
    "layout": "Centered frosted glass cards with 32px rounded corners, 48-64px padding, floating above gradient, layered depth with soft shadows",
    "effects": "Backdrop blur 20-40px on glass panels, subtle white border glow, soft colored shadows matching gradient, light refraction effects",
    "visual_language": "Apple Vision Pro / visionOS aesthetic, premium depth through transparency, futuristic yet approachable, 2024 design trends"
  },
  "aspect_ratio": "16:9",
  "slides": [
    {
      "slide_number": 1,
      "type": "title",
      "title": "Introducing Nova AI",
      "subtitle": "Intelligence, Reimagined",
      "visual_description": "Stunning gradient background flowing from deep purple (#667eea) through magenta to cyan (#00d4ff). Center: large frosted glass panel with strong backdrop blur, containing bold white title 'Introducing Nova AI' and lighter subtitle. Floating 3D glass spheres and abstract shapes around the card creating depth. Soft glow emanating from behind the glass panel. Premium visionOS aesthetic. The glass card has subtle white border (1px rgba 255,255,255,0.3) and soft purple-tinted shadow."
    }
  ]
}
```

### 步骤2：阅读图像生成技能

阅读 `/mnt/skills/public/image-generation/SKILL.md` 以了解如何生成图像。

### 步骤3：使用参考链按顺序生成幻灯片图像

**幻灯片1 - 标题（建立视觉语言）：**

创建 `/mnt/user-data/workspace/nova-slide-01.json`：
```json
{
  "prompt": "Ultra-premium presentation title slide with glassmorphism design...",
  "style": "Glassmorphism, visionOS aesthetic...",
  "composition": "Centered glass card as focal point...",
  "color_palette": "Purple gradient #667eea, magenta #f093fb, cyan #00d4ff...",
  "effects": "Backdrop blur on glass panels..."
}
```

```bash
python /mnt/skills/public/image-generation/scripts/generate.py \
  --prompt-file /mnt/user-data/workspace/nova-slide-01.json \
  --output-file /mnt/user-data/outputs/nova-slide-01.jpg \
  --aspect-ratio 16:9
```

**幻灯片2 - 内容（必须引用幻灯片1以保持一致性）：**

创建 `/mnt/user-data/workspace/nova-slide-02.json`：
```json
{
  "prompt": "Presentation slide continuing EXACT visual style from reference image...",
  "style": "MATCH REFERENCE EXACTLY - Glassmorphism, visionOS aesthetic...",
  "consistency_note": "CRITICAL: Must be visually identical in style to reference image..."
}
```

```bash
python /mnt/skills/public/image-generation/scripts/generate.py \
  --prompt-file /mnt/user-data/workspace/nova-slide-02.json \
  --reference-images /mnt/user-data/outputs/nova-slide-01.jpg \
  --output-file /mnt/user-data/outputs/nova-slide-02.jpg \
  --aspect-ratio 16:9
```

### 步骤4：组合最终 PPT

```bash
python /mnt/skills/public/ppt-generation/scripts/generate.py \
  --plan-file /mnt/user-data/workspace/nova-plan.json \
  --slide-images /mnt/user-data/outputs/nova-slide-01.jpg /mnt/user-data/outputs/nova-slide-02.jpg /mnt/user-data/outputs/nova-slide-03.jpg /mnt/user-data/outputs/nova-slide-04.jpg /mnt/user-data/outputs/nova-slide-05.jpg \
  --output-file /mnt/user-data/outputs/nova-presentation.pptx
```

## 风格特定指南

### Glassmorphism 风格（推荐 - 最现代前卫）
```json
{
  "style": "glassmorphism",
  "style_guidelines": {
    "color_palette": "充满活力的渐变背景（紫色 #667eea 到粉色 #f093fb，或青色 #4facfe 到蓝色 #00f2fe），20% 不透明度的磨砂白色面板，在渐变上突出的强调色",
    "typography": "SF Pro Display 或 Inter 字体风格，粗体 600-700 权重标题，干净的 400 权重正文，白色文本带微妙阴影以确保玻璃上的可读性",
    "imagery": "漂浮在空间中的抽象 3D 形状、柔和模糊的球体、具有玻璃材料的几何原语、通过重叠半透明层创造的深度",
    "layout": "带背景模糊效果的浮动卡片面板、慷慨的内边距（48-64px）、圆角（24-32px 半径）、带微妙阴影的分层深度",
    "effects": "玻璃上的磨砂模糊（backdrop-filter: blur 20px）、微妙的白色边框（1px rgba 255,255,255,0.2）、面板后面的柔和光晕、带投影的浮动元素",
    "visual_language": "Apple Vision Pro UI 等高级科技美学、通过透明度实现的深度、光线在玻璃表面折射"
  }
}
```

### Dark Premium 风格
```json
{
  "style": "dark-premium",
  "style_guidelines": {
    "color_palette": "深黑色底色（#0a0a0a 到 #121212）、发光强调色（电蓝色 #00d4ff、霓虹紫 #bf5af2 或金色 #ffd700）、用于深度的微妙灰色渐变（#1a1a1a 到 #0a0a0a）",
    "typography": "优雅无衬线（Neue Haas Grotesk 或 Suisse Int'l 风格）、戏剧性大小对比（72pt+ 标题、18pt 正文）、标题字间距 -0.02em、纯白色（#ffffff）文本",
    "imagery": "戏剧性影棚灯光、边缘灯光和轮廓光、电影感产品照片、抽象光迹、优质材料纹理（拉丝金属、哑光表面）",
    "layout": "慷慨的负空间（60%+）、不对称平衡、内容锚定到网格但有呼吸空间、每张幻灯片一个焦点",
    "effects": "关键元素后面的微妙环境光晕、光晕效果、颗粒纹理叠加（2-3% 不透明度）、边缘渐晕",
    "visual_language": "奢侈品科技品牌美学（Bang & Olufsen、保时捷设计）、通过克制实现的精致、每个元素都经过深思熟虑"
  }
}
```

## 输出处理

生成后：

- PPTX 文件保存在 `/mnt/user-data/outputs/`
- 使用 `present_files` 工具与用户分享演示文稿
- 提供调整样式、幻灯片数量或内容的选项

## 注意事项

- 幻灯片必须按顺序一张一张生成以保持视觉一致性
- 为第一张幻灯片建立整体视觉风格，后续幻灯片必须引用上一张以保持一致性
- 使用与演示计划中定义的风格指南匹配的详细提示
- 脚本自动处理所有图像到 PPTX 的组合
