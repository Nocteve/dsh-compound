# 受控工具演示输出

运行日期：2026-10-02。环境：Windows / Node.js 22.19.0。

以下是实际运行 `node scripts/demo.mjs` 的结果，仅去除了本机工作区绝对路径。脚本先复现受控夹具的解析错误，再修复并通过检查，随后保存经验、检索并检测后续文件变化。这是程序行为演示，不是真实 DeepSeek 模型任务评估。

```json
{
  "kind": "controlled-helper-demo",
  "modelUsed": false,
  "beforeFixExitCode": 1,
  "afterFixExitCode": 0,
  "observedVerification": "PASS: ordinary JSON, BOM-prefixed JSON, malformed JSON (3 assertions)",
  "captured": "docs/solutions/dsh-compound/fixture-windows-json-bom.md",
  "chineseQueryMatched": [
    "fixture-windows-json-bom"
  ],
  "initialEvidenceStatus": "unchanged",
  "unrelatedQueryCount": 0,
  "afterSourceEdit": {
    "evidenceStatus": "changed",
    "changedFiles": [
      "src/settings.mjs"
    ]
  }
}
```

可以在源码目录运行 `npm run demo` 重现；临时夹具会生成在本地 `.demo/` 目录。
