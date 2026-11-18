# 物料制作与交付

在项目根目录运行。MySQL已初始化；日常不运行dbinit、不主动建表或迁移。真实凭据只由现有配置读取，不打印或复制到文档。先查库、检查工作区，保留用户已有变更。

```sh
git status --short
python3 scripts/materials.py list
python3 scripts/materials.py show --book 书ID
go run ./cmd/materials read --book 书ID
```

新增默认至少4本。逐本核实适龄性、完整原文与页序、实际画面、作者插画师及许可；同作品先排重。选择来源和系列见 [选材入口](resource-candidates.md)。新作品使用新ID，不覆盖旧故事；不自行提交、推送或部署。

Codex将内容在内存中生成，通过标准输入传给 `go run ./cmd/materials save`，结构为 `{book, revision}`。新增revision为空；更新使用刚回读的完整快照revision，不强行覆盖。已发布书填写一句基于全文的 `reading_value`；制作未完成时可以 `save --metadata-only` 录入正文与预计路径，该阶段不代表交付完成。

先补齐逐本来源证据和原图，再执行指定书制作。StoryBloom在 `content/sources/storybloom/sources.json` 登记来源和逐页哈希，经 `scripts/storybloom_art.py` 核验后原样保留WebP。书目、图像描述与角色对白只维护MySQL。陌生ID不能靠 `art` 自动获得完整插画。

```sh
python3 scripts/materials.py art --book 书ID
python3 scripts/materials.py audio --book 书ID
ASSET_CHECK_MODE=local python3 scripts/materials.py validate --book 书ID
python3 scripts/materials.py package --book 书ID
python3 scripts/materials.py snapshot-tests
```

配音沿用 `config/audio.json` 中晓晓/Jenny、-20%，每种语言整本成功后事务写回。已匹配全文和参数的音频自动跳过，不因本机副本缺失重配；`prepare`只做配音加打包，不含制图。依赖由Codex核验并准备，不要求用户改JSON或运行importer。

每本独立检查全文、实际图片、双语对白与音频，使用PC和手机阅读流程验收。小程序浏览器适配检查、真实MySQL/本机素材检查、线上资源和微信真机结果分开记录。

单书包为 `web/assets/books/书ID.tar.gz`，包首层为书ID，只含该书封面、正文图片及现有双语音频，不含JSON、来源校对图或系统杂项。核验包内路径、文件数量和字节，音频实际解码。

用户上传到 `/root/www/pic/assets/books/` 后，在该目录逐本执行：

```sh
tar -xzf 书ID.tar.gz
```

不清空旧目录。用户确认上传解压后，由Codex执行：

```sh
ASSET_CHECK_MODE=remote python3 scripts/materials.py validate --book 书ID
```

随后检查公网页面及新书双语资源；上传反馈本身不代表全部验收完成。本批结果和剩余事项写 [验收记录](acceptance.md)。素材更新刷新即可；代码变更由用户自行提交推送、按 `bash deploy.sh` 部署。小程序客户端变更需用户重新编译预览或发布，与后端、素材分开处理。


## 小程序读完鼓励与底栏

读完鼓励是小程序阅读器默认行为，适用于全部现有书与新书，没有逐书启用清单，不依赖API的功能字段。角色和插画从MySQL已有对白读取，缺少有效角色或头像加载失败时显示可互动的“故事小伙伴”。全部页面读过后，末页配音自然结束或静读4秒弹出；面板渲染后执行原有读完记录。

底栏由 `miniprogram/custom-tab-bar/` 维护：图标加16px标签，浅蓝圆角选中态，适配底部安全区；首页、书库、书架同步当前路由，并为栏位预留底部空间。本次动效与底栏只需更新小程序客户端并重新编译/发布，不改库、不重制素材，也无需为这两项更新后端。跨设备已读同步仍需要后端支持既有 `GET /api/me/completed-books` 接口。
