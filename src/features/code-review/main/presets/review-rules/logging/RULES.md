---
id: logging-quality
name: 日志规范
version: 1.0.0
zones: [blue, yellow]
languages: ['*']
categories: [logging, security]
mandatory: true
---

# 日志规范

检查敏感信息、完整请求体或响应体、字符串拼接、日志级别不当、正常流程刷屏、同一异常多层重复打印，以及捕获异常后只打印消息而丢失必要堆栈或业务上下文。

报告日志问题时必须说明可能泄露的字段或造成的运行影响，不要只给出泛泛的“建议优化日志”。
