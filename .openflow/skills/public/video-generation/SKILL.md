---
name: video-generation
description: 当用户请求生成、创建或制作视频时使用此技能。支持结构化提示词和参考图像进行引导生成。
---

# 视频生成技能

## 概述

此技能使用结构化提示词和 Python 脚本生成高质量视频。工作流程包括创建 JSON 格式的提示词和执行视频生成，可选配参考图像。

## 核心能力

- 为 AIGC 视频生成创建结构化 JSON 提示词
- 支持参考图像作为引导或视频的第一帧/最后一帧
- 通过自动化 Python 脚本执行生成视频

## 工作流程

### 步骤 1：了解需求

当用户请求视频生成时，确定以下内容：

- 主题/内容：图像中应该有什么
- 风格偏好：艺术风格、情绪、色彩调色板
- 技术规格：宽高比、构图、灯光
- 参考图像：任何用于引导生成的图像
- 不需要检查 `/mnt/user-data` 下的文件夹

### 步骤 2：创建结构化提示词

在 `/mnt/user-data/workspace/` 中生成一个 JSON 文件，命名模式为：`{描述性名称}.json`

### 步骤 3：创建参考图像（当 image-generation 技能可用时可选）

为视频生成生成参考图像。

- 如果只提供 1 张图像，将其用作视频的引导帧

### 步骤 3：执行生成

调用 Python 脚本：
```bash
python /mnt/skills/public/video-generation/scripts/generate.py \
  --prompt-file /mnt/user-data/workspace/prompt-file.json \
  --reference-images /path/to/ref1.jpg \
  --output-file /mnt/user-data/outputs/generated-video.mp4 \
  --aspect-ratio 16:9
```

参数：

- `--prompt-file`：JSON 提示词文件的绝对路径（必填）
- `--reference-images`：参考图像的绝对路径（可选）
- `--output-file`：输出视频文件的绝对路径（必填）
- `--aspect-ratio`：生成视频的宽高比（可选，默认：16:9）

[!注意]
不要读取 python 文件，直接用参数调用它。

## 视频生成示例

用户请求："生成一段视频 clip，描绘《纳尼亚传奇：狮子、女巫和魔衣橱》的开场场景"

步骤 1：在网上搜索《纳尼亚传奇：狮子、女巫和魔衣橱》的开场场景

步骤 2：创建 JSON 提示词文件，内容如下：

```json
{
  "title": "纳尼亚传奇 - 火车站送别",
  "background": {
    "description": "二战期间伦敦火车站的疏散场景。蒸汽和烟雾弥漫空气中，孩子们被送往乡下以逃离闪电战。",
    "era": "1940年代战时英国",
    "location": "伦敦火车站站台"
  },
  "characters": ["佩文西夫人", "Lucy Pevensie"],
  "camera": {
    "type": "双人近景",
    "movement": "静止带轻微手持晃动",
    "angle": "侧面视角，亲密取景",
    "focus": "两人面部清晰，背景虚化"
  },
  "dialogue": [
    {
      "character": "佩文西夫人",
      "text": "你必须为我勇敢，亲爱的。我会来接你......我保证。"
    },
    {
      "character": "Lucy Pevensie",
      "text": "我会的，母亲。我保证。"
    }
  ],
  "audio": [
    {
      "type": "火车鸣笛（表示发车）",
      "volume": 1
    },
    {
      "type": "弦乐情感高涨，然后淡出",
      "volume": 0.5
    },
    {
      "type": "火车站环境音",
      "volume": 0.5
    }
  ]
}
```

步骤 3：使用 image-generation 技能生成参考图像

加载 image-generation 技能并根据该技能生成单个参考图像 `narnia-farewell-scene-01.jpg`。

步骤 4：使用 generate.py 脚本生成视频
```bash
python /mnt/skills/public/video-generation/scripts/generate.py \
  --prompt-file /mnt/user-data/workspace/narnia-farewell-scene.json \
  --reference-images /mnt/user-data/outputs/narnia-farewell-scene-01.jpg \
  --output-file /mnt/user-data/outputs/narnia-farewell-scene-01.mp4 \
  --aspect-ratio 16:9
```
> 不要读取 python 文件，直接用参数调用它。

## 输出处理

生成后：

- 视频通常保存在 `/mnt/user-data/outputs/`
- 使用 `present_files` 工具与用户分享生成的视频（优先）以及生成的图像（如果适用）
- 提供生成结果的简要描述
- 如需调整可以继续迭代

## 注意事项

- 始终使用英语编写提示词，无论用户的语言是什么
- JSON 格式确保结构化、可解析的提示词
- 参考图像显著提高生成质量
- 迭代优化对于获得最佳结果是正常的
