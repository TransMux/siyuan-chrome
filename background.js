chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(function () {
        const title = chrome.i18n.getMessage("copy_to_siyuan");
        chrome.contextMenus.create({
            id: 'copy-to-siyuan',
            title: title,
            contexts: ['selection', 'image'],
        })
    });
    setInterval(() => {
        chrome.runtime.sendMessage({ type: 'keepAlive' });
    }, 30000);
    
    // 初始化folo监听规则
    initFoloListenRules();
});

// 初始化folo监听规则
async function initFoloListenRules() {
    const items = await chrome.storage.sync.get({ foloListenEnabled: false });
    if (items.foloListenEnabled) {
        enableFoloListening();
    }
}

// 启用folo监听
function enableFoloListening() {
    if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
        chrome.webRequest.onBeforeRequest.addListener(
            handleFoloRequest,
            { urls: ["https://api.folo.is/collections"] },
            ["requestBody"]
        );
        console.log('Folo listening enabled');
    }
}

// 禁用folo监听
function disableFoloListening() {
    if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
        chrome.webRequest.onBeforeRequest.removeListener(handleFoloRequest);
        console.log('Folo listening disabled');
    }
}

// 处理folo收藏请求
function handleFoloRequest(details) {
    if (details.method === 'POST' && details.requestBody) {
        try {
            let entryId = null;
            
            // 从requestBody中提取entryId
            if (details.requestBody.raw) {
                const decoder = new TextDecoder('utf-8');
                const bodyText = decoder.decode(details.requestBody.raw[0].bytes);
                const bodyData = JSON.parse(bodyText);
                entryId = bodyData.entryId;
            } else if (details.requestBody.formData) {
                // 如果是form data格式
                const formData = details.requestBody.formData;
                if (formData.entryId) {
                    entryId = formData.entryId[0];
                }
            }
            
            if (entryId) {
                console.log('Detected folo collection request, entryId:', entryId);
                // 获取文章详情并剪藏
                processFoloArticle(entryId, details.tabId);
            }
        } catch (error) {
            console.error('Failed to parse folo request:', error);
        }
    }
}

// 处理folo文章剪藏
async function processFoloArticle(entryId, tabId) {
    try {
        console.log('Processing folo article:', entryId);
        
        // 获取必要的配置
        const items = await chrome.storage.sync.get({
            token: '',
            notebook: '',
            ip: 'http://127.0.0.1:6806'
        });
        
        if (!items.token || !items.notebook) {
            console.error('Missing SiYuan configuration');
            return;
        }
        
        // 在当前标签页执行获取文章详情的脚本
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: fetchFoloArticleDetails,
            args: [entryId]
        }, (results) => {
            if (results && results[0] && results[0].result) {
                const articleData = results[0].result;
                console.log('Got folo article data:', articleData);
                
                // 调用剪藏功能
                clipFoloArticle(articleData, tabId);
            } else {
                console.error('Failed to get folo article details');
            }
        });
        
    } catch (error) {
        console.error('Failed to process folo article:', error);
    }
}

