# 内容数据约定

`words.js` 和 `grammar.js` 仍然是当前的内容源文件，`content.js` 会把它们规范化为统一的内容项。

## 共同字段

每个规范化内容项都包含：

- `schemaVersion`
- `id`
- `type`：`word` 或 `grammar`
- `level`
- `levelSource`：等级依据，例如教材、备考资料或项目原有标注
- `verificationStatus`：内容核验状态，支持 `已核验`、`待核验`、`未通过`
- `themes`：词汇可关联多个生活主题
- `functions`：语法功能标签，可关联多个功能
- `order`
- `tags`
- `category`：内容主题分类
- `directory`：按等级、类型、词性和主题生成的目录路径
- `title`
- `examples`：`[{ ja, zh, audio }]`
- `exercises`：题目数组

词汇保留 `word`、`kana`、`meaning`、`pos`；语法保留 `structure`、`explanation`、`usage`、`notes`。

## 兼容规则

- 词汇可以使用旧的 `example` / `exampleZh`，规范化层会转成 `examples`。
- 语法可以使用旧的 `questions`，规范化层会转成 `exercises`。
- 新内容可以直接提供 `examples` / `exercises`，规范化层会优先使用它们。
- `id` 必须稳定且唯一，已存在的 `w01`、`g01` 以及题目 ID 不可重命名，否则会丢失学习进度。
- JLPT `level` 只允许 `N5`、`N4`、`N3`、`N2`、`N1` 或 `待核验`；无法确认时使用 `待核验`，不要默认猜测等级。
- 词汇的 `themes` 和语法的 `functions` 是附加分类，不替代原有 `category`、`pos` 或学习记录字段。
- 当前等级是内容层备考标注，不是官方完整必考词汇清单。
- 新内容必须明确 `levelSource` 和 `verificationStatus`；没有可靠依据时不要伪造等级或核验状态。
- `directory` 由 `content.js` 统一生成，例如 `N5/词汇/名词/人物与称谓`、`N5/语法/指示词`。
- 新增内容后运行 `node work/check-content.js`，检查 ID、必填字段、题目答案和音频覆盖。
