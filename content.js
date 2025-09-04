document.addEventListener('DOMContentLoaded', function () {
    chrome.runtime.onMessage.addListener(
        async (request, sender, sendResponse) => {
            if ('tip' === request.func && request.tip) {
                siyuanShowTip(request.msg, request.timeout)
                return
            }

            if ('tipKey' === request.func && request.tip) {
                siyuanShowTipByKey(request.msg, request.timeout)
                return
            }

            if ('copy2Clipboard' === request.func) {
                await copyToClipboard(request.data)
                return
            }

            if ('reload' === request.func) {
                window.location.reload()
                return
            }

            if ('capture-full-page' === request.func) {
                siyuanCaptureFullPage(request.tabId, request.closeTabAfter)
                return
            }

            if ('copy' !== request.func) {
                return
            }

            siyuanShowTipByKey("tip_clipping")

            const selection = window.getSelection()
            if (selection && 0 < selection.rangeCount && selection.toString().length > 0) {
                const range = selection.getRangeAt(0)
                const tempElement = document.createElement('div')
                tempElement.appendChild(range.cloneContents())
                siyuanSendUpload(tempElement, request.tabId, request.srcUrl, "part", undefined, undefined, request.insertAtFocus)
            } else {
                const tempElement = document.createElement('div')
                let href = window.location.href
                const hostname = window.location.hostname || ''
                const isDouyin = hostname.indexOf('douyin.com') !== -1 || hostname.indexOf('iesdouyin.com') !== -1

                let titles = []
                if (isDouyin) {
                    const feedActiveVideo = document.querySelector('[data-e2e="feed-active-video"]')
                    if (feedActiveVideo) {
                        const elements = Array.from(feedActiveVideo.getElementsByClassName('video-info-detail'))
                        const visibleElements = elements.filter(el => el && el.offsetParent !== null)
                        if (0 < visibleElements.length) {
                            titles = visibleElements.map(el => (el.innerText || '').replace(/[\r\n]+/g, ' ').trim()).filter(t => t)
                        }

                        // set href
                        if (href.indexOf('modal_id') === -1) {
                            // data-e2e-vid="7539492141777669411"
                            href = 'https://www.douyin.com/jingxuan?modal_id=' + feedActiveVideo.dataset.e2eVid
                        }
                    }
                }

                if (0 === titles.length) {
                    const defaultTitle = (document.title || '').trim()
                    titles = [defaultTitle || href]
                }

                titles.forEach((title, idx) => {
                    const a = document.createElement('a')
                    a.setAttribute('href', href)
                    a.textContent = title
                    // 每个标题单独成行，便于后续转换为 Markdown
                    const line = document.createElement('div')
                    line.appendChild(a)
                    tempElement.appendChild(line)
                })

                siyuanSendUpload(tempElement, request.tabId, request.srcUrl, "part", undefined, undefined, request.insertAtFocus)
            }
        })
    const copyToClipboard = async (textToCopy) => {
        // 修复无焦点的未捕获异常：https://github.com/siyuan-note/siyuan/issues/13208
        await new Promise(resolve => requestAnimationFrame(resolve));

        if (navigator.clipboard && window.isSecureContext) {
            try {
                return await navigator.clipboard.writeText(textToCopy);
            } catch (error) {
                //console.warn('Failed to copy text: ', error);
            }
        }

        let textArea = document.createElement('textarea')
        textArea.value = textToCopy
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        return new Promise((res, rej) => {
            document.execCommand('copy') ? res() : rej()
            textArea.remove()
        })
    }
})

let tipTimeoutId

const siyuanShowTip = (msg, timeout) => {
    let messageElement = document.getElementById('siyuanmessage')
    if (!messageElement) {
        document.body.insertAdjacentHTML('afterend', `<div style=" position:fixed;top: 0;z-index: 999999999;transform: translate3d(0, -100px, 0);opacity: 0;transition: opacity 0.15s cubic-bezier(0, 0, 0.2, 1) 0ms, transform 0.15s cubic-bezier(0, 0, 0.2, 1) 0ms;width: 100%;align-items: center;justify-content: center;height: 0;display: flex;" id="siyuanmessage">
<div style="line-height: 20px;border-radius: 4px;padding: 8px 16px;color: #fff;font-size: inherit;background-color: #4285f4;box-sizing: border-box;box-shadow: 0 3px 5px -1px rgba(0, 0, 0, 0.2), 0 6px 10px 0 rgba(0, 0, 0, 0.14), 0 1px 18px 0 rgba(0, 0, 0, 0.12);transition: transform 0.15s cubic-bezier(0, 0, 0.2, 1) 0ms;transform: scale(0.8);top: 16px;position: absolute;word-break: break-word;max-width: 80vw;"></div></div>`)
        messageElement = document.getElementById('siyuanmessage')
    }

    messageElement.style.transform = 'translate3d(0, 0, 0)'
    messageElement.style.opacity = '1'
    messageElement.firstElementChild.innerHTML = msg
    if (!timeout) {
        timeout = 5000
    }

    if (tipTimeoutId) {
        clearTimeout(tipTimeoutId);
    }

    tipTimeoutId = setTimeout(() => {
        siyuanClearTip();
    }, timeout);
}

