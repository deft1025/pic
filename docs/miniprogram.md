# 微信小程序

原生 WXML/WXSS/JavaScript 客户端在 `miniprogram/`，复用现有 Go API、MySQL 书库和图片/MP3。游客直接浏览和阅读；收藏、打开人数与读完状态仅面向登录用户。不保存阅读进度，每次打开绘本从第一页开始。范围不含支付、提现或分账。网页版原有本机状态单独保留，不自动接入小程序账号。

## 导入与配置

项目根目录运行 `npm run setup:mini`，再用微信开发者工具导入 `miniprogram/`。脚本只提取 `.env` 或环境变量中的 `WECHAT_APP_ID`，生成被Git忽略的 `project.config.json`；不提取或输出AppSecret。公开模板不含真实账号配置，未配置AppID时使用游客模式。

接口唯一配置在 `miniprogram/config.js`，正式地址为 `https://pic.xuninfo.top`。微信公众平台「开发管理 → 开发设置 → 服务器域名」配置：

| 用途 | 域名 |
| --- | --- |
| request | `https://pic.xuninfo.top` |
| downloadFile | `https://img.xuninfo.top`、`https://pic.xuninfo.top` |

域名项不带 `/pic`；素材仍使用API返回的完整路径。本机调试可以临时改为电脑的API地址并在开发者工具关闭域名校验，正式配置保持HTTPS与合法域名校验；手机的127.0.0.1不是电脑。代码没有上传或Socket接口。包含SVG的旧书需要真机检查，图片失败时保留完整文字与重试。

## 四张表与启用

定义唯一来源是 `docs/schema.sql` 第六节。用户手动创建现有库的这四张表，Codex只维护和导出SQL，不执行建表/迁移。现有库不重跑全量dbinit；提供独立预览命令：

```sh
# 只预览四张新表SQL，不连接数据库
GOCACHE=/tmp/pic-go-cache go run ./cmd/readerdb
```

| 表 | 用途 |
| --- | --- |
| `reader_users` | `user_id int unsigned`直接作为自增主键，初始水位10000；wechat_open_id唯一；`name`为用户名，`age`为年龄字典业务标识 |
| `reader_sessions` | 随机会话令牌SHA256摘要、整数用户编号和UTC到期时间 |
| `reader_favorites` | 整数用户编号与绘本联合唯一，`active`只表示0/1收藏状态 |
| `reader_events` | 登录用户的绘本阅读状态；user_id/book_id联合唯一，open可升级complete，完成后不再更新 |

用户表不再另设 `id` 或32位随机用户编号；其余三张表沿用独立自增 `id`。所有关联 `user_id` 均为 `int unsigned NOT NULL`，不保存游客用户编号。用户编号由MySQL保证唯一，同一OpenID重复登录仍返回原编号；自增可能因冲突/回滚留空号，不要求连续。API保留ID字符串表示（如 `"10000"`），数据库存整数；登录凭证仍为随机令牌。

本项目只服务当前一个微信小程序，`reader_users`不存AppID，登录插入/查询仅使用 `wechat_open_id`，该列须有唯一索引 `uk_reader_users_wechat`。用户手动移除旧 `wechat_app_id`列时，确认剩余唯一索引只包含 `wechat_open_id`，保留既有用户编号与关联记录。后端仍从 `.env`读取 `WECHAT_APP_ID`参与微信身份验证，小程序项目配置仍需AppID；这些配置继续保留。改表与新版后端需配套更新，随后由用户执行 `bash deploy.sh`。

`name`最多50个字、不可含控制字符，留空保存为“小小读者”。`age`保存年龄字典中的业务标识；初始空值代表尚未选择。首次登录成功在书架弹出浅蓝/奶油白的年龄卡片选择框，必须主动点选后确认，不预选年龄。服务端保存后，以后登录不再弹窗；个人资料页可以重新设置用户名和年龄段，不收集生日或微信头像昵称。未选择年龄段不能新增收藏。

