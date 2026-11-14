# 日常运行、部署与物料制作

当前流程：**MySQL 是正式书目唯一维护源；Codex 完成选材、制作、校验、数据库写入及打包，用户最多负责上传压缩包、解压。** 不要求用户编辑 JSON、运行 SQL 或反复执行 importer。现有表支持正文、推荐理由、气泡及声音记录，日常制作不重复建表。

## 新会话新增物料的默认流程

新增物料默认每批至少4本；用户明确指定数量或单本更新时按当次要求。各本独立核验来源、入库、制作、校验并交付单书包。

在本项目目录开启新会话时，先读本地 `AGENTS.md`，沿用本手册。Codex负责：查MySQL避免重复 → 阅读完整来源与逐本许可/署名 → 整理适龄双语正文、逐本推荐理由及明确角色对白 → 制作图片与原标准中英文配音 → 校验并事务写回MySQL → 检查PC/手机的选书与逐页双语阅读 → 按数据库引用交付单书包 → 用户上传解压后核对远程资源 → 更新验收与交接状态。制作各阶段按成功结果写回，不把启动生成或入库成功当成全部资源已完成。

沿用既有原画整理、晓晓/Jenny、生成-20%、播放1倍及响应式阅读器；对白存在MySQL页内，不另建排版清单。已有匹配配音不重生成，旧JSON不是维护源，不恢复批量灌演示数据。用户最多负责上传单书包和解压。详细命令及校验约定见下文；本机 `AGENTS.md` 为忽略文件，同一工作目录的新会话可读取，其他电脑需有对应交接文件或以本手册为依据。

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

书库默认按“最新加入”展示：MySQL `books.created_at` 倒序，同一秒按自增主键倒序，新增书目自动排前；修改旧书不会改变创建顺序。年龄、主题和搜索结果沿用所选排序，可切换“精选推荐”或“书名排序”。首页“今天读什么”展示精选前4本，“还有这些新朋友”按最新加入展示并排除前一组已展示书目。本次排序调整需部署新版后端与 `web/app.js`，无需改表、重新入库或上传绘本物料。

每本书维护一句 `reading_value` 推荐理由，建议8–24字、最多80字，按完整故事提炼亲子共读价值。首页、书库、详情、收藏与历史使用同一数据库字段，卡片标题下展示完整文案。新增和更新已发布物料均不可为空，草稿可暂空；仅补文案保留正文、画面和原配音，不重打素材包。标准见 [content.md](content.md)。

阅读页布局只维护在 `web/assets/reader.css`，不在全站 `styles.css` 追加阅读器补丁。固定结构为工具栏、可滚动图文区、独立播放器和辅助操作。PC大于900px采用图文并排且整体居中、两栏固定间距；手机和平板竖屏对白与旁白按原文顺序放在图上方；600px及以下播放器两行，短横屏为紧凑并排布局。长文字滚动而不推走播放器，同排版翻页保持图片画幅。窄屏通过原生页码选择跳页，不出现进度点横向滚动条。设置、夜间、图片失败/重试、读完和全屏使用同一布局。`index.html` 对主样式、阅读样式、应用脚本及应用内对白模块引用显式版本，相关文件一起部署。

布局修改执行 `npm run check`、`npm run test:flows`、`npm run test:reader` 和 `npm run test:layout`。后者以离线API快照及测试图检查18组尺寸、长短对白、中英文、两种排版、动态缩放、异常与各书目展示页；不能把测试图结果当实际插画验收。安装开发依赖 `npm install`；Mac可用已安装Chrome，其他环境先执行 `npx playwright install chromium`。`PIC_BASE_URL=http://127.0.0.1:8198 npm run test:layout` 改用本机实库与实际图片；若旧书本机副本已清理，可额外设置 `PIC_ASSET_FALLBACK=https://img.xuninfo.top/pic`，测试仅在内存读取已上传原资源，不重配或恢复本机素材。测试前由Codex通过 `snapshot-tests` 刷新快照。可用 `PIC_BROWSER=webkit|firefox` 选择已安装且当前系统支持的引擎，用 `PIC_BROWSER_EXECUTABLE` 指定浏览器。浏览器模拟不替代手机/Safari真机检查。

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

2026-11-14实库回读为**26本、313页**。本批新增《浴缸里的大冒险》《美好的一天》《羽毛朋友》《我能自己来！》各12页，52张图片、96个双语MP3及18页33个气泡均已通过工具写回与校验。4个单书包各37文件，逐文件字节与数据库引用一致；**本批待上传解压，之后由Codex强制remote校验**。沿用工作区最新版PC/手机UI，本机实库与真实本机新素材已完成浏览器检查，范围见 [acceptance.md](acceptance.md)；具体分龄、来源与改编说明见 [materials.md](materials.md)。

```text
web/assets/books/bd-bathtub-safari.tar.gz
web/assets/books/bd-a-beautiful-day.tar.gz
web/assets/books/bd-feathered-friends.tar.gz
web/assets/books/bd-i-can-do-it.tar.gz
```

上传这四包后，在`/root/www/pic/assets/books/`依次执行：

```sh
tar -xzf bd-bathtub-safari.tar.gz
tar -xzf bd-a-beautiful-day.tar.gz
tar -xzf bd-feathered-friends.tar.gz
tar -xzf bd-i-can-do-it.tar.gz
```

此前22本保持原样；2026-11-13批次《交个朋友吧》《坏心情云朵》《最棒的鸟窝》《千足虫找鞋子》已收到上传解压反馈，强制远程148个引用及逐文件SHA-256检查通过；2026-11-12批次也已收到上传解压反馈并通过远程资源检查。素材与来源原图均被Git忽略，未获清理授权不删除。

本批书目更新刷新即可生效，无需重复importer或重启。继续沿用当前最新版UI；本次新增的制图阈值和尺寸配置属于本机制作用途。代码提交、推送与部署继续由用户自行处理。

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