// Add i18n support https://github.com/siyuan-note/siyuan/issues/13559
const siyuanShowTipByKey = (msgKey, timeout) => {
    siyuanShowTip(chrome.i18n.getMessage(msgKey), timeout);
}

const siyuanClearTip = () => {
    let messageElement = document.getElementById('siyuanmessage')
    if (!messageElement) {
        return
    }
    messageElement.style.transform = 'translate3d(0, -100px, 0)'
    messageElement.style.opacity = '0'
}

const siyuanConvertBlobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader
    reader.onerror = reject
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(blob)
})

// 网页换行用 span 样式 word-break 的特殊处理 https://github.com/siyuan-note/siyuan/issues/13195
// 递归查找父元素直到找到 pre、code、span、math 或 math相关标签
function isIgnoredElement(element) {
    // 递归查找父元素直到找到 pre、code、span、math 或 math相关标签
    while (element) {
        let tagName = element.tagName.toLowerCase();
        const className = element.className.toLowerCase();
        if (tagName === 'math' ||
            className.includes('math') || className.includes('mathjax') || className.includes('latex') ||
            className.includes('katex') || className.includes('mjx') || className.includes('mathml') ||
            className.includes('equation') || className.includes('formula')) {
            return true;
        }

        element = element.parentElement; // 移动到父元素
        if (!element) {
            break;
        }

        tagName = element.tagName.toLowerCase();

        // 如果父元素是 pre、code、span、math 或与数学相关的类名
        if (tagName === 'pre' || tagName === 'code' || tagName === 'span' || tagName === 'section') {
            return true;
        } else if (tagName === 'div' || tagName === 'p') {
            return false; // 找到 div、p 直接返回
        }
    }
    return false; // 没找到时返回 false
}

// span元素的换行处理优化：https://github.com/siyuan-note/siyuan/issues/14775
// 规范：https://developer.mozilla.org/zh-CN/docs/Web/CSS/white-space
function siyuanProcessTextByWhiteSpace(element) {
  const text = element.textContent;
  const whiteSpace = getComputedStyle(element).whiteSpace;
  const brTag = '<br>';

  switch (whiteSpace) {
    case 'normal':
    case 'nowrap':
      // 合并所有空白字符为一个空格；换行为 <br>；去除行末空格
      return text
        .replace(/[ \t\r\f\v]+/g, ' ')         // 合并空格和制表符
        .replace(/[ \t]+\n/g, '\n')            // 去除行末空格
        .replace(/\n+/g, brTag)               // 合并换行并转为 <br>
        .trim();
    case 'pre':
      // 保留所有空白和换行，换行转为 <br>
      return text
        .replace(/\n/g, brTag);
    case 'pre-wrap':
      // 保留空白字符，换行转为 <br>，不处理行末空格（挂起）
      return text
        .replace(/\n+/g, brTag);
    case 'pre-line':
      // 合并空格，保留换行符，换行转为 <br>，移除行末空格
      return text
        .replace(/[ \t\r\f\v]+/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n+/g, brTag)
        .trim();
    case 'break-spaces':
      // 保留所有空白字符和换行符，换行为 <br>
      return text
        .replace(/\n/g, brTag);
    default:
      // 默认处理和 normal 相同
      return text
        .replace(/[ \t\r\f\v]+/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n+/g, brTag)
        .trim();
  }
}


// 处理会换行的 span 后添加 <br>，让内核能识别到换行
function siyuanSpansAddBr(tempElement) {
    const spans = tempElement.querySelectorAll('span');
    if (!spans || spans.length === 0) {
        console.log('No span elements found.');
        return;
    }

    // 用于存储符合条件的 span 元素
    const matchedSpans = [];

    spans.forEach((span) => {
        const style = window.getComputedStyle(span);

        // 现有的条件判断，判断是否满足换行条件
        if (
            (style.whiteSpace.trim().toLowerCase() === 'normal' || style.whiteSpace.trim().toLowerCase() === 'pre-wrap') &&
            (style.wordWrap.trim().toLowerCase() === 'break-word' || style.overflowWrap.trim().toLowerCase() === 'break-word' || style.wordBreak.trim().toLowerCase() === 'break-word')
        ) {
            // 检查父元素是否是 pre、code 或 span
            if (isIgnoredElement(span)) {
                console.log('Skipping span due to parent being pre, code or span.');
                return; // 如果父元素是 pre、code 或 span 或者数学公式，跳过该 span
            }

            span.innerHTML = siyuanProcessTextByWhiteSpace(span);

            // 添加到符合条件的数组中
            matchedSpans.push(span);
        }
    });

    if (matchedSpans.length > 0) {
        console.log(`Added <br> for ${matchedSpans.length} span elements.(Total span: ${spans.length})`);
        console.log('Matched span elements:', matchedSpans);
    } else {
        console.log('No span elements matched the criteria.');
    }
};

