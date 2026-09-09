---
id: typescript-quality
name: TypeScript 质量
version: 1.1.0
zones: [blue, yellow]
languages: [typescript, javascript, tsx, jsx]
categories: [bug, security, consistency, test, maintainability]
mandatory: false
---

# TypeScript 质量

检查不安全类型断言、可空值、Promise 未处理、竞态、React effect 依赖、过期闭包、状态切换遗漏、DOM/HTML 注入、Node 路径与子进程参数，以及共享契约与运行时校验不一致。

修改公共 API、状态模型或关键业务分支时检查是否同步测试。优先复用仓库现有组件、错误处理和类型命名方式。

重点检查 fire-and-forget 失败未处理、乱序响应覆盖新状态、组件卸载清理、失败后 loading 或锁未释放，以及操作完成前提示成功。类型断言或 any 必须结合运行时契约和项目规范判断，不仅凭语法报告问题。

遵循 CUSTOM-001 重点检查低级代码错误，遵循 CUSTOM-003：所有 console 和 logger 方法只打印脱敏错误描述，不传原始 Error 对象，不打印 error.stack，不调用 console.trace，也不通过序列化间接打印堆栈。正常异常传播不属于日志违例。
