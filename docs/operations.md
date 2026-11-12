# 日常运行与物料更新

本文是当前项目的操作入口。所有“本地”命令均在 `/Users/zx/Projects/pic` 执行；“服务器”命令在资源服务器执行。当前数据库已建好，旧演示数据已由用户清理，不需要重复建表或清理。

## 当前配置与目录

| 项目 | 当前值 |
| --- | --- |
| 本地项目 | `/Users/zx/Projects/pic` |
| 本地新物料 | 制作时生成到 `web/assets/books/`，当前已上传副本已清理 |
| 素材域名 | `https://img.xuninfo.top` |
| 素材域名根目录 | `/root/www`（已由用户截图确认） |
| 绘本素材目录 | `/root/www/pic/assets/books/` |
| 主站 `.env` | `ASSET_BASE_URL=https://img.xuninfo.top/pic` |
| 本地首页 | `http://127.0.0.1:8198/` |
| 默认导入资料 | `content/books/`，14 本、169 页 |

数据库和 JSON 继续存 `/assets/books/…` 相对路径，API 返回时添加素材域名前缀。不要将域名写回数据库，也不要在 `ASSET_BASE_URL` 末尾重复添加 `/assets`。主站的首页装饰图、JS、CSS 继续由主站提供。

本地 `.env` 已配置上述素材地址；主站若另行部署到服务器，需在实际运行进程读取的 `.env` 中配置同样的值。配置更改或程序更新需要重启，普通绘本内容入库无需重启。

## 代码部署与素材分离

主站代码不携带绘本图片或音频。`web/assets/books/`、试听音频和 `.tar.gz` 已加入 `.gitignore` / `.dockerignore`；Dockerfile 复制页面（包括 Google 验证 HTML）、JS、CSS、favicon、首页 hero.svg、通用对白脚本和导入 JSON，不复制绘本物料，也不挂载本地素材目录。

部署时保留 `ASSET_BASE_URL=https://img.xuninfo.top/pic`。`content/books/*.json`、分镜、来源快照与生成脚本继续版本管理；读者播放直接访问独立素材域名，API 启动不读本地绘本文件。

导入器新增配置（默认值如下）：

```dotenv
ASSET_CHECK_MODE=auto
ASSET_CHECK_TIMEOUT=10s
ASSET_CHECK_CONCURRENCY=6
```

- `auto`：优先检查本地文件，缺失时检查 `ASSET_BASE_URL` 对应地址；适合本地只保留正在制作的新书。
- `remote`：全部检查素材域名，用于上传后的验收；本地有副本也不会跳过远程检查。
- `local`：只检查本地文件，用于离线制作。打包脚本始终要求本书素材在本地。

远程检查去重并限制并发，优先 HEAD；服务器不支持 HEAD 或无法确定大小时，以 Range 请求读取一个字节。必须为非空的图片/音频响应，404、HTML 错误页、空文件或超时均报错，失败时不连接数据库或写入数据。

**已上传并确认完整的本地 `web/assets/books/` 副本可以清理**，不会影响运行或以后通过 Go importer 导入。保留 `content/books/` JSON；不要删除仍由主站提供的 `web/assets/hero.svg`。生成或重新打包某本书时仍需这本书的本地文件，必要时从素材服务器取回；后续新物料只在本地制作、打包后单独上传，不随代码发布。

`.gitignore` 只影响未跟踪文件；如果在其他 Git 仓库里已经跟踪过这些素材，需在那里移除索引（保留磁盘文件）：

```sh
git rm -r --cached --ignore-unmatch web/assets/books web/assets/audio-previews
```

当前工作目录已存在 Git 仓库，素材与本地校对图继续忽略，不由 Codex 提交或推送。Docker 镜像不包含绘本文件，Compose 也不再依赖主机上的素材目录。

## Google HTML 所有权验证

将 Google 下载的验证文件原样放在项目 `web/` 下，例如 `web/google92a938ffcd897911.html`。访问地址为 `https://主站域名/google92a938ffcd897911.html`，URL 不包含 `/web/`，也不放到素材域名。文件名与内容保持 Google 提供的原样。

