chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(function () {
        chrome.contextMenus.create({
            id: 'copy-to-siyuan',
            title: chrome.i18n.getMessage("copy_to_siyuan"),
            contexts: ['selection', 'image'],
        });

        chrome.contextMenus.create({
            id: 'send',
            title: chrome.i18n.getMessage("send"),
            contexts: ['page'],
        });
    });
    setInterval(() => {
        chrome.runtime.sendMessage({ type: 'keepAlive' });
    }, 30000);
    
    // 初始化folo监听规则
    initFoloListenRules();
    
    // 预加载注入脚本配置
    loadInjectScriptsConfig().catch(error => {
        console.error('Failed to preload inject scripts config:', error);
    });
});

// 初始化folo监听规则
async function initFoloListenRules() {
    const items = await chrome.storage.sync.get({ foloListenEnabled: false });
    if (items.foloListenEnabled) {
        await enableFoloListening();
    }
}

// 启用folo监听
async function enableFoloListening() {
    // 使用非阻塞webRequest监听请求内容
    if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
        chrome.webRequest.onBeforeRequest.addListener(
            handleFoloRequest,
            { urls: ["https://api.folo.is/collections"] },
            ["requestBody"]
        );
    }
    
    // 使用declarativeNetRequest拦截请求
    try {
        // 先移除现有规则
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [1]
        });
        
        // 添加新的阻塞规则
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [{
                id: 1,
                priority: 1,
                action: { type: "block" },
                condition: {
                    urlFilter: "https://api.folo.is/collections",
                    resourceTypes: ["xmlhttprequest"],
                    requestMethods: ["post"]
                }
            }]
        });
        console.log('Folo listening enabled with declarativeNetRequest blocking');
    } catch (error) {
        console.error('Failed to setup declarativeNetRequest blocking:', error);
    }
}

// 禁用folo监听
async function disableFoloListening() {
    if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
        chrome.webRequest.onBeforeRequest.removeListener(handleFoloRequest);
    }
    
    try {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [1]
        });
        console.log('Folo listening disabled');
    } catch (error) {
        console.error('Failed to remove request blocking:', error);
    }
}

// 处理folo收藏请求
function handleFoloRequest(details) {
    if (details.method === 'POST' && details.requestBody) {
        try {
            let entryId = null;
            
            console.log('🔍 [Folo] Processing collection request:', {
                url: details.url,
                tabId: details.tabId,
                requestBodyType: details.requestBody.raw ? 'raw' : 'formData'
            });
            
            // 从requestBody中提取entryId
            if (details.requestBody.raw) {
                const decoder = new TextDecoder('utf-8');
                const bodyText = decoder.decode(details.requestBody.raw[0].bytes);
                console.log('🔍 [Folo] Raw body text:', bodyText);
                const bodyData = JSON.parse(bodyText);
                entryId = bodyData.entryId;
            } else if (details.requestBody.formData) {
                // 如果是form data格式
                const formData = details.requestBody.formData;
                console.log('🔍 [Folo] FormData keys:', Object.keys(formData));
                if (formData.entryId) {
                    entryId = formData.entryId[0];
                }
            }
            
            if (entryId) {
                console.log('✅ [Folo] Successfully extracted entryId:', entryId);
                console.log('🚫 [Folo] Request will be blocked by declarativeNetRequest');
                
                // 获取文章详情并剪藏
                processFoloArticle(entryId, details.tabId);
            } else {
                console.warn('⚠️ [Folo] Failed to extract entryId from request body');
                
                // 发送错误日志
                sendLogToGlobalOverlay(
                    'Folo监听失败：无法从请求中提取entryId', 
                    'WARNING', 
                    'Folo自动剪藏',
                    { 
                        url: details.url, 
                        tabId: details.tabId,
                        requestBodyType: details.requestBody.raw ? 'raw' : 'formData'
                    }
                );
            }
        } catch (error) {
            console.error('❌ [Folo] Failed to parse folo request:', error);
            
            // 发送错误日志
            sendLogToGlobalOverlay(
                `Folo请求解析失败：${error.message}`, 
                'ERROR', 
                'Folo自动剪藏',
                { 
                    url: details.url, 
                    tabId: details.tabId,
                    error: error.stack 
                }
            );
        }
    }
}

