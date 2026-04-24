---
name: code-documentation
description: 当用户请求为代码、API、库、仓库或软件项目生成、创建或改进文档时使用此技能。支持 README 生成、API 参考文档、内联代码注释、架构文档、变更日志生成和开发人员指南。触发于"document this code"、"create a README"、"generate API docs"、"write developer guide"，或当分析代码库用于文档目的时。
---

# 代码文档技能

## 概述

此技能为软件项目、代码库、库和 API 生成专业、全面的文档。它遵循 React、Django、Stripe 和 Kubernetes 等项目的行业最佳实践，制作准确、结构良好、对新贡献者和经验丰富的开发人员都有用的文档。

输出从单文件 README 到多文档开发人员指南，始终与项目复杂性和用户需求相匹配。

## 核心能力

- 生成带有徽章、安装、使用和 API 参考的全面 README.md 文件
- 从源代码分析创建 API 参考文档
- 生成带图表的架构和设计文档
- 编写开发人员入职和贡献指南
- 从提交历史或发布说明生成变更日志
- 遵循特定语言的惯例创建内联代码文档
- 支持 JSDoc、docstrings、GoDoc、Javadoc 和 Rustdoc 格式
- 使文档风格适应项目的语言和生态系统

## 何时使用此技能

**当以下情况发生时，始终加载此技能：**

- 用户要求"记录"、"创建文档"或"编写文档"任何代码
- 用户请求 README、API 参考或开发人员指南
- 用户分享代码库或仓库并想要生成文档
- 用户要求改进或更新现有文档
- 用户需要架构文档，包括图表
- 用户请求变更日志或迁移指南

## 文档工作流程

### 阶段1：代码库分析

在编写任何文档之前，彻底了解代码库。

#### 步骤1.1：项目发现

识别项目基本信息：

| 字段 | 如何确定 |
|-------|-----------------|
| **语言** | 检查文件扩展名、`package.json`、`pyproject.toml`、`go.mod`、`Cargo.toml` 等 |
| **框架** | 查看依赖项中的已知框架（React、Django、Express、Spring 等） |
| **构建系统** | 检查 `Makefile`、`CMakeLists.txt`、`webpack.config.js`、`build.gradle` 等 |
| **包管理器** | npm/yarn/pnpm、pip/uv/poetry、cargo、go modules 等 |
| **项目结构** | 绘制目录树以了解架构 |
| **入口点** | 找到主文件、CLI 入口点、导出模块 |
| **现有文档** | 检查现有 README、docs/、wiki 或内联文档 |

#### 步骤1.2：代码结构分析

使用沙盒工具探索代码库：

```bash
# 获取目录结构
ls /mnt/user-data/uploads/project-dir/

# 读取关键文件
read_file /mnt/user-data/uploads/project-dir/package.json
read_file /mnt/user-data/uploads/project-dir/pyproject.toml

# 搜索公共 API 表面
grep -r "export " /mnt/user-data/uploads/project-dir/src/
grep -r "def " /mnt/user-data/uploads/project-dir/src/ --include="*.py"
grep -r "func " /mnt/user-data/uploads/project-dir/ --include="*.go"
```

#### 步骤1.3：识别文档范围

基于分析，确定要生成的文档：

| 项目规模 | 推荐的文档 |
|-------------|--------------------------|
| **单文件/脚本** | 内联注释 + 用法标题 |
| **小型库** | 带 API 参考的 README |
| **中型项目** | README + API 文档 + 示例 |
| **大型项目** | README + 架构 + API + 贡献 + 变更日志 |

### 阶段2：文档生成

#### 步骤2.1：README 生成

每个项目都需要 README。遵循此结构：

```markdown
# 项目名称

[一行项目描述 — 它做什么以及为什么重要]

[![徽章](链接)](#) [![徽章](链接)](#)

## 功能

- [关键功能 1 — 简要描述]
- [关键功能 2 — 简要描述]
- [关键功能 3 — 简要描述]

## 快速开始

### 先决条件

- [带版本要求的先决条件 1]
- [带版本要求的先决条件 2]

### 安装

[带有复制粘贴就绪代码块的安装命令]

### 基本用法

[展示核心功能的最小工作示例]

## 文档

- [链接到独立 API 参考（如果有）]
- [链接到架构文档（如果有）]
- [链接到示例目录（如果适用）]

## API 参考

[对于较小项目是内联 API 参考，或者链接到生成的文档]

## 配置

[环境变量、配置文件或运行时选项]

## 示例

[2-3个涵盖常见用例的实际示例]

## 开发

### 设置

[如何设置开发环境]

### 测试

[如何运行测试]

### 构建

[如何构建项目]

## 贡献

[贡献指南或链接到 CONTRIBUTING.md]

## 许可证

[许可证信息]
```