// 替换粗体样式为内核可识别<b>标签 https://github.com/siyuan-note/siyuan/issues/13306
function siyuanProcessBoldStyle(tempElement) {
    // 获取所有应用了 font-weight: bold 的元素
    const boldElements = tempElement.querySelectorAll('*');

    boldElements.forEach(element => {
        const style = window.getComputedStyle(element);
        if (element.tagName === 'B' || element.tagName === 'STRONG') {
            return; // 如果元素本身是 <b> 或 <strong> 标签，跳过
        }

        if (parentContainsBold(element)) {
            return;  // 如果元素的父元素是 <b> 或 <strong> 标签，跳过
        }

        // 判断是否具有 font-weight: bold
        if (style.fontWeight === 'bold' || style.fontWeight === '700') { // '700' 是 bold 的常见数值
            // 将 element 中的各个元素使用 <b> 标签包裹
            const children = element.childNodes;
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (child.nodeType === Node.TEXT_NODE) {
                    // 如果是文本节点，直接包裹在 <b> 标签中
                    const text = child.nodeValue;
                    const textElement = document.createElement('b');
                    textElement.setAttribute('b-added-by-siyuan', 'true');
                    textElement.textContent = text;
                    element.replaceChild(textElement, child);
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    // 如果是元素节点，递归处理
                    const childElement = child;
                    const childTagName = childElement.tagName.toLowerCase();
                    if (childTagName === 'b' || childTagName === 'strong') {
                        continue; // 如果是 <b> 或 <strong> 标签，跳过
                    }
                    if (parentContainsBold(childElement)) {
                        continue;  // 如果元素的父元素是 <b> 或 <strong> 标签，跳过
                    }
                    // 递归处理
                    siyuanProcessBoldStyle(childElement);
                }
            }
        }
    });
}

function parentContainsBold(element) {
    let parent = element.parentElement;
    while (parent) {
        if (parent.tagName === 'B' || parent.tagName === 'STRONG' ||
            parent.tagName === 'H1' || parent.tagName === 'H2' || parent.tagName === 'H3' || parent.tagName === 'H4' || parent.tagName === 'H5' || parent.tagName === 'H6') {
            return true;
        }
        parent = parent.parentElement;
    }
    return false;
}

function revertBoldStyles(tempElement) {
    // 获取所有带有 b-added-by-siyuan="true" 的 <b> 标签
    const elements = tempElement.querySelectorAll('b[b-added-by-siyuan="true"]');
    elements.forEach(element => {
        // 将包裹的 <b> 标签移除，恢复原本的元素
        const parent = element.parentNode;
        parent.replaceChild(document.createTextNode(element.textContent), element);
    });

    console.log(`revertBoldStyles reverted ${elements.length} <br> elements.`);
}

// 替换斜体样式为内核可识别 <i> 标签 https://github.com/siyuan-note/siyuan/issues/13306
function siyuanProcessItalicStyle(tempElement) {
    // 获取所有元素
    const allElements = tempElement.querySelectorAll('*');

    allElements.forEach(element => {
        const style = window.getComputedStyle(element);
        if (element.tagName === 'I' || element.tagName === 'EM') {
            return; // 如果元素本身是 <i> 或 <em> 标签，跳过
        }

        if (parentContainsItalic(element)) {
            return;  // 如果元素的父元素是 I 或 EM 标签，跳过
        }

        // 判断是否具有 font-style: italic
        if (style.fontStyle === 'italic') {
            // 将 element 中的各个元素使用 <i> 标签包裹
            const children = element.childNodes;
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (child.nodeType === Node.TEXT_NODE) {
                    // 如果是文本节点，直接包裹在 <i> 标签中
                    const text = child.nodeValue;
                    const textElement = document.createElement('i');
                    textElement.setAttribute('i-added-by-siyuan', 'true');
                    textElement.textContent = text;
                    element.replaceChild(textElement, child);
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    // 如果是元素节点，递归处理
                    const childElement = child;
                    const childTagName = childElement.tagName.toLowerCase();
                    if (childTagName === 'i' || childTagName === 'em') {
                        continue; // 如果是 <i> 或 <em> 标签，跳过
                    }
                    if (parentContainsItalic(childElement)) {
                        continue;  // 如果元素的父元素是 I 或 EM 标签，跳过
                    }
                    // 递归处理
                    siyuanProcessItalicStyle(childElement);
                }
            }
        }
    });
}

function revertItalicStyles(tempElement) {
    // 获取所有带有 b-added-by-siyuan="true" 的 <b> 标签
    const elements = tempElement.querySelectorAll('i[i-added-by-siyuan="true"]');
    elements.forEach(element => {
        // 将包裹的 <i> 标签移除，恢复原本的元素
        const parent = element.parentNode;
        parent.replaceChild(document.createTextNode(element.textContent), element);
    });

    console.log(`revertItalicStyles reverted ${elements.length} <br> elements.`);
}

function parentContainsItalic(element) {
    let parent = element.parentElement;
    while (parent) {
        if (parent.tagName === 'I' || parent.tagName === 'EM') {
            return true;
        }
        parent = parent.parentElement;
    }
    return false;
}