导出的 `dist/reader-schema.sql` 只含四张读者表，在MySQL客户端选中目标数据库后执行。该文件是从标准定义自动导出的忽略产物，不另行维护。建表是逐表DDL隐式提交，失败后可重试；`CREATE IF NOT EXISTS`不会把旧版本同名表自动改成新结构。本次只修改定义与代码，现有内容库是否实际应用以对应验收记录为准。若已有旧版表，先检查结构并单独准备迁移，不直接套用新库初始化。

后端 `.env` 使用 `WECHAT_APP_ID`、`WECHAT_APP_SECRET` 和默认关闭的 `MINI_PROGRAM_ENABLED=false`。四张表准备好后才启用 `MINI_PROGRAM_ENABLED=true` 并重启API。本机与服务器配置分别准备；真实密钥不写入小程序、文档或Git。正式代码部署仍由用户自行提交、推送，在服务器执行 `bash deploy.sh`；小程序上传/发布单独操作，不自动执行。

服务器四张读者表准备好后，将服务器实际读取的 `.env` 中 `MINI_PROGRAM_ENABLED` 改为 `true`，保留已有AppID、Secret和数据库配置。`.env`被Git忽略，本机文件需要单独同步到服务器；系统环境变量会覆盖同名文件配置。然后在服务器项目目录执行 `bash deploy.sh`。启动日志明确输出账号服务已启用/未启用，不输出凭据。

部署后可用不含有效登录code的空JSON检查开关（不会向微信换身份或创建账号）：

```sh
curl -sS -i -H 'Content-Type: application/json' --data '{}' https://pic.xuninfo.top/api/auth/wechat
journalctl -u pic -n 50 --no-pager
```

返回400“登录凭证无效”表示路由和开关已生效，仍须在小程序实际登录验证微信与读者表；503“尚未启用”表示实际运行配置的开关仍关闭。其他失败的日志只输出固定诊断码：`wechat_err_40013`（AppID）、`wechat_err_40125`/`wechat_err_40001`（凭据）、`wechat_err_40029`/`wechat_err_40163`（无效/已使用code）、`wechat_network_failed`（连接微信失败）、`reader_table_missing`（读者表缺失）、`reader_schema_mismatch`（旧表结构）、`reader_storage_failed`（数据库写入失败）。页面展示对应的简明原因，不返回微信原始errmsg、OpenID、会话密钥或SQL错误。

## 登录、会话与客户端

`wx.login`提供一次性code，后端向微信 `jscode2session` 换取身份，再建立内部账号和30天随机会话。只向小程序返回内部用户资料和随机令牌，不返回OpenID、AppSecret或session_key。后端只保存令牌摘要。退出即撤销当前会话，过期令牌返回401；401清除本机登录和私有收藏缓存。

登录由家长在书架主动操作。游客点击收藏先进入登录入口，不读写游客收藏，也不合并历史游客缓存。登录后只加载该账号收藏，成功写回服务器才改变本机状态；失败保留服务器确认过的状态并提供重试。退出/换号不把账号私有收藏变为游客数据。

书架“喜欢的绘本”以小封面、书名和箭头显示简洁列表，整行点击进入详情，不重复展示推荐理由或页数。沿用账号收藏顺序，在本机按每页8本分页显示；超过一页显示上一页、下一页及当前/总页数。从详情返回保留当前页，收藏减少或物料不可见后自动收缩页码，退出登录清空列表。

每个API进程对直接连接来源限制登录30次/分钟、事件240次/分钟，不信任任意 `X-Forwarded-For`。反向代理可能共用来源，需要在受信任入口按真实流量评估上限。这不是多进程全局限流。

会话不会因阅读/翻页/收藏而新增，只有成功登录时新增。现有代码在登录时清理该用户过期会话，并有独立 `expires_at` 索引。尚未实现后台定期清理任务；运维可按需要定期分批删除过期会话，避免长期不再登录的旧记录积累：

```sql
DELETE FROM reader_sessions
WHERE expires_at <= UTC_TIMESTAMP(3)
ORDER BY expires_at LIMIT 1000;
```

上述清理不删除用户或收藏，不代表本次已执行清理或配置调度任务。

## 阅读器

