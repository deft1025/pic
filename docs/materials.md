# 物料维护索引

MySQL是唯一可编辑书目源，运行和本机制作都查库。来源JSON仅保存原始证据，不导入运营库，不维护第二份书目。

- [选材来源与系列](resource-candidates.md)
- [StoryBloom逐批来源与改动说明](../content/sources/storybloom/README.md)
- [Book Dash原画来源](../content/sources/bookdash-originals/README.md)
- [制作与交付流程](operations.md)
- [实际验收与待办](acceptance.md)

2026-11-19新增幼儿园适应续批4本后为62本849页，共7个主题，“幼儿园适应”22本；后续以 `python3 scripts/materials.py list` 与指定书回读为准。主题通过MySQL字典提供，保留相关书原有情绪、习惯等分类；已有《好朋友》《黄色瓢虫拉拉》此前仅补充幼儿园主题，正文、图片及配音未变。

最新续批继续使用不同主人公与原插画师，全部归“幼儿园适应”及情绪。各12页，共48页、96段双语MP3；每包37个文件。

| 书名与单书包 | 生活情境 | 年龄 |
| --- | --- | --- |
| [马里的新朋友](../web/assets/books/bd-malis-friend.tar.gz) | 尊重独处、慢慢建立友谊 | 3–4、5–6 |
| [不敢试试的狮子](../web/assets/books/bd-the-lion-who-wouldnt-try.tar.gz) | 理解怕输、尝试加入同伴游戏 | 3–4、5–6 |
| [你也可以！](../web/assets/books/bd-yes-you-can.tar.gz) | 老师支持、表达兴趣、尊重差异 | 5–6 |
| [图米第一次去公园](../web/assets/books/bd-tumi-goes-to-the-park.tar.gz) | 第一次尝试、邀请同伴、合作玩耍 | 3–4 |

已完成本机制作、校验和打包；用户已确认本批四本上传并完成人工验收，详见 [验收记录](acceptance.md)。

上一批改用Book Dash四位不同插画师、不同主人公的原画，统一归入“幼儿园适应”，保留情绪标签。共48页、96段双语MP3，每本12个完整故事跨页。

| 书名与单书包 | 生活情境 | 年龄 | 包内文件数 |
| --- | --- | --- | --- |
| [辛迪和月亮](../web/assets/books/bd-sindi-and-the-moon.tar.gz) | 接住入学担心、期待新朋友 | 5–6 | 37 |
| [今天我过生日！](../web/assets/books/bd-its-my-birthday.tar.gz) | 幼儿园生日、同伴关爱 | 5–6 | 37 |
| [沙卡和马兹](../web/assets/books/bd-shaka-and-mazi.tar.gz) | 搬家依恋、适应新环境、交朋友 | 3–4、5–6 | 37 |
| [你呢？](../web/assets/books/bd-how-about-you.tar.gz) | 认识差异、询问喜好、一起玩耍 | 3–4 | 37 |

本批本机检查与单书包完成情况见 [验收记录](acceptance.md)，上传后沿用人工远程验收。

本批继续归入“幼儿园适应”（`kindergarten`），选取StoryBloom日常系列4本完整生活故事，共76页，适合5–6岁亲子共读，围绕表达不愿意、隐私与求助、不舒服的玩笑、停手与表达。安安主角批次已完成并由用户确认人工验收；后续选材优先其他主人公及不同画风。实际检查见 [验收记录](acceptance.md)。

| 书名与单书包 | 生活情境 | 页数 | 包内文件数 |
| --- | --- | --- | --- |
| [小小的不愿意](../web/assets/books/sb-my-little-no.tar.gz) | 表达不愿意、尊重彼此边界 | 20 | 61 |
| [我的秘密谁能听](../web/assets/books/sb-who-can-hear-my-secret.tar.gz) | 隐私、分享前询问、不安全的事可以求助 | 16 | 49 |
| [我只是开个玩笑](../web/assets/books/sb-just-a-joke.tar.gz) | 停止不舒服的玩笑、道歉和同伴支持 | 20 | 61 |
| [生气的小手放哪里](../web/assets/books/sb-where-angry-hands-go.tar.gz) | 先停手、表达边界和求助 | 20 | 61 |

单书包上传至 `/root/www/pic/assets/books/` 后逐包执行 `tar -xzf 书ID.tar.gz`。主题与新书通过现有API动态读取；本批用户沿用人工远程验收，上传反馈与实际检查结论分别记录。

上一批幼儿园适应续批为StoryBloom日常系列四本完整大班故事，共70页、140段双语MP3，分龄5–6岁亲子共读。物料实际检查见 [验收记录](acceptance.md)。

| 书名与单书包 | 生活情境 | 页数 | 包内文件数 |
| --- | --- | --- | --- |
| [我的小书包，今天自己收](../web/assets/books/sb-pack-my-own-bag.tar.gz) | 图画清单、自主整理 | 18 | 55 |
| [今天我是大班值日生](../web/assets/books/sb-classroom-helper.tar.gz) | 班级参与、小意外与求助 | 18 | 55 |
| [大班里的三位老师](../web/assets/books/sb-three-kind-teachers.tar.gz) | 熟悉老师、集体生活安全感 | 18 | 55 |
| [放学路上，慢慢说](../web/assets/books/sb-after-school-take-your-time.tar.gz) | 离园过渡、休息与倾听 | 16 | 49 |

用户已确认该批四个包上传解压完成，远程验收按用户要求由人工检查；未执行自动remote验证。

此前幼儿园适应首批四本共74页、148段双语MP3，原图、配音、校验与单书包已完成，上传验收以实际记录为准：

| 书名与单书包 | 生活情境 | 页数 | 包内文件数 |
| --- | --- | --- | --- |
| [校门口的那一次挥手](../web/assets/books/sb-school-gate-wave.tar.gz) | 入园告别与安全感 | 18 | 55 |
| [睡不着的午休小床](../web/assets/books/sb-rest-at-naptime.tar.gz) | 集体午休与放松 | 18 | 55 |
| [我可以和你们一起玩吗？](../web/assets/books/sb-may-i-play.tar.gz) | 发出邀请、商量轮流 | 20 | 61 |
| [我想去洗手间，可以举手吗？](../web/assets/books/sb-can-i-ask-for-help.tar.gz) | 身体需求与开口求助 | 18 | 55 |

主题与书目存于MySQL，刷新或重新进入书库即可读取；新书图片和音频需上传对应单书包。

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

后续主题按用户当次要求选材，优先完整、适龄、温暖的生活故事，具体入口见 [选材说明](resource-candidates.md)。

