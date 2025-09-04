# 功能需求

需要这个拓展添加一个设置开关：监听folo收藏操作

## 实现进度

### 已完成功能
1. ✅ 在扩展设置中添加了"启用folo收藏操作监听"开关
2. ✅ 修改了manifest.json，添加了webRequest权限和对api.folo.is的host权限
3. ✅ 在background.js中实现了网络请求拦截逻辑，监听对`https://api.folo.is/collections`的POST请求
4. ✅ 实现了从请求body中提取entryId的功能
5. ✅ 实现了调用`https://api.folo.is/entries?id={entryId}`获取文章详情的功能
6. ✅ 实现了将folo文章数据转换为剪藏格式并调用现有剪藏功能的逻辑
7. ✅ 添加了中英文本地化支持
8. ✅ 集成数据库attributeViews参数，自动填充数据库字段
9. ✅ 添加noReload控制参数，剪藏后不刷新页面
10. ✅ 完全拦截folo收藏请求，阻止发送到folo服务器
11. ✅ 集成Global Overlay日志系统，支持openSiYuan操作链接

### 技术实现细节
- **权限配置**: 使用webRequest权限拦截网络请求，添加对api.folo.is的host权限
- **请求拦截**: 在background.js中监听POST请求到https://api.folo.is/collections，从requestBody中提取entryId
- **文章获取**: 在页面上下文中调用folo API获取文章详情，保持cookie状态
- **剪藏集成**: 将folo文章数据转换为临时DOM元素，调用现有的siyuanSendUpload函数完成剪藏
- **数据库集成**: 通过attributeViews参数自动填充数据库字段：
  - 链接列(20250209201903-a01feo9)：文章URL
  - 来源列(20250209201845-at8lrm2)：标记为"RSS"
  - 作者列(20250904212513-5wb92lu)：文章作者
  - 关联列(20250830154540-udvlq8y)：空数组
- **用户体验**: 添加noReload控制，剪藏完成后不刷新页面
- **请求拦截**: 使用declarativeNetRequest完全拦截folo收藏请求，阻止发送到folo服务器
  - webRequest监听请求内容，提取entryId
  - declarativeNetRequest阻止请求发送到folo服务器
- **日志集成**: 集成Global Overlay日志系统，实时显示剪藏状态和结果
  - 发送剪藏开始、成功、失败等状态日志
  - 支持openSiYuan操作链接，可直接打开剪藏的文档
  - 区分普通剪藏和Folo自动剪藏的日志来源

### 待测试功能
- [ ] 端到端测试：在folo.is网站进行收藏操作，验证自动剪藏功能
- [ ] 错误处理测试：验证网络异常、API错误等情况的处理

## 使用方法
1. 打开扩展设置页面
2. 启用"启用folo收藏操作监听"选项
3. 确保已配置SiYuan的API token和保存路径
4. （可选）启动Global Overlay应用以接收剪藏日志
5. 在folo.is网站进行收藏操作时，文章会自动剪藏到SiYuan

## Global Overlay日志功能
如果安装了Global Overlay应用，扩展会自动发送剪藏日志：

### 日志类型
- **INFO**: 开始剪藏Folo文章
- **SUCCESS**: 剪藏成功，包含可点击的文档链接
- **ERROR**: 剪藏失败或文章获取失败

### 示例日志
```
[SUCCESS] Folo文章剪藏成功：《技术文章标题》 [打开文档](#openSiYuan(20250104123456-abcd1234))
[ERROR] Folo文章获取失败：entryId=12345
[INFO] 开始剪藏Folo文章：《文章标题》
```

### 操作链接
- 点击日志中的`[打开文档]`链接可直接在SiYuan中打开剪藏的文档
- Global Overlay需要运行在localhost:53431端口

如果开启，那么拦截以下请求：

```
fetch("https://api.folo.is/collections", {
  "headers": {
    "accept": "application/json",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "cache-control": "no-store",
    "content-type": "application/json",
    "priority": "u=1, i",
    "sec-ch-ua": "\"Not;A=Brand\";v=\"99\", \"Google Chrome\";v=\"139\", \"Chromium\";v=\"139\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "sec-gpc": "1",
    "sentry-trace": "84b17aed04e943418034d38bf27a54db-bfce251e556394a5-1",
    "x-app-name": "Folo Web",
    "x-app-platform": "desktop/web",
    "x-app-version": "0.7.0",
    "x-client-id": "9rrTC2S6YuVC8p8algyEU",
    "x-session-id": "kSFZRTbPbsJnCDfhRpQYe"
  },
  "body": "{\"entryId\":\"186407961908273152\",\"view\":0}",
  "method": "POST",
  "mode": "cors",
  "credentials": "include"
});
```

获取其中的entryId，然后通过下面的API获取文章title，url，author和content（注意，需要让页面发送，需要带cookie）：

