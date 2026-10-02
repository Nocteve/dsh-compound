# 验证记录

核查日期：2026-10-02。此文记录程序与 Harness 接口验证，不将它们当作 DeepSeek 模型效果实验。

## 环境

- Windows，Node.js `v22.19.0`。
- 本地已构建的 Harness `0.2.0-rc.2`，源码基线 `639ed015397290b3745d163aafe02ffee4aa3f84`。
- 本地 Harness 是现有开发工作区，含桌面端适配；不能据此声称在所有官方发行包中通过。
- 插件 `0.1.0`，无 npm 运行依赖，无安装脚本。

## 自动检查

`npm test` 覆盖：经验保存与读取、验证命令不会被执行、证据文件变化和缺失、中文匹配、长中文查询末尾关键词、项目隔离、损坏与过大记录、默认不覆盖、基于 digest 的更新冲突、并发更新、手工正文/元数据编辑的显式提示、UTF-8 BOM、祖先 junction 路径、工作区内链接限制，以及完整 CLI 流程。

Windows 普通用户没有创建文件符号链接的权限，因此相关两项测试会明确跳过；目录 junction 的检查实际运行。最终测试摘要见本文末尾。

两项 `SKILL.md` 已用 skill-creator 的 `quick_validate.py` 校验；这只验证格式，不验证触发率或任务效果。

## 真实 Harness 接口

运行 `node tests/host-integration.mjs <built-harness-checkout>` 使用当前 Harness 构建产物中的真实 Cordis Context 与 SkillRegistry，检查：

1. 注册后可列出并读取两项 Skills。
2. 模型与用户调用策略、渲染内容和 helper 资源路径正确。
3. 卸载后注册移除，重新加载不重复。

隔离 `DSH_HOME` 后使用实际 DSH CLI 安装插件，并检查 `--dump-config` 包含该 bundle 层。这不会修改用户正在使用的 profile，也不调用模型。

## 可重复演示

运行 `npm run demo` 会在插件目录的 `.demo/` 下创建独立夹具，先复现带 BOM 的 JSON 解析失败，再修复并通过三个断言。脚本把实际观察到的结果作为报告保存，随后检查中文查询命中、无关查询为空、源文件后续改变被标记为 `changed`。

这是受控工具演示，记录明确标注 synthetic/fixture 的性质；不等同于模型自行调查、选择 Skill 或跨会话正确使用经验。生成的夹具不包含在发布压缩包中。

## 尚未验证

尚未完成真实 DeepSeek 新会话任务的有/无插件对照，未测量主动触发、误召回对任务的影响、节省的时间或 token、减少的返工次数。macOS、Linux 和其他 Harness 版本也未在本次执行中验证。可按 [手工评估协议](manual-evaluation.md) 补齐；本版本不附能力提升百分比。

## 最终检查摘要

- Node 自动测试：22 项，20 通过、0 失败、2 项文件符号链接测试因 Windows 权限跳过。
- 真实 Harness SkillRegistry：加载、读取、资源路径、卸载、重新加载通过。
- 隔离 profile 的源码链接安装、实际 `.tgz` 安装及配置层检查通过；已从安装包中的代码重新执行 22 项程序测试，并以安装包路径通过真实 SkillRegistry 加载/卸载检查。
- 受控示例：修复前失败、修复后通过 3 个断言；中文召回命中，无关查询返回空，随后源文件修改标记为 `changed`。
- 两项 Skills 格式校验通过。真实模型效果尚未评测。
