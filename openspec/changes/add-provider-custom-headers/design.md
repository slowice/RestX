## Context

RestX 的 AI Provider 已集中管理手工和 Claude Code 自动发现的 OpenAI-compatible 服务。请求客户端目前构造固定的 `Authorization` 与 `Content-Type`，连接测试与各 AI 特性共享 Provider 执行链。自定义头必须对两类 Provider 以及所有调用路径一致生效，同时不修改 Claude Code 的外部配置文件。

## Goals / Non-Goals

**Goals:**

- 为每个 Provider 保存、展示和编辑名称/值形式的自定义请求头。
- 让自定义头覆盖默认同名头，并用于连接测试和正常 AI 调用。
- 允许外部 Provider 的 RestX 专属头配置在刷新后保留。
- 校验头名称和值，避免无效或注入式配置进入网络层。

**Non-Goals:**

- 不支持按单个 AI 特性、单次请求或 URL 路径配置头。
- 不对自定义头值加密、掩码或同步到 Claude Code 配置文件。
- 不支持非 OpenAI-compatible Provider 协议或任意 HTTP 方法配置。

## Decisions

### 使用 Provider 级名称/值映射保存请求头

注册表在每个存储记录中保存 `customHeaders`；公共 Provider 状态和已解析 Provider 都携带它，以便设置页编辑和 main 进程请求执行使用。UI 以可排序的行编辑，但提交时按名称规范化为映射，重复名称以最后一行覆盖前一行。

选择映射而非保留重复行，是因为 Fetch `Headers` 对同名头也会合并或覆盖，保留重复行不会带来可靠语义。

### 外部 Provider 的自定义头由 RestX 所有

Claude Code 导入的连接参数仍保持外部只读；`customHeaders` 是 RestX 附加元数据，使用 Provider 的稳定来源 ID 关联。每次外部配置刷新时合并保留该字段。

选择独立所有权而非写回 `~/.claude/settings.json`，避免 RestX 修改用户的 Claude Code 配置，并让两个应用的职责清晰分离。

### 在请求创建边界统一合并

OpenAI-compatible 客户端创建请求时先生成默认认证/JSON 头，再叠加 Provider 自定义头。每个 AI 特性继续只通过 Provider 执行上下文调用客户端；连接测试使用相同的合并函数。由于用户明确要求，自定义 `Authorization` 和 `Content-Type` 可以覆盖默认值。

选择请求边界合并而非在每个业务特性拼接，避免 AI Inspector、Code Review 与知识图谱行为漂移。

### 严格校验但明文展示

保存前拒绝空名称、无效 HTTP Header 名称和含回车/换行的值；空白行不持久化。值按用户要求明文保留并在编辑页直接显示。

## Risks / Trade-offs

- [明文头值包含令牌] → 设置页与本地配置可见；这是用户明确选择，文案提示该风险但不擅自加密或隐藏。
- [覆盖认证头造成连接失败] → 按用户意图允许覆盖；连接测试和实际请求保持一致，错误提示继续归因于服务响应。
- [外部 Provider 刷新丢失头] → 刷新逻辑根据稳定 Provider ID 合并 RestX 管理的字段。
- [非法头进入 Fetch] → 在 IPC 与注册表边界校验，再由请求客户端使用规范化映射。

## Migration Plan

1. 将缺少 `customHeaders` 的既有 Provider 视为空映射，保持原有请求行为。
2. 增加 IPC/preload API 和设置页编辑能力。
3. 刷新 Claude Code Provider 时保留 RestX 已存的头映射。
4. 如需回滚，旧版本忽略未知的 `customHeaders` 字段，Provider 基础配置仍可读取。

## Open Questions

无。