// 在页面上下文中获取folo文章详情的函数
async function fetchFoloArticleDetails(entryId) {
    try {
        const response = await fetch(`https://api.folo.is/entries?id=${entryId}`, {
            method: 'GET',
            headers: {
                'accept': '*/*',
                'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'cache-control': 'no-store',
                'user-agent': navigator.userAgent,
                'x-app-name': 'Folo Web',
                'x-app-platform': 'desktop/web',
                'x-app-version': '0.7.0'
            },
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.code === 0 && data.data && data.data.entries) {
            const entry = data.data.entries;
            return {
                title: entry.title || 'Untitled',
                url: entry.url || '',
                author: entry.author || '',
                content: entry.content || entry.description || '',
                siteName: data.data.feeds ? data.data.feeds.title : '',
                publishedAt: entry.publishedAt || ''
            };
        } else {
            throw new Error('Invalid response format');
        }
        
    } catch (error) {
        console.error('Failed to fetch folo article:', error);
        return null;
    }
}

// 剪藏folo文章
function clipFoloArticle(articleData, tabId) {
    if (!articleData) {
        console.error('No article data to clip');
        return;
    }
    
    // 使用现有的剪藏功能，在页面上下文中执行
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: function(articleData, tabId) {
            // 创建临时元素来包装文章内容
            const tempElement = document.createElement('div');
            
            // 添加文章标题
            const titleElement = document.createElement('h1');
            titleElement.textContent = articleData.title;
            tempElement.appendChild(titleElement);
            
            // 添加文章内容
            const contentElement = document.createElement('div');
            contentElement.innerHTML = articleData.content;
            tempElement.appendChild(contentElement);
            
            // 构造文章信息对象
            const article = {
                title: articleData.title,
                siteName: articleData.siteName || 'Folo',
                excerpt: articleData.content ? articleData.content.substring(0, 200) : ''
            };
            
            // 通过postMessage传递extraParams
            window.__siyuanFoloExtraParams = {
                attributeViews: [
                    {
                        avID: '20250102171020-4cqqonx', // 输入数据库
                        values: {
                            '20250209201903-a01feo9': {
                                // 链接列
                                url: {
                                    content: articleData.url,
                                },
                            },
                            '20250209201845-at8lrm2': {
                                // 来源列
                                mSelect: [{ color: '14', content: 'RSS' }],
                            },
                            '20250830154540-udvlq8y': {
                                // 关联列
                                relation: { blockIDs: [] },
                            },
                            "20250904212513-5wb92lu": {
                                // 作者列
                                text: {content: articleData.author || ""}
                            }
                        },
                    },
                ],
            };
            
            // 调用现有的剪藏函数，不刷新页面
            if (typeof siyuanSendUpload === 'function') {
                siyuanSendUpload(tempElement, tabId, undefined, "article", article, articleData.url, undefined, false, true);
            } else {
                console.error('siyuanSendUpload function not found');
            }
        },
        args: [articleData, tabId]
    });
}

// 监听存储变化，动态启用/禁用folo监听
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.foloListenEnabled) {
        if (changes.foloListenEnabled.newValue) {
            enableFoloListening();
        } else {
            disableFoloListening();
        }
    }
});

// URL模式匹配函数
function matchesUrlPattern(url, pattern) {
    if (!pattern || pattern.trim() === '') return false;
    
    // 将通配符模式转换为正则表达式
    const regexPattern = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // 转义正则特殊字符
        .replace(/\\\*/g, '.*'); // 将 \* 替换为 .*
    
    const regex = new RegExp('^' + regexPattern + '$', 'i');
    return regex.test(url);
}

// 检查URL是否匹配任何配置的模式
function shouldAutoClip(url, patterns) {
    if (!patterns || patterns.trim() === '') return false;
    
    const patternList = patterns.split(',').map(p => p.trim()).filter(p => p !== '');
    return patternList.some(pattern => matchesUrlPattern(url, pattern));
}

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // 只在页面加载完成时触发
    if (changeInfo.status === 'complete' && tab.url) {
        chrome.storage.sync.get({
            autoClipEnabled: false,
            autoClipUrlPatterns: '',
            token: '',
            notebook: '',
        }, (items) => {
            // 检查是否启用自动剪藏，以及是否配置了必要的参数
            if (items.autoClipEnabled && 
                items.token && 
                items.notebook && 
                shouldAutoClip(tab.url, items.autoClipUrlPatterns)) {
                
                console.log('Auto-clipping triggered for URL:', tab.url);
                
                // 延迟1秒执行，确保页面完全加载
                setTimeout(() => {
                    chrome.tabs.sendMessage(tabId, {
                        'func': 'capture-full-page',
                        'tabId': tabId,
                        'closeTabAfter': true,
                    }).catch(error => {
                        console.log('Auto-clip failed:', error);
                    });
                }, 1000);
            }
        });
    }
});

