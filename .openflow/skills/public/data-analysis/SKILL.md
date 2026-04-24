---
name: data-analysis
description: 当用户上传 Excel (.xlsx/.xls) 或 CSV 文件并想要执行数据分析、生成统计信息、创建摘要、数据透视表、SQL 查询，或任何形式的结构化数据探索时使用此技能。支持多工作表 Excel 工作簿、聚合、过滤、连接，以及将结果导出为 CSV/JSON/Markdown。
---

# 数据分析技能

## 概述

此技能使用 DuckDB 分析用户上传的 Excel/CSV 文件 — 这是一个进程内分析 SQL 引擎。它支持模式检查、基于 SQL 的查询、统计摘要和结果导出，全部通过单个 Python 脚本完成。

## 核心能力

- 检查 Excel/CSV 文件结构（工作表、列、类型、行数）
- 对上传的数据执行任意 SQL 查询
- 生成统计摘要（均值、中位数、标准差、百分位数、空值）
- 支持多工作表 Excel 工作簿（每个工作表成为一张表）
- 将查询结果导出为 CSV、JSON 或 Markdown
- 使用 DuckDB 列式引擎高效处理大文件

## 工作流程

### 步骤1：理解需求

当用户上传数据文件并请求分析时，识别：

- **文件位置**：`/mnt/user-data/uploads/` 下上传的 Excel/CSV 文件路径
- **分析目标**：用户想要什么见解（摘要、过滤、聚合、比较等）
- **输出格式**：结果应该如何呈现（表格、CSV 导出、JSON 等）
- 你不需要检查 `/mnt/user-data` 下的文件夹

### 步骤2：检查文件结构

首先，检查上传的文件以了解其模式：

```bash
python /mnt/skills/public/data-analysis/scripts/analyze.py \
  --files /mnt/user-data/uploads/data.xlsx \
  --action inspect
```

这返回：
- 工作表名称（对于 Excel）或文件名（对于 CSV）
- 列名、数据类型和非空计数
- 每个工作表/文件的行数
- 样本数据（前5行）

### 步骤3：执行分析

基于模式，构建 SQL 查询来回答用户的问题。

#### 运行 SQL 查询

```bash
python /mnt/skills/public/data-analysis/scripts/analyze.py \
  --files /mnt/user-data/uploads/data.xlsx \
  --action query \
  --sql "SELECT category, COUNT(*) as count, AVG(amount) as avg_amount FROM Sheet1 GROUP BY category ORDER BY count DESC"
```

#### 生成统计摘要

```bash
python /mnt/skills/public/data-analysis/scripts/analyze.py \
  --files /mnt/user-data/uploads/data.xlsx \
  --action summary \
  --table Sheet1
```

这返回对于每个数值列：count、mean、std、min、25%、50%、75%、max、null_count。
对于字符串列：count、unique、top value、frequency、null_count。

#### 导出结果

```bash
python /mnt/skills/public/data-analysis/scripts/analyze.py \
  --files /mnt/user-data/uploads/data.xlsx \
  --action query \
  --sql "SELECT * FROM Sheet1 WHERE amount > 1000" \
  --output-file /mnt/user-data/outputs/filtered-results.csv
```

支持的输出格式（从扩展名自动检测）：
- `.csv` — 逗号分隔值
- `.json` — 记录数组
- `.md` — Markdown 表格

### 参数

| 参数 | 必填 | 描述 |
|-----------|----------|-------------|
| `--files` | 是 | 空格分隔的 Excel/CSV 文件路径 |
| `--action` | 是 | 其中之一：`inspect`、`query`、`summary` |
| `--sql` | 对于 `query` | 要执行的 SQL 查询 |
| `--table` | 对于 `summary` | 要摘要的表/工作表名称 |
| `--output-file` | 否 | 导出结果的路径（CSV/JSON/MD） |

> [!NOTE]
> 不要读取 Python 文件，只需用参数调用它。

## 表命名规则

- **Excel 文件**：每个工作表成为一张表，名称为工作表名称（例如 `Sheet1`、`Sales`、`Revenue`）
- **CSV 文件**：表名是去扩展名的文件名（例如 `data.csv` → `data`）
- **多个文件**：所有文件的所有表都在同一查询上下文中，支持跨文件连接
- **特殊字符**：带空格或特殊字符的工作表/文件名会自动清理（空格 → 下划线）。对于以数字开头或包含特殊字符的名称使用双引号，例如 `"2024_Sales"`

## 分析模式

### 基本探索
```sql
-- 行数
SELECT COUNT(*) FROM Sheet1

-- 列中的不同值
SELECT DISTINCT category FROM Sheet1

-- 值分布
SELECT category, COUNT(*) as cnt FROM Sheet1 GROUP BY category ORDER BY cnt DESC

-- 日期范围
SELECT MIN(date_col), MAX(date_col) FROM Sheet1
```