#### 步骤2.2：API 参考生成

对于每个公共 API 表面，记录：

**函数/方法文档**：

```markdown
### `functionName(param1, param2, options?)`

简要描述此函数做什么。

**参数：**

| 参数 | 类型 | 必填 | 默认 | 描述 |
|-----------|------|----------|---------|-------------|
| `param1` | `string` | 是 | — | param1 的描述 |
| `param2` | `number` | 是 | — | param2 的描述 |
| `options` | `Object` | 否 | `{}` | 配置选项 |
| `options.timeout` | `number` | 否 | `5000` | 超时时间（毫秒） |

**返回：** `Promise<Result>` — 返回值描述

**抛出：**
- `ValidationError` — 当 param1 为空时
- `TimeoutError` — 当操作超过超时时

**示例：**

\`\`\`javascript
const result = await functionName("hello", 42, { timeout: 10000 });
console.log(result.data);
\`\`\`
```

**类文档**：

```markdown
### `ClassName`

类的简要描述及其目的。

**构造函数：**

\`\`\`javascript
new ClassName(config)
\`\`\`

| 参数 | 类型 | 描述 |
|-----------|------|-------------|
| `config.option1` | `string` | 描述 |
| `config.option2` | `boolean` | 描述 |

**方法：**

- [`method1()`](#method1) — 简要描述
- [`method2(param)`](#method2) — 简要描述

**属性：**

| 属性 | 类型 | 描述 |
|----------|------|-------------|
| `property1` | `string` | 描述 |
| `property2` | `number` | 只读。描述 |
```

#### 步骤2.3：架构文档

对于中大型项目，包括架构文档：

```markdown
# 架构概述

## 系统图

[包含显示高级架构的 Mermaid 图表]

\`\`\`mermaid
graph TD
    A[Client] --> B[API Gateway]
    B --> C[Service A]
    B --> D[Service B]
    C --> E[(Database)]
    D --> E
\`\`\`

## 组件概述

### 组件名称
- **目的**：此组件做什么
- **位置**：`src/components/name/`
- **依赖**：它依赖什么
- **公共 API**：关键导出或接口

## 数据流

[描述关键操作的数据如何在系统中流动]

## 设计决策

### 决策标题
- **上下文**：什么情况导致此决策
- **决策**：决定是什么
- **理由**：为什么选择这种方法
- **权衡**：牺牲了什么
```

#### 步骤2.4：内联代码文档

生成适合语言的内联文档：

**Python (Docstrings — Google 风格)**：
```python
def process_data(input_path: str, options: dict | None = None) -> ProcessResult:
    """Process data from the given file path.

    Reads the input file, applies transformations based on the provided
    options, and returns a structured result object.

    Args:
        input_path: Absolute path to the input data file.
            Supports CSV, JSON, and Parquet formats.
        options: Optional configuration dictionary.
            - "validate" (bool): Enable input validation. Defaults to True.
            - "format" (str): Output format ("json" or "csv"). Defaults to "json".

    Returns:
        A ProcessResult containing the transformed data and metadata.

    Raises:
        FileNotFoundError: If input_path does not exist.
        ValidationError: If validation is enabled and data is malformed.

    Example:
        >>> result = process_data("/data/input.csv", {"validate": True})
        >>> print(result.row_count)
        1500
    """
```

**TypeScript (JSDoc / TSDoc)**：
```typescript
/**
 * Fetches user data from the API and transforms it for display.
 *
 * @param userId - The unique identifier of the user
 * @param options - Configuration options for the fetch operation
 * @param options.includeProfile - Whether to include the full profile. Defaults to `false`.
 * @param options.cache - Cache duration in seconds. Set to `0` to disable.
 * @returns The transformed user data ready for rendering
 * @throws {NotFoundError} When the user ID does not exist
 * @throws {NetworkError} When the API is unreachable
 *
 * @example
 * ```ts
 * const user = await fetchUser("usr_123", { includeProfile: true });
 * console.log(user.displayName);
 * ```
 */
```

