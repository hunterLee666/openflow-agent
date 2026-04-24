---
name: image-generation
description: 当用户请求生成、创建、想象或可视化图像时使用此技能，包括角色、场景、产品或任何视觉内容。支持结构化提示和参考图像进行引导生成。
---

# 图像生成技能

## 概述

此技能使用结构化提示和 Python 脚本生成高质量图像。工作流程包括创建 JSON 格式的提示和执行图像生成，可选择使用参考图像。

## 核心能力

- 为 AIGC 图像生成创建结构化 JSON 提示
- 支持多个参考图像进行风格/构图指导
- 通过自动化 Python 脚本执行生成图像
- 处理各种图像生成场景（角色设计、场景、产品等）

## 工作流程

### 步骤1：了解需求

当用户请求图像生成时，识别：

- 主题/内容：图像中应该有什么
- 风格偏好：艺术风格、情绪、配色
- 技术规格：宽高比、构图、灯光
- 参考图像：任何用于指导生成的图像
- 你不需要检查 `/mnt/user-data` 下的文件夹

### 步骤2：创建结构化提示

在 `/mnt/user-data/workspace/` 中生成一个 JSON 文件，命名模式为：`{descriptive-name}.json`

### 步骤3：执行生成

调用 Python 脚本：
```bash
python /mnt/skills/public/image-generation/scripts/generate.py \
  --prompt-file /mnt/user-data/workspace/prompt-file.json \
  --reference-images /path/to/ref1.jpg /path/to/ref2.png \
  --output-file /mnt/user-data/outputs/generated-image.jpg
  --aspect-ratio 16:9
```

参数：

- `--prompt-file`：JSON 提示文件的绝对路径（必填）
- `--reference-images`：参考图像的绝对路径（可选，空格分隔）
- `--output-file`：输出图像文件的绝对路径（必填）
- `--aspect-ratio`：生成图像的宽高比（可选，默认：16:9）

[!NOTE]
不要读取 Python 文件，只需用参数调用它。

## 角色生成示例

用户请求："创建一个 1990 年代东京街头风格的女性角色"

创建提示文件：`/mnt/user-data/workspace/asian-woman.json`
```json
{
  "characters": [{
    "gender": "female",
    "age": "mid-20s",
    "ethnicity": "Japanese",
    "body_type": "slender, elegant",
    "facial_features": "delicate features, expressive eyes, subtle makeup with emphasis on lips, long dark hair partially wet from rain",
    "clothing": "stylish trench coat, designer handbag, high heels, contemporary Tokyo street fashion",
    "accessories": "minimal jewelry, statement earrings, leather handbag",
    "era": "1990s"
  }],
  "negative_prompt": "blurry face, deformed, low quality, overly sharp digital look, oversaturated colors, artificial lighting, studio setting, posed, selfie angle",
  "style": "Leica M11 street photography aesthetic, film-like rendering, natural color palette with slight warmth, bokeh background blur, analog photography feel",
  "composition": "medium shot, rule of thirds, subject slightly off-center, environmental context of Tokyo street visible, shallow depth of field isolating subject",
  "lighting": "neon lights from signs and storefronts, wet pavement reflections, soft ambient city glow, natural street lighting, rim lighting from background neons",
  "color_palette": "muted naturalistic tones, warm skin tones, cool blue and magenta neon accents, desaturated compared to digital photography, film grain texture"
}
```

执行生成：
```bash
python /mnt/skills/public/image-generation/scripts/generate.py \
  --prompt-file /mnt/user-data/workspace/cyberpunk-hacker.json \
  --output-file /mnt/user-data/outputs/cyberpunk-hacker-01.jpg \
  --aspect-ratio 2:3
```

