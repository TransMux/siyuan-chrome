(function () {
    /**
     * 小红书笔记解析器
     * 将小红书笔记页面解析为Markdown格式
     */

    /**
     * 从DOM节点中提取文本内容（递归处理）
     * @param {Node} node - 要提取文本的DOM节点
     * @param {boolean} includeEmoji - 是否包含emoji处理
     * @returns {string} 提取的文本内容
     */
    function extractTextFromNode(node, includeEmoji = true) {
        if (!node) return '';

        let text = '';
        const traverse = (n) => {
            if (!n || !n.childNodes) return;

            n.childNodes.forEach(child => {
                if (child.nodeType === Node.TEXT_NODE) {
                    text += child.textContent;
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    if (includeEmoji && child.tagName === 'IMG' && child.classList.contains('note-content-emoji')) {
                        text += '[emoji]';
                    } else if (child.tagName === 'SPAN' || child.tagName === 'A') {
                        traverse(child);
                    } else {
                        text += child.textContent || '';
                    }
                }
            });
        };
        traverse(node);
        return text.trim();
    }

    /**
     * 安全地获取文本内容
     * @param {Element} element - DOM元素
     * @returns {string} 文本内容
     */
    function safeGetText(element) {
        return element?.textContent?.trim() ?? '';
    }

    /**
     * 安全地解析整数
     * @param {string} text - 要解析的文本
     * @returns {number} 解析后的整数
     */
    function safeParseInt(text) {
        const parsed = parseInt(text, 10);
        return isNaN(parsed) ? 0 : parsed;
    }

    /**
     * 等待指定时间（异步非阻塞）
     * @param {number} ms - 等待的毫秒数
     * @returns {Promise} Promise对象
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 执行剪藏前的准备工作：滚动和展开内容（异步）
     * @returns {Promise} Promise对象
     */
    async function preparePageContent() {
        // 1. 对 list-container 元素执行向下滚动到底操作 5 次
        const listContainer = document.querySelector('.list-container');
        if (listContainer) {
            for (let i = 0; i < 5; i++) {
                listContainer.scrollTop = listContainer.scrollHeight;
                await sleep(300); // 等待300ms让内容加载
            }
        }

        // 2. 点击笔记范围内所有 show-more 元素，循环执行 3 次
        const noteContainer = document.querySelector('.note-container, #noteContainer');
        if (noteContainer) {
            for (let round = 0; round < 3; round++) {
                const showMoreElements = noteContainer.querySelectorAll('.show-more');
                for (const element of showMoreElements) {
                    if (element && element.offsetParent !== null) { // 检查元素是否可见
                        element.click();
                        await sleep(200); // 等待200ms让内容展开
                    }
                }
                await sleep(500); // 每轮之间等待500ms
            }
        }
        
        // 等待交互完成，确保DOM更新完成
        await sleep(500);
    }

    window.__siyuanGetPageContent = async function () {
        try {
            // 剪藏前准备工作：滚动和展开内容（异步等待）
            await preparePageContent();

            // 检查是否在小红书笔记详情页
            const noteContainer = document.querySelector('.note-container, #noteContainer');
            if (!noteContainer) {
                return {
                    type: "markdown",
                    content: null,
                    success: false,
                    refresh: false,
                    error: "未找到小红书笔记内容"
                };
            }

            const result = {
                author: '',
                authorUrl: '',
                avatarUrl: '',
                title: '',
                content: '',
                tags: [],
                location: '',
                date: '',
                images: [],
                stats: {
                    likes: 0,
                    collects: 0,
                    comments: 0
                },
                comments: []
            };

            // 1. 提取作者信息
            const authorLink = document.querySelector('.author-wrapper .info a.name, .author .name');
            if (authorLink) {
                const usernameEl = authorLink.querySelector('.username');
                result.author = usernameEl ? safeGetText(usernameEl) : safeGetText(authorLink);
                result.authorUrl = authorLink.href || '';
            }

            // 提取头像
            const avatar = document.querySelector('.author-wrapper .info img.avatar-item, .author img.avatar-item');
            if (avatar) {
                result.avatarUrl = avatar.src || '';
            }

            // 2. 提取标题
            const titleEl = document.querySelector('#detail-title, .title');
            if (titleEl) {
                result.title = window.document.title;
            }

            // 3. 提取正文内容
            const descEl = document.querySelector('#detail-desc .note-text, .desc .note-text');
            if (descEl) {
                result.content = extractTextFromNode(descEl);
            }

            // 4. 提取标签
            const tagLinks = document.querySelectorAll('#detail-desc a.tag, .desc a.tag');
            if (tagLinks && tagLinks.length > 0) {
                tagLinks.forEach(tagLink => {
                    const tagText = safeGetText(tagLink);
                    if (tagText) {
                        result.tags.push(tagText);
                    }
                });
            }

            // 5. 提取日期和地点
            const dateEl = document.querySelector('.bottom-container .date, .note-content .date');
            if (dateEl) {
                const dateText = safeGetText(dateEl);
                if (dateText) {
                    const parts = dateText.split(' ');
                    if (parts.length >= 2) {
                        result.date = parts[0];
                        result.location = parts.slice(1).join(' ');
                    } else {
                        result.date = dateText;
                    }
                }
            }

            // 6. 提取图片
            const images = document.querySelectorAll('.note-slider-img img, .img-container img, .swiper-slide img');
            if (images && images.length > 0) {
                const uniqueImages = new Set();
                images.forEach(img => {
                    const src = img.src;
                    if (src && src.startsWith('http') && !src.includes('emoji') && !src.includes('avatar')) {
                        uniqueImages.add(src);
                    }
                });
                result.images = Array.from(uniqueImages);
            }

            // 7. 提取互动数据 (点赞、收藏、评论)
            const likeCount = document.querySelector('.engage-bar .like-wrapper .count, .interaction .like .count');
            if (likeCount) {
                const likeText = safeGetText(likeCount);
                if (likeText && likeText !== '赞') {
                    result.stats.likes = safeParseInt(likeText);
                }
            }

            const collectCount = document.querySelector('.engage-bar .collect-wrapper .count, .interaction .collect .count');
            if (collectCount) {
                const collectText = safeGetText(collectCount);
                if (collectText && collectText !== '收藏') {
                    result.stats.collects = safeParseInt(collectText);
                }
            }

            const commentCount = document.querySelector('.engage-bar .chat-wrapper .count, .interaction .comment .count');
            if (commentCount) {
                const commentText = safeGetText(commentCount);
                if (commentText && commentText !== '评论') {
                    result.stats.comments = safeParseInt(commentText);
                }
            }

            // 8. 提取评论 - 只从 parent-comment 提取，避免重复
            const parentComments = document.querySelectorAll('.parent-comment');
            if (parentComments && parentComments.length > 0) {
                parentComments.forEach(parentCommentEl => {
                    // 查找主评论（.comment-item 但不包含 .comment-item-sub）
                    const mainCommentEl = parentCommentEl.querySelector('.comment-item:not(.comment-item-sub)');
                    if (!mainCommentEl) return;

                    const comment = {
                        author: '',
                        authorUrl: '',
                        avatarUrl: '',
                        content: '',
                        date: '',
                        location: '',
                        likes: 0,
                        replies: []
                    };

                    // 评论作者
                    const commentAuthorLink = mainCommentEl.querySelector('.author a.name, .comment-inner-container .author a.name');
                    if (commentAuthorLink) {
                        comment.author = safeGetText(commentAuthorLink);
                        comment.authorUrl = commentAuthorLink.href || '';
                    }

                    // 评论头像
                    const commentAvatar = mainCommentEl.querySelector('.avatar img.avatar-item');
                    if (commentAvatar) {
                        comment.avatarUrl = commentAvatar.src || '';
                    }

                    // 评论内容 - 尝试多种选择器
                    let commentContent = mainCommentEl.querySelector('.comment-inner-container > .right > .content .note-text');
                    if (!commentContent) {
                        commentContent = mainCommentEl.querySelector('.right .content .note-text');
                    }
                    if (!commentContent) {
                        commentContent = mainCommentEl.querySelector('.content .note-text');
                    }

                    if (commentContent) {
                        comment.content = extractTextFromNode(commentContent);
                    }

                    // 评论日期和地点
                    const commentDate = mainCommentEl.querySelector('.comment-inner-container > .right > .info .date, .info .date');
                    if (commentDate) {
                        const dateSpan = commentDate.querySelector('span:first-child');
                        const locationSpan = commentDate.querySelector('.location');
                        if (dateSpan) {
                            comment.date = safeGetText(dateSpan);
                        }
                        if (locationSpan) {
                            comment.location = safeGetText(locationSpan);
                        }
                    }

                    // 评论点赞数
                    const commentLikes = mainCommentEl.querySelector('.comment-inner-container > .right > .info .like .count, .info .like .count');
                    if (commentLikes) {
                        const likesText = safeGetText(commentLikes);
                        if (likesText && likesText !== '赞') {
                            comment.likes = safeParseInt(likesText);
                        }
                    }

                    // 提取回复 - 只在当前 parent-comment 的 reply-container 内查找
                    const replyContainer = parentCommentEl.querySelector('.reply-container');
                    if (replyContainer) {
                        const replyItems = replyContainer.querySelectorAll('.comment-item-sub');
                        if (replyItems && replyItems.length > 0) {
                            replyItems.forEach(replyEl => {
                                const reply = {
                                    author: '',
                                    content: '',
                                    date: '',
                                    location: '',
                                    isAuthor: false
                                };

                                // 回复作者
                                const replyAuthorLink = replyEl.querySelector('.author a.name, .comment-inner-container .author a.name');
                                if (replyAuthorLink) {
                                    reply.author = safeGetText(replyAuthorLink);
                                }

                                // 是否是作者回复
                                const authorTag = replyEl.querySelector('.author .tag');
                                if (authorTag && safeGetText(authorTag) === '作者') {
                                    reply.isAuthor = true;
                                }

                                // 回复内容 - 需要处理"回复 xxx:"的情况
                                const replyContent = replyEl.querySelector('.content .note-text');
                                if (replyContent) {
                                    // 提取纯文本内容，忽略"回复 xxx:"前缀
                                    let content = extractTextFromNode(replyContent, false);
                                    // 清理可能的"回复 xxx:"前缀（虽然理论上不应该有，但为了保险）
                                    content = content.replace(/^回复\s+[^:]+:\s*/, '').trim();
                                    reply.content = content;
                                }

                                // 回复日期和地点
                                const replyDate = replyEl.querySelector('.info .date');
                                if (replyDate) {
                                    const dateSpan = replyDate.querySelector('span:first-child');
                                    const locationSpan = replyDate.querySelector('.location');
                                    if (dateSpan) {
                                        reply.date = safeGetText(dateSpan);
                                    }
                                    if (locationSpan) {
                                        reply.location = safeGetText(locationSpan);
                                    }
                                }

                                // 只添加有内容的回复
                                if (reply.content || reply.author) {
                                    comment.replies.push(reply);
                                }
                            });
                        }
                    }

                    // 只添加有有效内容或作者信息的评论
                    if ((comment.content || comment.replies.length > 0) && comment.author) {
                        result.comments.push(comment);
                    }
                });
            }

            // 转换为Markdown
            let markdown;
            try {
                markdown = convertToMarkdown(result);
            } catch (mdError) {
                console.error('小红书Markdown转换错误:', mdError);
                // 即使Markdown转换失败，也尝试返回基本信息
                markdown = `# ${result.title || '小红书笔记'}\n\n解析出现错误，但成功提取了标题。`;
            }

            return {
                type: "markdown",
                title: result.title || '小红书笔记',
                content: markdown,
                success: true,
                refresh: false
            };

        } catch (error) {
            console.error('小红书DOM解析错误:', error);
            return {
                type: "markdown",
                content: null,
                success: false,
                error: error.message,
                refresh: false
            };
        }
    };

    /**
     * 格式化标题部分
     */
    function formatHeader(data) {
        // return data.title ? `# ${data.title}\n\n` : '';
        return '';
    }

    /**
     * 格式化元数据部分（作者、日期、地点）
     */
    function formatMetadata(data) {
        return `[${data.author}](${data.authorUrl}) · ${data.date} · ${data.location}\n\n`;
    }

    /**
     * 格式化正文内容
     */
    function formatContent(data) {
        return data.content ? `${data.content}\n\n` : '';
    }

    /**
     * 格式化标签
     */
    function formatTags(data) {
        // return data.tags.length > 0 ? `${data.tags.join(' ')}\n\n` : '';
        return '';
    }

    /**
     * 格式化图片
     */
    function formatImages(data) {
        if (data.images.length === 0) return '';
        
        let md = '{{{row\n\n';
        data.images.forEach((img, index) => {
            md += `![图片${index + 1}](${img})\n\n`;
        });
        md += '}}}\n\n';
        return md;
    }
    /**
     * 格式化互动数据
     */
    function formatStats(data) {
        if (!data.stats.likes && !data.stats.collects && !data.stats.comments) return '';

        return `👍 ${data.stats.likes} · 💖 ${data.stats.collects} · 💬 ${data.stats.comments}\n\n`;
    }

    /**
     * 格式化评论
     */
    function formatComments(data) {
        if (data.comments.length === 0) return '';

        let md = '';

        data.comments.forEach((comment) => {
            // 主评论格式: - 作者: 内容 (日期 · 地点)
            let dateLocation = '';
            if (comment.date || comment.location) {
                const parts = [];
                if (comment.date) parts.push(comment.date);
                if (comment.location) parts.push(comment.location);
                dateLocation = ` (${parts.join(' · ')})`;
            }

            const commentContent = comment.content || '';
            md += `- ${comment.author}: ${commentContent}${dateLocation}\n`;

            // 回复格式:   - 作者 (作者): 内容 (日期 · 地点)
            if (comment.replies.length > 0) {
                comment.replies.forEach((reply) => {
                    let replyDateLocation = '';
                    if (reply.date || reply.location) {
                        const parts = [];
                        if (reply.date) parts.push(reply.date);
                        if (reply.location) parts.push(reply.location);
                        replyDateLocation = ` (${parts.join(' · ')})`;
                    }

                    const authorLabel = reply.isAuthor ? `${reply.author} (作者)` : reply.author;
                    const replyContent = reply.content || '';
                    md += `  - ${authorLabel}: ${replyContent}${replyDateLocation}\n`;
                });
            }

            md += '\n';
        });

        return md;
    }

    /**
     * 将解析结果转换为Markdown格式
     */
    function convertToMarkdown(data) {
        const sections = [
            formatHeader(data),
            formatMetadata(data),
            formatImages(data),
            formatContent(data),
            formatTags(data),
            formatStats(data),
            formatComments(data)
        ];

        return sections.filter(s => s).join('');
    }
})();
