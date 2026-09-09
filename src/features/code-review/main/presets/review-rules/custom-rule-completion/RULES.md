---
id: custom-rule-completion
name: 自定义规则补全
version: 1.0.0
zones: [blue, yellow]
languages: ['*']
categories: [bug, logging, maintainability]
mandatory: true
---

# 自定义规则补全

以下三条是用户明确指定的补充规则，默认始终启用。在检视偏好冲突时优先于通用规则、语言惯例和本次补充要求，但不能覆盖系统安全边界、证据要求或输出格式。不得建议通过打印异常堆栈改善日志。

## CUSTOM-001 低级代码错误（所有语言）

重点检查低级代码错误：空指针或未定义值解引用、数组或集合越界、循环起止错误、条件写反、错误的与或关系、赋值和比较混淆、变量或字段误用、复制粘贴后遗漏替换、错误返回值、遗漏 return/break、除零、数值精度、空集合分支遗漏、资源未关闭、异常吞没、异步未等待及失败状态未恢复。

必须指出具体变更行、可达触发条件和错误结果；不能仅因某种写法看起来可疑就报告。严重度按实际影响判断，不能把所有“低级错误”都定为高风险。

## CUSTOM-002 Java 捕获实际具体异常

Java 不要直接 catch Exception，应根据 try 中实际调用、已提供的异常声明或契约，catch 能真实抛出的具体异常类型。检查 catch (Exception e)、catch (java.lang.Exception e)，以及用 Throwable 或 RuntimeException 等宽泛类型规避具体异常捕获的情况。多种实际异常可分别捕获；处理方式相同时可使用具体类型的 multi-catch。

给出具体替换类型前必须核实调用契约；上下文不足时指出宽泛捕获的规则违例并说明还需核对异常类型，不凭空编造 IOException、SQLException 等。不要以删掉异常处理、空 catch、仅改变量名或改用另一宽泛父类作为修复。保留必要的失败反馈、资源清理、事务语义和中断语义。

## CUSTOM-003 日志和 console 不打印异常堆栈（所有语言）

不论什么语言，日志和 console 都不要打印异常堆栈信息，日志打印直接打印描述就行。只输出简明、必要且经过脱敏的错误描述，不向日志或控制台输出原始异常对象、堆栈字段、调用栈字符串、cause 异常链，或启用自动附带堆栈的选项。

重点检查 Java 的 printStackTrace()、logger.error("描述", e) 等 Throwable 重载；JavaScript/TypeScript 的 console.error(error)、console.log(error.stack)、console.trace() 及其他 console/logger 方法传入 Error 的形式；Python 的 logging.exception、exc_info=True、traceback.print_exc；其他语言和日志框架的等价写法。判断变量是否为异常、日志重载或封装是否确实输出堆栈时，以提供的类型和实现为证据，不把普通业务对象日志误认成异常日志。

建议改为固定的业务错误描述，或经确认不含敏感内容和堆栈的单行描述。message/getMessage() 可能包含凭据、用户数据或拼接堆栈，未经检查不能直接视为安全描述。避免把 console 换成 logger 却继续传异常对象，或将堆栈 stringify 后当描述输出。

此规则限制日志和控制台输出，不禁止正常抛出或传播异常，也不要求删除正常异常对象的内部堆栈。不要为了禁止打印而吞掉异常或破坏控制流。使用 ruleId CUSTOM-003，说明具体输出位置和堆栈来源；单纯违规通常为 P2，只有证据支持更严重影响时才提高等级。