function simplifyNestedTags(root, tagName) {
    let elements = root.querySelectorAll(tagName);
    let hasNested = true;

    while (hasNested) {
        hasNested = false;
        elements.forEach(element => {
            if (simplifyElement(element, tagName)) {
                hasNested = true;
            }
        });
        elements = root.querySelectorAll(tagName);
    }

    function simplifyElement(element, tagName) {
        let nestedFound = false;
        if (element.hasChildNodes()) {
            element.childNodes.forEach(child => {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    if (child.tagName === tagName) {
                        nestedFound = true;
                        while (child.firstChild) {
                            element.insertBefore(child.firstChild, child);
                        }
                        child.remove();
                    } else {
                        nestedFound = nestedFound || simplifyElement(child, tagName);
                    }
                }
            });
        }
        return nestedFound;
    }
}

// 移除图片链接 https://github.com/siyuan-note/siyuan/issues/13941
function siyuanRemoveImgLink(tempElement) {
    const images = tempElement.querySelectorAll('img');
    images.forEach(image => {
        const parent = image.parentElement;
        if (!parent) {
            return;
        }

        if (parent.tagName === 'A') {
            const grandParent = parent.parentElement;
            if (!grandParent) {
                return;
            }
            grandParent.insertBefore(image, parent);
            parent.remove();
        }
    });
}

// 将 SVG 转换为 Base64 编码的 Data URI https://github.com/siyuan-note/siyuan/issues/14523
// 修复网页内嵌SVG包含非Latin字符导致剪藏报错 https://github.com/siyuan-note/siyuan/issues/14669
async function siyuanSvgToBase64(svgNode) {
    const serializer = new XMLSerializer();
    let svgStr = serializer.serializeToString(svgNode);

    if (!svgStr.startsWith('<?xml')) {
        svgStr = '<?xml version="1.0" encoding="UTF-8"?>' + svgStr;
    }

    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml' });

    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(svgBlob);
    });

    return dataUrl; // 返回 base64 编码的 data URL
}

async function siyuanSvgToImg(tempElement) {
    const svgElements = tempElement.querySelectorAll('svg');
    console.log(`Found ${svgElements.length} SVG elements`);

    for (const svg of svgElements) {
        const img = document.createElement('img');
        img.src = await siyuanSvgToBase64(svg);
        img.style.cssText = window.getComputedStyle(svg).cssText;
        svg.parentNode.replaceChild(img, svg);
    }
}


function adaptMSN(tempDoc) {
    if (tempDoc.documentURI.indexOf("msn.cn") !== -1) {
        // 删除掉其他不相关文章
        const articles = document.querySelectorAll(".consumption-page-gridarea_content");
        articles.forEach(article => {
            const shadowHost = article.querySelector("views-header-wc");
            if (!shadowHost) {
                return;
            }
            if (!shadowHost.shadowRoot) {
                return;
            }

            const titleEle = shadowHost.shadowRoot.querySelector("h1");
            if (!titleEle) {
                return;
            }

            if (titleEle.innerText.indexOf(tempDoc.title) === -1) {
                article.remove();
            }
        });

        // 将 Shadow DOM 展开
        const shadowHosts = document.querySelectorAll('cp-article');
        shadowHosts.forEach(element => {
            const shadowRoot = element.shadowRoot;
            if (!shadowRoot) {
                return;
            }

            const slots = shadowRoot.querySelectorAll('slot');
            slots.forEach(slot => {
                const slotName = slot.getAttribute('name');
                element.querySelectorAll(`[slot="${slotName}"]`).forEach(slotElement => {
                    const imgEle = slotElement.querySelector("cp-article-image");
                    if (!imgEle) {
                        return;
                    }
                    const imgShadowRoot = imgEle.shadowRoot;
                    if (!imgShadowRoot) {
                        return;
                    }
                    const imgs = imgShadowRoot.querySelectorAll('img');
                    if (!imgs || imgs.length === 0) {
                        return;
                    }
                    slotElement.innerHTML = ""
                    imgs.forEach(img => {
                        slotElement.appendChild(img.cloneNode(true));
                    });
                    slot.innerHTML = slotElement.innerHTML;
                });
            });

            const shadowContent = shadowRoot.innerHTML;
            const newDiv = document.createElement('div');
            newDiv.innerHTML = shadowContent;
            element.parentNode.replaceChild(newDiv, element);
        });
    }
}

