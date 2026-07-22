## Why

RestX 未来会持续加入性质不同的功能，但当前菜单、路由、全局状态、IPC 和 API 都集中在少数公共文件中；每增加或删除一个特性都会修改多个核心入口，特性之间也容易形成隐式依赖。现在需要建立编译期特性模块平台，让菜单特性可以独立拥有前后端实现，同时把公共层收敛为大多数特性都会依赖的架构能力。

## What Changes

- 定义统一的特性清单，由单个特性声明导航信息、路由组件、启用状态和所需能力。
- 左侧菜单和页面路由从特性清单自动生成；新增或删除菜单不再修改 Shell 与路由实现。
- 将特性代码按 `renderer`、`main`、`shared`、`tests` 聚合到独立目录，并优先迁移 AI Inspector 作为完整示范。
- 将集中式 IPC 注册拆成平台 IPC 与特性 IPC；特性通过命名空间注册自身处理器并自行完成输入校验。
- 将单体 `RestXApi` 拆为平台 API 与特性 API 契约，再在 preload 中以类型安全方式组合。
- 将全局状态和全局样式收敛为平台级能力；业务状态与样式归属各自特性。
- 建立特性间依赖规则、懒加载、错误边界和测试约束，防止单个特性故障影响其他菜单。
- 保持当前用户功能和数据兼容，不引入运行期执行第三方代码的插件系统。

## Capabilities

### New Capabilities

- `modular-feature-platform`: 定义 RestX 编译期特性模块的声明、注册、导航、路由、IPC/API 组合、隔离边界及可删除性要求。

### Modified Capabilities

无。

## Impact

- 主要影响 `src/renderer/src/app`、`src/renderer/src/features`、`src/main/ipc`、`src/main/services`、`src/preload` 和 `src/shared/contracts`。
- AI Inspector 相关 UI、主进程服务、契约与测试将移动到统一特性目录，导入路径随之调整，但用户可见功能保持不变。
- Home、Lab、Settings 将采用轻量特性清单；平台公共层只保留窗口壳、特性注册、基础 IPC 桥接、通用错误边界和真正跨特性复用的组件/工具。
- 不新增外部运行时依赖，不加载用户提供的 JavaScript/TypeScript 插件。
