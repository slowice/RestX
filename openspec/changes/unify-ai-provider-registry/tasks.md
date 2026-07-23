## 1. 平台 Provider 基础能力

- [x] 1.1 定义统一 Provider、凭据状态、CRUD、切换、测试和模型调用的 shared 契约
- [x] 1.2 实现手工 Provider 安全存储、全局当前 Provider 和输入校验
- [x] 1.3 实现 OpenAI-compatible 调用客户端与归一化错误
- [x] 1.4 注册平台 main IPC 与 preload 白名单 API

## 2. Claude Code 与迁移

- [x] 2.1 实现 Claude Code 配置发现、字段优先级和 `GLM5.1` 默认模型
- [x] 2.2 实现稳定来源指纹、HMAC 凭据指纹、文件变化刷新及认证失败单次重试
- [x] 2.3 实现旧 AI Inspector 和 Code Review Provider 的幂等迁移与去重

## 3. 特性接入

- [x] 3.1 将 AI Inspector 配置解析和智能导入调用迁移到平台当前 Provider
- [x] 3.2 将 Code Review 模型调用迁移到平台当前 Provider并移除区域 Provider IPC
- [x] 3.3 调整两个特性的缓存身份，使凭据刷新不导致缓存失效

## 4. Provider 管理界面

- [x] 4.1 在设置页实现统一 Provider 列表、当前项切换和状态展示
- [x] 4.2 实现手工 Provider 新增、编辑、删除和连接测试交互
- [x] 4.3 移除 AI Inspector 与 Code Review 的旧分散 Provider 表单

## 5. 验证

- [x] 5.1 补充注册表 CRUD、切换、迁移、Claude Code 刷新和脱敏测试
- [x] 5.2 补充 AI Inspector 与 Code Review 使用统一当前 Provider 的回归测试
- [x] 5.3 运行 `pnpm test`、`pnpm typecheck`、`pnpm build` 和 `git diff --check`