// 重构并合并 Readability 前处理 https://github.com/siyuan-note/siyuan/issues/13306
async function siyuanGetCloneNode(tempDoc) {
    // 优先处理数学公式，避免被后续逻辑影响
    siyuanProcessKaTeX(tempDoc);
    
    let items;
    try {
        items = await new Promise((resolve, reject) => {
            chrome.storage.sync.get({
                expSpan: false,
                expBold: false,
                expItalic: false,
                expRemoveImgLink: false,
                expSvgToImg: false,
            }, (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result);
                }
            });
        });
    } catch (error) {
        console.error("获取失败，错误信息：", error);
        items = {
            expSpan: false,
            expBold: false,
            expItalic: false,
            expRemoveImgLink: false,
            expSvgToImg: false,
        };
    }

    // 适配 MSN 页面 https://github.com/siyuan-note/siyuan/issues/14197
    adaptMSN(tempDoc);

    // 前处理，增加可识别样式
    if (items.expBold) {
        // 替换粗体样式为内核可识别 <b> 标签 https://github.com/siyuan-note/siyuan/issues/13306
        siyuanProcessBoldStyle(tempDoc);
    }

    if (items.expItalic) {
        // 替换斜体样式为内核可识别 <i> 标签 https://github.com/siyuan-note/siyuan/issues/13306
        siyuanProcessItalicStyle(tempDoc);
    }

    if (items.expRemoveImgLink) {
        // 移除图片链接 https://github.com/siyuan-note/siyuan/issues/13941
        siyuanRemoveImgLink(tempDoc);
    }

    if (items.expSpan) {
        // 网页换行用 span 样式 word-break 的特殊处理 https://github.com/siyuan-note/siyuan/issues/13195
        // 处理会换行的 span 后添加 <br>，让内核能识别到换行
        siyuanSpansAddBr(tempDoc);
    }

    if (items.expSvgToImg) {
        // 将网页内嵌的SVG节点转换成内嵌的IMG节点
        // https://github.com/siyuan-note/siyuan/issues/14523
        await siyuanSvgToImg(tempDoc);
    }

    // 合并嵌套的标签
    simplifyNestedTags(tempDoc, 'STRONG');
    simplifyNestedTags(tempDoc, 'B');
    simplifyNestedTags(tempDoc, 'I');
    simplifyNestedTags(tempDoc, 'EM');

    // 如果公式被嵌套包裹，则去掉外层包裹 https://github.com/siyuan-note/siyuan/issues/14382
    const mathElements = tempDoc.querySelectorAll('.ztext-math');
    mathElements.forEach(mathElement => {
        if (mathElement.parentElement.tagName === 'B' || mathElement.parentElement.tagName === 'STRONG' || mathElement.parentElement.tagName === 'I' || mathElement.parentElement.tagName === 'EM') {
            const parent = mathElement.parentElement;
            while (parent.firstChild) {
                parent.parentNode.insertBefore(parent.firstChild, parent);
            }
            parent.remove();
        }
    });

    // 如果行级标签包含了块级标签，则将该行级标签改为 div
    const inlineTags = ['span', 'strong', 'b', 'i', 'em', 'a'];
    const blockTags = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'blockquote', 'pre', 'code', 'section'];
    inlineTags.forEach(inlineTag => {
        const elements = document.querySelectorAll(inlineTag);
        elements.forEach(element => {
            let containsBlock = false;
            blockTags.forEach(blockTag => {
                if (element.querySelector(blockTag)) {
                    containsBlock = true;
                }
            });
            if (containsBlock) {
                const div = document.createElement('div');
                while (element.firstChild) {
                    div.appendChild(element.firstChild);
                }
                element.parentNode.replaceChild(div, element);
            }
        });
    });

    const clonedDoc = document.cloneNode(true);

    // 后处理，还原样式
    if (items.expBold) {
        // 还原粗体样式
        revertBoldStyles(tempDoc);
    }

    if (items.expItalic) {
        // 还原斜体样式
        revertItalicStyles(tempDoc);
    }

    return clonedDoc;
}

// 从 KaTeX 渲染的 HTML 结构中重构 LaTeX 源码
function extractLatexFromKatexHTML(katexElement) {
    // 获取渲染后的文本内容作为备用
    const textContent = katexElement.textContent.trim();
    if (!textContent) return '';
    
    try {
        // 尝试从DOM结构重构LaTeX
        const latex = reconstructLatexFromDOM(katexElement);
        if (latex && latex !== textContent) {
            return latex;
        }
    } catch (e) {
        console.warn('LaTeX reconstruction failed, falling back to text content:', e);
    }
    
    // 备用方案：简单的文本到LaTeX映射
    return applySymbolMappings(textContent);
}

// 从KaTeX DOM结构重构LaTeX语法
function reconstructLatexFromDOM(katexElement) {
    const katexHtml = katexElement.querySelector('.katex-html');
    if (!katexHtml) return '';
    
    // 处理主要的数学结构
    const base = katexHtml.querySelector('.base');
    if (!base) return '';
    
    return processKatexNode(base);
}

// 递归处理KaTeX DOM节点
function processKatexNode(node) {
    if (!node) return '';
    
    let result = '';
    
    for (let child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            result += child.textContent;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            const className = child.className || '';
            
            // 处理上标 (superscript)
            if (className.includes('msupsub')) {
                result += processSuperSubscript(child);
            }
            // 处理分数
            else if (className.includes('mfrac')) {
                result += processFraction(child);
            }
            // 处理根式
            else if (className.includes('mroot') || className.includes('msqrt')) {
                result += processRoot(child);
            }
            // 处理函数名
            else if (className.includes('mop')) {
                const opText = child.textContent.trim();
                if (opText === 'lim') result += '\\lim';
                else if (opText === 'sin') result += '\\sin';
                else if (opText === 'cos') result += '\\cos';
                else if (opText === 'log') result += '\\log';
                else result += opText;
            }
            // 处理关系符号和运算符
            else if (className.includes('mrel') || className.includes('mbin')) {
                result += applySymbolMappings(child.textContent);
            }
            // 处理标点符号
            else if (className.includes('mpunct')) {
                result += child.textContent;
            }
            // 处理括号
            else if (className.includes('mopen') || className.includes('mclose')) {
                result += child.textContent;
            }
            // 处理普通字符和数字
            else if (className.includes('mord')) {
                // 检查是否包含上下标
                if (child.querySelector('.msupsub')) {
                    result += processMordWithSubSup(child);
                } else {
                    result += applySymbolMappings(child.textContent);
                }
            }
            // 处理间距
            else if (className.includes('mspace')) {
                // KaTeX的间距，在LaTeX中通常不需要显式表示
                result += ' ';
            }
            // 递归处理其他节点
            else {
                result += processKatexNode(child);
            }
        }
    }
    
    return result;
}