Go 静态路由已支持根路径 `google字母数字.html`，不存在的文件返回 404；其他任意 HTML 不随之开放。Dockerfile 会复制 `web/*.html`。本次新增了 Go 路由，因此需部署并重启新版程序；Docker 部署需重新构建镜像。在浏览器确认上述公网地址直接显示验证文字后，再回 Google 点击验证。验证成功后保留文件。若 Nginx 将所有请求转发给 Go，无需额外配置；若 Nginx 独立处理 `.html`，需让该验证地址转发到 Go 或由其站点根目录提供同一文件。

## 角色对白：与书目统一维护（2026-11-11）

唯一编辑入口是 `content/books/书ID.json`。页面的可选 `dialogue` 保存角色、原文范围和气泡位置，随正文一起由 importer 写入 `book_pages.dialogue_layout`，API 直接返回。无需额外维护 `web/assets/reader-layouts/`、独立排版 JSON 或前端书目清单。新增绘本无对白时不填该字段；需要对白时在同一本资料内一起整理，步骤见 [content.md](content.md)。

现有 14 本、169 页中，为 12 本的 72 页整理了 95 个气泡。明确角色说话才设置气泡，旁白和说话者不明确的内容保留普通文字。桌面优先按插画留白定位，文字过长、重叠或盖住角色指向点时改用图上方卡片；700px 及以下统一采用错开的卡片，保持完整画面。普通阅读链接默认使用对白，顶部可切“图下文字”，选择保存在当前浏览器。`/read/bd-best-friends?layout=dialogue&page=2` 可用于定位示例页。

**2026-11-12 状态：用户反馈已在服务器执行完整增量 SQL；未独立回读确认，尚未收到对白导入或新版部署完成反馈。该服务器库不需重复执行迁移，继续后续步骤：**

1. 在数据库客户端选中现有绘本库，执行 [migrations/20261111_dialogue_layout.sql](migrations/20261111_dialogue_layout.sql)。它仅新增一个可空 JSON 字段，可重复执行，不重建表。
2. 更新并重启主站后端，部署 `web/app.js`、`web/styles.css` 与 `web/assets/reader-dialogue.js`（Docker 部署需重建镜像）。未升级字段时，新后端仍能从 MySQL 正常读取原图下文字。
3. 在项目目录先校验，再导入，刷新阅读页查看：

```sh
go run ./cmd/importer --validate-only
go run ./cmd/importer
```

旧 10 本的本地物料已清理，默认 `auto` 校验会访问现有素材域名；请保持网络可用。导入包含对白的资料而数据库尚未升级时，会在事务写入前报错，提示上述迁移文件。入库后刷新生效，无需再次重启。修改正文后必须重新校对范围和正文哈希；导入器拒绝失效布局，运行时遇到失效数据则显示普通正文。

本次只调整文字排版与存储，图片、MP3、音色、语速、素材包和 `.env` 不变，无需重新生成、打包或上传绘本。此前四本新书原有包的上传事项独立按下一节处理。

## 本次四本新书上传（2026-11-10）

四本已经事务入库，实际 MySQL/API 回读通过，无需重复导入。用户本轮明确要求先入库、再自行上传物料；新书图片与播放需等上传解压后才能在线使用。以下四包均位于本地 `web/assets/books/`，每包含该书封面、12 页 JPEG、中文和英文各 12 个 MP3，共 37 个文件：

| 本地压缩包 | 书名 | 大小 |
| --- | --- | --- |
| `bd-come-stay-with-me.tar.gz` | 来我家住吧 | 3.4 MiB |
| `bd-best-friends.tar.gz` | 好朋友 | 3.7 MiB |
| `bd-little-goat.tar.gz` | 小山羊 | 2.2 MiB |
| `bd-fifi-and-teddy.tar.gz` | 菲菲和泰迪熊 | 2.4 MiB |

将四个压缩包上传到资源服务器 `/root/www/pic/assets/books/`，在该目录执行：

```sh
cd /root/www/pic/assets/books
tar -xzf bd-come-stay-with-me.tar.gz
tar -xzf bd-best-friends.tar.gz
tar -xzf bd-little-goat.tar.gz
tar -xzf bd-fifi-and-teddy.tar.gz
```

