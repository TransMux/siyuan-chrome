# folo网页版收藏操作监听功能实现计划

## 功能需求分析

需要为SiYuan Chrome扩展添加一个新功能：监听folo网页版的收藏操作，并自动将收藏的文章进行剪藏。

### 核心流程：
1. 用户在扩展设置中开启"folo收藏操作监听"
2. 当用户在folo.is网站进行收藏操作时，扩展拦截收藏请求
3. 从请求中提取entryId
4. 使用entryId调用folo API获取文章详情
5. 将文章内容自动剪藏到SiYuan

## 技术方案

### 1. 配置界面修改
- 在options.html中添加"监听folo收藏操作"的开关
- 在popup.js中处理该配置的读取和保存

### 2. 网络请求拦截
- 修改manifest.json，添加必要的权限（declarativeNetRequest或webRequest）
- 在background.js中添加请求拦截逻辑，监听对`https://api.folo.is/collections`的POST请求
- 从请求body中提取entryId

### 3. 文章详情获取
- 实现调用`https://api.folo.is/entries?id={entryId}`的功能
- 需要保持原始页面的cookie以确保请求成功
- 解析返回的JSON数据，提取title、url、author、content

### 4. 剪藏集成
- 复用现有的剪藏功能，将folo文章数据转换为剪藏格式
- 调用现有的剪藏API完成文章保存

## 实现步骤

### Step 1: 添加配置选项 - Done
- [x] 修改options.html，添加folo监听开关
- [x] 修改popup.js，添加配置项的处理逻辑  
- [x] 更新本地化文件，添加相关文本

### Step 2: 修改manifest权限 - Done
- [x] 在manifest.json中添加webRequest权限
- [x] 添加对api.folo.is的host权限

### Step 3: 实现请求拦截 - Done
- [x] 在background.js中添加网络请求拦截逻辑
- [x] 监听POST请求到https://api.folo.is/collections
- [x] 提取请求body中的entryId

### Step 4: 实现文章详情获取 - Done
- [x] 实现调用folo entries API的功能
- [x] 处理API响应数据解析
- [x] 提取文章的title、url、author、content等信息

### Step 5: 集成剪藏功能 - Done
- [x] 将folo文章数据转换为剪藏所需的格式
- [x] 调用现有的剪藏功能完成保存

### Step 6: 测试和调试 - Done
- [x] 测试配置开关功能
- [x] 实现attributeViews数据库集成
- [x] 添加不刷新页面的控制参数
- [x] 完善错误处理和参数传递

### 最新改进
- [x] 添加attributeViews参数，支持数据库字段自动填充：
  - 链接列：自动填入文章URL
  - 来源列：标记为"RSS"
  - 作者列：填入文章作者信息
  - 关联列：预留空数组
- [x] 添加noReload参数控制，folo剪藏不会刷新页面
- [x] 通过window.__siyuanFoloExtraParams传递额外参数

## 技术难点

1. **请求拦截**：需要正确配置manifest权限和拦截规则
2. **Cookie处理**：获取文章详情时需要保持登录状态
3. **数据格式转换**：将folo API返回的数据转换为SiYuan剪藏格式
4. **错误处理**：处理网络请求失败、API返回错误等异常情况

## 风险评估

- **低风险**：配置界面修改、本地化文本
- **中风险**：请求拦截实现、数据格式转换
- **高风险**：Cookie处理、跨域请求处理

## 完成标准

1. 用户可以在设置中开启/关闭folo监听功能
2. 当功能开启时，用户在folo.is收藏文章会自动触发剪藏
3. 剪藏的内容包含完整的文章标题、链接、作者、内容
4. 功能不影响扩展的其他功能正常使用

---

# Bug修复：Folo剪藏连接错误问题

## 问题分析

通过分析日志和代码，发现了以下问题：

1. **主要问题：keepAlive消息监听器缺失**
   - `background.js:11` 每30秒发送 `keepAlive` 消息
   - 但是 `background.js:480` 的消息监听器只处理 `upload-copy` 消息
   - 导致 "Could not establish connection. Receiving end does not exist" 错误

2. **次要问题：注入脚本中调用未定义函数**
   - `clipFoloArticle` 函数在页面上下文中注入脚本
   - 注入的脚本尝试调用 `siyuanSendUpload` 函数
   - 但此函数定义在 `content.js:1027`，不在注入脚本的作用域内

