window.addEventListener('message', async (event) => {
    if (
        event.data &&
        event.data.type === 'GET_SIYUAN_EXTRA_PARAMS' &&
        event.data.source === 'siyuan-chrome-extension'
    ) {
        let params = {};
        let error = null;
        
        try {
            // 通过函数调用获取参数
            params = window.__siyuanGetCaptureParam ? await window.__siyuanGetCaptureParam() : {};
        } catch (e) {
            error = e.message || '获取捕获参数时发生错误';
        }

        // 返回结果给content script
        window.postMessage(
            {
                type: 'SIYUAN_EXTRA_PARAMS_RESPONSE',
                source: 'siyuan-chrome-extension',
                params: params,
                error: error,
            },
            '*'
        );
    }

    // 处理GET_PAGE_CONTENT请求
    if (
        event.data &&
        event.data.type === 'GET_PAGE_CONTENT' &&
        event.data.source === 'siyuan-chrome-extension'
    ) {
        let contentResult = null;
        let error = null;
        
        try {
            // 通过函数调用获取页面内容
            contentResult = window.__siyuanGetPageContent ? await window.__siyuanGetPageContent() : null;
        } catch (e) {
            error = e.message || '获取页面内容时发生错误';
        }

        // 返回结果给content script
        window.postMessage(
            {
                type: 'PAGE_CONTENT_RESPONSE',
                source: 'siyuan-chrome-extension',
                contentType: contentResult ? contentResult.type : null,
                content: contentResult ? contentResult.content : null,
                success: contentResult ? contentResult.success : false,
                title: contentResult ? contentResult.title : null,
                refresh: contentResult ? (contentResult.refresh === true) : false,
                error: error,
            },
            '*'
        );
    }
});

// 页面内容获取函数，返回预埋的剪藏内容
window.__siyuanGetPageContent = () => {
    return {
        type: null,
        content: null,
        success: false,
        title: null,
        refresh: false
    };
};