// 处理包含上下标的普通字符
function processMordWithSubSup(mordElement) {
    let result = '';
    
    for (let child of mordElement.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            result += applySymbolMappings(child.textContent);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            const className = child.className || '';
            
            if (className.includes('msupsub')) {
                result += processSuperSubscript(child);
            } else {
                result += applySymbolMappings(child.textContent);
            }
        }
    }
    
    return result;
}

// 处理上下标结构
function processSuperSubscript(supsubElement) {
    let result = '';
    
    // 查找下标和上标
    const subs = supsubElement.querySelectorAll('.msub');
    const sups = supsubElement.querySelectorAll('.msup'); 
    
    // 处理下标
    if (subs.length > 0) {
        for (let sub of subs) {
            const subText = processKatexNode(sub).trim();
            if (subText) {
                // 如果下标内容超过一个字符，用大括号包围
                if (subText.length > 1) {
                    result += `_{${subText}}`;
                } else {
                    result += `_${subText}`;
                }
            }
        }
    }
    
    // 处理上标
    if (sups.length > 0) {
        for (let sup of sups) {
            const supText = processKatexNode(sup).trim();
            if (supText) {
                // 如果上标内容超过一个字符，用大括号包围
                if (supText.length > 1) {
                    result += `^{${supText}}`;
                } else {
                    result += `^${supText}`;
                }
            }
        }
    }
    
    return result;
}

// 处理分数结构
function processFraction(fracElement) {
    const numerator = fracElement.querySelector('.mfrac > .frac-line ~ *');
    const denominator = fracElement.querySelector('.mfrac > *:first-child');
    
    if (numerator && denominator) {
        const numText = processKatexNode(numerator).trim();
        const denText = processKatexNode(denominator).trim();
        return `\\frac{${numText}}{${denText}}`;
    }
    
    return fracElement.textContent;
}

// 处理根式结构
function processRoot(rootElement) {
    const radicand = rootElement.querySelector('.mroot > .root-content, .msqrt > *');
    
    if (radicand) {
        const content = processKatexNode(radicand).trim();
        return `\\sqrt{${content}}`;
    }
    
    return rootElement.textContent;
}

// 应用符号映射
function applySymbolMappings(text) {
    if (!text) return '';
    
    const symbolMappings = {
        '≤': '\\leq',
        '≥': '\\geq', 
        '≠': '\\neq',
        '×': '\\times',
        '÷': '\\div',
        '±': '\\pm',
        '∓': '\\mp',
        '∞': '\\infty',
        '∈': '\\in',
        '∉': '\\notin',
        '⊂': '\\subset',
        '⊃': '\\supset',
        '⊆': '\\subseteq',
        '⊇': '\\supseteq',
        '∪': '\\cup',
        '∩': '\\cap',
        '∅': '\\emptyset',
        'α': '\\alpha',
        'β': '\\beta', 
        'γ': '\\gamma',
        'δ': '\\delta',
        'ε': '\\varepsilon',
        'ζ': '\\zeta',
        'η': '\\eta',
        'θ': '\\theta',
        'ι': '\\iota',
        'κ': '\\kappa',
        'λ': '\\lambda',
        'μ': '\\mu',
        'ν': '\\nu',
        'ξ': '\\xi',
        'π': '\\pi',
        'ρ': '\\rho',
        'σ': '\\sigma',
        'τ': '\\tau',
        'υ': '\\upsilon',
        'φ': '\\varphi',
        'χ': '\\chi',
        'ψ': '\\psi',
        'ω': '\\omega',
        'Γ': '\\Gamma',
        'Δ': '\\Delta',
        'Θ': '\\Theta',
        'Λ': '\\Lambda',
        'Ξ': '\\Xi',
        'Π': '\\Pi',
        'Σ': '\\Sigma',
        'Υ': '\\Upsilon',
        'Φ': '\\Phi',
        'Χ': '\\Chi',
        'Ψ': '\\Psi',
        'Ω': '\\Omega'
    };
    
    let result = text;
    for (const [symbol, latexSymbol] of Object.entries(symbolMappings)) {
        result = result.replace(new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), latexSymbol);
    }
    
    return result;
}