**Go (GoDoc)**：
```go
// ProcessData reads the input file at the given path, applies the specified
// transformations, and returns the processed result.
//
// The input path must be an absolute path to a CSV or JSON file.
// If options is nil, default options are used.
//
// ProcessData returns an error if the file does not exist or cannot be parsed.
func ProcessData(inputPath string, options *ProcessOptions) (*Result, error) {
```

### 阶段3：质量保证

#### 步骤3.1：文档完整性检查

验证文档涵盖：

- [ ] **它是什么** — 清晰的项目描述，新手可以理解
- [ ] **为什么存在** — 它解决的问题和价值主张
- [ ] **如何安装** — 复制粘贴就绪的安装命令
- [ ] **如何使用** — 至少一个展示核心功能的最小工作示例
- [ ] **API 表面** — 所有公共函数、类和类型都有文档
- [ ] **配置** — 所有环境变量、配置文件和选项
- [ ] **错误处理** — 常见错误以及如何解决
- [ ] **贡献** — 如何设置开发环境并提交更改

#### 步骤3.2：质量标准

| 标准 | 检查 |
|----------|-------|
| **准确性** | 每个代码示例必须与描述的 API 一起实际工作 |
| **完整性** | 没有公共 API 表面未记录 |
| **一致性** | 整个文档格式和结构相同 |
| **新鲜度** | 文档与当前代码匹配，而不是旧版本 |
| **可访问性** | 没有行话就没有解释，首字母缩略词首次使用时就定义 |
| **示例** | 每个复杂概念至少有一个实际示例 |

#### 步骤3.3：交叉引用验证

确保：
- 所有提到的文件路径都存在于项目中
- 所有引用的函数和类都存在于代码中
- 所有代码示例使用正确的函数签名
- 版本号与项目的实际版本匹配
- 所有链接（内部和外部）都有效

## 文档风格指南

### 写作原则

1. **先说"为什么"** — 在解释某事如何工作之前，先解释为什么存在
2. **渐进式披露** — 从简单开始，逐渐添加复杂性
3. **展示，不要告诉** — 优先使用代码示例而不是冗长的解释
4. **主动语态** — "函数返回 X" 而不是 "X 被函数返回"
5. **现在时态** — "服务器在端口 8080 上启动" 而不是 "服务器将在端口 8080 上启动"
6. **第二人称** — "你可以配置..." 而不是 "用户可以配置..."

### 格式规则

- 使用 ATX 风格标题（`#`、`##`、`###`）
- 使用带语言规范的发代码块（` ```python `、` ```bash `）
- 对结构化信息使用表格（参数、选项、配置）
- 对重要提示、警告和技巧使用注意事项
- 保持行长度可读（源文件中约 80-100 个字符换行）
- 对函数名、文件路径、变量名和 CLI 命令使用 `代码格式`

### 特定语言惯例

| 语言 | 文档格式 | 风格指南 |
|----------|-----------|-------------|
| Python | Google 风格 docstrings | PEP 257 |
| TypeScript/JavaScript | TSDoc / JSDoc | TypeDoc 惯例 |
| Go | GoDoc 注释 | Effective Go |
| Rust | Rustdoc (`///`) | Rust API 指南 |
| Java | Javadoc | Oracle Javadoc 指南 |
| C/C++ | Doxygen | Doxygen 手册 |

## 输出处理

生成后：

- 将文档文件保存到 `/mnt/user-data/outputs/`
- 对于多文件文档，保持项目目录结构
- 使用 `present_files` 工具向用户展示生成的文件
- 提供迭代特定部分或调整详细程度的选项
- 建议可能有益的其他文档

## 注意事项

- 在编写文档之前，始终分析实际代码 — 永远不要猜测 API 签名或行为
- 当现有文档存在时，保留其结构，除非用户明确要求重写
- 对于大型代码库，优先记录公共 API 表面和关键抽象
- 文档应该用与项目现有文档相同的语言编写；如果没有，则默认为英语
- 生成变更日志时，使用 [Keep a Changelog](https://keepachangelog.com/) 格式
- 此技能与 `deep-research` 技能结合使用效果很好，用于记录第三方集成或依赖
