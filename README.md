# pic · 小小绘本馆

面向 0–6 岁儿童与家长的免费双语绘本 Web MVP：Go API + MySQL + 原生 HTML/CSS/JavaScript，无前端构建依赖。视觉保持浅蓝、奶油白、黄色按钮、圆角卡片与柔和插画。

## 运行

需要 Go 1.25+ 和 MySQL（推荐 8.4）。当前 `.env`、数据库和初始书目已由用户配置，日常直接启动：

```sh
cd /Users/zx/Projects/pic
go run ./cmd/api
```

首页 **http://127.0.0.1:8198/**，健康检查 `/api/health`。运行时只读 MySQL，不回退 JSON。全新环境的建表说明见 [database.md](docs/database.md)，不要覆盖现有 `.env` 或重复初始化运营数据库。

## 物料更新

**生成 → 校验 → 打包上传并解压 → 确认资源可访问 → 导入 → 网页验证**。

完整步骤、每条命令的执行位置与常见错误统一见 [操作手册](docs/operations.md)。服务器素材目录为 `/root/www/pic/assets/books/`，主站配置为：

```dotenv
ASSET_BASE_URL=https://img.xuninfo.top/pic
```

本次全量包使用 `python3 scripts/package_assets.py`；后续单书使用 `python3 scripts/package_assets.py --book 书ID`，压缩包生成在 `web/assets/books/` 下。两种包的解压位置不同，见操作手册。

绘本图片、音频、试听和压缩包已排除出 Git / Docker 部署；主站不需要本地绘本目录。导入器默认本地缺失时通过素材域名校验，可用 `ASSET_CHECK_MODE=remote go run ./cmd/importer --validate-only` 强制检查全部远程资源。离线制作和单书打包仍使用本地文件，完整说明见操作手册。

数据库继续保存 `/assets/…` 相对路径，API 自动添加域名前缀，不用改表。配置修改需重启；绘本入库后刷新网页即可。

当前为 10 本 Book Dash 双语翻译与重绘版、121 页。图片和中英文各 121 页音频已由用户上传素材服务器，本地已上传的绘本文件及已用全量包已清理；书目 JSON 保留。用户反馈已执行 importer，实际数据库状态未独立复核。旧演示数据与试听已清理，不再保留旧清理步骤。

配音参数统一在 [config/audio.json](config/audio.json)：中文晓晓 `zh-CN-XiaoxiaoNeural`、英文 Jenny `en-US-JennyNeural`，均为 `-20%` 生成语速，播放器默认 1 倍。缺音频时仅提供明确标注的设备朗读；现有方案不提供可控情绪风格。新文本或参数会产生新的音频版本目录，成功生成整本后才写回 JSON。

## 功能

- 首页年龄与主题入口、精选/最新/睡前书目、继续上次阅读。
- 分类搜索、组合筛选、排序分页、空结果推荐。
- 详情、来源与署名、逐语言配音状态、本地收藏。
- 逐页双语阅读、滑动/按键翻页、音频播放/暂停/继续、自动翻页与失败重试。
- 夜间/全屏/文字显示、音量/倍速/定时停止、本地阅读进度和历史。
- MySQL 事务导入、资源校验、配置管理、静态资源域名。

无需注册，收藏、进度与设置保存在当前浏览器，不跨设备同步。初期 `REQUIRE_LICENSE_APPROVAL=false`，保留授权字段，不增加审核门槛。

## 配置与分层

自动读取 `.env`，支持 `--config` / `CONFIG_FILE`，环境变量覆盖文件；完整模板为 [.env.example](.env.example)。不要打印或上传实际 `.env`。

后端为 `router → handler → service → repository → model`，命令仅负责配置、组装和生命周期。静态界面在 `web/`；`content/books/` 是离线导入源，不是运行时后备数据。

## 检查

```sh
make test
# 单独检查前端流程；完整 DOM 测试需要先安装 package.json 的开发依赖
npm run check
npm run test:flows
npm run test:reader
```

检查结果和未验证范围见 [acceptance.md](docs/acceptance.md)。当前 schema 外键数量断言与 SQL 不一致，`make test` 尚未全绿；不要为消除测试失败擅自改变用户数据库。

## 文档入口

| 文档 | 内容 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | 后续 Codex 会话的项目约定、物料风格与当前状态 |
| [operations.md](docs/operations.md) | 日常启动、生成、上传、入库、验证及清理 |
| [materials.md](docs/materials.md) | 书目、分龄、共读问题和校对图 |
| [content.md](docs/content.md) | JSON 字段与素材格式 |
| [database.md](docs/database.md) | 表结构、初始化与事务说明 |
| [architecture.md](docs/architecture.md) | 分层、配置与各包职责 |
| [acceptance.md](docs/acceptance.md) | 当前验收状态及待验证项目 |
| [prd.docx](docs/prd.docx) | 原始产品文档 |
