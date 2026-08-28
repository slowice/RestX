# 首页登录与每日任务表格运行交接

## 当前目标

验证首页每次启动要求重新输入密码、登录后覆盖保存凭据并显示可编辑任务表格；确认增删行列和单元格编辑会自动保存。登录后回调当前为 no-op，失败不能阻止表格使用。

## 代码身份

- 分支：`codex/home-daily-tasks`
- 基线：`037f408 fix: preserve mail editor content on click`
- worktree：`/Users/xubin/xb/Work Stattion/RestX/.worktrees/home-daily-tasks`
- 当前阶段不在 worktree 创建需求提交。

## 关键文件

- `src/features/home/renderer/HomePage.tsx`：登录与任务表格交互。
- `src/features/home/main/register.ts`：home IPC 输入边界。
- `src/features/home/main/home-service.ts`：会话、回调状态和诊断序列。
- `src/features/home/main/credential-store.ts`：`safeStorage` 加密凭据。
- `src/features/home/main/task-store.ts`：表格校验与原子写入。
- `src/features/home/main/post-login-callback.ts`：预留 no-op 回调及其窄类型。
- `src/features/home/shared/`、`src/features/home/preload/api.ts`：公开 DTO 和固定 preload API。

## 端到端路径与日志标记

1. `[home-daily][01] login_submitted`：renderer 已提交，日志只包含账号/密码是否存在。
2. `[home-daily][02] login_ipc_validated`：main 已校验输入。
3. `[home-daily][03] credentials_saved`：密文已写入安全存储文件。
4. `[home-daily][04] task_table_unlocked`：renderer 已切换到任务表格。
5. `[home-daily][05] post_login_callback_started`：主进程预留回调开始。
6. `[home-daily][06] post_login_callback_succeeded|failed`：回调结果；失败只记录错误类型。
7. `[home-daily][07] task_table_loaded`：主进程返回列数和行数。
8. `[home-daily][08] task_save_requested`：收到表格快照，只记录列数和行数。
9. `[home-daily][09] task_table_saved`：原子保存完成。

不得在日志或回复中输出账号、密码、任务内容、凭据文件原文或完整任务 JSON。

## 存储层

- 正常运行：`~/.restx/config/home-login.json` 与 `~/.restx/config/home-tasks.json`。
- 隔离验证：启动前设置绝对路径环境变量 `RESTX_HOME_CONFIG_ROOT`，只覆盖 home 特性的两个文件。
- `home-login.json` 的密码字段必须是 `safeStorage` 生成的 Base64 密文，renderer 永远拿不到保存的密码。
- `home-tasks.json` 使用版本 1 快照；写入过程是同目录临时文件加 rename。

## 已确认结论

2026-08-28 已在真实 Electron renderer 完成隔离验证，调试端口为 `9347`，home 配置目录为 `/private/tmp/restx-home-daily.uHayEu`：

- 登录页真实加载；首次账号与密码均为空。
- 登录后出现 5 个预设列，日志到达 `[01]` 至 `[07]`，no-op 回调为 `[06] post_login_callback_succeeded`。
- 新增 1 条任务并编辑日期、任务、状态、优先级和备注；新增自定义“工时”列并写入内容，日志到达 `[08]`、`[09]`，页面显示“已自动保存”。
- 切换到其他菜单再返回，当前进程仍显示任务表格与已编辑数据，不重复登录。
- 完全停止 Electron 并重新启动后，首页重新显示登录表单；账号预填为上次账号，密码为空。
- 再次登录后恢复 6 列、1 行及自定义列内容；凭据文件包含密文字段且权限为 `600`，任务文件权限为 `600`。
- 已实际检查 `/private/tmp/restx-home-login.png`、`/private/tmp/restx-home-table-empty.png` 和 `/private/tmp/restx-home-table-edited.png`。页面加载正确，文字、控件、表头和行内容未截断或错位；增加第 6 列后出现可用横向滚动条，删除行操作位于滚动区域末端。

本轮结论：登录、回调、任务编辑、自动保存、会话内保持和重启重新登录主流程均为 `PASS`，当前没有未解决的运行假设。

## 不要修改

- 不要修改其他特性、platform Shell 或路由来实现全局登录。
- 不要把密码改为 renderer/localStorage 存储或记录到日志。
- 不要在验证时使用用户真实 `~/.restx/config/home-*.json`。
- 不要添加云同步、复杂列类型、公式或表格框架。

## 黄区复验与停止条件

仅当后续修改触及 home renderer、IPC、凭据存储、任务存储或回调装配时，才使用 worktree 已有依赖重新验证。以未占用的远程调试端口启动真实 Electron，并设置新的临时 `RESTX_HOME_CONFIG_ROOT`。出现第一个缺失序号、页面错误或存储错误时停止扩展操作，返回最小证据给蓝区分析。

回复模板（只返回以下内容）：

```text
日志序列：[01]=有/无 [02]=有/无 [03]=有/无 [04]=有/无 [05]=有/无 [06]=成功/失败/无 [07]=有/无 [08]=有/无 [09]=有/无
运行身份：worktree 路径；Electron target 标题；RESTX_HOME_CONFIG_ROOT
结果：登录 PASS/FAIL；表格编辑 PASS/FAIL；重启预填 PASS/FAIL；图像验收 PASS/FAIL
首个错误：无 / 错误类型与简短摘要
结论：一条基于上述证据的结论
```
