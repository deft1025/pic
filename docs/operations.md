# 日常运行、部署与物料制作

当前流程：**MySQL 是正式书目唯一维护源；Codex 完成选材、制作、校验、数据库写入及打包，用户最多负责上传压缩包、解压。** 不要求用户编辑 JSON、运行 SQL 或反复执行 importer。现有表已支持正文、气泡及声音记录，本次不改表。

## 日常运行和实际部署

本地项目目录为 `/Users/zx/Projects/pic`，默认首页 `http://127.0.0.1:8198/`：

```sh
go run ./cmd/api
```

服务器使用根目录 `deploy.sh`：`git pull` → `go build -o pic-server ./cmd/api/` → 重启 systemd `pic` 服务。服务器在项目目录执行：

```sh
bash deploy.sh
```

本次已移除不使用的 `.dockerignore`、`Dockerfile`、`docker-compose.yml`；不需要 Docker。Codex 不代替用户提交、推送或部署。本地的取消跟踪/文件删除等变更须由用户提交推送后，服务器拉取才会生效。

主站运行只查询 MySQL，需要程序、`web/` 中的界面资源与实际运行配置，**不需要 `content/books/`**。该目录已加入 `.gitignore`，已跟踪的旧 JSON 取消跟踪但保留本地备份；不再作为日常编辑、配音或打包来源。Git 中的 `tests/fixtures/library.json` 是自动生成的离线测试快照，不参与运行、制作或导入，禁止人工编辑。

配置统一从 `.env` / `CONFIG_FILE` / `--config` 加载，环境变量优先；真实凭据不打印、不提交。配置或程序更新需重启，数据库内容更新刷新网页即可，不必重启。当前数据库已初始化，不重复建表或清库。

## 素材服务器

| 项目 | 值 |
| --- | --- |
| 素材域名 | `https://img.xuninfo.top` |
| 域名根目录 | `/root/www` |
| 绘本素材目录 | `/root/www/pic/assets/books/` |
| 主站素材配置 | `ASSET_BASE_URL=https://img.xuninfo.top/pic` |
| 本机生成位置 | `web/assets/books/书ID/` |
| 单书交付包 | `web/assets/books/书ID.tar.gz` |

数据库保存 `/assets/…` 相对路径，API 在返回时添加素材域名前缀。图片、MP3、试听及压缩包不进入 Git；主站首页 `hero.svg`、通用对白模块、JS/CSS 仍随代码部署。不要清空服务器旧书目录。

单书包第一层是书 ID，不含 JSON、其他书、原始来源、校对图或系统文件。用户将包上传后，在服务器素材目录解压：

```sh
cd /root/www/pic/assets/books
tar -xzf 书ID.tar.gz
```

用户反馈解压后，由 Codex 校验远程图片与中英文音频；数据已由制作工具写回时，不再要求用户重复 importer。

## Codex 的查库制作入口

以下命令供 Codex 制作时使用，不是增加用户的手工步骤。统一在本地项目根目录运行，数据库配置沿用项目 `.env`，也可用 `--db-config 路径` 指定。缺少 edge-tts 等依赖时，由 Codex 在本机准备项目虚拟环境，不在服务器生成配音。

```sh
python3 scripts/materials.py show --book 书ID
python3 scripts/materials.py validate --book 书ID
python3 scripts/materials.py audio --book 书ID
python3 scripts/materials.py package --book 书ID
```

- `show` / `list`：直接读 MySQL，保留数据库相对路径、运营状态和来源字段，不从公开 API 拼接的远程地址或旧 JSON 回填。
- `audio`：默认中英文顺序处理，继续晓晓 / Jenny、生成 -20%。每种语言整本成功后事务写回 MP3 路径、声音记录和内容版本。相同全文、音色、语速已在库中记录时跳过，即使已上传的本地副本被清理也不会自动重配；明确要求重配才使用 `--force`。`--language zh|en` 可选单语言，`--preview` 仅试听、不写库。
- `package`：按数据库引用打包本机现存素材，保持单书包结构；缺文件会失败且保留原包，不偷偷重生成旧资源。旧书本地副本已清理时，如需重打包应先取回相应资源。
- `prepare`：顺序执行配音与打包；图片需事先准备完成，避免误用模板或批量重绘旧书。
- `art`：仅明确指定的一本书，原画按来源记录选择批次并处理图片，SVG 书使用已实现分镜；完成后写回路径和图片版本。保留数据库正文、对白、音频与运营字段，不默认重绘全库。`--source-dir` 可指定原画源目录。

现有脚本也提供查库入口：