// Listen for keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
    if (command === 'copy-to-siyuan') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    'func': 'copy',
                    'tabId': tabs[0].id,
                    'srcUrl': null,
                    'insertAtFocus': true,
                })
            }
        })
    } else if (command === 'capture-full-page') {
        // 获取所有选中的标签页
        chrome.tabs.query({ highlighted: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                console.log(`开始批量抓取 ${tabs.length} 个标签页`);
                // 对每个选中的标签页执行抓取操作，添加延迟避免并发问题
                tabs.forEach((tab, index) => {
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tab.id, {
                            'func': 'capture-full-page',
                            'tabId': tab.id,
                            'closeTabAfter': true,
                        });
                    }, index * 100);
                });
            }
        })
    }
})

chrome.contextMenus.onClicked.addListener(function (info, tab) {
    if (info.menuItemId === 'copy-to-siyuan') {
        chrome.tabs.sendMessage(tab.id, {
            'func': 'copy',
            'tabId': tab.id,
            'srcUrl': info.srcUrl,
        })
    }
})

// 添加模板渲染函数
function renderTemplate(template, data) {
    return template.replace(/\${([^}]+)}/g, function (_, key) {
        // 检查是否为条件表达式
        const conditionalMatch = key.match(/(.+?)\s*\?\s*(.*?)\s*:\s*(.*)/);
        if (conditionalMatch) {
            const conditionKey = conditionalMatch[1].trim();
            const trueValueString = conditionalMatch[2].trim();
            const falseValueString = conditionalMatch[3].trim();

            const condition = conditionKey.split('.').reduce((obj, prop) => obj && obj[prop], data);

            // 辅助函数，用于解析值中的变量或字符串
            const getValue = (valueStr) => {
                if ((valueStr.startsWith("'") && valueStr.endsWith("'")) || (valueStr.startsWith('"') && valueStr.endsWith('"'))) {
                    return valueStr.slice(1, -1); // 字符串字面量
                }
                // 尝试解析为变量
                const parts = valueStr.split('+').map(part => part.trim());
                let result = "";
                for (const part of parts) {
                    if ((part.startsWith("'") && part.endsWith("'")) || (part.startsWith('"') && part.endsWith('"'))) {
                        result += part.slice(1, -1);
                    } else {
                        const variableValue = part.split('.').reduce((obj, prop) => obj && obj[prop], data);
                        result += (variableValue !== undefined ? variableValue : '');
                    }
                }
                return result;
            };

            if (condition) {
                return getValue(trueValueString);
            } else {
                return getValue(falseValueString);
            }
        } else {
            // 普通变量替换
            const value = key.split('.').reduce((obj, prop) => obj && obj[prop], data);
            return value !== undefined ? value : '';
        }
    });
}

// 获取当前日期时间格式化函数
function getDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    let month = now.getMonth() + 1;
    let day = now.getDate();
    let hour = now.getHours();
    let minute = now.getMinutes();
    let second = now.getSeconds();
    if (month.toString().length === 1) {
        month = '0' + month;
    }
    if (day.toString().length === 1) {
        day = '0' + day;
    }
    if (hour.toString().length === 1) {
        hour = '0' + hour;
    }
    if (minute.toString().length === 1) {
        minute = '0' + minute;
    }
    if (second.toString().length === 1) {
        second = '0' + second;
    }
    return year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second;
}

// 获取简单日期时间
function getSimpleDateTime() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 5);
    return { date, time };
}