// 处理folo文章剪藏
async function processFoloArticle(entryId, tabId) {
    try {
        console.log('🔄 [Folo] Starting article processing:', entryId);
        
        // 获取必要的配置
        const items = await chrome.storage.sync.get({
            token: '',
            notebook: '',
            ip: 'http://127.0.0.1:6806'
        });
        
        console.log('🔧 [Folo] Configuration check:', {
            hasToken: !!items.token,
            hasNotebook: !!items.notebook,
            ip: items.ip
        });
        
        if (!items.token || !items.notebook) {
            console.error('❌ [Folo] Missing SiYuan configuration');
            
            // 发送错误日志
            sendLogToGlobalOverlay(
                'Folo剪藏失败：缺少SiYuan配置（Token或笔记本）', 
                'ERROR', 
                'Folo自动剪藏',
                { entryId: entryId, tabId: tabId, hasToken: !!items.token, hasNotebook: !!items.notebook }
            );
            return;
        }
        
        console.log('📄 [Folo] Executing script to fetch article details...');
        
        // 在当前标签页执行获取文章详情的脚本
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: fetchFoloArticleDetails,
            args: [entryId]
        }, (results) => {
            // 检查Chrome运行时错误
            if (chrome.runtime.lastError) {
                console.error('❌ [Folo] Chrome scripting error:', chrome.runtime.lastError);
                
                sendLogToGlobalOverlay(
                    `Folo脚本注入失败：${chrome.runtime.lastError.message}`, 
                    'ERROR', 
                    'Folo自动剪藏',
                    { entryId: entryId, tabId: tabId, error: chrome.runtime.lastError.message }
                );
                return;
            }
            
            console.log('📋 [Folo] Script execution results:', results);
            
            if (results && results[0] && results[0].result) {
                const articleData = results[0].result;
                console.log('✅ [Folo] Successfully got article data:', {
                    title: articleData.title,
                    url: articleData.url,
                    hasContent: !!articleData.content,
                    contentLength: articleData.content ? articleData.content.length : 0
                });
                
                // 调用剪藏功能
                clipFoloArticle(articleData, tabId, entryId);
            } else {
                console.error('❌ [Folo] Failed to get article details - no valid result');
                
                // 更详细的错误信息
                let errorDetails = {};
                if (results && results[0]) {
                    errorDetails.hasResult = !!results[0].result;
                    if (results[0].error) {
                        errorDetails.scriptError = results[0].error;
                    }
                }
                
                // 发送错误日志
                sendLogToGlobalOverlay(
                    `Folo文章获取失败：entryId=${entryId}`, 
                    'ERROR', 
                    'Folo自动剪藏',
                    { entryId: entryId, tabId: tabId, ...errorDetails }
                );
            }
        });
        
    } catch (error) {
        console.error('❌ [Folo] Failed to process folo article:', error);
        
        // 发送错误日志
        sendLogToGlobalOverlay(
            `Folo文章处理失败：${error.message}`, 
            'ERROR', 
            'Folo自动剪藏',
            { entryId: entryId, tabId: tabId, error: error.stack }
        );
    }
}

