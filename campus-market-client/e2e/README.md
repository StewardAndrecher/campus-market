# 浏览器端到端验收

这组测试使用 Node.js 22 自带的 WebSocket 和 Chrome DevTools Protocol（CDP）驱动本机 Chromium，读取**真实 H5 构建产物**并访问本地后端，覆盖首页、注册、登录、发布商品和 390px 移动布局。它不需要 npm 第三方依赖；不是普通 Node 逻辑测试，也不代表微信小程序或原生 App 真机验收。

## 准备

1. 按 `docs/GETTING_STARTED.md` 启动 MySQL、两个 Redis 和后端；完整消息链路可同时启动 RabbitMQ。
2. 在 `campus-market-client` 执行 `sh tools/build.sh h5`。
3. 准备 Node.js 22+ 和 Chromium / Google Chrome；如未安装到常见路径，设置 `CHROME_BIN` 为可执行文件。
4. 确认后端允许本地页面来源，默认地址为 `http://localhost:8080`。

测试会创建随机账号和以 `E2E` 开头的商品，**只能在可丢弃的本地开发库运行，禁止指向生产数据库**。

## 执行

```sh
cd campus-market-client/e2e
npm test
```

脚本自动使用随机空闲端口启动静态 H5 服务和隔离的 Chromium 用户目录，结束后清理。失败时保留 `test-results/failure.png`、页面文本和 `summary.json`；这些产物不提交 Git。测试数据保留在本地开发库，便于复核，不应混入演示截图。

云端 CI 没有 HBuilderX 编译器和项目后端中间件，因此本组检查在本机发布流程执行，不能用云端 Java/Node 测试代替。若后续网络与依赖可用，可再迁移到 Playwright，以获得更多浏览器和自动等待能力；当前记录只宣称本机 Chromium 验收。
