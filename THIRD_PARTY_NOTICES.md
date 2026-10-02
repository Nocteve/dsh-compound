# Compound Engineering attribution

The capture/recall workflow is adapted from Every's
[Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin),
especially `skills/ce-compound/SKILL.md`, its research references, and
`skills/ce-plan/SKILL.md`. The adaptation retains the criteria of a solved,
verified problem, durable reasoning beyond code/tests, searching related
solutions, and updating outdated experience rather than duplicating it.

Reference snapshot: `9af474a70e7f2a844338519ad9e92aafbd92d4fb`
(2026-10-02; observed via the upstream GitHub API). This is the reference
version, not a claim of full feature parity. Upstream source:
[ce-compound](https://github.com/EveryInc/compound-engineering-plugin/blob/9af474a70e7f2a844338519ad9e92aafbd92d4fb/skills/ce-compound/SKILL.md),
[ce-plan](https://github.com/EveryInc/compound-engineering-plugin/blob/9af474a70e7f2a844338519ad9e92aafbd92d4fb/skills/ce-plan/SKILL.md).

Changes: two DSH-native skills; a Cordis skill-registry bundle; a portable Node
helper for project-local records, keyword retrieval, file-change checks and
explicit replacement. The helper and bundle are new implementations. This
package does not include the upstream agent orchestration, Claude hooks,
auto-memory, concept extraction, full planning/review workflow or background
learning. It is an independent community project, not endorsed by DeepSeek,
Every or Anthropic.

Upstream license notice, preserved from the referenced project:

```text
MIT License

Copyright (c) 2025 Every

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
