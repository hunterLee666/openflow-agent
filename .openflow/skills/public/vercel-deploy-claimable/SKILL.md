---
name: vercel-deploy
description: 将应用程序和网站部署到 Vercel。当用户请求部署操作如"部署我的应用"、"部署到生产环境"、"创建预览部署"、"部署并给我链接"或"将其上线"时使用此技能。无需认证——返回预览链接和可认领的部署链接。
metadata:
  author: vercel
  version: "1.0.0"
---

# Vercel 部署

将任何项目即时部署到 Vercel。无需认证。

## 工作原理

1. 将项目打包成 tarball（排除 `node_modules` 和 `.git`）
2. 从 `package.json` 自动检测框架
3. 上传到部署服务
4. 返回**预览链接**（在线站点）和**认领链接**（转移到你的 Vercel 账户）

## 使用方法

```bash
bash /mnt/skills/user/vercel-deploy/scripts/deploy.sh [path]
```

**参数：**
- `path` - 要部署的目录，或 `.tgz` 文件（默认为当前目录）

**示例：**

```bash
# 部署当前目录
bash /mnt/skills/user/vercel-deploy/scripts/deploy.sh

# 部署特定项目
bash /mnt/skills/user/vercel-deploy/scripts/deploy.sh /path/to/project

# 部署现有 tarball
bash /mnt/skills/user/vercel-deploy/scripts/deploy.sh /path/to/project.tgz
```

## 输出

```
正在准备部署...
检测到框架：nextjs
创建部署包...
部署中...
✓ 部署成功！

预览链接：https://skill-deploy-abc123.vercel.app
认领链接：https://vercel.com/claim-deployment?code=...
```

脚本还会输出 JSON 到 stdout 用于程序调用：

```json
{
  "previewUrl": "https://skill-deploy-abc123.vercel.app",
  "claimUrl": "https://vercel.com/claim-deployment?code=...",
  "deploymentId": "dpl_...",
  "projectId": "prj_..."
}
```

## 框架检测

脚本从 `package.json` 自动检测框架。支持以下框架：

- **React**：Next.js、Gatsby、Create React App、Remix、React Router
- **Vue**：Nuxt、Vitepress、Vuepress、Gridsome
- **Svelte**：SvelteKit、Svelte、Sapper
- **其他前端**：Astro、Solid Start、Angular、Ember、Preact、Docusaurus
- **后端**：Express、Hono、Fastify、NestJS、Elysia、h3、Nitro
- **构建工具**：Vite、Parcel
- **其他**：Blitz、Hydrogen、RedwoodJS、Storybook、Sanity 等

对于静态 HTML 项目（没有 `package.json`），框架设置为 `null`。

## 静态 HTML 项目

对于没有 `package.json` 的项目：
- 如果有一个单独的 `.html` 文件且不是 `index.html`，它会自动重命名
- 这确保页面在根 URL（`/`）上提供服务

## 向用户展示结果

始终显示两个链接：

```
✓ 部署成功！

- [预览链接](https://skill-deploy-abc123.vercel.app)
- [认领链接](https://vercel.com/claim-deployment?code=...)

在预览链接查看你的站点。
要将此部署转移到你的 Vercel 账户，请访问认领链接。
```

## 故障排除

### 网络出口错误

如果因网络限制导致部署失败（常见于 claude.ai），请告诉用户：

```
由于网络限制，部署失败。解决方法如下：

1. 访问 https://claude.ai/settings/capabilities
2. 将 *.vercel.com 添加到允许的域名
3. 再次尝试部署
```
