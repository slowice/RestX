## Context

RestX 当前已经有 `features/*` 页面目录和由 `modules.ts` 生成菜单/路由的雏形，但特性仍共享一个全局状态、一个全局样式文件、一个集中式 IPC 注册器和一个单体 `RestXApi`。这使 UI 页面看似模块化，主进程能力和业务契约却没有跟随特性边界拆分。

Electron 同时存在 renderer、preload、main 三个安全边界。一个可维护的“插件式菜单”不能通过任意动态加载本地代码实现，而应采用受构建系统检查的编译期特性胶囊：特性内部聚合自己的多进程代码，平台只负责发现/注册受信任的特性入口。

## Goals / Non-Goals

**Goals:**

- 新增 UI 菜单特性时，创建特性目录并加入 renderer 注册表即可；Shell 和路由代码不需要修改。
- 需要主进程能力的特性，通过独立 main/preload 入口注册，不把业务 handler 继续堆入公共 IPC 文件。
- 删除一个特性时，可按注册入口和目录完成可预测删除，不留下隐式全局状态或样式依赖。
- 特性默认不能直接导入其他特性的内部代码，只能使用平台 API 或对方显式公开的 capability 契约。
- 平台公共层只保留生命周期、注册、IPC 安全封装、错误隔离等多数特性需要的架构能力。
- 保持现有页面、配置浏览、JSONL 浏览、AI 解析、缓存和智能导入行为兼容。

**Non-Goals:**

- 不支持从磁盘或网络运行未经构建和签名的第三方 JavaScript/TypeScript 插件。
- 不在本次改造中设计插件市场、版本协商、沙箱执行或热安装。
- 不为只有一个特性使用的代码提前抽象公共库。
- 不改变当前用户数据目录、缓存格式、AI 服务配置格式或工具预置格式。

## Target Structure

```text
src/
├── platform/                         # 仅架构级、跨多数特性的能力
│   ├── shared/
│   │   ├── feature-types.ts          # 特性 id、状态、依赖等纯类型
│   │   └── platform-api.ts           # 应用版本等平台 API 契约
│   ├── renderer/
│   │   ├── feature-registry.ts       # renderer 特性的唯一注册表
│   │   ├── define-feature.ts         # 特性清单校验/类型辅助
│   │   ├── FeatureBoundary.tsx       # 单特性错误边界
│   │   └── shell/                    # 窗口骨架、菜单容器、Outlet
│   ├── main/
│   │   ├── feature-registry.ts       # main 特性注册表
│   │   ├── ipc.ts                    # 安全 handle/remove 封装
│   │   └── register-platform.ts      # 平台生命周期与平台 IPC
│   └── preload/
│       ├── feature-registry.ts       # preload API 贡献注册表
│       └── expose-api.ts             # contextBridge 组合与暴露
│
├── features/                         # 每个目录是可独立增删的特性胶囊
│   ├── home/
│   │   └── renderer/
│   │       ├── feature.tsx           # 菜单、路由、懒加载声明
│   │       ├── HomePage.tsx
│   │       └── home.module.css
│   ├── ai-inspector/
│   │   ├── shared/
│   │   │   ├── api.ts                # 该特性公开的 API 类型
│   │   │   ├── channels.ts           # IPC channel 常量
│   │   │   └── contracts/            # config/jsonl/preset/analysis DTO
│   │   ├── renderer/
│   │   │   ├── feature.tsx
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   ├── state/
│   │   │   └── ai-inspector.module.css
│   │   ├── main/
│   │   │   ├── register.ts           # 只注册本特性的 IPC
│   │   │   ├── services/
│   │   │   └── presets/
│   │   ├── preload/
│   │   │   └── api.ts                # 本特性的白名单桥接实现
│   │   └── tests/
│   ├── lab/
│   │   └── renderer/...
│   └── settings/
│       └── renderer/...
│
├── main/index.ts                     # 只启动 platform/main 注册器
├── preload/index.ts                  # 只组合 platform + feature API
└── renderer/src/main.tsx             # 只启动 platform renderer
```

测试目录可保留项目级 `tests/` 作为 runner 入口，但测试文件按特性命名或逐步迁入 `src/features/<id>/tests`。构建配置只负责发现这些固定入口，不包含业务逻辑。

## Decisions

### 1. 使用编译期特性胶囊，而不是运行期代码插件

每个特性包含 `renderer`、可选 `main`、可选 `preload`、可选 `shared`。注册表只导入仓库内、经过 TypeScript 和构建校验的入口。

原因是 Electron preload 是安全边界。运行期加载未知代码会引入权限、升级、签名和 API 兼容问题；当前目标只是让团队后续开发的菜单功能易增删，编译期机制已经足够。

备选方案是扫描目录并动态执行插件，本阶段拒绝；以后若需要第三方生态，应另建独立 OpenSpec。

### 2. renderer、main、preload 分设注册表

renderer 注册表定义导航和路由；main 注册表定义后端 handler；preload 注册表定义允许暴露给 renderer 的方法。纯 UI 特性只需要加入 renderer 注册表。全栈特性需要分别加入三个明确入口。

不能使用一个同时 import React 页面与 Node 服务的万能注册表，否则不同 Electron 构建目标会相互引入不兼容依赖，也削弱安全审计能力。三个注册表是有意保留的进程边界，而不是重复架构。

### 3. 一个 renderer 清单同时驱动菜单和路由