chrome.runtime.onMessage.addListener(async (request) => {
    if (request.func !== 'upload-copy') {
        return
    }

    const requestData = request.data
    const fetchFileErr = requestData.fetchFileErr
    const dom = requestData.dom
    const files = requestData.files
    const formData = new FormData()
    formData.append('dom', dom)
    for (const key of Object.keys(files)) {
        const data = files[key].data
        const base64Response = await fetch(data)
        const blob = base64Response.blob()
        formData.append(key, await blob)
    }
    formData.append("notebook", requestData.notebook)
    formData.append("parentID", requestData.parentDoc)
    formData.append("parentHPath", requestData.parentHPath)
    formData.append("href", requestData.href)
    formData.append("tags", requestData.tags)
    formData.append("clipType", requestData.type)
    formData.append("insertAtFocus", requestData.insertAtFocus)

    fetch(requestData.api + '/api/extension/copy', {
        method: 'POST',
        headers: {
            'Authorization': 'Token ' + requestData.token,
        },
        body: formData,
    }).then((response) => {
        if (response.redirected) {
            chrome.tabs.sendMessage(requestData.tabId, {
                'func': 'tipKey',
                'msg': 'tip_token_invalid',
                'tip': 'tip',
            })
        }
        return response.json()
    }).then((response) => {
        if (response.code < 0) {
            chrome.tabs.sendMessage(requestData.tabId, {
                'func': 'tip',
                'msg': response.msg,
                'tip': requestData.tip,
            })
            return
        }

        chrome.tabs.sendMessage(requestData.tabId, {
            'func': 'copy2Clipboard',
            'data': response.data.md,
        })

        if ('' !== response.msg && requestData.type !== 'article') {
            chrome.tabs.sendMessage(requestData.tabId, {
                'func': 'tip',
                'msg': response.msg,
                'tip': requestData.tip,
            })
        }

        if (requestData.type === 'article') {
            let title = requestData.title ? requestData.title : 'Untitled'
            title = title.replaceAll("/", "／")
            chrome.storage.sync.get({
                clipTemplate: '---\n' +
                    '\n' +
                    '- ${title}${siteName ? " - " + siteName : ""}\n' +
                    '- [${urlDecoded}](${url}) \n' +
                    '${excerpt ? "- " + excerpt : ""}\n' +
                    '- ${date} ${time}\n' +
                    '\n' +
                    '---\n' +
                    '\n' +
                    '${content}',
            }, (items) => {
                let excerpt = requestData.excerpt.trim()
                if ("" !== excerpt) {
                    // 将连续的三个换行符替换为两个换行符
                    excerpt = excerpt.replace(/\n{3,}/g, "\n\n")
                    // 从第二行开始，每行前面加两个空格 https://github.com/siyuan-note/siyuan/issues/11315
                    excerpt = excerpt.replace(/\n/g, "\n  ")
                    excerpt = excerpt.trim()
                }
                let urlDecoded = requestData.href
                try {
                    urlDecoded = decodeURIComponent(urlDecoded)
                } catch (e) {
                    console.warn(e)
                }

                const { date, time } = getSimpleDateTime();
                const templateData = {
                    title: requestData.title || 'Untitled',
                    siteName: requestData.siteName || '',
                    excerpt: excerpt || '',
                    url: requestData.href,
                    urlDecoded: urlDecoded,
                    date,
                    time,
                    tags: requestData.tags,
                    content: response.data.md
                };

                // 渲染模板
                let markdown;
                try {
                    markdown = renderTemplate(items.clipTemplate, templateData);
                } catch (e) {
                    console.error('Template rendering error:', e);
                    // 如果模板渲染失败，使用默认格式
                    markdown = getDefaultMarkdown(requestData, response.data.md);
                }

                // compute Week path: /Week {ISO week number}
                function getISOWeek(d) {
                    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                    const dayNum = d.getUTCDay() || 7;
                    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
                    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
                    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
                    return weekNo;
                }
                const weekNum = getISOWeek(new Date());
                const weekFolder = `/Week ${weekNum}`;
                const parentHPath = requestData.parentHPath || '';
                const baseHPath = parentHPath ? parentHPath : '';
                const finalHPath = `${baseHPath}${weekFolder}`;

                // 合并 extraParams 到请求参数中
                const requestBody = {
                    'notebook': requestData.notebook,
                    'parentID': requestData.parentDoc,
                    'tags': requestData.tags,
                    'path': finalHPath + "/" + title,
                    'markdown': markdown,
                    'withMath': response.data.withMath,
                    'clippingHref': requestData.href,
                    'listDocTree': requestData.listDocTree,
                };
                
                // 如果存在 extraParams，则合并到请求参数中
                if (requestData.extraParams && typeof requestData.extraParams === 'object') {
                    Object.assign(requestBody, requestData.extraParams);
                }
                
                fetch(requestData.api + '/api/filetree/createDocWithMd', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Token ' + requestData.token,
                    },
                    body: JSON.stringify(requestBody),
                }).then((response) => {
                    return response.json()
                }).then((response) => {
                    if (0 === response.code) {
                        chrome.tabs.sendMessage(requestData.tabId, {
                            'func': 'tipKey',
                            'msg': "tip_clip_ok",
                            'tip': requestData.tip,
                        })

                        // 检查是否需要打开文档
                        chrome.storage.sync.get({
                            expOpenAfterClip: false,
                        }, (items) => {
                            if (items.expOpenAfterClip && response.data) {
                                // 使用 SiYuan 协议在桌面应用中打开文档
                                const documentUrl = `siyuan://blocks/${response.data}`;
                                chrome.tabs.create({ url: documentUrl });
                            }
                        });

                        if (fetchFileErr) {
                            // 可能因为跨域问题导致下载图片失败，这里调用内核接口 `网络图片转换为本地图片` https://github.com/siyuan-note/siyuan/issues/7224
                            fetch(requestData.api + '/api/format/netImg2LocalAssets', {
                                method: 'POST',
                                headers: {
                                    'Authorization': 'Token ' + requestData.token,
                                },
                                body: JSON.stringify({
                                    'id': response.data,
                                    'url': requestData.href, // 改进浏览器剪藏扩展转换本地图片成功率 https://github.com/siyuan-note/siyuan/issues/7464
                                }),
                            })
                        }

                        if (requestData.closeTabAfter) {
                            // 如果是通过快捷键触发的，关闭标签页
                            chrome.tabs.remove(requestData.tabId);
                        } else if (!requestData.noReload) {
                            // 如果没有设置noReload，则刷新页面
                            chrome.tabs.sendMessage(requestData.tabId, {
                                'func': 'reload',
                            })
                        }
                    } else {
                        chrome.tabs.sendMessage(requestData.tabId, {
                            'func': 'tip',
                            'msg': response.msg,
                            'tip': requestData.tip,
                        })
                    }
                })
            });
        }
    }).catch((e) => {
        console.error(e)
        chrome.tabs.sendMessage(requestData.tabId, {
            'func': 'tipKey',
            'msg': "tip_siyuan_kernel_unavailable",
            'tip': "tip",
        });
    })
})

// 默认剪藏格式的处理函数（当模板渲染失败时使用）
function getDefaultMarkdown(requestData, contentMd) {
    let markdown = "---\n\n* " + (requestData.title || 'Untitled')
    const siteName = requestData.siteName
    if ("" !== siteName) {
        markdown += " - " + siteName
    }
    markdown += "\n"
    const href = requestData.href
    let linkText = href
    try {
        linkText = decodeURIComponent(linkText)
    } catch (e) {
        console.warn(e)
    }
    markdown += "* " + "[" + linkText + "](" + href + ")\n"
    let excerpt = requestData.excerpt.trim()
    if ("" !== excerpt) {
        // 将连续的三个换行符替换为两个换行符
        excerpt = excerpt.replace(/\n{3,}/g, "\n\n")
        // 从第二行开始，每行前面加两个空格 https://github.com/siyuan-note/siyuan/issues/11315
        excerpt = excerpt.replace(/\n/g, "\n  ")
        excerpt = excerpt.trim()
        markdown += "* " + excerpt + "\n"
    } else {
        markdown += "\n"
    }
    markdown += "* " + getDateTime() + "\n\n---\n\n" + contentMd
    return markdown;
}
