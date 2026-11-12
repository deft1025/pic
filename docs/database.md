# MySQL 存储说明

当前数据库已由用户创建并初始化，日常无需再次建表。运行与本地制作均以 MySQL 为唯一书目维护源，旧 JSON 仅留本机历史备份；图片与音频是静态文件，数据库保存相对路径。现行导入与部署步骤统一见 [operations.md](operations.md)。

## 表结构

唯一建表文件为 [schema.sql](schema.sql)，包含 10 张表及 3 个年龄段、6 个主题、2 种语言的初始字典。推荐 MySQL 8.4，旧版本兼容性尚待实库验证。

所有表使用 `id int unsigned AUTO_INCREMENT` 主键，业务标识另设唯一索引；字段有中文注释和创建/更新时间。开关使用 `tinyint unsigned` 0/1，不使用 BOOLEAN 或 CHECK；页数与连续页码由导入器校验。

| 表 | 用途 | 业务唯一键 |
| --- | --- | --- |
| books | 绘本元数据 | book_id，例如 bd-come-back-cat |
| book_licenses | 来源与授权 | book_id |
| book_pages | 图片、双语文本、逐页音频路径与可选对白排版 | book_id + page_number |
| book_voices | 语音服务商、音色与生成记录 | book_id + language_id |
| age_ranges | 年龄字典 | age_id |
| categories | 主题字典 | category_id |
| languages | 语言字典 | language_id |
| book_age_ranges | 适读年龄关联 | book_id + age_id |
| book_categories | 主题关联 | book_id + category_id |
| book_languages | 语言关联 | book_id + language_id |

API 与 JSON 中的 `id` 仍表示业务标识。重复导入按业务标识更新，不重建绘本主表自增 ID，不删除导入批次以外的书。不要假定所有关联表都有级联删除；正式删除书目时需明确处理相关记录。

`book_pages.audio_zh_path` / `audio_original_path` 保存中英文逐页音频地址，`book_voices` 保存服务商、音色、生成时间等信息，不保存 MP3 二进制。仅上传音频不会写入这些表，制作工具整本成功后直接写回数据库，无需用户运行 importer。

`book_pages.dialogue_layout` 为可空 JSON，对应资料页的 `dialogue` 字段，保存双语原文范围、角色、坐标、画幅比例和正文哈希。它与正文同一事务导入，接口直接返回，不需要独立静态文件或额外布局表。唯一编辑源现为 MySQL，由本地制作工具统一写入。清除页内对白保存后写入 NULL，恢复普通正文；旧 JSON 不能再作为日常覆盖源。

已有库由用户执行一次 [migrations/20261111_dialogue_layout.sql](migrations/20261111_dialogue_layout.sql)，再导入资料；用户已反馈执行过迁移，且本轮已从实际数据库读取全部对白，无需重复执行。它只增加该字段，不改变现有图片或音频。新建库的 schema 已包含该字段。旧库未迁移时，新版 API 仍读 MySQL 并显示原正文；含对白的导入会在写事务开始前拒绝执行。若手改正文导致布局失效，API 忽略可选布局并保留普通阅读。

## 事务和查询

本地 cmd/materials 通过 service 校验书目与素材，repository 在事务内锁定书目、比较读取时的完整快照，再更新书目、授权、分类关系、页面和语音。并发变化会拒绝覆盖，正文变化时清理对应语言的旧配音及失效对白。旧 importer 仅用于显式历史迁移。数据库写入失败回滚该批次，文件生成和数据库之间没有跨系统事务。

搜索、筛选、排序与分页在 MySQL 完成；参数绑定和 LIKE 转义避免直接拼接用户输入。关联信息按列表页批量加载。发布查询默认只限制 `published`，`REQUIRE_LICENSE_APPROVAL=false` 不限制 pending 许可状态。数据库不可用返回 503，不回退 JSON。

## 配置

API、dbinit、importer、materials 均自动读取 `internal/config.Load`：`--config` 选择文件优先于 `CONFIG_FILE`，默认当前工作目录 `.env`；配置值由环境变量覆盖文件。目录相对于命令工作目录，不相对于配置文件目录。

`.env.example` 提供 DB_*、连接池、超时等模板。实际 `.env` 包含凭据，不上传或打印。密码含特殊字符时使用单引号；`DB_TLS=true` 启用证书验证。存储时间统一 UTC。

配置修改需重启服务；数据库内容更新后刷新即可，不需重启。

## 仅全新环境初始化

此节仅供新的空数据库部署参考，不适用于当前日常操作：

1. 用户创建目标数据库与账户，在新环境填写 `.env`，不覆盖已有凭据。
2. 在数据库客户端选中目标库，手动执行 `docs/schema.sql`。该文件不创建数据库，不包含绘本正文，也不升级旧版同名表。
3. 按操作手册准备、上传并导入现有数据库备份或经校验的资料，再启动 API。

`cmd/dbinit` 是同一 SQL 的命令入口；用户仍可自行手动建表。重复执行建表不会删除绘本，但会更新基础字典，不能替代迁移方案。

当前部署使用 `deploy.sh` 和 systemd；Docker 配置已移除。不在每次部署/启动时自动建表或灌入资料。

## 可选实库集成测试

普通 `go test ./...` 不需要 MySQL。实际集成测试默认跳过，在确认可连接并具备临时库创建/删除及 TRIGGER 权限的环境执行：

```sh
CONFIG_FILE="$PWD/.env" PIC_MYSQL_TEST=1 go test ./internal/repository -run TestMySQLIntegration -v
```

测试创建独立的 `pic_test_*` 临时库并在结束后删除，验证建表、导入、幂等更新、分页、上下架和事务回滚；不会使用运营库作为测试表容器。
