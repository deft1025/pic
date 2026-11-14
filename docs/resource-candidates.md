# 绘本原画候选

2026-11-14：本批已选择《浴缸里的大冒险》《美好的一天》《羽毛朋友》《我能自己来！》，采用四位不同插画师原画，各12个完整故事跨页。全文、来源、双语配音及明确角色对白已入MySQL，4个单书包待用户上传解压；PC/移动端沿用当前最新版UI并检查真实本机物料。当前制作状态见 [materials.md](materials.md)，浏览器检查与交付边界见 [acceptance.md](acceptance.md)，逐本许可依据见 [来源说明](../content/sources/bookdash-originals/README.md)。

2026-11-13：本批已选择并制作《交个朋友吧》《坏心情云朵》《最棒的鸟窝》《千足虫找鞋子》，各保留12个完整故事跨页及不同插画师原画。4本正文、气泡和配音已写入MySQL，用户已反馈单书包上传解压，148个远程引用及逐文件哈希检查通过；本机实库API与真实远程素材的376项浏览器检查通过，公网主站及实体手机未验收。当前资料见 [materials.md](materials.md) 与 [逐本来源](../content/sources/bookdash-originals/README.md)。以下为此前选材阶段记录，不代表当前入库或上传状态。

2026-11-12 更新：又完成《谁吃了我的帽子？》《聪明的小猪》《勇敢的博拉》《和我一起玩吧》四本完整 Book Dash 原画双语物料（48 页），已生成图片、中英文配音、角色气泡及单书包，仅本地准备，未上传/入库。书目、逐本来源及处理说明见 [materials.md](materials.md) 与 [来源记录](../content/sources/bookdash-originals/README.md)。下方保留此前的平台研究与候选比较，不能据此推断新一批已上线。

## 平台补充评估：Let’s Read 与 Book Dash

2026-11-10 实际核对平台说明、许可与下载入口。两者都有获取价值：Book Dash 适合作为稳定生产来源；Let’s Read 值得作为下一轮扩充来源，但要逐本核对具体版本。

