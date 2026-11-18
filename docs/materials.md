# 物料维护索引

MySQL是唯一可编辑书目源，运行和本机制作都查库。来源JSON仅保存原始证据，不导入运营库，不维护第二份书目。

- [选材来源与系列](resource-candidates.md)
- [StoryBloom逐批来源与改动说明](../content/sources/storybloom/README.md)
- [Book Dash原画来源](../content/sources/bookdash-originals/README.md)
- [制作与交付流程](operations.md)
- [实际验收与待办](acceptance.md)

2026-11-18最新入库后为46本607页，“幼儿园适应”主题6本；后续以 `python3 scripts/materials.py list` 与指定书回读为准。新主题业务ID为 `kindergarten`，保留相关书原有情绪、习惯等分类；已有《好朋友》《黄色瓢虫拉拉》仅补充主题，正文、图片及配音未变。

本批优先扩充新主题，新增StoryBloom四本幼儿园大班故事，共74页、148段双语MP3，适合5–6岁亲子共读。原图、配音、校验与单书包已完成，待用户上传解压后执行远程验收。

| 书名与单书包 | 生活情境 | 页数 | 包内文件数 |
| --- | --- | --- | --- |
| [校门口的那一次挥手](../web/assets/books/sb-school-gate-wave.tar.gz) | 入园告别与安全感 | 18 | 55 |
| [睡不着的午休小床](../web/assets/books/sb-rest-at-naptime.tar.gz) | 集体午休与放松 | 18 | 55 |
| [我可以和你们一起玩吗？](../web/assets/books/sb-may-i-play.tar.gz) | 发出邀请、商量轮流 | 20 | 61 |
| [我想去洗手间，可以举手吗？](../web/assets/books/sb-can-i-ask-for-help.tar.gz) | 身体需求与开口求助 | 18 | 55 |

将上述四个新包上传至 `/root/www/pic/assets/books/`，在该目录逐本执行 `tar -xzf 书ID.tar.gz`。无需编辑书目或运行导入。主题与书目已写入MySQL，数据刷新或重新进入书库即可读取；新书图片和音频仍需上传这四个包。

上一批跨系列睡前物料的四个包已在用户解压后通过逐本remote验证，160个远程完整文件SHA-256与本机一致，公网页面416组双语逐页及阅读流程检查通过。原包链接保留：

- [今晚的小灯可以亮着吗](../web/assets/books/sb-nightlight-can-stay.tar.gz)
- [为什么要睡觉](../web/assets/books/sb-why-we-sleep.tar.gz)
- [春夜喜雨](../web/assets/books/sb-spring-night-rain.tar.gz)
- [赠人玫瑰，手有余香](../web/assets/books/sb-a-rose-for-you.tar.gz)

此前亲子成长4本每本18页，原单书包链接保留；该批远程上传验收仍以实际记录为准：

- [花盆里的一颗豆](../web/assets/books/sb-bean-in-a-pot.tar.gz)
- [风筝等一阵风](../web/assets/books/sb-kite-waits-for-wind.tar.gz)
- [外公走得慢一点](../web/assets/books/sb-grandpas-pace.tar.gz)
- [爸爸也有不会的时候](../web/assets/books/sb-learning-with-dad.tar.gz)

后续继续优先补充“幼儿园适应”，围绕入园分离、吃饭午睡、交朋友和同伴冲突，偏温暖动物角色；本批按用户要求优先贴合幼儿园场景，不强求不同来源系列，具体选材见 [选材入口](resource-candidates.md)。