// 添加 KaTeX 公式处理，提取 LaTeX 源并替换为文本节点
function siyuanProcessKaTeX(tempElement) {
    // 原生 KaTeX: 从 katex-mathml 注释中提取 LaTeX，并根据 display 类区分行内($)或块级($$)包裹
    tempElement.querySelectorAll('span.katex-mathml').forEach(block => {
        const annotation = block.querySelector('annotation[encoding="application/x-tex"]');
        if (!annotation) return;
        const latex = annotation.textContent.trim();
        const displayWrapper = block.closest('span.katex-display');
        const inlineWrapper = block.closest('span.katex');
        const isDisplay = Boolean(displayWrapper);
        const delim = isDisplay ? ['$$', '$$'] : ['$', '$'];
        const wrapper = displayWrapper || inlineWrapper || block;
        const textNode = document.createTextNode(delim[0] + latex + delim[1]);
        wrapper.replaceWith(textNode);
    });
    // 支持 katex-elements Web Components: <katex-element> (行内) 与 <katex-display> (块级)，同样区分 $ 与 $$
    tempElement.querySelectorAll('katex-element, katex-display').forEach(el => {
        const latex = (el.getAttribute('math') || '').trim();
        if (!latex) return;
        const isDisplayEl = el.tagName.toLowerCase() === 'katex-display';
        const delimEl = isDisplayEl ? ['$$', '$$'] : ['$', '$'];
        el.replaceWith(document.createTextNode(delimEl[0] + latex + delimEl[1]));
    });
    
    // 处理只有渲染HTML没有源码的KaTeX结构 (如用户提供的情况)
    tempElement.querySelectorAll('span.math.math-inline, span.math.math-display').forEach(mathSpan => {
        // 检查是否已经被前面的逻辑处理过
        if (mathSpan.parentNode === null) return;
        
        const katexSpan = mathSpan.querySelector('span.katex');
        if (!katexSpan) return;
        
        // 尝试从渲染的HTML中重构LaTeX源码
        const latex = extractLatexFromKatexHTML(katexSpan);
        if (!latex) return;
        
        // 根据类名判断是行内公式还是块级公式
        const isDisplay = mathSpan.classList.contains('math-display');
        const delim = isDisplay ? ['$$', '$$'] : ['$', '$'];
        
        // 替换整个math span为LaTeX文本节点
        const textNode = document.createTextNode(delim[0] + latex + delim[1]);
        mathSpan.replaceWith(textNode);
    });
    
    // 处理其他可能的KaTeX结构（备用方案）
    tempElement.querySelectorAll('span.katex').forEach(katexSpan => {
        // 检查是否已经被处理或者有父级的math容器
        if (katexSpan.parentNode === null) return;
        if (katexSpan.closest('span.math')) return; // 已经被上面的逻辑处理
        
        // 尝试提取LaTeX源码
        const latex = extractLatexFromKatexHTML(katexSpan);
        if (!latex) return;
        
        // 检查是否有display类来判断公式类型
        const isDisplay = katexSpan.classList.contains('katex-display') || 
                          katexSpan.closest('.katex-display');
        const delim = isDisplay ? ['$$', '$$'] : ['$', '$'];
        
        const textNode = document.createTextNode(delim[0] + latex + delim[1]);
        katexSpan.replaceWith(textNode);
    });
}

// 转换知乎跳转链接为原链接
function siyuanConvertZhihuRedirectLinks(tempElement) {
    const links = tempElement.querySelectorAll('a[href*="link.zhihu.com"]');
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.indexOf('target=') !== -1) {
            try {
                const url = new URL(href);
                const targetParam = url.searchParams.get('target');
                if (targetParam) {
                    const originalUrl = decodeURIComponent(targetParam);
                    link.setAttribute('href', originalUrl);
                }
            } catch (e) {
                console.warn('Failed to convert Zhihu redirect link:', href, e);
            }
        }
    });
}

