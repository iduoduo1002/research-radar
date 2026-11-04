# 独立版实现边界

ResearchRadar extends RadarEngine（共享检索、阅读、翻译引擎），注册原生 ItemView、独立命令、Ribbon 和设置页；无 Hearth API、卡片路径或用户目录。

配置层：config.js 负责 schema 归一化、白名单、相对路径、简单正则校验。settings.js 是手动入口，公开 API 是 Agent 入口，两者同用 applySettings。配置写入串行化，版本号避免陈旧写入；写入失败恢复内存，上一版随状态保存。源缓存键含查询与规则摘要，过期网络响应不能写入新配置。

数据层：engine.js 封装 RSS、PubMed、Crossref、种子/引用和 Zotero；catalog.js 纯函数排序；core.js 身份、选择、缓存键、安全 URL 与队列。候选源最多400条，不宣称全量覆盖。源失败保留可读状态，重试不清空旧结果。

翻译：显式启用，手动串行批次；悬停只读缓存。暂停不硬杀进程；重启未完成批次暂停。缓存包含模型和原始文本身份。外部 requestUrl 超时无法取消已发网络请求，超时后暂停批次，避免继续堆积请求。

交接：handoff.js 仅保存 Vault 内任务及复制，不直接执行 CLI。MD供人读，JSON用于去重。配置分享和运行状态分开打包。

继承旧版自主编写的雷达功能，未复制 Hearth 插件实现。自 0.4.4 起，项目代码与文档按 Apache-2.0 授权，第三方组件保留原有许可。