```
curl 'https://api.folo.is/entries?id=186378149420966912' \
  -H 'accept: */*' \
  -H 'accept-language: zh-CN,zh;q=0.9,en;q=0.8' \
  -H 'baggage: sentry-environment=stable,sentry-release=b849d51159036fa843b3db479ff8daa8f1551189,sentry-public_key=e5bccf7428aa4e881ed5cb713fdff181,sentry-trace_id=84b17aed04e943418034d38bf27a54db,sentry-org_id=4507542488023040,sentry-sampled=true,sentry-sample_rand=0.6114532479620488,sentry-sample_rate=1' \
  -H 'cache-control: no-store' \
  -b '__Secure-better-auth.session_token=JiM2Qywon4UBJcRUEkXE5mwxVOHbDocX.Vza75jicSF2O2gSGPQW94WmVSdz3%2BN8miwznYq0gUzg%3D; ph_phc_EZGEvBt830JgBHTiwpHqJAEbWnbv63m5UpreojwEWNL_posthog=%7B%22distinct_id%22%3A%22131711898217439232%22%2C%22%24sesid%22%3A%5B1756992078461%2C%22019914da-1a4c-7f23-9be5-2ab52ba01d76%22%2C1756991461964%5D%2C%22%24epp%22%3Atrue%2C%22%24initial_person_info%22%3A%7B%22r%22%3A%22%24direct%22%2C%22u%22%3A%22https%3A%2F%2Fapp.folo.is%2Ftimeline%2Fview-0%2Fall%2Fpending%22%7D%7D' \
  -H 'dnt: 1' \
  -H 'origin: https://app.folo.is' \
  -H 'priority: u=1, i' \
  -H 'sec-ch-ua: "Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "Windows"' \
  -H 'sec-fetch-dest: empty' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-site: same-site' \
  -H 'sec-gpc: 1' \
  -H 'sentry-trace: 84b17aed04e943418034d38bf27a54db-ba6982b5368524cc-1' \
  -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36' \
  -H 'x-app-name: Folo Web' \
  -H 'x-app-platform: desktop/web' \
  -H 'x-app-version: 0.7.0' \
  -H 'x-client-id: 9rrTC2S6YuVC8p8algyEU' \
  -H 'x-session-id: kSFZRTbPbsJnCDfhRpQYe'
```

这个API返回值：

```
{
    "code": 0,
    "data": {
        "feeds": {
            "type": "feed",
            "id": "148722657631904810",
            "url": "rsshub://zhihu/people/activities/ChenWenhong",
            "title": "队长的知乎动态",
            "description": "公众号：面向数据编程 - Powered by RSSHub",
            "siteUrl": "https://www.zhihu.com/people/ChenWenhong/activities",
            "image": "https://picx.zhimg.com/v2-42e3f6120ebe552386373eb30d194a71_l.jpg?source=5a24d060&needBackground=1",
            "errorMessage": null,
            "errorAt": null,
            "ownerUserId": null,
            "tipUsers": []
        },
        "entries": {
            "id": "186417676135289856",
            "title": "队长赞同了回答: 2025年9月3号的中国阅兵，展示了哪些让人眼前一亮、世界先进的能力和武器？",
            "url": "https://www.zhihu.com/question/1946518406233851448/answer/1946655930096812704",
            "content": "<p>也没多少，老美几十年前就有了，此事红警2也有记载。光棱坦克，天启坦克，恐怖机器人，多功能步兵车，多功能步兵车（工程师）</p><figure><img src=\"https://pica.zhimg.com/v2-586c85a45057e458eaaa8a7535f18c52.jpg\"></figure><p><br></p><figure><img src=\"https://pic2.zhimg.com/v2-f6b82ef44be7815809a503573a296d09.jpg\"></figure><p><br></p><figure><img src=\"https://pic1.zhimg.com/v2-d87ab65ed51a6ec15bc53bdbcce9ef5e.jpg\"></figure><p><br></p><figure><img src=\"https://pic2.zhimg.com/v2-b9a3314a7890c759ffca6d0548785fb7.jpg\"></figure><p><br></p><figure><img src=\"https://pica.zhimg.com/v2-189e3fb1d3696b239ada4b905144671a.jpg\"></figure><p></p>",
            "description": "也没多少，老美几十年前就有了，此事红警2也有记载。光棱坦克，天启坦克，恐怖机器人，多功能步兵车，多功能步兵车（工程师）",
            "guid": "https://www.zhihu.com/question/1946518406233851448/answer/1946655930096812704",
            "author": "大肥猫",
            "authorUrl": null,
            "authorAvatar": null,
            "insertedAt": "2025-09-04T13:20:52.430Z",
            "publishedAt": "2025-09-04T13:11:00.675Z",
            "media": [
                {
                    "url": "https://pica.zhimg.com/v2-586c85a45057e458eaaa8a7535f18c52.jpg",
                    "type": "photo"
                },
                {
                    "url": "https://pic2.zhimg.com/v2-f6b82ef44be7815809a503573a296d09.jpg",
                    "type": "photo"
                },
                {
                    "url": "https://pic1.zhimg.com/v2-d87ab65ed51a6ec15bc53bdbcce9ef5e.jpg",
                    "type": "photo"
                },
                {
                    "url": "https://pic2.zhimg.com/v2-b9a3314a7890c759ffca6d0548785fb7.jpg",
                    "type": "photo"
                },
                {
                    "url": "https://pica.zhimg.com/v2-189e3fb1d3696b239ada4b905144671a.jpg",
                    "type": "photo"
                }
            ],
            "categories": null,
            "attachments": null,
            "extra": null,
            "language": null
        }
    }
}
```

然后将这些信息进行剪藏。

