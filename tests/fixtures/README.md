# 隔离的测试资料

`books/` 保留固定的测试用故事和查询特征，用于验证分页、筛选、发布规则及播放器状态；不属于运营书目，默认导入器不会读取此目录。

所有测试图像与音频引用统一指向 `web/assets/fixture/` 中的一张中性 SVG 和一个 10 毫秒静音 WAV，用来检查路径、静态传输与音频状态。它们不含旧书的图片、MP3 或试听内容，不复制到正式 `web/`，不属于主站部署文件。

`illustrations.json` 仅供绘图回归测试。生产分镜仅来自根目录 `config/illustrations.json`；不要将测试目录作为运营导入目录。

`library.json` 是 `python3 scripts/materials.py snapshot-tests` 直接从 MySQL 自动生成的只读测试快照，保存已有绘本的文字、布局和相对路径，用于无数据库的全页回归。它不携带图片/MP3、不参与运行/制作/导入，禁止人工编辑或当作正式来源。更新由 Codex 自动执行，不增加用户的内容维护步骤。测试不依赖 `content/books/` 的历史本地备份。