直接解压即可，不需清空旧目录。包内第一层为各自书 ID，沿用既有目录层级。上传后检查例如 `https://img.xuninfo.top/pic/assets/books/bd-best-friends/cover.jpg`，刷新书库即可，无需重启。中英文播放、暂停/继续、自动翻页及手机显示仍需上传后验收。素材包与旧书本地物料无关，不要为了这次上传重新生成整个书库。

本次检查包括 148 个打包文件与 JSON 引用/文件哈希一致、96 个 MP3 非空且能解析、音色与全文生成指纹匹配；音频合计约 656 秒。声音仍为晓晓/Jenny、生成 `-20%`、播放默认 1 倍。尚未逐段人工听审；不等于真机播放已验收。

## 平时启动

```sh
cd /Users/zx/Projects/pic
go run ./cmd/api
```

日常启动不运行 dbinit、不重新导入。程序自动读取 `.env`；连接到哪一个数据库由该文件及覆盖它的环境变量决定。

## 新增或修改物料的完整流程

顺序固定为：**本地生成 → 校验 → 打包 → 上传并解压 → 检查资源访问 → 导入 MySQL → 网页验证**。

### 1. 本地生成

配音参数在 `config/audio.json`，中文晓晓、英文 Jenny，均以 `-20%` 语速生成，播放器默认 1 倍。每次只执行实际需要更新的语言：

```sh
# 示例：只更新指定书的英文；新增书替换为对应 JSON 路径
/tmp/pic-audio-venv/bin/python scripts/generate_audio.py content/books/bd-come-back-cat.json --language en
```

中文生成使用同一命令去掉 `--language en`。只生成需要更新的书，避免清理旧音频后用整个目录批量命令重新生成全部书。重绘插画使用 `python3 scripts/illustrate_books.py`。没有对应内容变更时不必执行。这些命令只更新本地文件，不上传、不入库。