首页推荐、新书、书库关键词/年龄/主题/分页、详情与来源署名均查现有API。年龄段和主题使用下拉筛选框，包含“全部”，具体选项来自字典接口，筛选变化从第一页加载。阅读器统一使用图内气泡呈现已配置的角色对白，图下保留旁白，不再提供排版切换，旧的图下文字偏好忽略。没有有效对白配置或插画加载失败时保留完整文字，避免漏文。气泡独立测量实际文字和角色名，尝试多个宽度与左右排列，按内容收紧宽高；仅长对白滚动，不再拉伸为等高大格。图片保持完整比例，左右各8px留白，画幅不随对白改变。用户选择的语言、隐藏文字、夜间、连播和倍率保存在小程序本机。每次从第一页开始，无进度表、进度接口或“最近读过”书架。

复用既有预生成MP3，默认1倍；不重新配音或把设备朗读当作预生成音频。翻页/换语言/切后台/离开阅读器销毁旧音频，暂停保留播放位置，加载失败可重试。当前视口的图片画幅稳定，气泡只在实际contain插画范围内测量定位；必要时只合并同角色、同锚点、紧邻且仅隔署名的台词，不隐藏后续对白/旁白；长文字图内滚动，字号不低于16px。播放器置于图文下方，两行控制和原生页码选择。阅读页提供返回、夜间与扩展阅读模式。

登录确认弹窗按钮为“同意登录”（微信confirmText最多4字），弹窗或登录失败会显示持续错误；取消不发送登录请求，进行中阻止重复点击。微信code获取超时为10秒。

## 接口

JSON请求最多32KiB；账号接口只通过 `Authorization: Bearer <token>` 确认用户，不接受客户端指定用户编号。所有写入均验证账号归属；年龄依据现有MySQL年龄字典。

| 方法与路径 | 输入或返回 |
| --- | --- |
| GET `/api/recommendations` | 4本推荐，可选Bearer令牌；年龄取服务器资料，不接受客户端指定用户/年龄 |
| POST `/api/auth/wechat` | `{code}` → `{token,expires_at,user:{id,name,age,needs_profile}}` |
| POST `/api/auth/logout` | 撤销当前会话 |
| GET `/api/me/profile` | 当前用户 `{id,name,age,needs_profile}` |
| PUT `/api/me/profile` | `{name,age}` → 保存后的当前资料 |
| GET `/api/me/favorites` | `{items:[book_id]}`，仅当前可见书 |
| PUT `/api/me/favorites` | `{book_ids:[…],active:true/false}`，每批1–100本，重复请求不重复收藏 |
| POST `/api/events` | `{event_id,book_id,kind,reading_id}`，必须登录 |

下架书不能新增收藏/事件，但旧收藏仍可取消；账号查询再次经过书目可见性和可选许可过滤，不绕过书库规则。

## “今天读什么”推荐

仅小程序调用 `/api/recommendations`；网页版首页、登录入口和本机收藏保持原样。接口返回4本且不缓存，进入首页时重新加载；令牌过期自动按游客重试，迟到的旧账号结果不能覆盖当前账号。

- 热门分 = 当前有效收藏人数 × 2 + 首次读完人数。取消收藏不计入；一人一本书只有一条状态，反复打开/读完均不重复加分。
- 游客或尚未选择年龄的账号：按热门分倒序，同分按 `books.id DESC`。全为0时自然变为物料自增ID倒序。
- 已选年龄的账号：先选2本同龄且未读完的新书（自增ID倒序），让新物料有展示机会；剩余位置从同龄未读热门中补齐。若仍不足，依次补同龄热门（可含已读）、全库热门，始终去重，最多4本。
- 年龄依据服务器 `reader_users.age`，未读依据该用户的complete记录；已下架或不满足当前可见性要求的物料排除。推荐与“还有这些新朋友”之间也去重。
- 账号功能关闭时不访问可选读者表，按物料ID倒序提供新书；启用后统计查询失败会报错，不虚构热度。无需新增表或迁移现有表。

## 统计口径

仅登录用户发送事件，游客不发送也不暂存。`reader_events`实际保存阅读状态，以 `user_id + book_id`联合唯一，每个用户每本书最多一条：

