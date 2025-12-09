(function () {
    /**
     * 思源笔记页面内容提取脚本
     * 通过 API 获取当前文档的完整信息
     */

    /**
     * 获取当前激活的文档 ID
     * @returns {string|null} 文档根 ID
     */
    function getCurrentDocumentId() {
        const activeWnd = document.querySelector('.layout__wnd--active');
        // 找到 activeWnd > class="layout-tab-container" > class="protyle-title" > data-node-id
        const titleNode = activeWnd.querySelector('.protyle-title[data-node-id]');
        if (titleNode) {
            return titleNode.getAttribute('data-node-id');
        }
        return null;
    }

    /**
     * 获取文档标题
     * @returns {string} 文档标题
     */
    function getDocumentTitle() {
        // 从标题栏获取
        const titleElement = document.querySelector('.protyle-title__input');
        if (titleElement) {
            const title = titleElement.textContent.trim();
            if (title) return title;
        }

        // 从页面标题获取
        if (document.title && document.title !== '思源笔记') {
            return document.title.replace(' - 思源笔记', '');
        }

        return '未命名文档';
    }

    /**
     * 处理 assets 路径，转换为完整 URL
     * @param {string} html - 原始 HTML 内容
     * @returns {string} 处理后的 HTML
     */
    function processAssetsPath(html) {
        const apiUrl = window.location.origin;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // 处理图片 src
        const images = tempDiv.querySelectorAll('img[src]');
        images.forEach(img => {
            let src = img.getAttribute('src');
            if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                if (src.startsWith('/')) {
                    src = apiUrl + src;
                } else if (src.startsWith('assets/')) {
                    src = apiUrl + '/' + src;
                }
                img.setAttribute('src', src);
            }
        });

        // 处理其他资源（音频、视频等）
        const sources = tempDiv.querySelectorAll('audio[src], video[src], source[src]');
        sources.forEach(elem => {
            let src = elem.getAttribute('src');
            if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                if (src.startsWith('/')) {
                    src = apiUrl + src;
                } else if (src.startsWith('assets/')) {
                    src = apiUrl + '/' + src;
                }
                elem.setAttribute('src', src);
            }
        });

        // 处理背景图片
        const elementsWithStyle = tempDiv.querySelectorAll('[style*="background"]');
        elementsWithStyle.forEach(elem => {
            let style = elem.getAttribute('style');
            if (style && (style.includes('assets/') || style.includes('url(/'))) {
                // 处理 url(/assets/...) 和 url(assets/...) 格式
                style = style.replace(/url\(['"]?\/assets\//g, `url('${apiUrl}/assets/`);
                style = style.replace(/url\(['"]?assets\//g, `url('${apiUrl}/assets/`);
                elem.setAttribute('style', style);
            }
        });

        return tempDiv.innerHTML;
    }

    /**
     * 通过 API 获取文档内容
     * @param {string} docId - 文档 ID
     * @returns {Promise<Object>} API 响应数据
     */
    async function fetchDocumentContent(docId) {
        try {
            // 构建 API URL（相对路径，会使用当前域名和端口）
            const apiUrl = '/api/filetree/getDoc';

            // 调用 API
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: docId,
                    mode: 0,  // 完整模式
                    size: 102400  // 足够大的大小，确保获取完整文档
                })
            });

            if (!response.ok) {
                throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (data.code !== 0) {
                throw new Error(`API 返回错误: ${data.msg}`);
            }

            return data.data;
        } catch (error) {
            console.error('[思源剪藏] API 请求失败:', error);
            throw error;
        }
    }

    /**
     * 获取思源页面内容
     * 覆盖全局的 __siyuanGetPageContent 函数
     */
    window.__siyuanGetPageContent = async () => {
        try {
            // 检测是否在思源页面
            if (!window.siyuan && !document.querySelector('.protyle-wysiwyg')) {
                return {
                    type: null,
                    content: null,
                    success: false,
                    title: null,
                    refresh: false
                };
            }

            // 获取当前文档 ID
            const docId = getCurrentDocumentId();
            if (!docId) {
                return {
                    type: "dom",
                    content: null,
                    success: false,
                    title: null,
                    error: '未找到当前文档 ID',
                    refresh: false
                };
            }

            console.log('[思源剪藏] 获取到文档 ID:', docId);

            // 获取文档标题
            const title = getDocumentTitle();

            // 通过 API 获取文档内容
            const docData = await fetchDocumentContent(docId);

            // docData 包含：
            // - content: 文档的 HTML 内容
            // - id: 文档 ID
            // - rootID: 根文档 ID
            // - parent2ID: 父文档 ID
            // - path: 文档路径
            // - box: 笔记本 ID
            // 等等...

            // 处理 assets 路径，转换为完整 URL
            let htmlContent = docData.content;
            if (htmlContent) {
                htmlContent = processAssetsPath(htmlContent);
            }

            console.log('[思源剪藏] 成功获取文档内容:', {
                docId,
                title,
                htmlContent,
                path: docData.path,
                box: docData.box
            });

            // 返回文档内容
            // 使用 type: "dom" 表示这是 HTML 内容
            return {
                type: "dom",
                content: htmlContent,
                success: true,
                title: title || docData.rootTitle || '未命名文档',
                refresh: false,
                meta: {
                    rootId: docData.rootID || docId,
                    docId: docId,
                    path: docData.path,
                    box: docData.box,
                    parentID: docData.parent2ID,
                    source: 'siyuan-api',
                    timestamp: new Date().toISOString()
                }
            };

        } catch (error) {
            console.error('[思源剪藏] 提取内容失败:', error);
            return {
                type: "dom",
                content: null,
                success: false,
                error: error.message,
                refresh: false
            };
        }
    };

    console.log('[思源剪藏] 注入脚本已加载 (API 模式)');
})();
