# 内容规范

2026-11-12 起正式内容只在 MySQL 维护。以下字段是本地制作工具与数据库之间的数据结构，不要求用户维护文件。Codex 整理、校验并直接写库；用户最多上传压缩包、解压。`content/books/` 仅为忽略的历史本地备份，不作为日常数据来源。现行流程见 [operations.md](operations.md)。

## 核心字段

| 字段 | 类型 / 说明 |
| --- | --- |
| id | 稳定唯一字符串，不允许空格、点或路径分隔符 |
| title_zh / title_original | 中文名 / 英文名 |
| author / illustrator | 作者 / 插画师 |
| description_zh | 中文简介 |
| age_ranges | `0-2`、`3-4`、`5-6` 的非空数组 |
| categories | `animals`、`habits`、`emotions`、`bedtime`、`nature`、`cognition` |
| languages | `zh` / `en`，每种语言需有逐页文本 |
| cover | 本地 `/assets/…` 路径 |
| page_count | 与 pages 长度一致 |
| reading_minutes | 预计阅读分钟数 |
| featured_order | 大于 0 时参与精选，数值越小越靠前；0 非精选 |
| published_at | 含时区的 ISO 8601 时间 |
| publish_status | `published` / `draft` / `offline` |
| content_version | 内容版本，修改资源时同步更新文件名或版本 |
| is_demo | 是否为演示内容 |

## 授权字段

`license` 保留 `type`、`source_url`、`license_url`、`attribution`、`review_status`、`commercial_use`、`self_hosting`、`translation_allowed`、`audio_derivative_allowed`。

初期未核实内容使用 `review_status: pending` 和权限 `false`；这不会阻止 `published` 展示。可选严格审核只在显式开启时生效。

## 页数据

每页记录 `page_number`（从 1 开始连续递增）、`image`、`image_alt`、`text_zh`、`text_original`，可选 `audio_zh`、`audio_original`、`dialogue`。所有引用资源必须存在且非空。普通正文显示在图下；对白可使用独立气泡文字层，不更改原图片或配音，不把旁白改写成角色说话。

### 可选对白字段

对白与正文统一维护在 MySQL 的对应页，由本机制作工具整本事务写入 `book_pages.dialogue_layout`；运行时 API 返回 `pages[].dialogue`，不另取静态排版配置。不填写或设为 `null` 就是普通正文；从制作数据中清除后保存，会把库中旧布局清空为 SQL NULL。

| 字段 | 约定 |
| --- | --- |
| `aspect_ratio` | 原图宽高比，如 SVG `[3,2]`、原画跨页 `[2,1]` |
| `length.zh/en` | 对应正文的 JavaScript UTF-16 长度 |
| `text_sha256.zh/en` | 对应完整正文 UTF-8 字节的 SHA-256 小写十六进制值 |
| `parts` | 1–8 个按原文顺序排列的气泡 |
| `parts[].start/end.zh/en` | 对应语言原文的 UTF-16 范围，左闭右开，不复制台词；不可重叠或切开代理对 |
| `parts[].speaker.zh/en` | 有原文或画面依据的角色名；无法确定说话者则保留普通文字 |
| `parts[].x/y/width` | 画面百分比坐标及气泡宽度；不能越界 |
| `parts[].target` | 角色指向点 `[x,y]`，百分比；角色在画外时为 `null` |

气泡之间及前后的原文仍作为旁白显示，全文保留给辅助阅读与原音频。PC角色对白模式将卡片放在插画旁的文字栏；手机竖屏卡片放在图上方，短横屏采用图文并排，中等屏幕仍按坐标排版、拥挤时转为卡片。坐标与指向需结合实际画面校对。修改正文后更新范围、长度和哈希，否则导入失败。修改插画后也要重新核对位置；这不能靠哈希自动判断。单纯调整气泡位置不更改图片、音频、物料版本或压缩包。

正式 10 本新书的逐页分镜在 `config/illustrations.json`，使用 `python3 scripts/illustrate_books.py` 离线绘制，每页采用对应情节的独立 SVG；不能只换文件名或图片描述来伪装不同页面。生成器核对页数、页码与中文正文后才写文件，更新 `image_alt` 和包含画面摘要的 `content_version`，保留所有音频与运营字段。变更正文时需同步调整分镜及绘制逻辑。新书校对图、来源与分龄说明见 [materials.md](materials.md)。旧演示书和试听已清理，不再保留旧清理步骤。

音频按每页独立存储，MP3 推荐。可用 `voices.zh`、`voices.en` 记录 `provider`、`voice_id`、`generated_at`、`review_status`；配置某语言声音时，该语言每页都需有音频。

中文配音采用 `config/audio.json` 中的晓晓神经女声、`-20%` 生成语速，阅读器 1 倍即此标准。`scripts/generate_audio.py` 支持单个 JSON 或整个书目目录。生成音频保存到 `audio/语言/内容指纹/page-001.mp3`，内容指纹由音色、语速和逐页文本计算；更换配音参数或文本后生成新目录，避免旧文件或浏览器缓存仍播放原配音。生成后先校验，运行 `scripts/package_assets.py --book 书ID` 打包上传并解压，确认素材域名可访问，再运行 importer 入库；完整命令见 [operations.md](operations.md)。

## 本地目录示例

```text
web/assets/books/bd-come-back-cat/
  cover.svg
  page-001.svg
  page-002.svg
  audio/zh/<内容指纹>/page-001.mp3
  audio/en/<内容指纹>/page-001.mp3
```

新书可以使用 WebP、AVIF、PNG 或 JPEG。浏览器只在当前页显示一个图像，预取下一页；音频只加载当前页。静态文件支持 HTTP Range（用于音频定位）与缓存。当前素材域名为 `https://img.xuninfo.top/pic`，数据库仍保存 `/assets/…` 相对路径，API 在响应时添加域名前缀。Go 导入器默认优先校验本地，缺失时通过 ASSET_BASE_URL 校验远程素材；已上传的本地素材可以清理，不随 Git 或主站部署。离线制作和打包仍需对应本地文件；素材上传后再入库，数据库更新立即生效。


## MySQL 入库

JSON 是版本化资料源，运行时接口读取 MySQL。`cmd/importer` 将资料映射到绘本、授权、逐页内容、语音与分类关系表；表结构见 [database.md](database.md)。当前数据库已经初始化，日常不重新建表。