- 首次打开详情写入 `open`，再次打开不新增、不修改时间或其他字段。
- 首次读完将该行升级为 `complete`，更新对应事件/会话标识和更新时间，保留主键与创建时间。若读完先于打开请求到达，直接创建 `complete`。
- 一旦完成，任何后续open/complete请求均直接返回，整条记录及时间不再修改。事务锁定用户行，数据库联合唯一索引兜底并发。

未读指没有complete状态，包括没有记录和仅open两种；不保存阅读页码。统计口径改为打开人数（该书全部记录数，含已完成）与读完人数（complete行数），不再累计重复点击次数。读完触发仍为遍历全页后确认，或最后一页配音结束，属于客户端自报行为。客户端保持原有事件/会话标识与接口兼容；待发送队列按账号隔离，最多100条，联网/再次展示时重试；退出清除当前账号队列。

已有事件表须由用户手动执行 [合并与索引调整SQL](migrations/20261117_reader_events_user_book.sql)：先停止API写入并备份该表，在实际业务库执行脚本，再部署新版后端。脚本同用户/书优先保留最早complete，否则保留最早open；保留行的全部字段及时间不变，再将旧会话/类型索引替换为用户/绘本唯一索引。不清空或重建整张表；已完成的旧记录继续算读完。Codex不向现有业务库执行迁移。

收藏只看当前状态：同一用户/绘本最多一条记录，收藏为1、取消为0，再收藏仍为1。没有 `added_count`，不累计添加操作次数。收藏排行榜可直接查询：

```sql
SELECT b.book_id,b.title_zh,COUNT(*) AS favorite_count
FROM reader_favorites f
JOIN books b ON b.book_id=f.book_id
WHERE f.active=1 AND b.publish_status='published'
GROUP BY b.book_id,b.title_zh
ORDER BY favorite_count DESC,b.book_id;
```

取消后不计入人数。`SUM(active)`按绘本分组也可统计同一口径。综合查看三种指标时先各自聚合，避免JOIN重复累乘：

```sql
SELECT b.book_id,b.title_zh,
       COALESCE(e.opens,0) AS opens,
       COALESCE(e.completions,0) AS completions,
       COALESCE(f.favorite_count,0) AS favorite_count
FROM books b
LEFT JOIN (
    SELECT book_id,COUNT(*) AS opens,
           SUM(event_kind='complete') AS completions
    FROM reader_events GROUP BY book_id
) e ON e.book_id=b.book_id
LEFT JOIN (
    SELECT book_id,SUM(active) AS favorite_count
    FROM reader_favorites GROUP BY book_id
) f ON f.book_id=b.book_id;
```

事件时间为服务器UTC接收时间。上线前由运营方在微信后台按实际收集项完善隐私保护指引、联系/账号数据删除渠道及保留与清理计划；当前没有账号自助注销接口或自动事件清理任务。

## 检查

```sh
npm run check:mini
npm run test:mini
npm run test:mini:layout
npm run test:mini:profile
# 可选，仅在独立临时MySQL库测试，不初始化现有内容库
PIC_MYSQL_TEST=1 GOCACHE=/tmp/pic-go-cache go test ./internal/repository -run '^TestAccountMySQLIntegration$' -count=1 -v
```

`check:mini`检查JS/JSON、页面入口和后端凭据隔离；存在微信开发者工具wcc/wcsc时实际编译WXML/WXSS，其他机器可配置 `WECHAT_COMPILER_DIR`，缺失时明确报告未编译。浏览器适配回归使用真实WXML/WXSS、离线快照和生成测试图，不代表微信模拟器、原画或真机验收。

自动化需开发者工具「设置 → 安全设置 → 服务端口」开启，之后可用 `cli auto --project /Users/zx/Projects/pic/miniprogram --trust-project`；不代替微信账号登录。真实联调仍需新表、后端开关、新API部署、微信后台域名及真实一次性code。真机检查首次年龄弹窗/再次登录不弹、个人资料修改、收藏换机/退出换号、音频后台/弱网、SVG与完整对白；编译或模拟API通过不能推断上述结果。官方登录说明：https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html
