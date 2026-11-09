# 适龄绘本更新 · 2026-11-06

本批在本地准备了 10 本 Book Dash 开放许可绘本的双语翻译与重绘版，共 121 个故事画面、10 张封面。保留完整原作的故事跨页，不计封面、版权页，不通过拆句凑页数。按用户后续要求，旧 10 本演示书的 JSON、图片、音频和两份试听已从正式目录删除。用户随后反馈已完成新书导入和旧数据清理；当前执行环境仍不能直连 MySQL，未独立复核实库。

## 分龄与共读

年龄是选材建议，不表示儿童必须能独立识字。0–2 岁建议从指图、模仿动作开始，3–4 岁练习复述与预测，5–6 岁增加因果、观点和现实知识的讨论。长篇人物故事适合成人陪读。中英文对照逐页对应。

下表校对图仅在本地 `docs/materials-review/` 保存，已排除 Git；新克隆的项目不包含这些图片，对应链接仅在本地有图片时可用。校对图不参与网站运行，也无需上传素材服务器。

| 绘本 | 年龄 | 页数 | 阅读重点与共读问题 | 全页配图 |
| --- | --- | --- | --- | --- |
| 小猫，回来呀！ / Come back, cat! | 0–2、3–4 | 12 | 重复句、位置和日常：小猫去了哪里？下一页会出现什么？ | [校对图](materials-review/bd-come-back-cat.jpg) |
| 小老鼠找新家 / A House for Mouse | 3–4 | 12 | 比较冷暖、干湿，区分梦境：为什么别人的家不一定适合小老鼠？ | [校对图](materials-review/bd-a-house-for-mouse.jpg) |
| 了不起的黛西 / Amazing Daisy! | 3–4、5–6 | 12 | 愿望、受挫与支持：黛西难过时，妈妈怎样回应？这是想象故事。 | [校对图](materials-review/bd-amazing-daisy.jpg) |
| 一粒种子的力量 / A Tiny Seed | 5–6 | 12 | 旺加里·马塔伊的求学、种树与环保行动：一粒种子怎样带来改变？含贫困及人物离世情节，建议成人陪读。 | [校对图](materials-review/bd-a-tiny-seed.jpg) |
| 树懒先生找睡床 / Sleepy Mr Sloth | 3–4 | 12 | 重复问句、局部线索：看到耳朵、蜂窝或尾巴，你猜附近是谁？ | [校对图](materials-review/bd-sleepy-mr-sloth.jpg) |
| 小蚂蚁的大计划 / Little Ant's Big Plan | 5–6 | 12 | 阅读、合作与因果：读书怎样帮助蚂蚁找到食物？你会怎样分工？ | [校对图](materials-review/bd-little-ants-big-plan.jpg) |
| 陆龟的家在哪里 / Tortoise finds his home | 3–4、5–6 | 12 | 累加叙事、天气变化与反转：伙伴怎样越聚越多？陆龟的家原来在哪里？ | [校对图](materials-review/bd-tortoise-finds-his-home.jpg) |
| 这是谁的纽扣 / Whose button is this? | 5–6 | 13 | 助人、观察与换位思考：丁丁为什么误会信号灯？最后怎样知道纽扣是谁的？ | [校对图](materials-review/bd-whose-button-is-this.jpg) |
| 河马想跳舞 / Hippo Wants to Dance | 3–4 | 12 | 拟声词、情绪与共处：邻居为什么不高兴？怎样让大家都能开心地跳舞？ | [校对图](materials-review/bd-hippo-wants-to-dance.jpg) |
| 它是什么呀 / What is it? | 3–4 | 12 | 比较特征，区分猜测与事实：没有尾巴就一定危险吗？影子到底是谁的？ | [校对图](materials-review/bd-what-is-it.jpg) |

## 来源与改编方式

原作由 [Book Dash](https://bookdash.org/books/) 发布，采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。每本书的 JSON 保留具体作品来源、原作者、原插画师、设计者、许可链接，以及本版翻译与重绘说明。许可证允许按要求署名后分享、翻译和改编；这不表示 Book Dash 或原作者为本站背书。

英文正文取自 Book Dash 官方 `bookdash-books` 仓库。保留原有 12–13 个故事跨页顺序，中文由本项目 AI 辅助翻译。原作无字跨页补充了短串词，保证当前播放器可逐页朗读，未删掉这些情节：

- 《小猫，回来呀！》第 5、12 页。
- 《小老鼠找新家》第 10 页。
- 《河马想跳舞》第 12 页。

串词的英文原文和对应页码记录在 `content/sources/bookdash/sources.json`，不冒充原作逐字正文。其余页面仅合并英文段落空白。原文快照、Git blob SHA、文件 SHA-256、署名和许可证据保存在同目录，便于下次复核。《一粒种子的力量》明确区分本次正文版本与当前官网的设计者署名。

插画均为新版独立 SVG，使用本项目浅蓝、奶油白、低饱和圆润造型，未搬用原版位图。逐页分镜在 `config/illustrations.json`，新绘制逻辑在 `scripts/bookdash_art.py`，由 `scripts/illustrate_books.py` 统一生成。封面标识为双语重绘版，书目 `is_demo=false`；许可审核状态仍如实为 `pending`，不新增发布门槛。

## 当前物料与操作入口

正式书库为 10 本、121 页、131 张绘本 SVG，中文和英文各 121 页配音；文件已由用户上传素材服务器，本地已上传的绘本图片/MP3及压缩包已清理，JSON 引用保留。英文由用户在本机执行生成脚本完成。音色保持晓晓 / Jenny、生成语速 `-20%`、播放器默认 1 倍。

完整操作统一见 [operations.md](operations.md)：生成或更新 → 校验 → 按书打包上传并在服务器 `/root/www/pic/assets/books/` 解压 → 确认资源访问 → 本地 importer 写入主站 MySQL → 网页验证；本次全量包在 `/root/www/pic` 解压。用户反馈已上传并执行 importer；数据库和完整浏览器播放未独立复核。

旧书及试听已清理，旧数据库清理由用户确认完成，不再执行旧清理步骤。测试目录仅保留隔离元数据和中性文件，不是正式书库。当前状态与验证边界见 [acceptance.md](acceptance.md)。
