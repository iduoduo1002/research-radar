# 发布与开源计划

当前目标：`iduoduo1002/research-radar`私有仓库，0.4.2桌面测试版。**本阶段不改成公开，不提交插件市场。** 未来公开与开源许可证由拥有者另行批准，不能把“先私有，再开源”的路线设想当成已经完成的开源授权。

## 1. 私有阶段

源码仅包含src、tests、必要构建/打包脚本、依赖锁定和项目文档；backups、test-vault、evidence、node_modules、个人data.json和.env不进入Git。图片仅使用隔离测试库的通用示例；原始证据保留本地。公开仓库或私有仓库均不得上传凭据。

Release标签使用与manifest.version完全一致的`0.4.2`，不用v前缀。附`main.js`、`manifest.json`、`styles.css`、安装ZIP与SHA256；README与完整文档位于源码和ZIP。Release标为pre-release，只有有私有仓库访问权限的用户可下载，不会因此对所有人开放。

LICENSE暂为权利保留声明，package.json为UNLICENSED；第三方MIT等许可保留。版权范围与开源选项见[RIGHTS](../RIGHTS.md)。不自动邀请协作者，不自动接受外部代码授权。

自动检查配置暂存`.github/ci-template.yml`。当前GitHub登录授权缺少workflow权限，因此没有激活Actions，也没有远端CI验收。维护者日后用具备相应权限的方式，将模板放入`.github/workflows/`后再验证；本地可运行同样的npm命令。

## 2. 转公开之前

- 由拥有者确认版权主体、单位/合作权利、AI辅助与第三方来源，以及未来贡献授权。
- 选定正式许可证并替换临时LICENSE。单纯改仓库可见性不会自动赋予开源许可。保留已许可第三方组件原条款。
- 复核全部Git历史、附件、截图、Issues、Actions日志与授权范围，排除个人研究资料、密钥、旧备份与本机路径。
- 根据实际代码和新增功能再次运行测试，检查安装/升级、内置帮助、离线/错误状态与翻译手动触发。补充真实的Windows/Linux运行证据后再扩大平台声明。
- 固定版本、附件和对应源码；受邀测试者反馈一轮后，再明确批准将GitHub仓库改为公开。

## 3. 社区插件目录（后续独立步骤）

按[官方提交说明](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)核对最新规则：可访问源码、根目录README/LICENSE/manifest、唯一插件ID、网络/付费/账号/外部文件访问披露，以及版本完全匹配的Release附件。通过Obsidian社区目录账号关联GitHub后提交；平台审核结果才代表上架，自动测试通过不等于审核通过。

当前`minAppVersion=1.13.7`取已实测版本，不声称这是理论最早可运行版本；SecretStorage等功能需对应运行环境。isDesktopOnly保持true。后续更新维护versions.json；不要在未经验证时把最低版本降低。

## 4. 可恢复范围

本地改动前的逐文件校验备份保存在backups（不上传）；Git提交和远端私有仓库可恢复代码、文档与版本标签，不能恢复未上传的个人缓存/模型/论文全文。私有仓库不等于这些数据的备份。若以后公开，下载或fork出去的内容无法仅靠改回私有追回。