// 在页面上下文中获取folo文章详情的函数
async function fetchFoloArticleDetails(entryId) {
    try {
        console.log('🌐 [Folo] Fetching article details for entryId:', entryId);
        
        const apiUrl = `https://api.folo.is/entries?id=${entryId}`;
        console.log('🌐 [Folo] API URL:', apiUrl);
        
        const response = await fetch(apiUrl, {
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
        
        console.log('🌐 [Folo] Response status:', response.status, response.statusText);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('🌐 [Folo] API response structure:', {
            code: data.code,
            hasData: !!data.data,
            hasEntries: !!(data.data && data.data.entries)
        });
        
        if (data.code === 0 && data.data && data.data.entries) {
            const entry = data.data.entries;
            const result = {
                title: entry.title || 'Untitled',
                url: entry.url || '',
                author: entry.author || '',
                content: entry.content || entry.description || '',
                siteName: data.data.feeds ? data.data.feeds.title : '',
                publishedAt: entry.publishedAt || ''
            };
            
            console.log('✅ [Folo] Successfully parsed article:', {
                title: result.title,
                url: result.url,
                author: result.author,
                hasContent: !!result.content,
                contentLength: result.content.length,
                siteName: result.siteName
            });
            
            return result;
        } else {
            console.error('❌ [Folo] Invalid response format:', {
                code: data.code,
                dataKeys: data.data ? Object.keys(data.data) : 'no data'
            });
            throw new Error(`Invalid response format - code: ${data.code}`);
        }
        
    } catch (error) {
        console.error('❌ [Folo] Failed to fetch folo article:', error);
        console.error('❌ [Folo] Error stack:', error.stack);
        return null;
    }
}

// 剪藏folo文章
function clipFoloArticle(articleData, tabId, entryId) {
    if (!articleData) {
        console.error('❌ [Folo] No article data to clip');
        
        sendLogToGlobalOverlay(
            'Folo剪藏失败：文章数据为空', 
            'ERROR', 
            'Folo自动剪藏',
            { entryId: entryId, tabId: tabId }
        );
        return;
    }
    
    console.log('📝 [Folo] Starting clip process for article:', articleData.title);
    
    // 使用消息传递机制调用剪藏功能
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: function(articleData, tabId, entryId) {
            console.log('📝 [Folo-Inject] Creating temp element for article:', articleData.title);
            
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
            
            // 构造extraParams
            const extraParams = {
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
            
            // 通过消息传递调用剪藏功能
            console.log('📤 [Folo-Inject] Sending folo-clip message to content script');
            
            // 发送消息给content script
            chrome.runtime.sendMessage({
                func: 'folo-clip',
                data: {
                    tempElementHTML: tempElement.innerHTML,
                    article: article,
                    url: articleData.url,
                    extraParams: extraParams,
                    tabId: tabId,
                    entryId: entryId
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('❌ [Folo-Inject] Message sending failed:', chrome.runtime.lastError);
                } else {
                    console.log('✅ [Folo-Inject] Message sent successfully:', response);
                }
            });
        },
        args: [articleData, tabId, entryId]
    }, (results) => {
        if (chrome.runtime.lastError) {
            console.error('❌ [Folo] Script injection failed:', chrome.runtime.lastError);
            
            sendLogToGlobalOverlay(
                `Folo剪藏脚本注入失败：${chrome.runtime.lastError.message}`, 
                'ERROR', 
                'Folo自动剪藏',
                { entryId: entryId, tabId: tabId, error: chrome.runtime.lastError.message }
            );
        } else {
            console.log('✅ [Folo] Clip script injected successfully');
        }
    });
}

// 发送日志到Global Overlay
async function sendLogToGlobalOverlay(message, level = 'INFO', source = 'SiYuan Chrome Extension', data = null) {
    try {
        const response = await fetch('http://localhost:53431/sendLog', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                level,
                source,
                data
            })
        });
        
        if (!response.ok) {
            console.warn('Failed to send log to Global Overlay:', response.status);
        }
    } catch (error) {
        // 静默失败，不影响主要功能
        console.debug('Global Overlay not available:', error.message);
    }
}

// 监听存储变化，动态启用/禁用folo监听
chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'sync' && changes.foloListenEnabled) {
        if (changes.foloListenEnabled.newValue) {
            await enableFoloListening();
        } else {
            await disableFoloListening();
        }
    }
});