const siyuanSendUpload = async (tempElement, tabId, srcUrl, type, article, href, insertAtFocus, closeTabAfter = false) => {
    // 处理知乎跳转链接
    siyuanConvertZhihuRedirectLinks(tempElement);
    chrome.storage.sync.get({
        ip: 'http://127.0.0.1:6806',
        showTip: true,
        token: '',
        notebook: '',
        parentDoc: '',
        parentHPath: '',
        tags: '',
        assets: true,
        expOpenAfterClip: false,
        expSpan: false,
        expBold: false,
        expItalic: false,
        expRemoveImgLink: false,
        expListDocTree: false,
    }, async function (items) {
        if (!items.token) {
            siyuanShowTipByKey("tip_token_miss")
            return
        }

        if (!items.notebook) {
            siyuanShowTipByKey("tip_save_path_miss")
            return
        }

        let srcList = []
        if (srcUrl) {
            srcList.push(srcUrl)
        }
        const images = tempElement.querySelectorAll('img')
        images.forEach(item => {
            let src = item.getAttribute('src')
            if (!src) {
                return
            }

            if (item.className.includes("emoji") && "" !== item.getAttribute("alt")) {
                // 图片 Emoji 直接使用 alt https://github.com/siyuan-note/siyuan/issues/13342
                return
            }

            // 处理使用 data-original 属性的情况 https://github.com/siyuan-note/siyuan/issues/11826
            let dataOriginal = item.getAttribute('data-original')
            if (dataOriginal && !dataOriginal.startsWith("/")) {
                if (!src || !src.endsWith('.gif')) {
                    src = dataOriginal
                }
            }

            if ('https:' === window.location.protocol) {
                if (src.startsWith('http:')) {
                    src = src.replace('http:', 'https:')
                } else if (src.startsWith('//')) {
                    src = 'https:' + src
                }
                item.setAttribute('src', src)
            }

            if (-1 < item.className.indexOf("ztext-gif") && -1 < src.indexOf("zhimg.com")) {
                // 处理知乎动图
                src = src.replace(".jpg", ".webp")
            }

            srcList.push(src)
        })

        const files = {}
        srcList = [...new Set(srcList)]

        if (!items.assets) { // 不剪藏资源文件 https://github.com/siyuan-note/siyuan/issues/12583
            srcList = []
        }

        let fetchFileErr = false;
        for (let i = 0; i < srcList.length; i++) {
            let src = srcList[i]
            siyuanShowTip(chrome.i18n.getMessage("tip_clip_img") + ' [' + i + '/' + srcList.length + ']...');
            let response;
            try {
                // Wikipedia 使用图片原图 https://github.com/siyuan-note/siyuan/issues/11640
                if (-1 !== src.indexOf('wikipedia/commons/thumb/')) {
                    let idx = src.lastIndexOf('.')
                    let ext = src.substring(idx)
                    if (0 < src.indexOf('.svg.png')) {
                        ext = '.svg'
                    }
                    idx = src.indexOf(ext + '/')
                    if (0 < idx) {
                        src = src.substring(0, idx + ext.length)
                        src = src.replace('/commons/thumb/', '/commons/')
                    }
                }
                response = await fetch(src, {
                    "headers": {
                        "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                        "sec-fetch-dest": "image",
                    },
                });
            } catch (e) {
                console.warn("fetch [" + src + "] failed", e)
                fetchFileErr = true;
                continue
            }
            const image = await response.blob()
            files[escape(src)] = {
                type: image.type,
                data: await siyuanConvertBlobToBase64(image),
            }
        }

        let title = article && article.title ? article.title : document.title || "";
        let siteName = article && article.siteName ? article.siteName : "";
        let excerpt = article && article.excerpt ? article.excerpt : "";
        let url = href || window.location.href;

                 const msgJSON = {
             fetchFileErr,
             files: files,
             dom: tempElement.innerHTML,
             api: items.ip,
             token: items.token,
             notebook: items.notebook,
             parentDoc: items.parentDoc,
             parentHPath: items.parentHPath.substring(items.parentHPath.indexOf('/')),
             tags: items.tags,
             assets: items.assets,
             tip: items.showTip,
             title: title,
             siteName: siteName,
             excerpt: excerpt,
             listDocTree: items.expListDocTree,
             href: url,
             type,
             tabId,
             insertAtFocus: insertAtFocus,
             closeTabAfter: closeTabAfter,
         };

        if (type === 'part') {
            chrome.runtime.sendMessage({ func: 'upload-copy', data: msgJSON })
        } else {
            // 如果是全文剪藏获取页面中 __siyuanCreateDocExtraParam 函数的返回值
            
            // 向页面发送消息请求额外参数
            window.postMessage({
                type: 'GET_SIYUAN_EXTRA_PARAMS',
                source: 'siyuan-chrome-extension'
            }, '*');
            
            // 监听页面返回的消息
            const messageHandler = (event) => {
                if (event.data && event.data.type === 'SIYUAN_EXTRA_PARAMS_RESPONSE' && 
                    event.data.source === 'siyuan-chrome-extension') {
                    if (event.data.params && typeof event.data.params === 'object' && !Array.isArray(event.data.params)) {
                        msgJSON.extraParams = event.data.params;
                    }
                    // 移除消息监听器
                    window.removeEventListener('message', messageHandler);
                    chrome.runtime.sendMessage({ func: 'upload-copy', data: msgJSON })
                }
            };
            
            window.addEventListener('message', messageHandler);
        }
    })
}

// 完整页面抓取函数
const siyuanCaptureFullPage = async (tabId, closeTabAfter = false) => {
    try {
        siyuanShowTipByKey("tip_clipping", 60 * 1000)
    } catch (e) {
        siyuanShowTip("First time using extension - please reload page", 5000);
        return;
    }

    try {
        // 浏览器剪藏扩展剪藏某些网页代码块丢失注释 https://github.com/siyuan-note/siyuan/issues/5676
        document.querySelectorAll(".hljs-comment").forEach(item => {
            item.classList.remove("hljs-comment")
            item.classList.add("hljs-cmt")
        })

        // 重构并合并 Readability 前处理 https://github.com/siyuan-note/siyuan/issues/13306
        const clonedDoc = await siyuanGetCloneNode(document);

        const article = new Readability(clonedDoc, {
            keepClasses: true,
            charThreshold: 16,
            debug: true
        }).parse()
        const tempElement = document.createElement('div')
        tempElement.innerHTML = article.content
        // console.log(article)
        siyuanSendUpload(tempElement, tabId, undefined, "article", article, window.location.href, undefined, closeTabAfter)
    } catch (e) {
        console.error(e)
        siyuanShowTip(e.message, 7 * 1000)
    }
}
