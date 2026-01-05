/**
 * 小红书用户首页自动剪藏脚本
 * 功能：自动检测、点击、剪藏用户首页的笔记，并标记已剪藏的笔记
 */

(async function() {
  'use strict';

  console.log('[SiYuan小红书Feed] 脚本已加载');

  // 配置项
  const CONFIG = {
    noteItemSelector: '.note-item', // 笔记项选择器
    processedAttribute: 'data-siyuan-id', // 已处理标记
    processingAttribute: 'data-siyuan-processing', // 处理中标记
    scrollContainer: '.feeds-container', // 滚动容器选择器
    scrollDelay: 2000, // 滚动后等待加载时间(ms)
    scrollAmount: 800, // 每次滚动距离(px)
    checkInterval: 1000, // 检查可见笔记的间隔(ms)
  };

  // 状态管理（修复：移除未使用的状态变量）
  const state = {
    isRunning: false,
  };

  /**
   * 获取所有可见且未处理的笔记项（修复：改为部分可见即可）
   */
  function getVisibleUnprocessedNotes() {
    const allNotes = document.querySelectorAll(CONFIG.noteItemSelector);
    const visibleNotes = [];
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

    allNotes.forEach(note => {
      // 跳过已处理或正在处理的笔记
      if (note.hasAttribute(CONFIG.processedAttribute) ||
          note.hasAttribute(CONFIG.processingAttribute)) {
        return;
      }

      // 检查是否部分可见（修复：只要部分可见即可，不要求完全在视口内）
      const rect = note.getBoundingClientRect();
      const isVisible = (
        rect.bottom > 0 &&           // 下边缘在视口上方之下
        rect.right > 0 &&             // 右边缘在视口左方之右
        rect.top < viewportHeight &&  // 上边缘在视口下方之上
        rect.left < viewportWidth     // 左边缘在视口右方之左
      );

      if (isVisible) {
        visibleNotes.push(note);
      }
    });

    return visibleNotes;
  }

  /**
   * 从笔记项中提取笔记详情页链接
   */
  function getNoteDetailUrl(noteItem) {
    // 尝试多种可能的链接选择器
    const linkSelectors = [
      'a.cover',
      'a[href*="/explore/"]',
      'a[href*="/user/profile/"]',
    ];

    for (const selector of linkSelectors) {
      const link = noteItem.querySelector(selector);
      if (link && link.href) {
        return link.href;
      }
    }

    return null;
  }

  /**
   * 标记笔记为处理中
   */
  function markNoteAsProcessing(noteItem, noteUrl) {
    noteItem.setAttribute(CONFIG.processingAttribute, 'true');
    noteItem.style.border = '2px solid #ff6b6b';
    noteItem.style.opacity = '0.6';
    console.log('[SiYuan小红书Feed] 标记笔记为处理中:', noteUrl);
  }

  /**
   * 标记笔记为已完成，并存储文档ID
   */
  function markNoteAsProcessed(noteItem, documentId) {
    noteItem.removeAttribute(CONFIG.processingAttribute);
    noteItem.setAttribute(CONFIG.processedAttribute, documentId);
    noteItem.style.border = '2px solid #51cf66';
    noteItem.style.opacity = '1';
    console.log('[SiYuan小红书Feed] 笔记剪藏完成，文档ID:', documentId);
  }

  /**
   * 标记笔记剪藏失败
   */
  function markNoteAsFailed(noteItem, error) {
    noteItem.removeAttribute(CONFIG.processingAttribute);
    noteItem.setAttribute('data-siyuan-error', error || 'unknown');
    noteItem.style.border = '2px solid #ffa500';
    noteItem.style.opacity = '0.8';
    console.error('[SiYuan小红书Feed] 笔记剪藏失败:', error);
  }

  /**
   * 滚动页面加载更多笔记
   */
  function scrollToLoadMore() {
    return new Promise(resolve => {
      const scrollContainer = document.querySelector(CONFIG.scrollContainer) || window;

      if (scrollContainer === window) {
        window.scrollBy({
          top: CONFIG.scrollAmount,
          behavior: 'smooth'
        });
      } else {
        scrollContainer.scrollBy({
          top: CONFIG.scrollAmount,
          behavior: 'smooth'
        });
      }

      console.log('[SiYuan小红书Feed] 滚动加载更多笔记...');

      // 等待内容加载
      setTimeout(resolve, CONFIG.scrollDelay);
    });
  }

  /**
   * 处理单个笔记的剪藏（修复：清理监听器泄漏和移除冗余状态）
   */
  async function processNote(noteItem) {
    const noteUrl = getNoteDetailUrl(noteItem);

    if (!noteUrl) {
      console.warn('[SiYuan小红书Feed] 无法获取笔记链接，跳过');
      markNoteAsFailed(noteItem, 'no_link');
      return false;
    }

    // 标记为处理中
    markNoteAsProcessing(noteItem, noteUrl);

    try {
      // 发送消息到background，请求打开新标签页并剪藏（修复：正确清理监听器）
      const response = await new Promise((resolve, reject) => {
        let settled = false;
        let timeoutId = null;

        const cleanup = () => {
          if (settled) return;
          settled = true;
          if (timeoutId) clearTimeout(timeoutId);
          window.removeEventListener('message', listener);
        };

        const listener = (event) => {
          if (event.data && event.data.type === 'SIYUAN_CLIP_RESULT') {
            cleanup();
            resolve(event.data);
          }
        };

        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error('剪藏超时'));
        }, 60000); // 60秒超时

        window.addEventListener('message', listener);

        window.postMessage({
          type: 'SIYUAN_CLIP_NOTE',
          url: noteUrl,
          sourceUrl: window.location.href,
        }, '*');
      });

      if (response.success && response.documentId) {
        markNoteAsProcessed(noteItem, response.documentId);
        return true;
      } else {
        markNoteAsFailed(noteItem, response.error || 'unknown_error');
        return false;
      }

    } catch (error) {
      console.error('[SiYuan小红书Feed] 处理笔记失败:', error);
      markNoteAsFailed(noteItem, error.message);
      return false;
    }
  }

  /**
   * 主循环：持续检测和处理笔记
   */
  async function mainLoop() {
    console.log('[SiYuan小红书Feed] 开始批量剪藏...');
    state.isRunning = true;

    let consecutiveEmptyChecks = 0;
    const maxEmptyChecks = 3; // 连续3次没有可见笔记时停止

    while (state.isRunning) {
      // 获取可见且未处理的笔记
      const visibleNotes = getVisibleUnprocessedNotes();

      if (visibleNotes.length === 0) {
        consecutiveEmptyChecks++;
        console.log(`[SiYuan小红书Feed] 当前没有可见的未处理笔记 (${consecutiveEmptyChecks}/${maxEmptyChecks})`);

        if (consecutiveEmptyChecks >= maxEmptyChecks) {
          console.log('[SiYuan小红书Feed] 所有可见笔记已处理完成，停止');
          break;
        }

        // 尝试滚动加载更多
        await scrollToLoadMore();
        continue;
      }

      // 重置空检查计数
      consecutiveEmptyChecks = 0;

      // 逐个处理笔记
      for (const note of visibleNotes) {
        if (!state.isRunning) break;

        console.log('[SiYuan小红书Feed] 处理笔记...');
        await processNote(note);

        // 每个笔记之间稍作延迟
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 检查是否需要滚动加载更多
      const remainingVisibleNotes = getVisibleUnprocessedNotes();
      if (remainingVisibleNotes.length === 0) {
        await scrollToLoadMore();
      }
    }

    state.isRunning = false;
    console.log('[SiYuan小红书Feed] 批量剪藏任务完成');
    showNotification('批量剪藏完成！', 'success');
  }

  /**
   * 显示通知
   */
  function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      background: ${type === 'success' ? '#51cf66' : type === 'error' ? '#ff6b6b' : '#4dabf7'};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-size: 14px;
      font-weight: 500;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // 3秒后移除
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * 创建控制面板
   */
  function createControlPanel() {
    const panel = document.createElement('div');
    panel.id = 'siyuan-feed-control-panel';
    panel.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 15px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      min-width: 200px;
    `;

    const title = document.createElement('div');
    title.textContent = 'SiYuan 批量剪藏';
    title.style.cssText = `
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 10px;
      color: #333;
    `;

    const startBtn = document.createElement('button');
    startBtn.textContent = '开始剪藏';
    startBtn.style.cssText = `
      width: 100%;
      padding: 8px;
      background: #4dabf7;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      margin-bottom: 8px;
    `;
    startBtn.onclick = () => {
      if (!state.isRunning) {
        mainLoop();
        startBtn.disabled = true;
        stopBtn.disabled = false;
        showNotification('开始批量剪藏...', 'info');
      }
    };

    const stopBtn = document.createElement('button');
    stopBtn.textContent = '停止剪藏';
    stopBtn.style.cssText = `
      width: 100%;
      padding: 8px;
      background: #ff6b6b;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      margin-bottom: 8px;
    `;
    stopBtn.disabled = true;
    stopBtn.onclick = () => {
      state.isRunning = false;
      startBtn.disabled = false;
      stopBtn.disabled = true;
      showNotification('已停止批量剪藏', 'info');
    };

    const statusDiv = document.createElement('div');
    statusDiv.id = 'siyuan-feed-status';
    statusDiv.style.cssText = `
      font-size: 12px;
      color: #666;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #e0e0e0;
    `;
    statusDiv.textContent = '等待开始...';

    // 定时更新状态
    setInterval(() => {
      const processed = document.querySelectorAll(`[${CONFIG.processedAttribute}]`).length;
      const failed = document.querySelectorAll('[data-siyuan-error]').length;
      statusDiv.innerHTML = `
        已处理: ${processed}<br>
        失败: ${failed}<br>
        状态: ${state.isRunning ? '运行中' : '已停止'}
      `;
    }, 1000);

    panel.appendChild(title);
    panel.appendChild(startBtn);
    panel.appendChild(stopBtn);
    panel.appendChild(statusDiv);

    document.body.appendChild(panel);

    console.log('[SiYuan小红书Feed] 控制面板已创建');
  }

  /**
   * 监听来自content script的消息
   */
  window.addEventListener('message', (event) => {
    // 只处理来自同源的消息
    if (event.source !== window) return;

    if (event.data && event.data.type === 'SIYUAN_CLIP_RESULT') {
      console.log('[SiYuan小红书Feed] 收到剪藏结果:', event.data);
    }
  });

  // 页面加载完成后创建控制面板
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createControlPanel);
  } else {
    createControlPanel();
  }

  console.log('[SiYuan小红书Feed] 脚本初始化完成');
})();