`/tmp/pic-audio-venv` 是临时环境，若已不存在，在项目根目录创建虚拟环境后使用 `.venv/bin/python` 替代：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install edge-tts
```

生成器按音色、语速和正文生成不同版本目录；相同输入可复用已完成文件，每本全部成功后才回写 JSON。批量跳过 `offline` 书目。失败时修复网络再重试，不要把设备朗读当作正式音频完成。

### 2. 本地校验

```sh
cd /Users/zx/Projects/pic
go run ./cmd/importer --validate-only
```

当前全目录校验应显示 **14 本绘本，169 页**。本次实际只用四本新书构成的临时批次校验及事务导入，显示 **4 本绘本，48 页**，避免覆盖旧书运营资料。校验失败先解决，不继续上传和入库。

### 3. 打包并上传解压

服务器上传工具不能上传目录，现行方式为：**本次上传完整素材包，以后按书目上传对应压缩包**。使用 `scripts/package_assets.py`，只收集书目实际引用的图片与音频；全量包额外包含首页装饰图。自动排除 `.DS_Store`、`._*`、缓存、JSON 和其他压缩包，不递归复制 macOS 元数据。

此前全量包已由用户上传并解压，本地绘本副本和已用压缩包已清理。日常更新按下面的单书流程执行；不要为了打包重新生成所有旧书。若需要全量恢复包，先从素材服务器取回对应素材，再运行 `python3 scripts/package_assets.py`；该全量包从 `assets/` 开始，在 `/root/www/pic` 解压。

#### 后续：每本新增或更新的书单独打包

本地生成、校验完成后，按实际书 ID 执行；以下用现有书举例：

```sh
python3 scripts/package_assets.py --book bd-come-back-cat
```

生成文件放在本地 **`web/assets/books/` 下面**，与对应书目文件夹同级：

```text
/Users/zx/Projects/pic/web/assets/books/bd-come-back-cat.tar.gz
```

该包内从 **`bd-come-back-cat/`** 开始，含本书当前引用的图片及中英文音频。只上传该压缩包到服务器 **`/root/www/pic/assets/books`**，在那里执行：

```sh
cd /root/www/pic/assets/books
tar -xzf bd-come-back-cat.tar.gz
```

新增书用它自己的 ID 生成与解压。不会重复上传其他书，也不需要重建整个 assets 目录。更新现有书的同路径文件会覆盖，旧版音频目录不会自动删除。全量包与单书包不会把其他 `.tar.gz` 再套进包里。

| 包类型 | 包内第一层 | 服务器解压位置 |
| --- | --- | --- |
| `pic-book-assets.tar.gz` | `assets/` | `/root/www/pic` |
| `书ID.tar.gz` | `书ID/` | `/root/www/pic/assets/books` |

### 4. 检查素材域名

上传解压后，先在本地强制检查当前资料的全部远程资源，不连接数据库：

```sh
ASSET_CHECK_MODE=remote go run ./cmd/importer --validate-only
```

该命令不要求本地绘本素材。检查通过后再入库；也可以用下面链接做人工试听。


封面验证地址：

```text
https://img.xuninfo.top/pic/assets/books/bd-come-back-cat/cover.svg
```

英文音频路径含内容指纹，不要照抄旧版本。可在本地输出本次第一本书的真实试听地址，再复制到浏览器：

```sh
python3 - <<'PY'
import json
from pathlib import Path
book = json.loads(Path('content/books/bd-come-back-cat.json').read_text())
print('https://img.xuninfo.top/pic' + book['pages'][0]['audio_original'])
PY
```

图片应显示、英文应能播放。Nginx 应返回正确的 `image/svg+xml` / `audio/mpeg`，音频 Range 请求应返回 206。404 时检查目录层级，403 时检查读取权限或防盗链设置。已有中文资源站已验证可访问，无需为每次新增音频重新配置站点。

### 5. 在本地更新 MySQL

资源可访问后，回到本地项目目录执行：

```sh
cd /Users/zx/Projects/pic
go run ./cmd/importer
```

读取本地更新后的 JSON，按 ASSET_CHECK_MODE 校验本地或远程素材，连接本地 `.env` 对应的 MySQL；目标应为主站实际使用的数据库。导入在事务内按业务 ID 更新书目、逐页路径和 `book_voices`，不会删除未在批次中的其他书。生成音频、上传文件、写入数据库是三个独立步骤，不能省掉最后的导入。

### 6. 网页验证

无需重启，刷新网页并打开《小猫，回来呀！》：

- 详情应显示英文已配逐页音频。
- `/api/books/bd-come-back-cat/pages` 中 `audio_original` 应为 `https://img.xuninfo.top/pic/assets/books/…`。
- 切到 English，使用 1 倍播放，验证暂停、继续、播完自动翻页及切回中文停止旧音频。
- 浏览器 Network 中图片和 MP3 应请求 `img.xuninfo.top/pic/…`。若仍显示设备朗读，检查是否尚未导入、导入了另一数据库，或当前页缺少 `audio_original`。

## 文件清理

- 上传、解压和播放验证完成后，可以删除本地及服务器上的已使用压缩包。原本为目录上传准备的 `upload-english/` 副本不再需要，已清理。
- 制作机保留 JSON、来源快照、分镜和生成脚本。已上传并通过远程校验的本地绘本素材可清理，尚未上传的新物料保留到上传完成；以后导入缺失的本地素材会通过域名校验。
- 不直接删除旧版本音频：只有确认数据库和当前 JSON 均不再引用时才清理，避免生成新版本但尚未导入时中断线上播放。
- 主站运行目录无需部署绘本素材；首页装饰图和前端文件仍需部署。Dockerfile 与构建忽略规则已排除绘本素材，Compose 不挂载本地素材。
- 同服务器独立静态域名仍共用整机磁盘和内存；配音生成在本机完成，服务器只提供文件访问。

## 本轮状态（2026-11-06）

- 书库为 10 本、121 页；原 131 张绘本 SVG 和中英文各 121 个 MP3 已由用户上传。本地已上传素材和用完压缩包已清理，JSON、制作脚本和主站界面资源保留。
- 已知中文资源上传完成；封面 HTTP 200、中文音频 Range HTTP 206 已抽样验证。
- 本次已实测封面、中文第一页、英文第一页均 HTTP 200，类型正确；数据库音频更新和真实浏览器播放尚待用户完成或反馈，抽查不能代表全量验收。

- 当前本地已清理 374 个绘本/已用压缩包文件、约 23.5 MiB，未删除服务器文件。后续新物料在本地制作后按书目打包；旧书无需自动取回或重生成。用户反馈执行过 importer，未独立核验实库。
