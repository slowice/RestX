---
id: java-mybatis-sql
name: Java、MyBatis 与 SQL
version: 1.1.0
zones: [blue, yellow]
languages: [java, xml, sql]
categories: [security, bug, consistency, test]
mandatory: false
---

# Java、MyBatis 与 SQL

检查空值、错误布尔条件、集合越界、异常吞没、事务边界、资源释放、并发共享状态、幂等性和 DTO/数据库字段不一致。

遵循 CUSTOM-001 重点检查低级代码错误，遵循 CUSTOM-002 捕获实际具体异常，禁止直接 catch Exception 或用宽泛父类代替具体异常。替换类型必须由实际调用契约支持。遵循 CUSTOM-003，日志只打印脱敏描述，不打印异常堆栈或将 Throwable 作为日志参数。

MyBatis 必须重点检查 `${}` 拼接、动态 SQL 条件遗漏、Mapper 方法参数名与 XML 不一致、批量操作空集合、更新或删除缺少限制条件、查询范围过大和 N+1 查询。优先参考仓库既有的 Controller、Service、Mapper、异常和返回结构风格，但不得复制既有的不安全实现。

`${}` 是否构成注入应核对数据来源和白名单，不能只按语法定罪。检查事务实际生效范围、异常后的回滚和中断语义；数据库结构变更需核对历史数据、默认值、兼容窗口和迁移失败处理。
