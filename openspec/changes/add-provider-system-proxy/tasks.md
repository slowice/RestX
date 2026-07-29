## 1. Provider 契约与持久化

- [x] 1.1 为 Provider 公共状态、已解析类型和存储记录增加兼容的 `useSystemProxy` 字段
- [x] 1.2 实现 Provider 级代理偏好更新，并保证旧记录、新记录和外部 Provider 刷新的默认与保留行为
- [x] 1.3 先补充注册表回归测试，覆盖独立持久化、默认关闭、外部刷新保留和缓存指纹不变

## 2. 统一代理感知请求链路

- [x] 2.1 定义 Provider main 请求上下文，根据偏好注入 Node.js `fetch` 或 Electron `net.fetch`
- [x] 2.2 让连接测试以及配置分析、智能导入、代码 Review、知识分类等所有 Provider 调用使用注入的请求函数
- [x] 2.3 先补充网络选择和业务调用回归测试，覆盖代理开启、关闭、失败不回退与敏感信息不记录

## 3. IPC 与 Provider 界面

- [x] 3.1 增加严格校验的 `setSystemProxy(id, enabled)` IPC 和 preload 白名单 API，并补充 API 测试
- [x] 3.2 在所有 Provider 卡片展示系统代理开关，处理忙碌、成功和失败状态
- [x] 3.3 补充 Settings UI 回归测试，覆盖手工和自动导入 Provider 的开关交互

## 4. 集中验证与交付

- [x] 4.1 更新相关 OpenSpec 任务状态并执行 `git diff --check`
- [x] 4.2 在独立自动化验证任务中执行 `pnpm typecheck`、`pnpm test` 和 `pnpm build`
- [x] 4.3 在独立视觉验收任务中检查 Provider 页面固定状态、交互和截图
- [x] 4.4 在独立进程冒烟任务中验证应用启动、主窗口加载、主进程存活和正常退出
- [ ] 4.5 对完整变更执行一次最终代码审查，修复阻塞问题并仅重跑受影响检查
- [ ] 4.6 将已验证变更整合到本地 `main`，清理需求 worktree 和本地分支后提交并推送
