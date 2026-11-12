# Book Dash 原画双语版 · 2026-11-10

本目录是四本正式新书的来源与逐页校对资料，不是运行时书库。正式导入资料在 `content/books/`；本次只按四个新业务 ID 导入，不改旧书正文或配音。

| ID | 中文书名 | 原作 | 故事跨页 |
| --- | --- | --- | --- |
| bd-come-stay-with-me | 来我家住吧 | Come stay with me | 12 |
| bd-best-friends | 好朋友 | Best Friends | 12 |
| bd-little-goat | 小山羊 | Little Goat | 12 |
| bd-fifi-and-teddy | 菲菲和泰迪熊 | Fifi and Teddy | 12 |

每书 JSON 保存原作者、原插画师、设计、编辑、具体作品 URL、CC BY 4.0 链接、中英文逐页正文和实际画面描述。英文从官网完整书页人工校对整理，OCR 仅辅助识别；合并排版换行并统一引号、撇号。中文为本项目 AI 辅助翻译，名称采用中文音译；拟声词按中文朗读习惯处理，不称为出版社官方译本。

原作无字跨页补充以下朗读串词，对应 JSON 的 `narration_additions`，不冒充原作逐字正文：

- Come stay with me：第 6 页，两个朋友一起玩耍。
- Fifi and Teddy：第 6 页掀被子找、第 7 页向窗外找、第 12 页拥抱泰迪。

`sources.json` 保存 52 张官网下载原图的具体 URL、源图 SHA-256、尺寸和页码映射。官网无字图片目录可以列出，但其 CloudFront 下载返回 403，因此正式制作使用官网下载的高清预览原图，按 `config/original_art.json` 的逐行区域清理英文排版，保留原插画。封面保留原书名和作者署名；双语正文放在图片外。资料中的署名如实说明这一版式改动，未称为原版整页排版或本项目重绘。

下载原图在本地 `docs/materials-review/original-sources-20261110/`，已排除 Git；新克隆需按 `sources.json` 下载并核对哈希后才能重新制作图片，不要求取回或重生成旧 10 本。

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-materials.txt
.venv/bin/python scripts/prepare_original_books.py
.venv/bin/python scripts/generate_audio.py content/books/bd-come-stay-with-me.json
.venv/bin/python scripts/generate_audio.py content/books/bd-come-stay-with-me.json --language en
```

图片制作脚本不上传或连接数据库；相同正文会保留已生成的音频引用，正文改变则清除对应语言的过期音频与声音记录，需重新生成。`--art-only` 只输出图片，适合校对过程，不用于最终交付；最终仍需运行完整准备命令更新内容版本并重新校验、打包及导入。配音使用现行 `config/audio.json`，不改默认播放器倍速。

2026-11-10 已实际生成 52 张 JPEG、中文与英文各 48 个 MP3，四本事务导入成功，MySQL/API 回读正文、版本、资源路径和 8 条声音记录一致。四个单书包各 37 个素材文件，已逐个比对解包内容与当前 JSON 引用和文件哈希。素材上传及线上访问、手机播放仍待用户完成。操作入口为 `docs/operations.md`。
