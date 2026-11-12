# Book Dash 原画双语版 · 2026-11-12

2026-11-12 流程更新：正式正文、画面描述和对白以MySQL为唯一维护源；本目录仅保留来源/英文原文/源图哈希等证据。日常通过 `python3 scripts/materials.py art --book 书ID` 读取数据库并制作指定书，不重建JSON。旧content/books仅留本机备份，下文JSON制作/导入步骤为此前阶段记录，当前步骤以 `docs/operations.md` 为准。

本目录保存八本原画整理版的来源证据，不是运行时书库。正式导入资料及对白的唯一编辑入口在 `content/books/`。2026-11-10 四本已入库；2026-11-12 四本仅在本地准备完成，未上传或入库。

| ID | 中文书名 | 原作 | 故事跨页 |
| --- | --- | --- | --- |
| bd-come-stay-with-me | 来我家住吧 | Come stay with me | 12 |
| bd-best-friends | 好朋友 | Best Friends | 12 |
| bd-little-goat | 小山羊 | Little Goat | 12 |
| bd-fifi-and-teddy | 菲菲和泰迪熊 | Fifi and Teddy | 12 |
| bd-who-ate-my-hat | 谁吃了我的帽子？ | Who ate my hat? | 12 |
| bd-clever-pig | 聪明的小猪 | Clever Pig | 12 |
| bd-brave-bora | 勇敢的博拉 | Brave Bora | 12 |
| bd-play-with-me | 和我一起玩吧 | Play with me | 12 |

每书来源 JSON 保存作者、插画师、设计、编辑、作品 URL、CC BY 4.0 链接与英文页序；前批资料保留历史中文校对快照，2026-11-12 新批仅保存英文原文和无字页标记，不再复制中文、画面描述或对白。这些可编辑内容统一维护于 `content/books/*.json`。英文从官网完整书页人工校对整理，OCR 仅辅助识别；合并排版换行并统一引号、撇号。中文为本项目 AI 辅助翻译，名称采用中文音译；拟声词按中文朗读习惯处理，不称为出版社官方译本。

原作无字跨页补充以下朗读串词，对应 JSON 的 `narration_additions`，不冒充原作逐字正文：

- Come stay with me：第 6 页，两个朋友一起玩耍。
- Fifi and Teddy：第 6 页掀被子找、第 7 页向窗外找、第 12 页拥抱泰迪。
- Who ate my hat?：第 8 页彼此看着、第 10 页一起做新帽子、第 12 页朋友野餐。
- Play with me：第 11 页全家笑着靠在一起。

`sources.json` 保存 104 张制作源图的具体 URL、源图 SHA-256、尺寸和页码映射。官网无字图片目录可以列出，但其 CloudFront 下载抽查返回 403（包含本轮 Clever Pig），因此正式制作使用官网下载的高清预览原图，按 `config/original_art.json` 的逐行区域清理英文排版，保留原插画。封面保留原书名和作者署名；双语正文放在图片外。资料中的署名如实说明这一版式改动，未称为原版整页排版或本项目重绘。

下载原图分批保存在本地 `docs/materials-review/original-sources-20261110/` 和 `docs/materials-review/original-sources-20261112/`，已排除 Git；新克隆需按 `sources.json` 下载并核对哈希后才能重新制作图片，不要求取回或重生成旧 10 本。

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-materials.txt
.venv/bin/python scripts/prepare_original_books.py
.venv/bin/python scripts/generate_audio.py content/books/bd-come-stay-with-me.json
.venv/bin/python scripts/generate_audio.py content/books/bd-come-stay-with-me.json --language en
```

图片制作脚本不上传或连接数据库；相同正文会保留已生成的音频引用，正文改变则清除对应语言的过期音频与声音记录，需重新生成。`--art-only` 只输出图片，不修改书目、正文、气泡或声音记录。默认完整命令仍只处理前批四本；新批使用 `--book` 选择，不从来源快照重建可编辑书目。例如：

```sh
.venv/bin/python scripts/prepare_original_books.py --book bd-clever-pig --art-only --source-dir docs/materials-review/original-sources-20261112
```

图片或正文变更后须更新该书 `content_version`，重新校验和打包；正文改变还需重新生成对应配音。新批资料与对白直接编辑 `content/books/*.json`，不回填另一份中文或排版清单。配音使用现行 `config/audio.json`，不改默认播放器倍速。

2026-11-10 已实际生成 52 张 JPEG、中文与英文各 48 个 MP3，四本事务导入成功，MySQL/API 回读正文、版本、资源路径和 8 条声音记录一致。四个单书包各 37 个素材文件，已逐个比对解包内容与当前 JSON 引用和文件哈希。素材上传及线上访问、手机播放仍待用户完成。操作入口为 `docs/operations.md`。

2026-11-12 新批实际完成 52 张 JPEG、96 个 MP3（约 628.1 秒）、30 页 38 个角色气泡和四个单书包。每包 37 文件；图片全文页序及清理结果已目视核对，音频路径/全文签名/格式和包内文件哈希检查通过，未逐段人工听审。未写运营库或上传资源；旧 14 本、旧物料、声音配置与真实 `.env` 保持原样。
