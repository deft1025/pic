# pic · 小小绘本馆

面向0–6岁儿童与家长的免费双语绘本馆，包含Go API、原生HTML/CSS/JavaScript网页和微信小程序。MySQL是书目唯一维护源；正文、对白与资源路径经物料工具维护，不手工维护第二份书目JSON。

## 本机运行

需要Go 1.25+和MySQL（推荐8.4），从项目根目录运行：

```sh
go run ./cmd/api
```

首页：http://127.0.0.1:8198/；健康检查：`/api/health`。配置自动读取 `.env`，支持 `--config` / `CONFIG_FILE` 与环境变量覆盖，公开模板见 [.env.example](.env.example)。不要打印、提交或覆盖真实凭据；现有数据库日常不运行dbinit、不主动建表或迁移。

后端分层为 `router → handler → service → repository → model`；网页在 `web/`，小程序在 `miniprogram/`。运行与本机制作均查MySQL，数据库故障不回退JSON；`content/books/` 仅为本机历史备份。

## 物料与部署

Codex负责逐本选材、入库、图片和双语配音制作、校验与单书打包。用户上传 `web/assets/books/书ID.tar.gz` 到 `/root/www/pic/assets/books/` 并解压，当前远程验收由人工完成。具体命令见 [操作手册](docs/operations.md)。

素材域名为 `https://img.xuninfo.top/pic`，数据库保存 `/assets/…` 相对路径，API通过 `ASSET_BASE_URL` 添加前缀。素材不随Git部署，内容更新刷新即可；服务器代码由用户通过 `bash deploy.sh` 更新，小程序客户端单独编译发布。

## 微信小程序

在项目根目录执行 `npm run setup:mini`，再用微信开发者工具导入 `miniprogram/`。接口为 `https://pic.xuninfo.top`，AppSecret只留后端。游客可阅读；账号收藏、已读与推荐需要已有五张读者表及后端 `MINI_PROGRAM_ENABLED` 开关，详见 [操作手册](docs/operations.md#微信小程序配置)。

网页版收藏、历史与设置保存在当前浏览器；小程序账号功能不接入PC，不保存阅读进度。书库与主题通过API读取，不在客户端维护书单。

## 检查

```sh
make test
npm run check
npm run test:flows
npm run test:reader
npm run test:layout
npm run test:mini
npm run test:mini:layout
```

前端DOM与浏览器检查使用 `package.json` 的开发依赖。`make test` 在Python失败处停止，JS需单独执行。已知缺失schema文件及外键断言问题见 [验收记录](docs/acceptance.md)，不要为消除测试失败擅改运营数据库。

## 文档

- [操作手册](docs/operations.md)：物料制作、选材、上传、时间字段及小程序维护。
- [验收记录](docs/acceptance.md)：实际检查结果、历史交付及未验证范围。
- [测试资料说明](tests/fixtures/README.md)：离线夹具用途及自动刷新方式。

本机Codex约定保存在被Git忽略的 `AGENTS.md`。书目数量和状态以实时查库为准，不在说明文档重复维护清单。