使用参考图像：
```json
{
  "characters": [{
    "gender": "based on [Image 1]",
    "age": "based on [Image 1]",
    "ethnicity": "human from [Image 1] adapted to Star Wars universe",
    "body_type": "based on [Image 1]",
    "facial_features": "matching [Image 1] with slight weathered look from space travel",
    "clothing": "Star Wars style outfit - worn leather jacket with utility vest, cargo pants with tactical pouches, scuffed boots, belt with holster",
    "accessories": "blaster pistol on hip, comlink device on wrist, goggles pushed up on forehead, satchel with supplies, personal vehicle based on [Image 2]",
    "era": "Star Wars universe, post-Empire era"
  }],
  "prompt": "Character inspired by [Image 1] standing next to a vehicle inspired by [Image 2] on a bustling alien planet street in Star Wars universe aesthetic. Character wearing worn leather jacket with utility vest, cargo pants with tactical pouches, scuffed boots, belt with blaster holster. The vehicle adapted to Star Wars aesthetic with weathered metal panels, repulsor engines, desert dust covering, parked on the street. Exotic alien marketplace street with multi-level architecture, weathered metal structures, hanging market stalls with colorful awnings, alien species walking by as background characters. Twin suns casting warm golden light, atmospheric dust particles in air, moisture vaporators visible in distance. Gritty lived-in Star Wars aesthetic, practical effects look, film grain texture, cinematic composition.",
  "negative_prompt": "clean futuristic look, sterile environment, overly CGI appearance, fantasy medieval elements, Earth architecture, modern city",
  "style": "Star Wars original trilogy aesthetic, lived-in universe, practical effects inspired, cinematic film look, slightly desaturated with warm tones",
  "composition": "medium wide shot, character in foreground with alien street extending into background, environmental storytelling, rule of thirds",
  "lighting": "warm golden hour lighting from twin suns, rim lighting on character, atmospheric haze, practical light sources from market stalls",
  "color_palette": "warm sandy tones, ochre and sienna, dusty blues, weathered metals, muted earth colors with pops of alien market colors",
  "technical": {
    "aspect_ratio": "9:16",
    "quality": "high",
    "detail_level": "highly detailed with film-like texture"
  }
}
```
```bash
python /mnt/skills/public/image-generation/scripts/generate.py \
  --prompt-file /mnt/user-data/workspace/star-wars-scene.json \
  --reference-images /mnt/user-data/uploads/character-ref.jpg /mnt/user-data/uploads/vehicle-ref.jpg \
  --output-file /mnt/user-data/outputs/star-wars-scene-01.jpg \
  --aspect-ratio 16:9
```

## 常见场景

针对不同场景使用不同的 JSON 模式。

**角色设计**：
- 身体属性（性别、年龄、种族、体型）
-面部特征和表情
- 服装和配饰
- 历史时代或背景
- 姿势和上下文

**场景生成**：
- 环境描述
- 时间、天气
- 情绪和氛围
- 焦点和构图

**产品可视化**：
- 产品细节和材料
- 灯光设置
- 背景和上下文
- 展示角度

## 特定模板

仅在匹配用户请求时阅读以下模板文件。

- [Doraemon 漫画](templates/doraemon.md)

## 输出处理

生成后：

- 图像通常保存在 `/mnt/user-data/outputs/`
- 使用 present_files 工具与用户分享生成的图像
- 提供生成结果的简要描述
- 如果需要调整，提供迭代选项

## 提示：使用参考图像增强生成

对于视觉准确性至关重要的场景，**首先使用 `image_search` 工具**查找参考图像，然后再进行生成。

**建议使用 image_search 工具的场景：**
- **角色/肖像生成**：搜索类似的姿势、表情或风格，以指导面部特征和身体比例
- **特定物体或产品**：搜索真实物体的参考图像以确保准确表示
- **建筑或环境场景**：搜索位置参考以捕获真实细节
- **时尚和服装**：搜索风格参考以确保准确的服装细节和造型

**示例工作流程：**
1. 调用 `image_search` 工具查找合适的参考图像：
   ```
   image_search(query="Japanese woman street photography 1990s", size="Large")
   ```
2. 将返回的图像 URL 下载到本地文件
3. 使用下载的图像作为生成脚本中 `--reference-images` 参数

这种方法通过为模型提供具体的视觉指导而不是仅依赖文本描述，显著提高生成质量。

## 注意事项

- 无论用户使用何种语言，始终使用英语进行提示
- JSON 格式确保结构化、可解析的提示
- 参考图像显著提高生成质量
- 迭代细化对于获得最佳结果是正常的
- 对于角色生成，包括详细的角色对象以及一个合并的提示字段
