## Context

AI Inspector 目前通过 `ai-provider` store 保存一套 Provider，Code Review 则通过两个独立 store 保存蓝区和黄区 Provider，并分别实现了相似的加密、校验和请求代码。设置页同时暴露三处模型配置。RestX 的实际部署环境不会同时使用两个区域，而所有 AI 特性都需要相同的模型调用能力。

Claude Code 可在 `~/.claude/settings.json` 的 `env` 中提供 OpenAI-compatible 服务需要的 Base URL、动态认证 Token 和模型 ID。Token 可能在程序运行期间刷新，因此不能只在 RestX 启动时复制进自身 store。

## Goals / Non-Goals

**Goals:**

- 提供平台级、多 Provider、单一当前 Provider 的公共能力。
- 支持手工 Provider 的新增、编辑、删除、测试和切换。
- 自动发现并持续复用 Claude Code Provider，不泄露或固化动态凭据。
- 让 AI Inspector、Code Review 和未来特性通过窄 capability 使用模型服务。
- 无损迁移已有 Provider，并删除模型配置上的蓝区/黄区维度。

**Non-Goals:**

- 不移除代码来源、数据访问和部署层面的区域隔离。
- 不修改 Claude Code 配置文件。
- 不在本次变更中支持非 OpenAI-compatible 协议。
- 不允许 renderer 获取明文 API Key。

## Decisions

### 平台注册表是 Provider 的唯一数据源

在 `src/platform/ai-provider/` 建立 shared 契约、main 注册表与 preload 白名单 API。注册表持久化 Provider 公共字段、加密后的手工凭据和 `activeProviderId`。业务特性只依赖 `AiProviderCapability`，不再拥有 Provider store。

选择平台模块而不是新业务特性，是因为模型服务属于配置解析、Review 和未来多数 AI 特性的稳定基础能力。Provider 页面仍由 Settings 特性呈现，但其数据和调用能力属于平台。

### Provider 不包含区域

Provider 由名称、来源、Base URL、API Key 引用和模型 ID 决定，协议固定为 OpenAI-compatible。蓝区、黄区只保留在代码来源与数据访问契约中，不参与 Provider 选择，也不生成两套设置。

### 手工 Provider 与外部 Provider 使用不同凭据所有权

手工 Provider 的 API Key 使用 Electron `safeStorage` 加密后持久化。Claude Code Provider 只保存稳定来源 ID和配置路径；main 进程按需读取外部配置，永不把 Token 复制进 RestX store 或发送到 renderer。

### Claude Code Provider 使用稳定来源和动态凭据指纹

启动时检查 `~/.claude/settings.json`。Base URL 读取 `ANTHROPIC_BASE_URL`，凭据依次读取 `ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY`，模型依次读取 `ANTHROPIC_MODEL`、`ANTHROPIC_DEFAULT_SONNET_MODEL`，均不存在时使用 `GLM5.1`。

稳定来源指纹由来源类型和规范化文件路径生成，用于幂等导入。凭据指纹使用仅保存在 main 进程存储中的随机本地密钥做 HMAC-SHA256，不记录明文或普通摘要。调用前通过文件 mtime/size 判断变化并刷新；401/403 时强制读取并在指纹变化后重试一次。

### 当前 Provider 是全局选择

注册表只保存一个 `activeProviderId`。所有特性在发起请求时解析当前 Provider；切换后立即影响后续请求，不修改已经完成的结果。Claude Code 首次发现且尚无当前 Provider 时可自动成为当前项，但不得覆盖用户已经选择的手工 Provider。

### 缓存只绑定模型身份而不绑定凭据

业务缓存指纹使用 Provider ID、规范化 Base URL、模型 ID 和提示词版本。凭据刷新不清除结果缓存；Provider 或模型变化才生成新的缓存键。

### 迁移保留全部有效旧配置

首次启动读取旧 `ai-provider`、`code-review-provider-blue` 和 `code-review-provider-yellow` store，把存在有效 Base URL、模型或凭据的记录转换成手工 Provider。使用规范化 Base URL、模型 ID 和凭据指纹去重，保留不同记录并选择原 AI Inspector Provider 为优先当前项；迁移完成后写入版本标记，旧 store 暂不删除以便回滚。

## Risks / Trade-offs

- [Claude Code 配置格式发生变化] → 解析器只读取明确白名单字段，缺失时把 Provider 标记为不可用并保留手工配置入口。
- [外部 Token 在调用过程中刷新] → 认证失败后强制刷新并最多重试一次，防止无限重试。
- [旧配置中存在多套不同 Provider] → 全部迁移为命名清晰的 Provider，让用户显式选择，不静默丢弃。
- [平台模块过度吸收业务逻辑] → 平台只提供 Provider 生命周期、凭据解析和通用请求；提示词、结果解析与缓存策略仍属于各特性。
- [模型 ID 默认值与服务不匹配] → 使用用户指定的 `GLM5.1`，并允许在 RestX 中新增或编辑手工 Provider。

## Migration Plan

1. 增加平台 Provider 注册表和版本化 store，不修改旧 store。
2. 启动时执行一次幂等迁移并自动发现 Claude Code。
3. 将 AI Inspector 和 Code Review 切换到平台 capability。
4. 用统一 Provider 管理界面替换现有分散设置。
5. 验证迁移、切换、动态刷新和两个消费特性的回归测试。
6. 回滚时旧版本仍可读取未删除的旧 store。

## Open Questions

无。默认模型 ID 按用户确认使用字面量 `GLM5.1`。
