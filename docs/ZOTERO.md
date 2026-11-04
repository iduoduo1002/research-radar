# Zotero联动与Agent配置

适用版本：Research Radar 0.4.7 桌面测试版。此功能只读本机Zotero个人文库，不需要Web API Key，不下载全文，也不修改Zotero。默认关闭；主题方案不会携带或启用它。

## 1. 标题颜色的准确含义

| 标记 | 表示什么 | 不代表什么 |
|---|---|---|
| 原色 | 开启联动并成功核对后，当前文献未匹配本机个人库 | 关闭联动、尚未检查或断线时，不能据原色认定未收录 |
| 红色 | 已匹配条目，并发现可读取的本地论文PDF | 不保证PDF正文完整、版本正确或已经阅读全文 |
| 绿色 | 已匹配条目，但未发现可读取的本地论文PDF | 不证明出版社没有全文；云端尚未同步的PDF也可能未被发现 |
| 琥珀色 / ? | 连接、身份或PDF状态尚待核验 | 不归为未收录或“确定无PDF” |

列表提供紧凑文字图例；标题和序号着色，勾号悬停说明匹配依据和附件状态。优先DOI匹配，缺DOI时按严格书目信息匹配；不同版本、不同文库和不完整元数据可能未命中。补充材料和网页快照不作为论文PDF。仅支持个人文库，暂不支持群组库/云端API。

## 点击状态筛选（0.4.7）

点击列表顶部的「原色 未匹配」「红 有PDF」「绿 无本地PDF」或「? 待核」，只显示对应论文，再次点击同一标签恢复全部。每个标签显示当前关键词范围内的实际篇数，选中时有边框，支持键盘聚焦及回车/空格操作。

- 与关键词筛选叠加，切换主题、期刊或浏览范围时继续应用当前状态筛选；关闭面板后不保存筛选状态。
- 「全选当前列表」只选择可见论文；此前勾选的其他论文保留，批量操作仍处理全部已选论文。
- 切换标签只在本地筛选，不刷新论文、不请求翻译、不额外访问Zotero。正常核对和用户点击「Zotero ↻」仍按既有机制运行。
- 核对中、断线或附件状态未知均归「待核」，不会归为未匹配或无PDF；核对完成后自动更新。没有匹配结果会显示取消筛选/等待核对提示。关闭Zotero联动会取消状态筛选。
- `checkZoteroConnection()` 的面板计数对应当前可见论文；文库总条目数不受筛选影响。

## 2. 手动配置

1. 打开Zotero桌面应用。在“设置 → 高级”中找到并启用“允许此计算机上的其他应用程序与Zotero通信”（Allow other applications on this computer to communicate with Zotero）；不同版本位置/文字可能不同，按当前界面核对。无需关闭系统防火墙、浏览器安全策略或开放远程服务。
2. Obsidian设置 → Research Radar → 本机Zotero与收件箱：开启“Zotero本机收录标记”，端口默认23119，点击顶部“保存设置”。插件固定访问127.0.0.1，不填Zotero数据目录，不设置公网IP。
3. 打开Research Radar，点击列表顶部“Zotero ↻”。首次核对读取个人库顶层元数据，并仅对匹配条目核对附件；较大库需要等待。悬停标题只读已存译文，不启动翻译。
4. 查看红/绿/原色/待核状态。新下载PDF或新增条目后再次点击“Zotero ↻”，会强制更新标记，避免继续显示5分钟缓存。

正常缓存5分钟；已启用且可见的面板在窗口重新获得焦点或每60秒尝试恢复。隐藏/停用面板不自动恢复。关闭联动后不再开始核对；已发请求可能完成。PDF附件检查可能读取库外本地文件的开头，但不修改文件、不上传内容。

## 3. 一键取得Agent配置Prompt

路径一：设置 → Research Radar → **Agent配置Zotero联动 → Zotero联动配置Prompt**。

路径二：命令面板 → **Research Radar: Zotero联动配置Prompt**。

弹窗生成当前库名与已保存本机端口的完整提示词，可先审阅，再点“复制Zotero配置Prompt”粘贴给已配置的Codex、Claude或其他Agent。只复制不会启用联动、启动Agent、下载全文或访问文库。提示词不含API Key、研究背景、整库配置或个人文献。

