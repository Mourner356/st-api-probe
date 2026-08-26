# ST API Probe

SillyTavern 内部 API 只读探测工具。用于确认扩展开发所需的模块、事件、
设置对象是否可用及其结构，避免盲猜 API 导致的开发返工。

## 它做什么

- 尝试导入 script.js / extensions.js / tokenizers.js / openai.js /
  world-info.js / power-user.js，逐个报告成功与失败
- 列出完整 `event_types` 事件表
- 探测 `extension_settings`、`oai_settings`、`world_info` 的结构
- 实测 tokenizer 函数是否可调用、返回同步值还是 Promise
- 挂载 prompt / generation / world-info 相关事件，捕获首次 payload 结构

## 它不做什么

- 不修改任何设置
- 不向聊天区插入元素
- 不干预生成流程
- 所有导入均为动态导入并捕获异常，单个失败不影响其余

## 使用

1. 安装后刷新页面
2. 展开扩展面板的「API 探针」
3. 发一条消息，让事件捕获生效
4. 点「复制完整报告」

用完可直接卸载。

## 版本

0.1.0 — 初版
