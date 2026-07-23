## Why

RestX 的配置、加密凭据、缓存、用户预置和日志目前分散在 Electron 默认 userData、`~/.RestX` 等位置，路径大小写和职责都不一致。统一到 `~/.restx` 可以让备份、排障、权限控制和后续跨平台维护更清晰，同时避免新旧目录继续分叉。

## What Changes

- 建立统一的 `~/.restx` 应用数据根目录，并按 `config`、`cache`、`logs`、`runtime` 划分职责。
- 将所有 `electron-store` 配置与加密凭据写入 `~/.restx/config`，将分析与代码检视缓存写入 `~/.restx/cache`。
- 将 AI 调用日志和代码检视审计日志从 `~/.RestX/log` 改到 `~/.restx/logs`，将用户预置迁移到 `~/.restx/config/presets`。
- 将 Electron 自身的 userData 指向 `~/.restx/runtime`，使 RestX 后续产生的运行数据不再散落到系统默认目录。
- 在应用注册任何特性和存储实例之前执行幂等迁移：处理 macOS 大小写不敏感文件系统上的 `.RestX` → `.restx`，并迁移旧 Electron userData、日志、预置、配置、凭据和缓存。
- 迁移目标已存在时不覆盖；无法安全合并的旧文件保留原位并继续启动，避免因迁移失败造成数据丢失。

## Capabilities

### New Capabilities

- `restx-storage-layout`: 统一应用数据目录、子目录职责、启动时迁移、权限与兼容回退行为。

### Modified Capabilities

无。

## Impact

- 新增平台级存储路径与迁移模块，并调整 Electron 启动顺序。
- 修改 AI Inspector、Code Review 和统一 AI Provider 的持久化构造参数及日志路径。
- 迁移现有 `electron-store` JSON、`~/.RestX/log` 和 `~/.RestX/presets` 数据；不改变配置结构、密文字段或缓存格式。
- 不新增运行时依赖；需要新增迁移、路径、边界和现有功能回归测试。
