(function () {
    // PageMain数据结构转换器
    class PageMainConverter {
        constructor(rootBlock) {
            this.rootBlock = rootBlock;
            this.processedBlocks = new Set();
        }

        async convertToMarkdown() {
            if (!this.rootBlock) {
                return '# 无法获取文档数据\n\n文档可能还在加载中，请稍后重试。';
            }

            const title = this.getDocumentTitle();
            // console.error(`开始转换文档: ${title}`);

            let content = [];
            // content.push(`# ${title}\n\n`);

            // 转换所有子块（支持异步）
            if (this.rootBlock.children && Array.isArray(this.rootBlock.children)) {
                for (const block of this.rootBlock.children) {
                    const blockContent = await this.convertBlock(block);
                    if (blockContent) {
                        content.push(blockContent);
                    }
                }
            }

            return content.join('\n\n');
        }

        getDocumentTitle() {
            if (this.rootBlock.zoneState?.allText) {
                let title = this.rootBlock.zoneState.allText.replace(/\n$/, '');
                // 移除末尾的" - 飞书云文档"后缀
                title = title.replace(/ - 飞书云文档$/, '');
                return title;
            }
            return '未命名文档';
        }

        async convertBlock(block) {
            if (!block || this.processedBlocks.has(block.id)) {
                return '';
            }

            this.processedBlocks.add(block.id);

            const blockType = block.type || block.snapshot?.type;
            if (!blockType) {
                return '';
            }
            // console.error(`convertBlock: ${blockType}, ${block}`);

            switch (blockType) {
                case 'text':
                    return this.convertTextBlock(block);
                case 'heading1':
                case 'heading2':
                case 'heading3':
                case 'heading4':
                case 'heading5':
                case 'heading6':
                    return await this.convertHeadingBlock(block);
                case 'bullet':
                case 'ordered':
                case 'todo':
                    return await this.convertListBlock(block);
                case 'callout':
                    return await this.convertCalloutBlock(block);
                case 'code':
                    return this.convertCodeBlock(block);
                case 'divider':
                    return '---\n\n';
                case 'image':
                    return await this.convertImageBlock(block);
                case 'table':
                    return await this.convertTableBlock(block);
                case 'quote_container':
                    return await this.convertQuoteBlock(block);
                case 'file':
                    return this.convertFileBlock(block);
                case 'iframe':
                    return this.convertIframeBlock(block);
                case 'whiteboard':
                    return await this.convertWhiteboardBlock(block);
                case 'equation':
                    return this.convertEquationBlock(block);
                case 'grid':
                    return await this.convertGridBlock(block);
                case 'grid_column':
                    return await this.convertGridColumnBlock(block);
                case 'bookmark':
                    return this.convertBookmarkBlock(block);
                case 'mindnote':
                    return this.convertMindnoteBlock(block);
                case 'synced_source':
                    return await this.convertSyncedSourceBlock(block);
                case 'synced_reference':
                    return await this.convertSyncedReferenceBlock(block);
                case 'wiki_catalog':
                case 'fallback':
                    return ""
                default:
                    // console.error(`⚠️ 未支持的块类型: ${blockType}, ${block}`);
                    return ""
            }
        }

        convertTextBlock(block) {
            // 检查是否为整行公式块
            if (this.isBlockEquation(block)) {
                return this.convertBlockEquation(block);
            }
            
            const text = this.extractFormattedText(block);
            if (!text) return '';
            
            // 处理文本对齐
            const align = block.align;
            if (align === 'center') {
                return `${text}\n\n{: style="text-align: center;"}\n\n`;
            } else if (align === 'right') {
                return `${text}\n\n{: style="text-align: right;"}\n\n`;
            } else if (align === 'left') {
                return `${text}\n\n{: style="text-align: left;"}\n\n`;
            }
            
            return `${text}\n\n`;
        }

        isBlockEquation(block) {
            // 特例：表格内所有公式均为行内公式
            const isInTable = this.parentBlock && this.parentBlock.type === 'table_cell';
            if (isInTable) return false;

            // 检查是否为整行公式：文本块只包含equation属性且无实际文本内容
            const ops = block.zoneState?.content?.ops;
            if (!ops || ops.length === 0) return false;

            // 检查所有ops是否都只包含公式（忽略空格）
            const hasEquation = ops.some(op => op.attributes?.equation);
            const hasNonSpaceText = ops.some(op => {
                const text = op.insert?.trim();
                return text && text.length > 0 && !op.attributes?.equation;
            });

            return hasEquation && !hasNonSpaceText;
        }

        convertBlockEquation(block) {
            // 提取公式内容
            const ops = block.zoneState?.content?.ops || [];
            const equations = ops
                .filter(op => op.attributes?.equation)
                .map(op => op.attributes.equation.replace(/\n$/, ''));

            if (equations.length === 0) return '';

            // 块级公式使用$$包围
            const formula = equations.join('');
            return `$$\n${formula}\n$$\n\n`;
        }

        async convertHeadingBlock(block) {
            const level = parseInt(block.type.replace('heading', ''));
            const text = this.extractFormattedText(block);
            const prefix = '#'.repeat(Math.min(level, 6));
            let result = text ? `${prefix} ${text}\n\n` : '';

            // 处理子块（如果有）
            if (block.children && Array.isArray(block.children) && block.children.length > 0) {
                for (const child of block.children) {
                    const childContent = await this.convertBlock(child);
                    if (childContent) {
                        result += childContent;
                    }
                }
            }

            return result;
        }

        async convertListBlock(block, indent = '') {
            let result = [];
            const text = this.extractFormattedText(block);

            if (text) {
                if (block.type === 'bullet') {
                    result.push(`${indent}- ${text}`);
                } else if (block.type === 'ordered') {
                    // const seq = block.snapshot?.seq || '1';
                    result.push(`${indent}${1}. ${text}`);
                } else if (block.type === 'todo') {
                    const checked = block.snapshot?.done ? 'x' : ' ';
                    result.push(`${indent}- [${checked}] ${text}`);
                }
            }

            // 处理子项
            if (block.children && Array.isArray(block.children)) {
                for (const child of block.children) {
                    let childContent;
                    // 如果子块是列表类型，使用缩进处理
                    if (['bullet', 'ordered', 'todo'].includes(child.type)) {
                        childContent = await this.convertListBlock(child, indent + '    ');
                    } else {
                        // 其他类型的块使用通用块处理逻辑
                        childContent = await this.convertBlock(child);
                        // 为非列表子块添加适当的缩进
                        if (childContent) {
                            childContent = childContent.split('\n').map(line => 
                                line.trim() ? indent + '  ' + line : line
                            ).join('\n') + "\n";
                        }
                    }
                    if (childContent) {
                        result.push(childContent);
                    }
                }
            }

            return result.join('\n');
        }

        async convertCalloutBlock(block) {
            let content = ['{{{row', ''];

            // 从snapshot中获取样式信息
            const emojiId = block.snapshot?.emoji_id || 'bulb';
            const backgroundColor = block.snapshot?.background_color || 'rgb(240,251,239)';
            const borderColor = block.snapshot?.border_color;

            // 处理内容
            if (block.children && Array.isArray(block.children)) {
                let firstChild = true;
                for (const child of block.children) {
                    let childContent = await this.convertBlock(child);
                    if (childContent) {
                        if (firstChild) {
                            // 第一个子元素作为标题，与emoji放在同一行，去除标题格式
                            childContent = childContent.replace(/^#+\s*/, ''); // 去除开头的# 号
                            content.push(`:${emojiId}: ${childContent.trim()}`, '');
                            firstChild = false;
                        } else {
                            // 其他子元素正常添加
                            content.push(childContent.trim() + '\n');
                        }
                    }
                }

                // 如果没有子元素，只添加emoji
                if (firstChild) {
                    content.push(`:${emojiId}: `, '');
                }
            } else {
                content.push(`:${emojiId}: `, '');
            }

            content.push('}}}');

            // 构建样式字符串
            let styles = [
                `background-color: ${backgroundColor}`,
            ];

            // 如果有边框颜色，添加边框样式
            if (borderColor && borderColor.trim() !== '') {
                styles.push(`border: 2px solid ${borderColor}`);
            }

            content.push(`{: style="${styles.join('; ')};}"}`);

            return content.join('\n') + '\n\n';
        }

        convertCodeBlock(block) {
            const language = block.language || block.snapshot?.language || '';
            const code = block.zoneState?.allText || '';
            return `\`\`\`${language}\n${code.replace(/\n$/, '')}\n\`\`\`\n\n`;
        }

        async convertImageBlock(block) {
            const image = block.snapshot?.image;
            if (!image) return '';

            // 改进caption处理，确保去除末尾换行符
            let alt = image.name || '图片';
            if (image.caption?.text?.initialAttributedTexts?.text?.[0]) {
                alt = image.caption.text.initialAttributedTexts.text[0].replace(/\n$/, '');
            }
            
            // 构建图片URL
            const imageUrl = `https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/preview/${image.token}/?preview_type=16`;

            return `![${alt}](${imageUrl})\n\n`;
        }

        convertFileBlock(block) {
            const file = block.snapshot?.file;
            if (!file) return '';

            const name = file.name || '文件';
            const url = `https://feishu.cn/space/api/file/out/${file.token}/`;

            return `[${name}](${url})\n\n`;
        }

        convertBookmarkBlock(block) {
            const bookmark = block.bookmark || block.snapshot?.bookmark;
            if (!bookmark) return '';

            const title = bookmark.title || '书签';
            const url = bookmark.url || '';
            const summary = bookmark.summary || '';
            const coverUrl = bookmark.cover_url;

            // 如果有封面图片，使用图片链接格式
            if (coverUrl) {
                let result = `[![${title}](${coverUrl})](${url})\n\n`;
                if (summary) {
                    result += `${summary}\n\n`;
                }
                return result;
            }

            // 否则使用普通链接格式
            let result = `[${title}](${url})\n\n`;
            if (summary) {
                result += `${summary}\n\n`;
            }
            return result;
        }

        convertMindnoteBlock(block) {
            return "mindnote is not supported\n\n";
        }

        async convertSyncedSourceBlock(block) {
            // 处理同步块，展开其中的内容
            let content = [];

            // 提取标题文本（如果有）
            const title = this.extractFormattedText(block);
            if (title) {
                content.push(`**${title}**\n`);
            }

            // 处理子块内容
            if (block.children && Array.isArray(block.children)) {
                for (const child of block.children) {
                    const childContent = await this.convertBlock(child);
                    if (childContent) {
                        content.push(childContent);
                    }
                }
            }

            return content.join('\n');
        }

        async convertSyncedReferenceBlock(block) {
            // 处理同步块引用，从 innerBlockManager.allBlockModels 获取数据

            // 检查是否有 innerBlockManager 和 allBlockModels
            if (!block.innerBlockManager || !block.innerBlockManager.allBlockModels) {
                // console.warn('⚠️ 同步块引用缺少 innerBlockManager.allBlockModels');
                return '> [同步块引用]\n\n';
            }

            const allBlockModels = block.innerBlockManager.allBlockModels;

            // 检查是否是数组且有内容
            if (!Array.isArray(allBlockModels) || allBlockModels.length === 0) {
                // console.warn('⚠️ allBlockModels 不是数组或为空');
                return '> [空同步块]\n\n';
            }

            // console.error(`✅ 正在展开同步块引用，包含 ${allBlockModels.length} 个块`);

            // 按照 allBlockModels 数组的顺序处理每个块
            let content = [];

            for (const refBlock of allBlockModels) {
                if (!refBlock) continue;

                try {
                    // 直接使用 refBlock，它已经是标准的块格式
                    const blockContent = await this.convertBlock(refBlock);
                    if (blockContent) {
                        content.push(blockContent);
                    }
                } catch (e) {
                    // console.warn(`⚠️ 处理同步块中的子块失败:`, e);
                }
            }

            return content.join('\n\n');
        }

        convertIframeBlock(block) {
            const iframe = block.snapshot?.iframe;
            if (!iframe) return '';

            const src = iframe.src || iframe.url || '';
            const title = iframe.title || '嵌入内容';
            const width = iframe.width || '100%';
            const height = iframe.height || '400px';

            return `<iframe src="${src}" title="${title}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>\n\n`;
        }

        async convertWhiteboardBlock(block) {
            // 提取caption文本
            const caption = this.evaluateCaption(block.snapshot?.caption);
            const altText = caption ? `白板: ${caption}` : '白板';

            // 尝试转换为PNG图片
            try {
                const imageUrl = await this.whiteboardToPNG(block);
                if (imageUrl) {
                    // console.error('🎨 成功将白板转换为PNG图片');
                    return `![${altText}](${imageUrl})\n\n`;
                }
            } catch (error) {
                // console.warn('⚠️ 白板转PNG失败，使用URL fallback:', error.message);
            }

            // Fallback: 使用传统的白板URL
            const token = block.snapshot?.token || block.token || block.record?.id;
            if (token) {
                const url = `https://feishu.cn/space/api/whiteboard/view/${token}`;
                return `![${altText}](${url})\n\n`;
            }

            // console.error('⚠️ Whiteboard block missing token:', block);
            return '';
        }

        // 辅助方法：提取caption文本
        evaluateCaption(caption) {
            if (!caption) return '';

            try {
                const text = caption.text?.initialAttributedTexts?.text?.[0];
                if (text) {
                    // 去除末尾换行符
                    return text.replace(/\n$/, '');
                }
            } catch (e) {
                // console.warn('提取caption失败:', e);
            }

            return '';
        }

        // 将白板转换为PNG图片
        async whiteboardToPNG(block) {
            // 检查是否有whiteboardBlock
            if (!block.whiteboardBlock) {
                throw new Error('No whiteboardBlock found');
            }

            const { isolateEnv } = block.whiteboardBlock;

            // 检查是否有ratioApp
            if (!isolateEnv?.hasRatioApp?.()) {
                throw new Error('RatioApp not available');
            }

            // 等待白板加载完成
            const recordId = block.record?.id;
            if (recordId) {
                await this.waitForWhiteboardReady(recordId);
            }

            // 获取图片数据
            const imageDataWrapper = await this.whiteboardToImageData(block);
            if (!imageDataWrapper) {
                throw new Error('Failed to get image data');
            }

            // 转换为Blob
            const blob = await this.imageDataToBlob(imageDataWrapper.data, {
                onDispose: imageDataWrapper.release
            });

            if (!blob) {
                throw new Error('Failed to convert to blob');
            }

            // 转换为base64
            const base64 = await this.blobToBase64(blob);
            return base64;
        }

        // 等待白板准备就绪
        async waitForWhiteboardReady(recordId, timeout = 3000) {
            return new Promise((resolve, reject) => {
                const startTime = Date.now();

                const checkReady = async () => {
                    try {
                        if (window.PageMain?.locateBlockWithRecordIdImpl) {
                            const isReady = await window.PageMain.locateBlockWithRecordIdImpl(recordId);
                            if (isReady) {
                                resolve(true);
                                return;
                            }
                        }

                        if (Date.now() - startTime > timeout) {
                            reject(new Error('Timeout waiting for whiteboard'));
                            return;
                        }

                        setTimeout(checkReady, 100);
                    } catch (error) {
                        reject(error);
                    }
                };

                checkReady();
            });
        }

        // 从白板获取图片数据
        async whiteboardToImageData(whiteboard) {
            if (!whiteboard.whiteboardBlock) return null;

            const { isolateEnv } = whiteboard.whiteboardBlock;

            if (!isolateEnv.hasRatioApp()) return null;

            const ratioApp = isolateEnv.getRatioApp();

            // 调用ratioApp获取图片数据
            const imageData = await ratioApp.ratioAppProxy.getOriginImageDataByNodeId(
                24,
                [''],
                false,
                2
            );

            if (!imageData) return null;

            return imageData;
        }

        // 将ImageData转换为Blob
        async imageDataToBlob(imageData, options = {}) {
            return new Promise(resolve => {
                const { onDispose } = options;

                const width = imageData.width;
                const height = imageData.height;
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(null);
                    return;
                }

                ctx.putImageData(imageData, 0, 0);
                onDispose?.();

                canvas.toBlob(resolve);
            });
        }

        // 将图片URL转换为base64
        async imageUrlToBase64(url) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';

                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');

                        canvas.width = img.width;
                        canvas.height = img.height;

                        ctx.drawImage(img, 0, 0);

                        const dataURL = canvas.toDataURL();
                        resolve(dataURL);
                    } catch (error) {
                        reject(error);
                    }
                };

                img.onerror = () => {
                    reject(new Error('Failed to load image'));
                };

                img.src = url;
            });
        }

        // 将Blob转换为base64
        async blobToBase64(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

        convertEquationBlock(block) {
            // 处理块级数学公式
            const equation = block.zoneState?.allText || block.snapshot?.equation || '';
            if (!equation) return '';

            // 块级公式使用$$包围，并添加独立行
            const formula = equation.replace(/\n$/, ''); // 去除末尾换行
            return `$$\n${formula}\n$$\n\n`;
        }

        async convertGridBlock(block) {
            // 处理网格布局，转换为思源笔记的行布局超级块
            let validColumns = [];
            
            if (block.children && Array.isArray(block.children)) {
                for (const column of block.children) {
                    if (column.type === 'grid_column') {
                        const columnContent = await this.convertGridColumnBlock(column);
                        if (columnContent) {
                            validColumns.push(columnContent);
                        }
                    }
                }
            }
            
            // 如果只有一个列，直接返回列内容，不使用超级块
            if (validColumns.length === 1) {
                return validColumns[0] + '\n\n';
            }
            
            // 多个列时使用行超级块
            let content = ['{{{col', ''];
            content.push(...validColumns);
            content.push('}}}');
            return content.join('\n\n') + '\n\n';
        }

        async convertGridColumnBlock(block) {
            // 处理网格列，转换为思源笔记的列布局超级块
            let validChildren = [];
            
            if (block.children && Array.isArray(block.children)) {
                for (const child of block.children) {
                    const childContent = await this.convertBlock(child);
                    if (childContent) {
                        validChildren.push(childContent.trim());
                    }
                }
            }
            
            // 如果只有一个子块，直接返回子块内容，不使用超级块
            if (validChildren.length === 1) {
                return validChildren[0];
            }
            
            // 多个子块时使用列超级块
            let content = ['{{{row', ''];
            content.push(...validChildren);
            content.push('}}}');
            return content.join('\n\n');
        }

        async convertTableBlock(block) {
            // 参考 cloud-document-converter 实现
            // TABLE块的children包含所有TableCell块
            const columnsCount = block.snapshot?.columns_id?.length || 1;
            // const hasHeader = block.snapshot?.header_row !== false;
            // note: 思源暂时不支持无表头表格
            const hasHeader = true;
            
            if (!block.children || block.children.length === 0) {
                return '';
            }

            // 筛选出table_cell类型的子块
            const tableCells = block.children.filter(child => child.type === 'table_cell');

            if (tableCells.length === 0) {
                return '';
            }

            let table = [];
            let rowIndex = 0;

            // 按列数分组处理单元格（chunk）
            for (let i = 0; i < tableCells.length; i += columnsCount) {
                const rowCells = tableCells.slice(i, i + columnsCount);
                let cellContents = [];

                for (const cellBlock of rowCells) {
                    let cellContent = '';
                    if (cellBlock.children && cellBlock.children.length > 0) {
                        // 处理单元格中的所有子块
                        const contents = [];
                        for (const child of cellBlock.children) {
                            const previousParent = this.parentBlock;
                            this.parentBlock = cellBlock; // 设置表格单元格为父级上下文
                            const childContent = await this.convertBlock(child);
                            this.parentBlock = previousParent; // 恢复父级上下文
                            if (childContent) {
                                // 移除末尾的换行符，并将多行内容用空格连接
                                contents.push(childContent.trim().replace(/\n+/g, ' '));
                            }
                        }
                        cellContent = contents.join(' ');
                    }
                    cellContents.push(cellContent || ' ');
                }

                // 添加行到表格
                table.push('| ' + cellContents.join(' | ') + ' |');

                // 在表头后添加分隔线
                if (rowIndex === 0 && hasHeader) {
                    table.push('| ' + Array(columnsCount).fill('---').join(' | ') + ' |');
                }
                rowIndex++;
            }

            return table.join('\n') + '\n\n';
        }

        async convertQuoteBlock(block) {
            let result = [];
            if (block.children && Array.isArray(block.children)) {
                for (const child of block.children) {
                    const childContent = await this.convertBlock(child);
                    if (childContent) {
                        const lines = childContent.trim().split('\n');
                        for (const line of lines) {
                            if (line.trim()) {
                                result.push(`> ${line}`);
                            }
                        }
                    }
                }
            }
            return result.join('\n') + '\n\n';
        }

        extractFormattedText(block) {
            // 如果有结构化的text数据，使用富文本解析
            if (block.text?.apool && block.text?.initialAttributedTexts) {
                return this.parseRichText(block.text);
            }

            // 否则使用zoneState的ops格式
            if (!block.zoneState?.content?.ops) {
                return block.zoneState?.allText || '';
            }

            const ops = block.zoneState.content.ops;
            let result = [];

            for (const op of ops) {
                if (!op.insert) continue;

                let text = op.insert;
                const attrs = op.attributes || {};

                // 应用格式（inline-component 在 applyTextFormatting 中处理）
                text = this.applyTextFormatting(text, attrs);
                result.push(text);
            }

            return result.join('').replace(/\n$/, '');
        }

        parseRichText(textData) {
            const apool = textData.apool;
            const numToAttrib = apool.numToAttrib || {};
            const initialTexts = textData.initialAttributedTexts;
            
            if (!initialTexts || !initialTexts.attribs || !initialTexts.text) {
                return '';
            }

            const attribs = initialTexts.attribs["0"] || '';
            const text = initialTexts.text["0"] || '';
            
            if (!attribs || !text) {
                return text;
            }

            // 解析属性字符串，例如: "*0*1+10*0*1*2+h*0*1+p*0*1*2+1t*0*1+i"
            return this.applyRichTextAttributes(text, attribs, numToAttrib);
        }

        applyRichTextAttributes(text, attribs, numToAttrib) {
            const result = [];
            let currentPos = 0;
            let currentAttrs = [];

            // 解析属性字符串
            const parts = attribs.split(/(?=[*+])/);
            
            for (const part of parts) {
                if (!part) continue;

                if (part.startsWith('*')) {
                    // 属性操作，如 *0*1
                    const attrNums = part.slice(1).split('*');
                    currentAttrs = attrNums.filter(n => n !== '').map(n => parseInt(n));
                } else if (part.startsWith('+')) {
                    // 文本长度，如 +10
                    const lengthMatch = part.match(/\+(\w+)/);
                    if (lengthMatch) {
                        const length = lengthMatch[1];
                        let charCount;
                        
                        // 飞书所有长度都使用base36编码
                        charCount = parseInt(length, 36);

                        // 提取对应长度的文本
                        const textSegment = text.substr(currentPos, charCount);
                        currentPos += charCount;

                        // 应用当前属性
                        const formattedSegment = this.applyAttributesToText(textSegment, currentAttrs, numToAttrib);
                        result.push(formattedSegment);
                    }
                }
            }

            // 处理剩余文本
            if (currentPos < text.length) {
                const remaining = text.substr(currentPos);
                const formattedRemaining = this.applyAttributesToText(remaining, currentAttrs, numToAttrib);
                result.push(formattedRemaining);
            }

            return result.join('');
        }

        applyAttributesToText(text, attrNums, numToAttrib) {
            if (!attrNums || attrNums.length === 0) {
                return text;
            }

            let attrs = {};
            for (const attrNum of attrNums) {
                const attrDef = numToAttrib[attrNum.toString()];
                if (attrDef && Array.isArray(attrDef) && attrDef.length >= 2) {
                    attrs[attrDef[0]] = attrDef[1];
                }
            }

            return this.applyTextFormatting(text, attrs);
        }

        extractInlineComponentText(component, originalText) {
            const componentType = component.type;

            switch (componentType) {
                case 'button':
                    const buttonText = component.data?.text || originalText || '[按钮]';
                    const actions = component.data?.actions;

                    if (actions && actions.length > 0) {
                        for (const action of actions) {
                            if (action.type === 'OpenLink' && action.value) {
                                return `[${buttonText}](${action.value})`;
                            }
                        }
                    }
                    return buttonText;

                case 'mention_doc':
                    const docTitle = component.data?.title || originalText || '[文档]';
                    const docUrl = component.data?.raw_url;
                    if (docUrl) {
                        return `[${docTitle}](${docUrl})`;
                    }
                    return docTitle;

                case 'mention_user':
                case 'user':
                    // user 类型：优先使用 name，如果没有则使用 uid
                    // 格式：@用户名 或 @uid
                    const userName = component.data?.name;
                    const userUid = component.data?.uid;

                    if (userName) {
                        return `@${userName}`;
                    } else if (userUid) {
                        return `@${userUid}`;
                    } else {
                        return originalText || '@未知用户';
                    }

                case 'link':
                    const linkText = component.data?.text || originalText || '[链接]';
                    const linkUrl = component.data?.url;
                    if (linkUrl) {
                        return `[${linkText}](${linkUrl})`;
                    }
                    return linkText;

                default:
                    // console.error(`⚠️ 发现未支持的inline-component类型: "${componentType}"`, component);
                    return originalText || `[${componentType}]`;
            }
        }

        applyTextFormatting(text, attrs) {
            // 优先处理内联组件（inline-component）
            if (attrs['inline-component']) {
                try {
                    const component = JSON.parse(attrs['inline-component']);
                    text = this.extractInlineComponentText(component, text);
                } catch (e) {
                    // 解析失败，使用原始文本
                }
            }

            const styles = [];
            let dataType = 'text';

            // 处理加粗
            if (attrs.bold) {
                dataType = dataType === 'text' ? 'strong' : 'text strong';
            }

            // 处理颜色
            if (attrs.textHighlight && attrs.textHighlight !== 'var(--b3-font-white)') {
                styles.push(`color: ${attrs.textHighlight}`);
            }
            if (attrs.textHighlightBackground && attrs.textHighlightBackground !== 'var(--b3-font-background)') {
                styles.push(`background-color: ${attrs.textHighlightBackground}`);
            }

            // 处理斜体
            if (attrs.italic) {
                text = `*${text}*`;
            }

            // 处理删除线
            if (attrs.strikethrough) {
                text = `~~${text}~~`;
            }

            // 处理下划线
            if (attrs.underline) {
                text = `<u>${text}</u>`;
            }

            // 处理行内代码
            if (attrs.inlineCode) {
                return `\`${text}\``;
            }

            // 处理数学公式（内联公式使用$包围）
            if (attrs.equation && attrs.equation.length > 0) {
                // 去除末尾的换行符，使用单个$包围内联公式
                const formula = attrs.equation.replace(/\n$/, '');
                return `$${formula}$`;
            }

            // 应用span样式
            if (attrs.bold || styles.length > 0) {
                const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')};"` : '';
                text = `<span data-type="${dataType}"${styleAttr}>${text}</span>`;
            }

            return text;
        }
    }



    window.__siyuanGetPageContent = async function () {
        try {
            // console.error('🚀 飞书文档转Markdown工具启动...');

            // 检查运行环境
            if (typeof window === 'undefined') {
                // console.error('❌ 此工具只能在浏览器环境中运行，请在飞书文档页面的控制台中执行');
                return {
                    type: "markdown",
                    content: null,
                    success: false,
                    refresh: false
                };
            }

            // 获取PageMain数据
            if (!window.PageMain?.blockManager?.rootBlockModel) {
                // console.error('❌ 未找到PageMain数据源，请确保在飞书文档页面运行此脚本');
                // console.error('💡 提示：请打开一个飞书文档页面，然后在浏览器控制台中运行此脚本');
                return {
                    type: "markdown",
                    content: null,
                    success: false,
                    refresh: false
                };
            }

            // console.error('✅ 检测到飞书文档页面，正在从PageMain读取文档数据...');
            const rootBlock = window.PageMain.blockManager.rootBlockModel;

            // console.error('✅ 成功获取文档数据');

            const converter = new PageMainConverter(rootBlock);
            const markdown = await converter.convertToMarkdown();

            // console.error('=== 转换完成 ===\n');
            // console.error(markdown);
            // console.error('\n=== Markdown内容已输出到控制台 ===');

            // 尝试复制到剪贴板
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(markdown).then(() => {
                    // console.error('✅ Markdown内容已复制到剪贴板');
                }).catch(err => {
                    // console.error('❌ 复制到剪贴板失败:', err);
                });
            }

            // console.error(`\n✅ 转换成功完成！`);
            // console.error(`📄 Markdown长度: ${markdown.length} 字符`);
            // console.error(`🎨 支持粗体、颜色高亮、callout等格式化`);
            // console.error(`📋 内容已输出到控制台，可直接复制使用`);

            return {
                type: "markdown",
                title: converter.getDocumentTitle(),
                content: markdown,
                success: true,
                refresh: false
            };
        } catch (error) {
            // console.error('❌ 转换过程中发生错误:', error);
            return {
                type: "markdown",
                content: null,
                success: false,
                error: error.message,
                refresh: false
            };
        }
    };
})()