// URL模式匹配函数
function matchesUrlPattern(url, pattern) {
    if (!pattern || pattern.trim() === '') return false;
    
    // 将通配符模式转换为正则表达式
    // 处理常见的URL模式格式，如 *.example.com/* 或 *://*.example.com/*
    let normalizedPattern = pattern.trim();
    
    // 如果模式是 "*"，匹配所有URL
    if (normalizedPattern === '*') {
        return true;
    }
    
    // 如果模式不包含协议，添加通配符协议匹配
    if (!normalizedPattern.includes('://')) {
        normalizedPattern = '*://' + normalizedPattern;
    }
    
    // 将通配符模式转换为正则表达式
    // 先将 * 替换为临时占位符，转义其他特殊字符，然后再替换回来
    const regexPattern = normalizedPattern
        .replace(/\*/g, '__WILDCARD__') // 先用占位符替换 *
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // 转义正则特殊字符
        .replace(/__WILDCARD__/g, '.*'); // 将占位符替换为 .*
    
    try {
        const regex = new RegExp('^' + regexPattern + '$', 'i');
        return regex.test(url);
    } catch (error) {
        console.error('Invalid URL pattern:', pattern, error);
        return false;
    }
}

// 加载注入脚本配置
let injectScriptsConfig = null;
let injectScriptsConfigPromise = null;

async function loadInjectScriptsConfig() {
    if (injectScriptsConfig) {
        return injectScriptsConfig;
    }
    
    if (injectScriptsConfigPromise) {
        return injectScriptsConfigPromise;
    }
    
    injectScriptsConfigPromise = (async () => {
        try {
            const configUrl = chrome.runtime.getURL('inject-scripts.json');
            const response = await fetch(configUrl);
            if (!response.ok) {
                console.warn('Failed to load inject-scripts.json:', response.status);
                return null;
            }
            const config = await response.json();
            injectScriptsConfig = config;
            console.log('✅ Loaded inject scripts config:', config);
            return config;
        } catch (error) {
            console.error('❌ Failed to load inject-scripts.json:', error);
            return null;
        } finally {
            injectScriptsConfigPromise = null;
        }
    })();
    
    return injectScriptsConfigPromise;
}

// 为页面注入脚本
async function injectScriptsForTab(tabId, url) {
    try {
        // 排除特殊页面
        if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://')) {
            return;
        }
        
        const config = await loadInjectScriptsConfig();
        if (!config || !config.scripts || !Array.isArray(config.scripts)) {
            return;
        }
        
        // 找到匹配的脚本
        const matchedScripts = config.scripts.filter(script => {
            if (!script.url_pattern || !script.inject) {
                return false;
            }
            return matchesUrlPattern(url, script.url_pattern);
        });
        
        if (matchedScripts.length === 0) {
            return;
        }
        
        console.log(`🔧 Injecting ${matchedScripts.length} script(s) for URL: ${url}`);
        
        // 注入所有匹配的脚本
        for (const script of matchedScripts) {
            try {
                const scriptPath = script.inject;
                
                // 检查标签页是否仍然存在
                try {
                    await chrome.tabs.get(tabId);
                } catch (e) {
                    console.warn(`Tab ${tabId} no longer exists, skipping script injection`);
                    return;
                }
                
                // 使用 chrome.scripting.executeScript 注入脚本文件
                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: [scriptPath],
                    world: 'MAIN'
                });
                
                console.log(`✅ Injected script: ${scriptPath}`);
            } catch (error) {
                // 忽略常见的错误（如标签页已关闭、页面无法访问等）
                if (error.message && (
                    error.message.includes('No tab with id') ||
                    error.message.includes('Cannot access') ||
                    error.message.includes('Receiving end does not exist')
                )) {
                    console.debug(`Skipping script injection for tab ${tabId}:`, error.message);
                } else {
                    console.error(`❌ Failed to inject script ${script.inject}:`, error);
                }
            }
        }
    } catch (error) {
        console.error('❌ Error injecting scripts:', error);
    }
}

