---
id: typescript-quality
name: TypeScript 质量
version: 1.0.0
zones: [blue, yellow]
languages: [typescript, javascript, tsx, jsx]
categories: [bug, security, consistency, test, maintainability]
mandatory: false
---

# TypeScript 质量

检查不安全类型断言、可空值、Promise 未处理、竞态、React effect 依赖、过期闭包、状态切换遗漏、DOM/HTML 注入、Node 路径与子进程参数，以及共享契约与运行时校验不一致。

修改公共 API、状态模型或关键业务分支时检查是否同步测试。优先复用仓库现有组件、错误处理和类型命名方式。
