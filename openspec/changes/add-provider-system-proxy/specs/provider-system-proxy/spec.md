## ADDED Requirements

### Requirement: 每个 AI Provider 独立保存系统代理偏好
系统 SHALL 为每个手工或自动导入的 AI Provider 保存独立的系统代理布尔配置，并 SHALL 允许用户在统一 Provider 界面修改该配置。

#### Scenario: 为手工 Provider 开启系统代理
- **WHEN** 用户在手工 Provider 卡片上开启“使用系统代理”
- **THEN** 系统持久化该 Provider 的代理偏好，并让其后续请求使用系统代理

#### Scenario: 为自动导入 Provider 开启系统代理
- **WHEN** 用户在只读的自动导入 Provider 卡片上开启“使用系统代理”
- **THEN** 系统只更新 RestX 管理的网络偏好，不修改外部 Provider 的服务参数或凭据

#### Scenario: 不影响其他 Provider
- **WHEN** 用户修改一个 Provider 的系统代理开关
- **THEN** 其他 Provider 的代理偏好保持不变

### Requirement: 旧 Provider 和新 Provider 默认直连
系统 MUST 将缺少系统代理字段的旧 Provider 解释为关闭，并 MUST 让新建或首次自动导入的 Provider 默认关闭系统代理。

#### Scenario: 升级读取旧 Provider
- **WHEN** 系统读取没有系统代理字段的既有 Provider 记录
- **THEN** 该 Provider 继续使用升级前的 Node.js 直连路径

#### Scenario: 首次创建 Provider
- **WHEN** 用户新建手工 Provider 或系统首次导入外部 Provider
- **THEN** Provider 的系统代理开关默认为关闭

#### Scenario: 刷新外部 Provider
- **WHEN** 自动导入 Provider 已有代理偏好且外部配置发生刷新
- **THEN** 系统更新外部服务参数和状态，同时保留代理偏好

### Requirement: AI Provider 请求统一遵循网络偏好
系统 SHALL 让 Provider 连接测试和所有通过平台 Provider capability 发起的实际 AI 请求使用同一代理感知请求上下文。

#### Scenario: 系统代理关闭
- **WHEN** 某 Provider 的系统代理开关关闭
- **THEN** 连接测试和实际 AI 调用均使用现有 Node.js 网络栈直连

#### Scenario: 系统代理开启
- **WHEN** 某 Provider 的系统代理开关开启
- **THEN** 连接测试和实际 AI 调用均使用 Electron 原生网络栈，并遵循操作系统代理、PAC 和代理认证配置

#### Scenario: PAC 决定直连
- **WHEN** 系统代理开启但操作系统 PAC 对目标 URL 返回 `DIRECT`
- **THEN** Electron 网络栈按系统规则直接连接目标服务

### Requirement: 代理失败不得静默绕过
系统 MUST 在系统代理请求失败时返回可理解的连接错误，并 MUST NOT 静默回退到关闭代理时的 Node.js 直连路径。

#### Scenario: 系统代理不可达
- **WHEN** Provider 开启系统代理且代理服务器无法连接或请求超时
- **THEN** 系统显示归一化网络错误，保持 Provider 配置不变且不尝试绕过代理

### Requirement: 代理信息不得越过安全边界
系统 MUST NOT 向 renderer、业务日志、错误消息、缓存或遥测暴露解析后的代理地址、PAC 内容、代理认证数据或 Provider 明文凭据。

#### Scenario: 代理请求记录失败
- **WHEN** 使用系统代理的 Provider 请求失败并产生诊断日志
- **THEN** 日志只包含既有安全响应摘要和错误类别，不包含代理配置或认证数据

### Requirement: 代理偏好不得改变模型结果身份
系统 SHALL 将代理偏好视为网络路由配置，不得因开关变化修改 Provider 结果缓存身份。

#### Scenario: 只切换代理偏好
- **WHEN** Provider 的 Base URL、模型和提示版本不变且用户只切换系统代理
- **THEN** 系统不因该切换清除或改变既有 AI 结果缓存键