`RendererFeature` 采用近似如下的稳定契约：

```ts
type RendererFeature = {
  id: FeatureId
  order: number
  navigation?: { label: string; icon: LucideIcon; group: NavigationGroup }
  route: { path: string; load: () => Promise<{ default: ComponentType }> }
  status?: 'stable' | 'experimental'
  requires?: CapabilityId[]
}
```

Shell 只读取 `navigation`，Router 只读取 `route`，二者不再 import 业务页面。页面使用 `React.lazy`，每个路由外包裹特性级错误边界和 Suspense。

备选方案是继续维护菜单数组与路由数组，容易出现两边漏改，因此不采用。

### 4. IPC channel 和 API 由特性拥有

特性在 `shared/channels.ts` 中定义带命名空间的 channel，例如 `feature:ai-inspector:scan-directory`。main 入口通过平台提供的安全注册辅助注册 handler；preload 入口只暴露该特性列出的固定方法。

平台不提供 renderer 可直接调用任意 channel 的通用 `invoke(channel)`，防止白名单失效。最终 `RestXApi` 是平台 API 与各已注册特性 API 的类型组合，而不再由一个中央文件手写所有业务方法。

### 5. 默认禁止跨特性内部导入

允许的依赖方向为：

```text
feature internals -> same feature shared -> platform
feature A -> feature B public capability contract (必须显式声明 requires)
```

禁止 `features/a/**` 直接导入 `features/b/renderer|main/**`。确需协作时，由提供方导出窄 capability 接口，消费方声明 `requires`，注册阶段检查依赖；缺少依赖时该消费特性不注册，并给出可诊断日志。

第一版通过 TypeScript 路径、ESLint/import 约束和架构测试保护边界。这里不追求绝对零依赖，而追求依赖显式、可替换、可检测。

### 6. 公共层采用“多数特性需要”准入规则

只有满足以下条件的代码进入 `platform`：

- 属于 Electron/React 应用生命周期、特性注册或安全边界；或
- 已被大多数活跃特性使用，且语义稳定；或
- 是维持特性隔离必须统一执行的横切能力，例如错误边界、日志接口、IPC 注册清理。

文件扫描、AI Provider、JSONL 解析、预置管理、分析缓存等均属于 AI Inspector，不进入平台。只被两个特性偶然复用的工具优先重复少量代码或通过公开 capability 协作，避免形成“万能 shared”。

### 7. 状态、样式、存储和错误按特性隔离

- 平台状态只保存窗口/主题/全局偏好等应用级信息。
- 扫描结果、选中文件、分析状态等移动到 AI Inspector 自己的 state/provider。
- 平台 CSS 只保留 reset、主题 token 和 Shell 布局；特性使用 CSS Modules 或特性根选择器。
- 特性持久化数据使用稳定的 feature id 作为命名空间。
- 一个特性的 render 错误显示局部降级页面，不能让整个侧栏和其他路由白屏。

### 8. 先迁移纵向切片，再清理旧入口

AI Inspector 是第一个完整纵向切片，覆盖 renderer/main/preload/shared/tests。Home、Lab 作为纯 UI 示例；Settings 在保持行为不变的前提下拆分，并通过公开 API 使用必要能力。全部验证通过后，删除旧 `app/modules.ts`、集中式业务 IPC 和单体 API 定义。

## Risks / Trade-offs

- [目录移动较多，容易产生导入路径回归] → 分阶段迁移，每阶段保持 typecheck/test/build 通过，最后才删除兼容入口。
- [三个进程各有注册入口，看起来比单一数组复杂] → 用统一命名和 feature id 校验降低维护成本，并把它视为 Electron 安全边界的显式表达。
- [公共层准入过严可能产生少量重复] → 先允许小范围重复，达到多数特性稳定复用后再提升到 platform。
- [特性 capability 依赖可能形成环] → 注册器检测缺失和循环依赖，架构测试拒绝循环。
- [CSS Modules 迁移可能造成视觉差异] → 先保留主题 token，按页面迁移并进行构建与界面冒烟验证。
- [一次性迁移所有服务风险较高] → 先建立平台骨架，再迁移 AI Inspector，随后迁移轻量页面，采用可回退的小步提交。

## Migration Plan

1. 新建 platform 类型、renderer 注册器、懒加载路由和错误边界，先兼容现有页面。
2. 将 Home、Lab 迁成纯 renderer 特性，验证新增/删除一个轻量菜单只修改特性注册表。
3. 将 AI Inspector 的契约、renderer 状态/UI、main 服务、preload API 和测试迁入一个纵向特性目录。
4. 拆分 main IPC 与 preload API 组合，保持 `window.restx` 的用户代码调用形状兼容或在单次迁移中统一更新。
5. 迁移 Settings，收敛平台级 AppState 和全局 CSS。
6. 添加架构测试：唯一 id/route、依赖存在且无环、IPC channel 不重复、禁止跨特性内部导入。
7. 删除旧入口，运行 test、typecheck、build、package 和核心页面冒烟测试。

回退时可在第 1—5 步保留兼容注册器；只有所有验证通过后才删除旧实现，因此回退不涉及用户数据迁移。

## Open Questions

当前没有阻塞实现的问题。默认使用显式的三层注册表和 CSS Modules；未来若希望做到“只复制文件夹即可自动注册”，可在架构稳定后增加生成器，而不是在第一版引入隐式文件扫描。
