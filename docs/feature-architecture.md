# RestX 特性模块开发指南

RestX 使用编译期特性插件架构。每个左侧菜单是一个特性胶囊；特性可以只有 renderer 页面，也可以同时拥有 main 服务、preload 白名单和共享契约。

## 目录边界

```text
src/
├── platform/                    # 注册、生命周期、IPC 安全、Shell、错误边界
├── features/
│   └── <feature-id>/
│       ├── shared/              # 对外公开的 DTO、API 和 channel 常量
│       ├── renderer/            # 菜单声明、页面、状态和特性样式
│       ├── main/                # 主进程 handler 和业务服务
│       ├── preload/             # window.restx 白名单 API 贡献
│       └── tests/               # 可选的就近测试
├── main/index.ts                # Electron 启动入口
├── preload/index.ts             # API 组合入口
└── app-api.ts                   # 最终 window.restx 类型组合
```

`platform` 只接受大多数特性都会使用的架构能力。文件扫描、AI 调用、JSONL、配置解析、缓存和工具预置都属于 AI Inspector，不能放入 platform。

## 新增一个纯页面菜单

1. 创建 `src/features/<feature-id>/renderer/Page.tsx`。
2. 创建 `src/features/<feature-id>/renderer/feature.tsx`：

```tsx
import { Notebook } from 'lucide-react'
import { defineRendererFeature } from '../../../platform/renderer/define-feature'
import './feature.css'

export const notesFeature = defineRendererFeature({
  id: 'notes',
  order: 40,
  navigation: { label: '笔记', icon: Notebook, group: 'primary' },
  route: {
    path: '/notes',
    load: () => import('./Page').then(({ Page }) => ({ default: Page }))
  },
  status: 'stable'
})
```

3. 只在 `src/platform/renderer/feature-registry.ts` 导入它并加入 `registeredFeatures`。

Shell 和 Router 不需要修改；同一份声明会同时生成菜单和路由，并自动获得懒加载、加载状态与错误边界。

## 增加主进程能力

需要文件系统、网络或系统 API 时，再增加以下入口：

- `shared/channels.ts`：声明 `feature:<feature-id>:<operation>` channel。
- `shared/api.ts`：声明该特性对 renderer 公开的类型。
- `main/register.ts`：通过 `defineMainFeature` 注册 allowlist 中的 handler。
- `preload/api.ts`：通过 `definePreloadFeature` 把固定方法映射到固定 channel。
- `src/platform/main/feature-registry.ts`：加入 main 特性入口。
- `src/platform/preload/feature-registry.ts`：加入 preload 特性入口。
- `src/app-api.ts`：把公开 API 类型组合进 `RestXApi`。

不要向 renderer 暴露 `invoke(channel, args)` 之类的通用方法。renderer 只能调用特性 preload 明确公开的方法。

## 特性依赖

默认允许的导入方向：

```text
特性内部 -> 本特性 shared -> platform
特性 A -> 特性 B 的 shared 或 renderer 公共入口
```

禁止直接导入另一个特性的 `pages`、`components`、`state`、`main/services` 等内部实现。确需依赖时：

1. 由提供方导出窄公共入口或 capability 契约。
2. 消费方在 `feature.tsx` 的 `requires` 中声明 capability。
3. 提供方在 `provides` 中声明同名 capability。

注册器会拒绝缺失 capability、循环依赖、重复 id、重复路由和重复 IPC channel。

## 删除菜单

纯页面特性只需：

1. 从 renderer 注册表移除特性。
2. 删除对应 `src/features/<feature-id>` 目录。

全栈特性还需从 main/preload 注册表和 `src/app-api.ts` 类型组合中移除。运行 `pnpm test && pnpm typecheck && pnpm build` 后，架构测试会检查残留引用和越界导入。

## 公共层准入原则

代码只有满足以下任一条件才进入 `platform`：

- Electron/React 应用生命周期或安全边界能力；
- 特性注册、依赖校验、路由或错误隔离；
- 已被大多数活跃特性使用且语义稳定。

少数特性之间的业务协作优先通过 capability 完成，不创建万能 `shared` 目录。
