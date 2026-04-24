# 系统集成排查报告

## 排查时间: 2026-04-24

## 1. 入口层 (main.tsx) 集成状态

### ✅ 已集成
- QueryEngine (query function)
- ToolRegistry + getDefaultTools
- MemorySystem (DefaultMemorySystem)
- HookRegistry (DefaultHookRegistry)
- SessionStore (FileSessionStore)
- Telemetry (ConsoleTelemetry)

### ❌ 未集成
- [ ] PromptCache - SystemPromptBuilder 支持但未传递
- [ ] CommandRegistry - Slash命令系统未初始化
- [ ] TaskAgentTools - 未注册到 ToolRegistry
- [ ] WorkspaceBoundaryValidator - 未配置
- [ ] McpServer - 未启动
- [ ] KAIROS Engine - 未与 MemorySystem 关联

---

## 2. QueryEngine 集成状态

### ✅ 已集成
- FourteenStepGovernancePipeline (直接集成)
- Hooks.dispatch (PreToolUse/PostToolUse)
- Memory.record() 调用
- Telemetry.log() 调用

### ❌ 问题
- [ ] PromptCache 未传递给 SystemPromptBuilder
- [ ] Slash命令未在消息处理前解析
- [ ] TaskAgent 未注册为工具

---

## 3. MemorySystem 集成状态

### ✅ 已集成
- WorkingMemory (当前任务、上下文)
- EpisodicMemory (事件记录)
- SemanticMemory (语义存储)
- ProjectMemory (项目信息)

### ❌ 未集成
- [ ] KnowledgeGraph - 已创建但未与内存系统关联
- [ ] DualRetriever - 已创建但未配置到检索管道
- [ ] KAIROS Distillation - 已创建但未触发

---

## 4. Hooks 集成状态

### ✅ 已集成
- PreToolUse hook
- PostToolUse hook

### ❌ 未集成
- [ ] SessionStart hook
- [ ] SessionEnd hook
- [ ] MessageReceived hook
- [ ] CompactionStart/End hooks

---

## 5. MCP/Tools/Skills 生态

### ✅ 已集成
- ToolRegistry
- MCP Server (基础)
- Skill Registry

### ❌ 未集成
- [ ] MCP Protocol 完全集成
- [ ] Skill allowed-tools 字段检查
- [ ] TaskAgent 作为工具注册

---

## 6. 需要修复的问题清单

### P0 (关键)
1. main.tsx 添加 PromptCache 并传递
2. main.tsx 添加 CommandRegistry 初始化
3. main.tsx 注册 TaskAgentTools
4. TaskAgent 未导出的工具创建函数

### P1 (重要)
5. MemorySystem 集成 KnowledgeGraph
6. MemorySystem 集成 DualRetriever
7. QueryEngine 集成 PromptCache

### P2 (一般)
8. Hooks 添加更多生命周期钩子
9. KAIROS 梦境系统触发机制
10. UI 事件闭环
