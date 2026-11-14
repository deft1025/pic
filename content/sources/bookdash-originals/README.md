# Book Dash 原画双语版来源

本目录保存16本原画整理版的作品署名、英文原文、无字页标记和源图证据，不是运行时书库。正式中文、画面描述、对白、运营字段与音频引用只维护在MySQL；`content/books/`是忽略的历史备份。制作与交付流程见 [operations.md](../../../docs/operations.md)。

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
| bd-lets-be-friends | 交个朋友吧 | Let’s be Friends | 12 |
| bd-grumpy-cloud | 坏心情云朵 | Grumpy Cloud | 12 |
| bd-the-best-nest | 最棒的鸟窝 | The Best Nest | 12 |
| bd-shongololos-shoes | 千足虫找鞋子 | Shongololo’s shoes | 12 |
| bd-bathtub-safari | 浴缸里的大冒险 | Bathtub Safari | 12 |
| bd-a-beautiful-day | 美好的一天 | A Beautiful Day | 12 |
| bd-feathered-friends | 羽毛朋友 | Feathered Friends | 12 |
| bd-i-can-do-it | 我能自己来！ | I can do it! | 12 |

每书来源JSON保存原作者、插画师、设计、编辑、作品URL、许可证链接和英文页序；2026-11-13及后续批次另记ISBN。英文依官网完整原图人工核对，OCR仅作辅助，合并排版换行、整理引号与朗读标点。2026-11-14批次无字页的原文保留空串，新增朗读内容只维护在MySQL；未知编辑记为null。早期来源资料中的中文是历史校对快照，不参与制作或入库；后续不复制中文、画面描述或对白到来源文件。

新增作品逐本核对作品页署名、版本和完整预览；Book Dash [官方源文件页](https://bookdash.org/book-source-files/)声明所有作品采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，允许按要求署名后分享、翻译与改编。2026-11-14四本PDF入口实测403；其中《羽毛朋友》官网完整预览另含清晰版权页，已阅读并保存，明确CC BY 4.0，设计者全名Stephanie Pretorius。其余三本许可依据为作品详情与官方全部作品声明，未声称核对PDF版权页。数据库许可记录均为`pending`。完整翻译与图片排版整理均在书目署名披露，不表示创作者或Book Dash为本站背书。

原作无字跨页补充以下中英文朗读串词，对应来源JSON的`narration_additions`，不冒充原作逐字正文：

- Come stay with me：第6页，两个朋友一起玩耍。
- Fifi and Teddy：第6页掀被子找、第7页向窗外找、第12页拥抱泰迪。
- Who ate my hat?：第8页彼此看着、第10页一起做新帽子、第12页朋友野餐。
- Play with me：第11页全家笑着靠在一起。
- Let’s be Friends：第11页，鱼朋友们来到门口；第10页门边原有敲门拟声字并入朗读。
- Shongololo’s shoes：第12页，千足虫穿回鞋子，动物们聚在派对上。
- Bathtub Safari：第12页，杰克和小动物玩具一起入睡。
- A Beautiful Day：第4页一起出发，第12页星空下入睡。
- Feathered Friends：第4页看见冠羽企鹅，第6页新朋友跟来，第8页羽毛飞舞，第11页一起游泳，第12页并肩站在水边。

`sources.json`保存208张制作源图的具体URL、SHA-256、尺寸和页码映射。《羽毛朋友》故事页对应预览索引3–14，跳过衬页、版权页和封底；封底科普附言不作为故事正文。正式图片沿用官网高清预览原插画，按`config/original_art.json`中逐页复核的文字区域清理图内英文；封面保留英文书名和创作者署名。`ink_threshold`用于文字贴近浅色水彩边缘的局部；`max_width`和`max_cover_width`按书设置缩小上限，缺省沿用源图尺寸。双语正文和气泡由阅读器显示，不烘焙进原图，不使用统一模板重绘。

原图分批保存在被Git忽略的`docs/materials-review/original-sources-YYYYMMDD/`，批次由`sources.json`的`downloaded_on`指定；新克隆可按逐图URL取回并核对哈希。正式图和音频只按数据库引用制作与打包，不从来源快照重建可编辑书目：

```sh
python3 scripts/materials.py art --book 书ID
python3 scripts/materials.py audio --book 书ID
python3 scripts/materials.py validate --book 书ID
python3 scripts/materials.py package --book 书ID
```

图片制作前须已备齐对应原图、来源证据和清理配置；图片阶段保留正文、对白、音频及运营字段。仅调整气泡排版不重做图片或配音。配音沿用晓晓/Jenny、生成语速-20%、播放器1倍；每种语言整本成功后事务写回。每本单独打包，包首层为书ID，12页作品各37个文件。实际制作、远程校验和浏览器结果见 [acceptance.md](../../../docs/acceptance.md)。
