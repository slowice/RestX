## ADDED Requirements

### Requirement: Provider 注册表统一管理模型服务
系统 SHALL 通过平台级 Provider 注册表管理多个模型服务，每个 Provider SHALL 包含名称、来源、Base URL 和模型 ID，且不得包含蓝区或黄区字段。

#### Scenario: 多个手工 Provider 并存
- **WHEN** 用户新增两个具有不同名称或服务参数的 Provider
- **THEN** 系统在统一列表中保留两个 Provider，并允许独立编辑和删除

#### Scenario: Provider 不按区域拆分
- **WHEN** 用户打开 AI 设置
- **THEN** 系统只展示统一 Provider 列表，不展示蓝区 Provider 和黄区 Provider 两套表单

### Requirement: 用户可以切换全局当前 Provider
系统 SHALL 持久化唯一的当前 Provider，并让所有 AI 特性在下一次调用时使用该 Provider。

#### Scenario: 切换当前 Provider
- **WHEN** 用户将另一个可用 Provider 设为当前项
- **THEN** 配置解析、代码 Review 和其他 AI 特性的后续请求均使用新 Provider

#### Scenario: 当前 Provider 不可用
- **WHEN** 当前 Provider 的配置或凭据不可用
- **THEN** 系统返回可识别的配置错误，且不得静默切换到其他 Provider

### Requirement: 手工 Provider 凭据安全保存
系统 SHALL 使用 Electron 安全存储加密手工 API Key，且 renderer、日志、缓存和错误消息不得获得明文凭据。

#### Scenario: 保存手工 Provider
- **WHEN** 用户提交名称、Base URL、API Key 和模型 ID
- **THEN** 系统保存公共字段和加密凭据，并只向 renderer 返回凭据已配置状态

#### Scenario: 更新但不替换 API Key
- **WHEN** 用户编辑 Provider 公共字段且 API Key 留空
- **THEN** 系统保留原有加密凭据

### Requirement: 用户可以测试 Provider
系统 SHALL 允许用户在保存后测试指定 Provider，并使用 OpenAI-compatible 请求返回成功或可理解的失败信息。

#### Scenario: 测试成功
- **WHEN** Provider 的 Base URL、API Key 和模型 ID 可正常调用
- **THEN** 系统显示测试成功且不记录请求中的凭据

#### Scenario: 测试失败
- **WHEN** Provider 请求超时、认证失败或返回协议错误
- **THEN** 系统显示归一化错误且保持 Provider 配置不变

### Requirement: 系统自动导入 Claude Code Provider
系统 SHALL 在启动时检查 Claude Code 设置，并将可用配置幂等注册为来源为 `claude-code` 的 Provider。

#### Scenario: 首次发现 Claude Code Provider
- **WHEN** `~/.claude/settings.json` 包含可用 Base URL 和认证 Token
- **THEN** 系统新增一个 Claude Code Provider，且在没有当前 Provider 时将其设为当前项

#### Scenario: 重复启动
- **WHEN** 同一 Claude Code 配置已经导入
- **THEN** 系统更新原 Provider 状态而不创建重复项

#### Scenario: 模型字段缺失
- **WHEN** Claude Code 配置中不存在可识别的模型 ID
- **THEN** 导入的 Provider 使用 `GLM5.1`

### Requirement: Claude Code 动态凭据自动刷新
系统 SHALL 保持 Claude Code 凭据由外部配置所有，并通过安全指纹检测变化，不得把动态 Token 复制到 RestX Provider store。

#### Scenario: 调用前配置已经变化
- **WHEN** Claude Code 设置文件的状态与上次解析不同
- **THEN** 系统重新读取凭据并使用新的 Token 发起请求

#### Scenario: 认证失败后 Token 已刷新
- **WHEN** 请求返回 401 或 403，且强制刷新后的凭据指纹发生变化
- **THEN** 系统使用新凭据自动重试一次

#### Scenario: 凭据进入日志或 renderer
- **WHEN** 系统读取、调用或刷新 Claude Code Provider
- **THEN** 日志和 renderer API 中均不包含明文 Token 或可复用摘要

### Requirement: 现有 Provider 无损迁移
系统 SHALL 把 AI Inspector 和 Code Review 的既有 Provider 迁移到统一注册表，去重相同配置并保留不同配置。

#### Scenario: 旧配置相同
- **WHEN** 两个旧 store 中的 Provider 服务身份和凭据一致
- **THEN** 系统只创建一个迁移后的手工 Provider

#### Scenario: 旧配置不同
- **WHEN** 旧 store 中存在多个不同 Provider
- **THEN** 系统全部保留并提供清晰名称供用户切换

### Requirement: 业务特性通过公共 capability 调用当前 Provider
系统 SHALL 让 AI Inspector、Code Review 和未来特性通过平台公共契约获取当前 Provider 并发起调用，不得直接导入其他特性的 Provider 实现。

#### Scenario: 配置解析调用模型
- **WHEN** 用户请求解析配置
- **THEN** AI Inspector 通过平台 capability 使用当前 Provider 并保持自己的提示词、结果解析和缓存逻辑

#### Scenario: 代码 Review 调用模型
- **WHEN** 用户开始 AI Review
- **THEN** Code Review 通过同一平台 capability 使用当前 Provider，同时继续执行代码来源的数据访问校验
