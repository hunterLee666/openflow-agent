---
name: podcast-generation
description: 当用户请求从文本内容生成、创建或制作播客时使用此技能。将书面内容转换为双主播对话播客音频格式，具有自然的对话。
---

# 播客生成技能

## 概述

此技能从文本内容生成高质量播客音频。工作流程包括创建结构化 JSON 脚本（对话式对话）并通过文本转语音合成执行音频生成。

## 核心能力

- 将任何文本内容（文章、报告、文档）转换为播客脚本
- 生成自然的双主播对话（男主播和女主播）
- 使用文本转语音合成语音音频
- 将音频片段混合成最终播客 MP3 文件
- 支持英语和中文内容

## 工作流程

### 步骤1：了解需求

当用户请求播客生成时，识别：

- 来源内容：要转换为播客的文本/文章/报告
- 语言：英语或中文（基于内容）
- 输出位置：保存生成播客的位置
- 你不需要检查 `/mnt/user-data` 下的文件夹

### 步骤2：创建结构化脚本 JSON

在 `/mnt/user-data/workspace/` 中生成一个结构化 JSON 脚本文件，命名模式为：`{descriptive-name}-script.json`

JSON 结构：
```json
{
  "locale": "en",
  "lines": [
    {"speaker": "male", "paragraph": "dialogue text"},
    {"speaker": "female", "paragraph": "dialogue text"}
  ]
}
```

### 步骤3：执行生成

调用 Python 脚本：
```bash
python /mnt/skills/public/podcast-generation/scripts/generate.py \
  --script-file /mnt/user-data/workspace/script-file.json \
  --output-file /mnt/user-data/outputs/generated-podcast.mp3 \
  --transcript-file /mnt/user-data/outputs/generated-podcast-transcript.md
```

参数：

- `--script-file`：JSON 脚本文件的绝对路径（必填）
- `--output-file`：输出 MP3 文件的绝对路径（必填）
- `--transcript-file`：输出转录 markdown 文件的绝对路径（可选，但建议）

> [!IMPORTANT]
> - 在一次完整调用中执行脚本。不要将工作流程分成单独的步骤。
> - 脚本在内部处理所有 TTS API 调用和音频生成。
> - 不要读取 Python 文件，只需用参数调用它。
> - 始终包含 `--transcript-file` 以生成用户可读的转录本。

## 脚本 JSON 格式

脚本 JSON 文件必须遵循此结构：

```json
{
  "title": "The History of Artificial Intelligence",
  "locale": "en",
  "lines": [
    {"speaker": "male", "paragraph": "Hello Deer! Welcome back to another episode."},
    {"speaker": "female", "paragraph": "Hey everyone! Today we have an exciting topic to discuss."},
    {"speaker": "male", "paragraph": "That's right! We're going to talk about..."}
  ]
}
```

字段：
- `title`：播客剧集的标题（可选，用于转录本中的标题）
- `locale`：语言代码——"en" 表示英语，"zh" 表示中文
- `lines`：对话行数组
  - `speaker`："male" 或 "female"
  - `paragraph`：此发言者的对话文本

## 脚本撰写指南

创建脚本 JSON 时，遵循以下指南：

### 格式要求
- 只有两个主播：一男一女，自然交替
- 目标运行时长：约10分钟对话（约40-60行）
- 以男主播说包含"Hello Deer"的问候语开始

### 语气与风格
- 自然、对话式的对话——像两个朋友聊天
- 使用随意的表达和对话式过渡
- 避免过于正式的语言或学术语气
- 包含反应、后续问题和自然的感叹词

### 内容指南
- 主播之间频繁来回交流
- 保持句子简短，便于口语化跟随
- 仅使用纯文本——输出中没有 markdown 格式
- 将技术概念翻译成通俗易懂的语言
- 不包含数学公式、代码或复杂符号
- 使内容引人入胜，适合纯音频听众
- 排除日期、作者姓名或文档结构等元信息

## 播客生成示例

用户请求："生成一个关于人工智能历史的播客"

步骤1：创建脚本文件 `/mnt/user-data/workspace/ai-history-script.json`：
```json
{
  "title": "The History of Artificial Intelligence",
  "locale": "en",
  "lines": [
    {"speaker": "male", "paragraph": "Hello Deer! Welcome back to another fascinating episode. Today we're diving into something that's literally shaping our future - the history of artificial intelligence."},
    {"speaker": "female", "paragraph": "Oh, I love this topic! You know, AI feels so modern, but it actually has roots going back over seventy years."},
    {"speaker": "male", "paragraph": "Exactly! It all started back in the 1950s. The term artificial intelligence was actually coined by John McCarthy in 1956 at a famous conference at Dartmouth."},
    {"speaker": "female", "paragraph": "Wait, so they were already thinking about machines that could think back then? That's incredible!"},
    {"speaker": "male", "paragraph": "Right? The early pioneers were so optimistic. They thought we'd have human-level AI within a generation."},
    {"speaker": "female", "paragraph": "But things didn't quite work out that way, did they?"},
    {"speaker": "male", "paragraph": "No, not at all. The 1970s brought what's called the first AI winter..."}
  ]
}
```

步骤2：执行生成：
```bash
python /mnt/skills/public/podcast-generation/scripts/generate.py \
  --script-file /mnt/user-data/workspace/ai-history-script.json \
  --output-file /mnt/user-data/outputs/ai-history-podcast.mp3 \
  --transcript-file /mnt/user-data/outputs/ai-history-transcript.md
```

这将生成：
- `ai-history-podcast.mp3`：音频播客文件
- `ai-history-transcript.md`：播客的可读 markdown 转录本

## 特定模板

仅在匹配用户请求时阅读以下模板文件。

- [技术解释器](templates/tech-explainer.md) - 用于转换技术文档和教程

## 输出格式

生成的播客遵循"Hello Deer"格式：
- 两个主播：一男一女
- 自然对话
- 以"Hello Deer"问候语开始
- 目标时长：约10分钟
- 为主播之间引人入胜的对话流程而交替

## 输出处理

生成后：

- 播客和转录本保存在 `/mnt/user-data/outputs/`
- 使用 `present_files` 工具与用户分享播客 MP3 和转录本 MD
- 提供生成结果的简要描述（主题、时长、主播）
- 如果需要调整，提供重新生成的选项

## 要求

必须设置以下环境变量：
- `VOLCENGINE_TTS_APPID`：火山引擎 TTS 应用 ID
- `VOLCENGINE_TTS_ACCESS_TOKEN`：火山引擎 TTS 访问令牌
- `VOLCENGINE_TTS_CLUSTER`：火山引擎 TTS 集群（可选，默认为"volcano_tts"）

## 注意事项

- **始终在一次调用中执行完整管道**——无需测试单独步骤或担心超时
- 脚本 JSON 应匹配内容语言（en 或 zh）
- 脚本中的技术内容应为音频可访问性而简化
- 脚本中应将复杂符号（公式、代码）翻译成通俗语言
- 长内容可能会导致更长的播客