## 需要检查和确认的代码文件

- [x] `background.js:11` - keepAlive消息发送逻辑
- [x] `background.js:480` - 消息监听器实现
- [x] `background.js:258` - clipFoloArticle中的siyuanSendUpload调用
- [x] `content.js:1027` - siyuanSendUpload函数定义
- [x] `content.js:2` - content script消息监听器

## 修复计划

### 1. 修复keepAlive消息监听器
- 在background.js的onMessage监听器中添加对keepAlive消息的处理
- 或者移除不必要的keepAlive发送逻辑

### 2. 修复Folo剪藏中的siyuanSendUpload调用
- 将注入脚本中的直接函数调用改为通过消息传递机制
- 让注入脚本发送消息给content script，由content script调用siyuanSendUpload

### 3. 测试验证
- 测试keepAlive错误是否解决
- 测试Folo剪藏功能是否正常工作
- 验证不影响现有的剪藏功能

## 具体实施步骤

1. **修复keepAlive消息处理**
   - 在 `background.js` 的 `chrome.runtime.onMessage.addListener` 中添加keepAlive处理

2. **重构Folo剪藏逻辑**
   - 修改 `clipFoloArticle` 函数，使用消息传递而非直接调用
   - 在content.js中添加处理Folo剪藏的消息监听器

3. **测试和验证**
   - 加载扩展并测试Folo剪藏功能
   - 检查控制台是否还有连接错误

## 预期结果

- 消除 "Could not establish connection" 错误
- Folo剪藏功能正常工作
- 不影响现有功能

---

# Chrome 扩展 webRequest 权限错误修复计划

## 问题分析

当前 Chrome 扩展出现以下错误：
```
Unchecked runtime.lastError: You do not have permission to use blocking webRequest listeners. Be sure to declare the webRequestBlocking permission in your manifest. Note that webRequestBlocking is only allowed for extensions that are installed using ExtensionInstallForcelist.
```

## 根本原因

1. **Manifest V3 限制**：Chrome 扩展已使用 Manifest V3，但代码中仍在使用 Manifest V2 的 `webRequest` API 的阻塞模式
2. **权限问题**：`webRequestBlocking` 权限在 Manifest V3 中被限制，只允许企业策略安装的扩展使用
3. **API 冲突**：代码同时使用了 `webRequest` 和 `declarativeNetRequest`，但主要依赖已被限制的 `webRequest` 阻塞模式

## 解决方案计划

### 第一步：移除不兼容的 webRequest 阻塞监听器
- [ ] 删除 `chrome.webRequest.onBeforeRequest.addListener` 中的 `["requestBody", "blocking"]` 参数
- [ ] 移除 `handleFoloRequest` 函数中返回 `{ cancel: true }` 的阻塞逻辑
- [ ] 清理相关的 webRequest 监听器添加/移除代码

### 第二步：完全迁移到 declarativeNetRequest API
- [ ] 优化现有的 `declarativeNetRequest` 规则配置
- [ ] 实现基于 `declarativeNetRequest` 的请求拦截逻辑
- [ ] 使用 `chrome.webRequest.onBeforeRequest`（非阻塞模式）来获取请求体内容

### 第三步：重构 Folo 监听机制
- [ ] 分离请求拦截和数据提取逻辑
- [ ] 使用非阻塞的 webRequest 监听器获取 entryId
- [ ] 通过 declarativeNetRequest 阻塞原始请求到 folo.is
- [ ] 确保数据提取和处理流程正常工作

### 第四步：测试和验证
- [ ] 测试 Folo 收藏拦截功能是否正常
- [ ] 验证不再出现权限错误
- [ ] 确认扩展的其他功能不受影响

### 第五步：清理和优化
- [ ] 移除不必要的 manifest 权限声明
- [ ] 优化代码结构和错误处理
- [ ] 添加适当的日志和调试信息

## 技术要点

1. **Manifest V3 兼容性**：确保所有 API 使用都符合 Manifest V3 规范
2. **非阻塞设计**：改为使用非阻塞的事件监听和异步处理
3. **权限最小化**：只使用必要的权限，移除受限权限
4. **错误处理**：添加适当的错误处理和用户反馈机制

## 预期结果

- 消除 webRequest 权限错误
- 保持 Folo 自动剪藏功能正常工作
- 扩展能在所有用户环境中正常运行，不依赖企业策略
- 代码更加符合 Chrome 扩展最佳实践