| 平台 | 已核实的获取价值 | 本项目使用时的限制 |
| --- | --- | --- |
| [Book Dash](https://bookdash.org/book-source-files/) | 官方明确全部绘本采用 CC BY 4.0，允许下载、翻译、改编与分享；提供印刷、电子和工作源文件，原插画师风格多样；本项目已有实际制作与入库链路 | 须保留创作者和 Book Dash 署名、标明改动。本轮四本无字源文件的 CloudFront 下载返回 403，不能承诺所有入口均可直接获取。此前统一画风主要来自本项目共享 SVG 重绘程序，不代表原作都相似 |
| [Let’s Read](https://www.letsreadasia.org/) | 官方介绍面向亚洲及太平洋社区；实际书目包含语言、阅读等级、作者、插画师、逐页正文与图片链接，以及 PDF / EPUB 下载地址；有望补充不同地域和作者的视觉表达 | 不能将“免费阅读/下载”等同于可翻译、配音和自行分发。官方条款默认 CC BY 4.0，但允许作品另列许可；实际抽查存在 Copyright、CC BY-NC 和 CC BY-NC-ND。阅读等级也不等于本项目年龄，须完整阅读后分龄 |

**Let’s Read 的实际样本**（不是对全站许可分布的统计，也不是新入库推荐书单）：

- [The Bell](https://www.letsreadasia.org/book/the-bell)：详情与实际下载 EPUB 版权页均为 **CC BY-NC 4.0**。作者 Jason Paisoi，插画 Eskoi Ismael Bogen；EPUB 下载成功（约 13.3 MiB），ZIP 可解析，含 27 个图片文件及可读取的正文、署名与版权页，图片数不等于故事页数。正文涉及五年级学生，不能仅凭平台阅读等级 2 将其直接归入幼儿书库。
- [Sam and Cam’s Jam](https://www.letsreadasia.org/book/sam-and-cams-jam)：实际详情标注 **Copyright**，提供 PDF / EPUB 链接和逐页图文，不能由可下载推断允许本站改编分发。
- [Magic Hands](https://www.letsreadasia.org/book/magic-hands)：书目接口标注 **CC BY-NC-ND 4.0**，不作为当前翻译、图片处理与双语配音流程的直接选材。正式使用前仍应核对下载版版权页。

核对入口：[Let’s Read 官方条款第 4 节](https://www.letsreadasia.org/termsandcondition)、[官方介绍](https://www.letsreadasia.org/about)、[实际公开书目接口样本](https://www.letsreadasia.org/api/v5/book/search?cardName=All&limit=20&fLimit=4&lId=4846240843956224&cursor=)、[Book Dash 源文件与许可](https://bookdash.org/book-source-files/)、[Book Dash 署名要求](https://bookdash.org/book-dash-crediting-requirements_and-identity-guidelines/)。条款页显示最后修订日期 2021-07-15；实际书目中仍出现 ND，与条款中上传许可说明不同，因此以具体作品版本核对，不能只读平台通用说明。

**选材方向**：继续优先保留原插画，按温暖手绘、动物朋友、家庭日常和情绪故事筛选，而不是再次统一重绘。Let’s Read 尚未完成符合《波西和皮普》感受的逐本视觉与全文筛选，不宣称已经找到可直接制作的新书。后续适用作品仍使用现有晓晓 / Jenny、生成语速 -20%、播放器 1 倍和单书素材包流程。本次仅评估与下载临时研究样本，未新增正式物料、配音、上传包或数据库记录。

---

**后续制作已完成**：用户已要求将这四本正式制作并入库。现已生成各 12 页、52 张 JPEG 和 96 个中英文 MP3，事务导入成功，真实 MySQL/API 回读通过；四个单书上传包已准备，等待用户上传解压及线上播放验收。官网无字下载 CDN 返回 403，实际采用官网高清插画预览清理英文排版。来源与改动记录见 [bookdash-originals](../content/sources/bookdash-originals/README.md)，当前上传步骤见 [operations.md](operations.md)。下文保留选材时的比较与预览说明，“尚未制作”等描述仅指选材阶段。

本轮按用户最新方向寻找更接近《波西和皮普》阅读感受的作品：温暖手绘、动物朋友、表情与动作丰富、有生活细节和日常情绪。网站界面继续统一；不同绘本保留各自插画师的画风，同一本内部保持一致。

当前 10 本使用同一套本地 SVG 重绘程序，角色、背景与配色共享，容易显得相似。新书优先使用开放许可作品的原插画，以保留手绘纹理、构图和角色差异。

## 推荐顺序

中文书名为本轮暂译；年龄为本项目共读建议，并非出版方分龄。以下四本均逐页阅读了官网展示的完整故事，分别有 12 个故事跨页；封面、版权页、衬页与封底不计入故事页数。

| 候选与来源 | 建议年龄 | 画风与内容 | 推荐理由 |
| --- | --- | --- | --- |
| [来我家住吧 / Come stay with me](https://bookdash.org/books/come-stay-with-me/) | 3–4 | 手绘纹理、蓝兔子与小乌龟；奶奶受伤时，小乌龟在兔子朋友家暂住，一起玩耍和入睡，最后家人团聚 | **首选**。动物朋友、温暖陪伴与小小生活事件最符合本轮方向；场景偏户外 |
| [好朋友 / Best Friends](https://bookdash.org/books/best-friends/) | 3–4、5–6 | 有笔触和纸感的动物校园；好友生病后，Zindzi 学会接纳其他朋友，最终大家一起玩 | **首选**。拟人动物、玩具、滑板车和同伴情绪丰富；配色较克制 |
| [小山羊 / Little Goat](https://bookdash.org/books/little-goat/) | 0–2 亲子指图、3–4 共读 | 清淡水彩、细线条、草地与小鸟；小山羊只顾找甜草，妈妈四处寻找它 | 水彩质感适合做另一种画风；主要是亲子寻找，拟人生活细节较少 |
| [菲菲和泰迪熊 / Fifi and Teddy](https://bookdash.org/books/fifi-and-teddy/) | 3–4 | 水彩与铅笔感，卧室、吃饭、秋千、洗衣等生活场景；心爱的泰迪熊不见了，原来是妈妈给它洗澡 | 适合补充生活与依恋主题；主角是小女孩，泰迪熊是玩具 |

四本均来自 Book Dash，但插画师各不相同。采用原画能够保留这些差异。此前考察的写实动物计数、粗线条漫画和生命循环类作品，未列入本轮优先推荐。

## 直接看图

- [本地画风对比图](materials-review/candidates-20261110/comparison.jpg)：每本封面与两个内页。
- [本地完整预览页](materials-review/candidates-20261110/index.html)：可展开逐本查看全部原站预览，附原图链接。
- [本地来源记录](materials-review/candidates-20261110/sources.json)：逐图 URL、SHA-256、故事页范围、作者与许可记录。

这些文件保存在已忽略的 `docs/materials-review/` 下，仅本机可用，不随 Git 或主站部署。当前保存的是 60 张原站预览，含非故事页面，约 1.73 MiB（连同对比图、页面和来源证据）；它们是选材资料，不是可上传的正式双语物料包。此处下载的是新候选预览，未恢复已清理的旧书物料。

## 署名与许可

Book Dash 的[源文件说明](https://bookdash.org/book-source-files/?book=come-stay-with-me)明确作品采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，允许按要求署名后分享、翻译和改编，需遵守其[署名指引](https://bookdash.org/book-dash-crediting-requirements_and-identity-guidelines/)。下表署名取自各自作品详情页，核对日期为 2026-11-10。

| 作品 | 原作者 | 原插画师 | 设计 | 编辑 |
| --- | --- | --- | --- | --- |
| Come stay with me | Nasrin Siege | Subi Bosa | Job Mubinya | Nabeela Kalla |
| Best Friends | Julia Smuts Louw | Gerhard van Wyk | Penny Waterkeyn | Katie Huston |
| Little Goat | Mirna Lawrence | Nicola Anne Smith | Tiffany Mac Sherry | Nabeela Kalla |
| Fifi and Teddy | Tshepo Letsapa | Alison de Villiers | Fathima Kathrada | Zanri Kritzinger |

原站预览中的英文属于原作版式。正式制作需取可分离文字的插画源文件，按当前阅读器将双语正文放在图外；不能仅将带英文的整张书页当作已经完成的中文绘本。下载页面已确认有源文件入口，本轮未取得并核验这四本的完整制作源文件包。原画实际介质以源文件为准，本文“水彩”“纸感”等描述为对可见画面的观察。

## 已确认的制作与存储标准

- 中文继续晓晓 `zh-CN-XiaoxiaoNeural`、英文继续 Jenny `en-US-JennyNeural`，生成语速均为 `-20%`；使用 `config/audio.json`，播放器默认 1 倍，语言切换方式保留。
- 图片与逐页 MP3 本机制作，按书打包，独立上传到现有素材服务器。沿用 `https://img.xuninfo.top/pic`、服务器 `/root/www/pic/assets/books/` 和现行上传解压流程。
- 导入 JSON 与数据库保存 `/assets/…` 相对路径，API 通过 `ASSET_BASE_URL` 拼接；候选使用新的稳定业务 ID，由用户执行事务导入。

本轮实际完成选材、完整故事预览阅读、详情署名与官网许可说明核对、本地图文对照。尚未制作四本的中文逐页翻译、导入 JSON、正式图片、配音或上传包；未上传素材、写数据库、修改线上界面、Git 提交或推送。完整操作继续以 [operations.md](operations.md) 为准。
