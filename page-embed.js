window.addEventListener('message', async (event) => {
    if (
        event.data &&
        event.data.type === 'GET_SIYUAN_EXTRA_PARAMS' &&
        event.data.source === 'siyuan-chrome-extension'
    ) {
        // 通过函数调用获取参数
        let params = window.__siyuanGetCaptureParam ? await window.__siyuanGetCaptureParam() : {};

        // 返回结果给content script
        window.postMessage(
            {
                type: 'SIYUAN_EXTRA_PARAMS_RESPONSE',
                source: 'siyuan-chrome-extension',
                params: params,
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
        // 通过函数调用获取页面内容
        let contentResult = window.__siyuanGetPageContent ? await window.__siyuanGetPageContent() : null;

        // 返回结果给content script
        window.postMessage(
            {
                type: 'PAGE_CONTENT_RESPONSE',
                source: 'siyuan-chrome-extension',
                contentType: contentResult ? contentResult.type : null,
                content: contentResult ? contentResult.content : null,
                success: contentResult ? contentResult.success : false,
            },
            '*'
        );
    }
});

window.__siyuanGetCaptureParam = () => {
    return {
        attributeViews: [
            {
                avID: '20250102171020-4cqqonx', // 输入数据库
                values: {
                    '20250209201903-a01feo9': {
                        // 链接列
                        url: {
                            content: window.location.href,
                        },
                    },
                },
            },
        ],
    };
};

// 页面内容获取函数，返回预埋的剪藏内容
window.__siyuanGetPageContent = () => {
    return {
        type: null,
        content: null,
        success: false
    };
};