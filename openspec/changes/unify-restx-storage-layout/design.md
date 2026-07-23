## Context

RestX 当前同时使用 Electron 默认 `userData`、`~/.RestX/log` 和 `~/.RestX/presets`。`electron-store` 的配置、凭据和缓存都默认落在 userData 根目录，AI Inspector 与 Code Review 又各自拼接日志路径。macOS 默认文件系统通常大小写不敏感，直接从 `.RestX` 改为 `.restx` 还可能只改变代码字符串而不改变磁盘目录项的真实大小写。

这是一项跨 platform、AI Provider、AI Inspector 和 Code Review 的迁移。现有凭据使用 Electron `safeStorage` 生成的密文，迁移必须保持原始字节，不能解密后重写；应用必须在任何持久化 Store 构造或读取之前完成迁移。

## Goals / Non-Goals

**Goals:**

- 让 RestX 自有配置、凭据、缓存、日志、用户预置和 Electron runtime 都位于 `~/.restx`。
- 用稳定子目录区分持久配置、可清理缓存、日志和 Chromium/Electron 运行数据。
- 自动迁移旧 userData 与 `~/.RestX`，处理大小写不敏感和大小写敏感文件系统。
- 保持所有 JSON 数据结构、密文字段和公开 API 兼容。
- 迁移幂等、非覆盖，失败时不阻止应用启动或删除唯一副本。

**Non-Goals:**

- 不迁移 Claude Code、Codex 等外部工具自身的配置。
- 不改变 API Key、GitCode PAT、CodeHub PRIVATE-TOKEN 或缓存的加密算法。
- 不提供用户自定义 RestX 数据根目录。
- 不清理无法确认已成功迁移的旧目录或冲突文件。

## Decisions

### 1. 统一布局由 platform main 模块拥有

新增平台级存储模块，唯一声明以下路径：

```text
~/.restx/
├── config/              # electron-store 配置、加密凭据、用户预置
│   └── presets/
├── cache/               # analysis-cache、code-review-cache
├── logs/                # AI 调用日志、代码检视审计日志
└── runtime/             # Electron/Chromium userData
```

这些路径被多个特性使用且语义稳定，放在 platform 比复制路径常量或创建跨特性依赖更符合特性胶囊边界。

### 2. 所有 Store 显式指定 cwd

配置和凭据 Store 使用 `config`，缓存 Store 使用 `cache`。不依赖 Electron 默认 userData 来决定业务数据位置，因为 userData 还包含 Cookies、Preferences 和 Chromium 数据，无法表达配置与缓存的生命周期差异。

统一 AI Provider 的旧 Store 迁移读取也使用 `config`。原有 JSON schema 和文件名保持不变，使 safeStorage 密文可以原样迁移。

### 3. Electron userData 指向 runtime，特性注册改为迁移后动态加载

主入口在应用 ready 前将 `app.setPath('userData')` 指向 `~/.restx/runtime`。`registerApplication` 改为在 `initializeRestxStorage()` 完成后动态导入，确保任何顶层 Store 或服务单例都不会先读取一个尚未迁移的新空文件。

相比逐个重构所有服务为延迟构造，调整一次启动装配顺序更容易验证，也能约束未来特性遵循相同启动边界。

### 4. 迁移使用大小写归一化、分类搬迁和非覆盖合并

启动迁移按以下顺序执行：

1. 检测 `~/.RestX` 与 `~/.restx` 是否指向同一 inode。若是，使用同目录临时名称完成大小写归一化；若目标不存在，直接改名。
2. 创建四个目标子目录，权限为仅当前用户访问。
3. 将旧 `.RestX/log` 或 `.RestX/logs` 合并到 `logs`，将 `.RestX/presets` 合并到 `config/presets`。
4. 将旧 Electron userData 顶层 `.json` 文件按名称分类：包含 `cache` 的进入 `cache`，其余进入 `config`。
5. 将 userData 剩余内容合并到 `runtime`。

同名目标存在时保留目标且不覆盖源文件；仅在文件成功改名或复制后删除源项。目录只在确认为空时删除。迁移可重复执行并继续处理上次未完成的条目。

### 5. 新写入使用严格目录权限

根目录和子目录使用 `0700`，日志、预置和 Store 文件继续使用当前库或写入逻辑的用户私有权限。日志路径统一为复数 `logs`，不再创建 `.RestX` 或单数 `log`。

## Risks / Trade-offs

- **[旧目录和目标目录存在同名冲突]** → 不覆盖、不删除源文件；新目录作为当前权威位置，冲突源保留供人工核对。
- **[迁移中断]** → 每个文件独立搬迁且流程幂等，下次启动继续；不得先批量删除源目录。
- **[safeStorage 密文跨位置读取失败]** → 原样移动字节，不解密重写；仍在同一 OS 用户和应用环境中读取。
- **[动态 import 改变启动错误路径]** → 保留现有启动 catch 和退出行为，并增加启动/路径测试。
- **[runtime 搬迁数据量较大]** → 优先使用同文件系统 rename；仅在 rename 失败时复制单个文件。
- **[大小写敏感系统同时存在 `.RestX` 与 `.restx`]** → 保留新目录并按非覆盖规则合并旧目录，不假设二者相同。

## Migration Plan

1. 发布包含平台存储模块和启动顺序调整的版本。
2. 首次启动在注册业务特性前迁移旧目录，随后所有 Store 从新路径读取。
3. 验证现有 Provider、GitCode、CodeHub、偏好、缓存、日志和用户预置可继续使用。
4. 回滚旧版本时，新目录不自动反向迁移；旧冲突副本会保留，但已成功移动的数据需手工复制回旧路径。

## Open Questions

无。未来如需支持自定义数据根目录，应作为单独变更设计锁、并发启动和跨卷迁移。
