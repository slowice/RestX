---
id: java-mybatis-sql
name: Java、MyBatis 与 SQL
version: 1.0.0
zones: [blue, yellow]
languages: [java, xml, sql]
categories: [security, bug, consistency, test]
mandatory: false
---

# Java、MyBatis 与 SQL

检查空值、错误布尔条件、集合越界、异常吞没、事务边界、资源释放、并发共享状态、幂等性和 DTO/数据库字段不一致。

MyBatis 必须重点检查 `${}` 拼接、动态 SQL 条件遗漏、Mapper 方法参数名与 XML 不一致、批量操作空集合、更新或删除缺少限制条件、查询范围过大和 N+1 查询。优先参考仓库既有的 Controller、Service、Mapper、异常和返回结构风格，但不得复制既有的不安全实现。
