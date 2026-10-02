# dsh-compound

**DeepSeek Harness 的项目经验记录与召回插件。非官方社区项目。**

把一次已经解决并验证的疑难问题，保存成下一次排查能使用的经验：为什么发生、怎么修、何时适用、验证过什么。以后遇到相关任务，检索少量记录，再对照当前代码判断是否适用。设计借鉴 [Every 的 Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)，移植范围和许可见 [来源说明](THIRD_PARTY_NOTICES.md)。

## 第一版有什么

- `dsh-compound-capture`：按用户要求记录值得保留的经验，已有记录通过内容摘要校验后更新。
- `dsh-compound-recall`：按症状、组件和关键词查找项目经验，支持中文文本匹配。
- 文件变化检查：记录相关文件的 SHA-256；召回时报告未变、已变、缺失或无法判断。
- 普通 Markdown 经验文件，保存在当前项目的 `docs/solutions/dsh-compound/`，可审阅、版本管理、编辑或删除。
- 标准 DSH bundle，可装入指定 profile。运行代码使用 Node 内置库，不需要数据库、嵌入服务或后台进程。

文件未变不代表经验仍然正确；检索分数不代表可信度。验证命令与结果是记录者提供的报告，工具不会执行它们，也不会替你证明问题已经解决。

## 安装

需要 Node.js 22.19+ 和已安装的 DeepSeek Harness。当前测试环境为 Windows、Node 22.19.0、Harness `0.2.0-rc.2`；详细测试边界见 [验证记录](docs/validation.md)。

克隆源码后运行测试并打包：

```powershell
git clone https://github.com/Nocteve/dsh-compound.git
cd dsh-compound
npm test
npm pack --ignore-scripts
```

把生成的压缩包装入你使用的 profile。下面以 `web` 为例，把路径换成实际位置：

```powershell
dsh plugin --profile web add 'C:\Downloads\dsh-compound-0.1.0.tgz'
```

也可以直接链接下载或克隆的源码目录，下面路径换成实际插件目录：

```powershell
dsh plugin --profile web add 'C:\Projects\dsh-compound'
```

关闭并重新启动该 profile 后，在技能列表中应能找到两项 `dsh-compound-*`。本包没有安装脚本、构建步骤或 Claude CLI 依赖。尚未发布到 npm，因此不要直接用包名安装，以免安装到不相关的同名包。

## 怎么用

在问题已经修复、相关检查确实通过之后，对 Harness 说：

> 用 dsh-compound-capture 记录这次问题值得复用的经验，保留根因、适用条件和实际验证结果。已有相同经验就更新，没必要写的就不要写。

在相关的新任务里说：

> 用 dsh-compound-recall 查一下这个项目有没有类似问题的解决经验。核对当前代码后再使用，指出哪些条件还需要重新验证。

模型也可以在相关排查或规划中选择 recall，但是否主动选择取决于模型；插件没有每回合强制注入或后台自动学习。capture 不会在每个任务结束后自动归档。

两项 Skills 通过 DSH 的 `ctx.skills` 注册，使用 Harness 已有的终端能力调用随包 helper。通常不需要手动运行以下命令；排查安装或脚本问题时可以直接调用：

```powershell
node bin/compound.mjs recall --workspace 'E:\my-project' --query 'Windows 进程退出' --limit 5
node bin/compound.mjs inspect --workspace 'E:\my-project' --id 'worker-exit'
node bin/compound.mjs capture --workspace 'E:\my-project' --input 'E:\my-project\draft.json'
```

草稿字段和输出含义见 [记录格式](docs/record-format.md)。`examples/verified-solution.json` 是明确标记的合成结构示例，没有发生过对应验证，不能作为真实经验直接导入。

## 数据与卸载

每个工作区只读取自己的 `docs/solutions/dsh-compound/`，不搜索用户主目录或其他项目。记录是本地文件，本 helper 不上传数据；当 Harness 模型读取记录时，其内容会进入当前会话，适用你配置的模型服务的数据处理方式。

只保存脱敏后确有价值的结论，不保存凭据或原始私密日志。路径检查拒绝符号链接，并限制记录和证据文件大小；它是可靠性措施，不是针对恶意本地进程的隔离沙箱。证据文件过大、在工作区外或不存在时会报错，具体限制见记录格式。

```powershell
dsh plugin --profile web remove dsh-compound
```

卸载移除技能；项目内已有经验仍保留。删除某条记录可以直接删除对应 Markdown 文件；修改实质结论后应重新验证并通过 capture 更新，避免记录正文与机器元数据不一致。

## 验证与参与

- `npm test`：保存、检索、变化检查与边界测试。
- `node tests/host-integration.mjs <已构建的Harness源码目录>`：使用真正的 Cordis 和 SkillRegistry 验证加载、资源路径、卸载及重新加载。
- `npm run demo`：运行受控示例并输出保存、召回、文件变化的过程；这是工具演示，不是模型能力实验。
- [模型评估协议](docs/manual-evaluation.md)：新会话对照、陈旧经验和误召回负例，尚无模型效果提升结论。
- [受控演示输出](docs/demo-transcript.md)：程序实际运行结果；不包含真实模型评估。

当前没有完整迁移 CE 的规划、审查、多代理编排与自动记忆。后续优先收集安装失败、重复记录、误召回、漏召回和陈旧经验案例，再决定是否扩展。