```sh
python3 scripts/generate_audio.py --book 书ID --language zh
python3 scripts/generate_audio.py --book 书ID --language en
python3 scripts/package_assets.py --book 书ID
python3 scripts/prepare_original_books.py --book 书ID
python3 scripts/illustrate_books.py --book 书ID
```

技术性的音色配置、分镜、来源哈希和清理区域继续由 Codex 管理；用户不手工维护它们。制作中的序列化数据仅在内存或自动删除的临时目录内使用，不再保存第二份可编辑书目。

## 新内容录入和一致性

Codex 阅读完整来源、整理双语正文和明确角色对白后，用本机 `cmd/materials` 工具直接录入 MySQL。`read --book ID` 返回完整书目与快照版本，`save` 从标准输入接收工具生成的数据，**不需要用户创建或编辑 JSON 文件**。新建使用空快照版本，已有书必须带上读取时的版本，防止误覆盖；来源与许可署名仍须逐本保留。`save --metadata-only` 仅用于制作前录入完整正文和预计资源路径，不代表资源已生成或可访问。

保存沿用已有校验与事务，不增加授权审批门槛。正文变化时清理对应语言旧音频引用及声音记录，失效的对白范围回退普通文本；生成失败不提交该阶段结果。写回前在事务内锁定书目并比对完整快照，若制作期间有其他改动则拒绝覆盖，重新查库后重试。不同书继续使用不同业务 ID。

默认保存和 `validate` 使用既有素材检查器：`ASSET_CHECK_MODE=auto` 优先本地，缺失时检查素材域名；`remote` 全部检查远程；`local` 仅本地。非空、资源类型、HEAD/必要时单字节 Range 和并发限制沿用现有实现。生成/打包只处理指定书本机素材，不以旧 JSON 为后备。

旧 `cmd/importer`、显式文件模式和 `--source legacy-json` 仅保留历史迁移/修复兼容；**以后不作为日常流程运行，避免用旧备份覆盖数据库新内容**。需要数据恢复时由 Codex核对目标及差异后处理。

## 已有物料状态

2026-11-12 已只读核对实际 MySQL 的 **18 本、217 页**，包括新四本《谁吃了我的帽子？》《聪明的小猪》《勇敢的博拉》《和我一起玩吧》的正文、气泡和相对资源路径。用户已反馈四包上传解压；此次没有重新导入或改写这些内容；已强制远程模式检查新四本全部148个引用图片/MP3，非空、类型和可访问性均通过，真机播放仍待验证。旧十本插画师展示字段与本地历史 JSON 有差异，保留数据库现值；声音时间的毫秒舍入和对白 target 的 null/省略属序列化差别，不据此覆盖。

四个现有包各 37 文件（封面 1、正文图片 12、中英文 MP3 各 12）：

```text
web/assets/books/bd-who-ate-my-hat.tar.gz
web/assets/books/bd-clever-pig.tar.gz
web/assets/books/bd-brave-bora.tar.gz
web/assets/books/bd-play-with-me.tar.gz
```

本地源预览在 `docs/materials-review/original-sources-20261112/`，建议保留供重制；`responsive-20261112/` 是布局截图和报告，可在检查完成后清理。两者均被 Git 忽略、不打包、不部署。已上传资源的本机副本不影响网站运行，但未明确要求前不自动清理仍在制作/交付的资源。

## Google 验证与 sitemap

Google 验证文件保留在 `web/google92a938ffcd897911.html`，部署后从主站根路径 `/google92a938ffcd897911.html` 访问，不带 `/web/`，不放素材域名。Go 仅开放符合规则且确实存在的验证 HTML。若 Nginx 单独处理 HTML，确保该地址能访问对应文件。

主站 `GET /sitemap.xml` 实时查询 MySQL 全部可见已发布书目，不需要生成、上传 XML。包含公共页面与绘本详情，不包含个人书架或阅读器参数变体；上/下架后下次请求生效，数据库失败返回 503。反向代理 HTTPS 部署应在主站配置填写真实公开 origin：

```dotenv
SITE_BASE_URL=https://你的主站域名
```

它与 `ASSET_BASE_URL` 独立，不加路径。修改后重启；确保 Nginx 把 `/sitemap.xml` 请求转发给 Go，公网确认 XML 后由用户在 Search Console 提交。

## 检查与备份

Codex 执行 Go/Python/JS 及阅读器检查；全页回归快照可自动刷新：

```sh
python3 scripts/materials.py snapshot-tests
make test
npm run test:reader
```

该快照只读数据库、用于离线测试，不替代 MySQL 备份，不作为运营导入来源。生产数据维护以数据库为准；当前已知 schema 外键数量测试失败按用户要求忽略，不为通过断言修改表结构。实际检查边界见 `docs/acceptance.md`。