// 检查URL是否匹配任何配置的模式
function shouldAutoClip(url, patterns) {
    if (!patterns || patterns.trim() === '') return false;
    
    const patternList = patterns.split(',').map(p => p.trim()).filter(p => p !== '');
    return patternList.some(pattern => matchesUrlPattern(url, pattern));
}

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tab.url) return;
    
    // 只在页面加载完成时触发
    if (changeInfo.status === 'complete') {
        // 首先注入脚本
        injectScriptsForTab(tabId, tab.url).catch(error => {
            console.error('Failed to inject scripts:', error);
        });
        
        // 然后处理自动剪藏逻辑
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
                            'closeTabAfter': false,
                        });
                    }, index * 100);
                });
            }
        })
    } else if (command === 'capture-full-page-close') {
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
    } else if (command === 'toggle-clipboard-monitor') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    'func': 'toggle-clipboard-monitor-hotkey',
                    'tabId': tabs[0].id,
                })
            }
        })
    }
})

chrome.contextMenus.onClicked.addListener(function (info, tab) {
    if (info.menuItemId === 'copy-to-siyuan') {
        safeTabsSendMessage(tab && tab.id, {
            'func': 'copy',
            'tabId': tab && tab.id,
            'srcUrl': info.srcUrl,
        })
    } else if (info.menuItemId === 'send') {
        safeTabsSendMessage(tab && tab.id, {
            'func': 'siyuanGetReadability',
            'tabId': tab && tab.id,
        });
    }
})