模板限定：确认目标库 → 核对Zotero本机API → 仅预览开关/端口 → 使用原revision保存 → 回读 → 查看当前列表与颜色计数。Agent没有Obsidian CLI或eval时使用手动步骤，不直接修改运行中的data.json。Zotero偏好开关需用户在其界面开启；不能绕过为改SQLite/偏好文件。

## 4. Agent公开接口（0.4.3）

以下JavaScript只在已授权的目标库中运行。先通过app.vault.getName()确认库名，再获取插件；不要把未经转义的库名/端口拼成shell命令。

```js
const p = app.plugins.plugins['research-radar'];
const before = p.getZoteroConfiguration();
// 返回仅含revision和Zotero配置，不含翻译密钥引用/研究背景
const preview = p.previewZoteroConfiguration({enabled:true,port:23119});
// 核对范围后，沿用同一revision
await p.applyZoteroConfiguration(preview.configuration, {expectedRevision:preview.revision});
const after = p.getZoteroConfiguration();
await p.openRadar();
const verification = await p.checkZoteroConnection();
```

preview无副作用；apply只接受enabled布尔值和1024–65535整数port，不接受远程地址/密钥/其他插件设置。使用统一保存机制、版本冲突检查和失败回滚；翻译运行时拒绝配置，不自行中断。主题、翻译、收件箱和Prompt不变。接口是有权限的约定，不是独立Agent沙箱，不能限制一个已拥有完整本机权限的Agent。

check只在已启用后访问本机个人库，复用正常缓存；返回连接、条目总数和已打开面板的pdf/noPdf/unknown/unmatched计数，不返回整库记录、密钥或原始文件路径。未打开面板时panels为空，不代表所有论文未收录。connected=true只证明元数据可访问，仍须查看unknown和各面板结果。需要强制更新时使用面板“Zotero ↻”。

配置保存成功≠连接成功≠取得PDF。验证失败保留具体状态，不为演示凑红绿样例而写文库。

## 5. 全文获取与颜色刷新

**本插件不下载全文、不写Zotero。** 若用户另外授权论文处理，使用论文“交给智能体”的执行Prompt，由接收Agent通过其已有工具查重、合法获取PDF并归入明确匹配的既有分类。先读取该环境中Zotero工具/Skill说明，不假设装有特定CLI或服务。

处理完须核验真实条目与附件（条目ID、附件类型、本地可读文件，必要时阅读核对版本），再在雷达点“Zotero ↻”。仅保存DOI条目、拿到出版社链接或完成下载按钮点击，都不能报告“全文已取得”。此时颜色可能由原色→绿色→红色，但以实时核对为准，不由Agent手动写入颜色。

下载需登录、访问受限或无合法来源时保留PARTIAL/待人工获取；不绕过付费墙，不用网页快照充当全文。论文的创新/局限根据实际阅读深度分别陈述。

## 6. 排障

| 现象 | 检查与最小处理 |
|---|---|
| 没有颜色、没有Zotero按钮 | 默认关闭，检查开关并保存；主题profile不会代替开启本机集成 |
| 全部? / ECONNREFUSED | 打开Zotero、允许本机通信、核对端口，再点“Zotero 重试” |
| 库里明明有，仍未匹配 | 确认是个人库、条目DOI/标题/发表信息一致；群组和预印本/正式版不能强行合并 |
| 绿色但云端有PDF | 确认PDF已同步到本机且可打开；仅链接附件、缺失文件/补充材料不满足红色条件 |
| 新下载后仍绿色 | 点击“Zotero ↻”强制刷新；自动缓存并非即时订阅Zotero事件 |
| 已保存但check失败 | 分别报告配置成功与连接失败；不要删除/重建条目或修改数据库来解决接口问题 |
| Agent提示无0.4.3接口 | 升级或走手动设置，不用主题applyProfile替代本机集成授权 |

仅在当前授权会话内使用书目身份和计数；反馈截图脱敏，不提交data.json、Zotero数据库、论文PDF或密钥。详细边界见[安全说明](SECURITY.md)与[Agent指南](../AGENT.md)。
