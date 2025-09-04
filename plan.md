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