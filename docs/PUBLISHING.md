# 发布与开源流程

拥有者已授权将 `iduoduo1002/research-radar` 改为公开并开源。**0.4.4 为首次 Apache-2.0 开源桌面测试版**；仍使用 pre-release 标记，尚未提交 Obsidian 社区市场。公开与远端发布是否完成，以 GitHub 实际回读为准。

## 1. 发布内容与许可

源码包含 src、tests、构建/打包脚本、依赖锁定和项目文档。backups、test-vault、evidence、node_modules、个人 data.json 和 .env 不进入 Git；四个本地未跟踪的实机脚本不随本次提交。图片使用隔离测试库通用示例，原始私人证据留本地。

根目录 [LICENSE](../LICENSE) 为 Apache-2.0 正式原文；[NOTICE](../NOTICE) 保留项目署名，[RIGHTS](../RIGHTS.md) 解释授权范围与边界，第三方 MIT 许可单独完整保留。版本与原始附件不可静默替换：0.4.2、0.4.3 保留历史授权，新用户下载最新的 0.4.6 开源测试版。

标签必须与 manifest.version 一致，当前 0.4.6 不带 v 前缀。Release 附 main.js、manifest.json、styles.css、安装 ZIP 和 SHA256。ZIP 包含完整文档与许可；程序头部也携带项目与第三方许可，以支持市场三文件安装形式。

## 2. 发布检查

- 备份并验证 Git bundle 及逐文件校验；审查将被公开的全部 Git 历史、截图、Release 附件、Issues 和 Actions 日志，不只检查当前目录。
- npm test 和 npm run package 通过，检查非空文档、链接、版本、ZIP CRC、白名单和 SHA256。
- 推送源码与版本标签，等待对应提交 CI，通过后上传新版本附件并核对下载摘要。
- 按拥有者授权切换为 public，使用不带认证的访问确认仓库、LICENSE 和下载地址可访问；核对 GitHub 识别为 Apache-2.0。
- 公开后别人可下载和 fork；改回私有不能追回已公开副本，也不能撤销已经有效授出的开源许可。

Actions 在 push/pull_request 执行 npm ci、npm test 和 npm run package，仅请求 contents:read；远端具体状态以运行记录为准。CI 与本地测试不代替独立安全审计、全部翻译服务或跨平台实机验收。

## 3. 社区插件目录提交

当前官方入口是 [Obsidian Community](https://community.obsidian.md/account/plugins)，不再按旧文档向 community-plugins.json 提 PR。先发布0.4.6及匹配版本的三文件附件，再登录Obsidian账号、关联GitHub公开个人资料，选择 New plugin，填写 https://github.com/iduoduo1002/research-radar。提交后根据自动检查修改，再发布对应版本。

提交表单要求同意开发者政策并确认继续支持插件，或无法维护时移除/转移。提交与正式可安装是不同状态；本说明不代表已经提交或审核通过，具体状态以社区管理页为准。

minAppVersion=1.13.7、isDesktopOnly=true。根目录manifest、README、LICENSE、完整源码可公开读取。外部命令行安装器仅由用户手动执行，不被插件调用；插件不自安装/更新。网络、付费API、库外Zotero附件读取均已在README披露。Windows/Linux桌面及付费账号仍未实测。

## 4. 恢复边界

本地 backups 保留发布前源码、文档和可验证 Git bundle，不上传。Git 不能恢复未提交的个人缓存、论文、模型或任务。发布不会修改日常 Vault、Hearth 版或用户个人 data.json。