function safeTabsSendMessage(tabId, message) {
    if (!tabId) return;
    try {
        chrome.tabs.sendMessage(tabId, message, () => {
            void chrome.runtime.lastError;
        });
    } catch (e) {
        // ignore
    }
}

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
    return {date, time};
}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.type === 'keepAlive') {
        // 处理keepAlive消息，保持service worker活跃
        sendResponse({ status: 'alive' });
        return;
    }
    
    if (request.func === 'getTabId') {
        // 返回当前标签页ID
        if (sender.tab && sender.tab.id) {
            sendResponse({ tabId: sender.tab.id });
        } else {
            sendResponse({ tabId: null });
        }
        return true;
    }
    
    if (request.func === 'folo-clip') {
        console.log('📨 [Folo] Received folo-clip message:', request.data);
        
        try {
            // 获取存储配置
            const items = await chrome.storage.sync.get({
                token: '',
                notebook: '',
                ip: 'http://127.0.0.1:6806'
            });
            
            if (!items.token || !items.notebook) {
                console.error('❌ [Folo] Missing SiYuan configuration for folo-clip');
                sendResponse({ success: false, error: 'Missing SiYuan configuration' });
                return;
            }
            
            // 向对应的tab发送消息，由content script处理
            chrome.tabs.sendMessage(request.data.tabId, {
                func: 'folo-clip-content',
                data: request.data
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('❌ [Folo] Failed to send message to content script:', chrome.runtime.lastError);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    console.log('✅ [Folo] Successfully sent folo-clip to content script');
                    sendResponse({ success: true });
                }
            });
            
            return true; // 保持消息通道开放
            
        } catch (error) {
            console.error('❌ [Folo] Error handling folo-clip message:', error);
            sendResponse({ success: false, error: error.message });
        }
        return;
    }
    
    if (request.func !== 'upload-copy') {
        return
    }

    const requestData = request.data
    const fetchFileErr = requestData.fetchFileErr
    const dom = requestData.dom
    const files = requestData.files
    const formData = new FormData()
    
    // 如果是markdown内容，添加特殊标记
    if (requestData.isMarkdown) {
        formData.append('isMarkdown', 'true')
    }
    
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
    formData.append("title", requestData.title || "")

    fetch(requestData.api + '/api/extension/copy', {
        method: 'POST',
        headers: {
            'Authorization': 'Token ' + requestData.token,
        },
        body: formData,
    }).then((response) => {
        if (response.redirected) {
            safeTabsSendMessage(requestData.tabId, {
                'func': 'tipKey',
                'msg': 'tip_token_invalid',
                'tip': 'tip',
            })
        }
        return response.json()
    }).then((response) => {
        if (response.code < 0) {
            safeTabsSendMessage(requestData.tabId, {
                'func': 'tip',
                'msg': response.msg,
                'tip': requestData.tip,
            })
            return
        }

        safeTabsSendMessage(requestData.tabId, {
            'func': 'copy2Clipboard',
            'data': response.data.md,
        })

        if ('' !== response.msg && requestData.type !== 'article') {
            safeTabsSendMessage(requestData.tabId, {
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

                const {date, time} = getSimpleDateTime();
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
                        // 添加到数据库
                        if (requestData.selectedDatabaseID) {
                            const docId = response.data;

                            // 先刷新 SQL 数据库
                            fetch(requestData.api + '/api/sqlite/flushTransaction', {
                                method: 'POST',
                                headers: {
                                    'Authorization': 'Token ' + requestData.token,
                                },
                                body: JSON.stringify({}),
                            }).then(() => {
                                // 刷新完成后再添加到数据库
                                const dbInput = {
                                    avID: requestData.selectedDatabaseID,
                                    srcs: [{
                                        id: docId,
                                        isDetached: false,
                                    }]
                                };
                                fetch(requestData.api + '/api/av/addAttributeViewBlocks', {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': 'Token ' + requestData.token,
                                    },
                                    body: JSON.stringify(dbInput),
                                })
                            });
                        }

                        safeTabsSendMessage(requestData.tabId, {
                            'func': 'tipKey',
                            'msg': "tip_clip_ok",
                            'tip': requestData.tip,
                        })

                        // 发送日志到Global Overlay
                        if (response.data) {
                            const documentId = response.data;
                            const title = requestData.title || 'Untitled';
                            
                            // 检查是否是Folo剪藏
                            const isFoloClip = requestData.extraParams && requestData.extraParams.attributeViews;
                            const source = isFoloClip ? 'Folo自动剪藏' : 'SiYuan剪藏';
                            const logMessage = `剪藏成功：[${title}](#openSiYuan(${documentId}))`
                            
                            sendLogToGlobalOverlay(logMessage, 'SUCCESS', source, {
                                documentId: documentId,
                                title: title,
                                url: requestData.href,
                                type: requestData.type,
                                isFoloClip: isFoloClip
                            });
                        }

                        // 检查是否需要打开文档
                        chrome.storage.sync.get({
                            expOpenAfterClip: false,
                        }, (items) => {
                            if (items.expOpenAfterClip && response.data) {
                                let documentUrl = requestData.api + "?id=" + response.data;
                                if (requestData.api.startsWith("http://localhost:") || requestData.api.startsWith("http://127.0.0.1:")) {
                                    documentUrl = `siyuan://blocks/${response.data}`;
                                }
                                chrome.tabs.create({url: documentUrl});
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
                        safeTabsSendMessage(requestData.tabId, {
                            'func': 'tip',
                            'msg': response.msg,
                            'tip': requestData.tip,
                        })
                        
                        // 发送错误日志到Global Overlay
                        const errorTitle = requestData.title || 'Untitled';
                        const isErrorFoloClip = requestData.extraParams && requestData.extraParams.attributeViews;
                        const errorSource = isErrorFoloClip ? 'Folo自动剪藏' : 'SiYuan剪藏';
                        const errorLogMessage = `剪藏失败：[${errorTitle}] - ${response.msg}`;
                        
                        sendLogToGlobalOverlay(errorLogMessage, 'ERROR', errorSource, {
                            title: errorTitle,
                            url: requestData.href,
                            error: response.msg,
                            type: requestData.type,
                            isFoloClip: isErrorFoloClip
                        });
                    }
                })
            });
        }
    }).catch((e) => {
        console.error(e)
        safeTabsSendMessage(requestData.tabId, {
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