### 聚合与分组
```sql
-- 按类别和月份的收入
SELECT category, DATE_TRUNC('month', order_date) as month,
       SUM(revenue) as total_revenue
FROM Sales
GROUP BY category, month
ORDER BY month, total_revenue DESC

-- 按消费排名的前10名客户
SELECT customer_name, SUM(amount) as total_spend
FROM Orders GROUP BY customer_name
ORDER BY total_spend DESC LIMIT 10
```

### 跨文件连接
```sql
-- 将销售与不同文件的客户信息连接
SELECT s.order_id, s.amount, c.customer_name, c.region
FROM sales s
JOIN customers c ON s.customer_id = c.id
WHERE s.amount > 500
```

### 窗口函数
```sql
-- 累计总额和排名
SELECT order_date, amount,
       SUM(amount) OVER (ORDER BY order_date) as running_total,
       RANK() OVER (ORDER BY amount DESC) as amount_rank
FROM Sales
```

### 数据透视风格分析
```sql
-- 透视：按类别的月度收入
SELECT category,
       SUM(CASE WHEN MONTH(date) = 1 THEN revenue END) as Jan,
       SUM(CASE WHEN MONTH(date) = 2 THEN revenue END) as Feb,
       SUM(CASE WHEN MONTH(date) = 3 THEN revenue END) as Mar
FROM Sales
GROUP BY category
```

## 完整示例

用户上传 `sales_2024.xlsx`（带有工作表：`Orders`、`Products`、`Customers`）并问："分析我的销售数据 — 显示按收入排名的顶级产品和月度趋势。"

### 步骤1：检查文件

```bash
python /mnt/skills/public/data-analysis/scripts/analyze.py \
  --files /mnt/user-data/uploads/sales_2024.xlsx \
  --action inspect
```

### 步骤2：按收入排名的顶级产品

```bash
python /mnt/skills/public/data-analysis/scripts/analyze.py \
  --files /mnt/user-data/uploads/sales_2024.xlsx \
  --action query \
  --sql "SELECT p.product_name, SUM(o.quantity * o.unit_price) as total_revenue, SUM(o.quantity) as total_units FROM Orders o JOIN Products p ON o.product_id = p.id GROUP BY p.product_name ORDER BY total_revenue DESC LIMIT 10"
```

### 步骤3：月度收入趋势

```bash
python /mnt/skills/public/data-analysis/scripts/analyze.py \
  --files /mnt/user-data/uploads/sales_2024.xlsx \
  --action query \
  --sql "SELECT DATE_TRUNC('month', order_date) as month, SUM(quantity * unit_price) as revenue FROM Orders GROUP BY month ORDER BY month" \
  --output-file /mnt/user-data/outputs/monthly-trends.csv
```

### 步骤4：统计摘要

```bash
python /mnt/skills/public/data-analysis/scripts/analyze.py \
  --files /mnt/user-data/uploads/sales_2024.xlsx \
  --action summary \
  --table Orders
```

用清晰的解释向用户展示结果，包括发现、趋势和可操作的见解。

## 多文件示例

用户上传 `orders.csv` 和 `customers.xlsx` 并问："哪个地区的平均订单价值最高？"

```bash
python /mnt/skills/public/data-analysis/scripts/analyze.py \
  --files /mnt/user-data/uploads/orders.csv /mnt/user-data/uploads/customers.xlsx \
  --action query \
  --sql "SELECT c.region, AVG(o.amount) as avg_order_value, COUNT(*) as order_count FROM orders o JOIN Customers c ON o.customer_id = c.id GROUP BY c.region ORDER BY avg_order_value DESC"
```

## 输出处理

分析后：

- 直接在对话中以格式表格形式呈现查询结果
- 对于大结果，导出到文件并通过 `present_files` 工具分享
- 始终用通俗易懂的语言解释发现，包括关键要点
- 当模式有趣时，建议后续分析
- 如果用户想要保留结果，提供导出选项

## 缓存

脚本自动缓存加载的数据以避免每次调用时重新解析文件：

- 首次加载时，文件被解析并存储在 `/mnt/user-data/workspace/.data-analysis-cache/` 下的持久化 DuckDB 数据库中
- 缓存键是所有输入文件内容的 SHA256 哈希 — 如果文件更改，则创建新缓存
- 使用相同文件的后续调用将直接使用缓存的数据库（近乎即时的启动）
- 缓存是透明的 — 无需额外参数

当针对相同数据文件运行多个查询时，这特别有用（检查 → 查询 → 摘要）。

## 注意事项

- DuckDB 支持完整 SQL，包括窗口函数、CTE、子查询和高级聚合
- Excel 日期列会自动解析；使用 DuckDB 日期函数（`DATE_TRUNC`、`EXTRACT` 等）
- 对于非常大的文件（100MB+），DuckDB 高效处理它们而不会将所有内容加载到内存中
- 带空格的列名可使用双引号访问：`"Column Name"`
