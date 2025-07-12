document.addEventListener('DOMContentLoaded', () => {
    // --- 配置区域 ---
    // 优先使用从 Hexo 主题配置传递的配置，否则使用默认配置
    const defaultConfig = {
        mastodonApiUrl: '',
        initialLimit: 5,
        loadMoreLimit: 10,
        excludeReplies: true, // 请不要改这里，还没写好评论部分
        excludeReblogs: false, // 是否允许显示转发内容
        bangumiApiUrl: '',
        bangumiLimit: 5,
    };

    // 从全局配置中获取配置，如果没有则使用默认配置
    const externalConfig = window.momentsConfig || {};
    const config = {
        mastodonApiUrl: externalConfig.mastodon?.api || defaultConfig.mastodonApiUrl,
        initialLimit: externalConfig.mastodon?.initialLimit || defaultConfig.initialLimit,
        loadMoreLimit: externalConfig.mastodon?.loadMoreLimit || defaultConfig.loadMoreLimit,
        excludeReplies: externalConfig.mastodon?.excludeReplies !== undefined ? externalConfig.mastodon.excludeReplies : defaultConfig.excludeReplies,
        excludeReblogs: externalConfig.mastodon?.excludeReblogs !== undefined ? externalConfig.mastodon.excludeReblogs : defaultConfig.excludeReblogs,
        bangumiApiUrl: externalConfig.bangumi?.api || defaultConfig.bangumiApiUrl,
        bangumiLimit: externalConfig.bangumi?.loadMoreLimit || defaultConfig.bangumiLimit,
    };

    // --- DOM 元素获取 ---
    const timelineContainer = document.getElementById('mastodon-timeline');
    const loadMoreBtn = document.getElementById('load-more-btn');
    const loadingIndicator = document.querySelector('.timeline-loading');
    const noMorePostsPlaceholder = document.getElementById('no-more-posts-placeholder');

    // --- 状态管理 ---
    let state = {
        nextPageUrl: null,
        isLoading: false,
        bangumiOffset: 0,
        bangumiFinished: false,
        loadedBangumiDates: new Set(),
        loadedMastodonDates: new Set(),
    };

    /**
     * 创建媒体附件的 HTML 结构
     * @param {Array} mediaAttachments - 媒体附件数组
     * @param {boolean} isBangumi - 是否为Bangumi条目
     * @returns {string} - 媒体附件的HTML字符串
     */
    const createMediaHtml = (mediaAttachments, isBangumi = false) => {
        if (!mediaAttachments || mediaAttachments.length === 0) return '';
        
        let mediaHtml = '<div class="media-attachments">';
        const totalImages = mediaAttachments.filter(att => att.type === 'image').length;
        
        mediaAttachments.forEach((attachment, index) => {
            if (attachment.type === 'image' && index < 9) { // 只显示前9张图片
                // 为超过9张图片的情况添加数量提示
                const isLastVisible = index === 8 && totalImages > 9;
                const extraCount = totalImages - 9;
                
                mediaHtml += `
                    <a href="${attachment.url}" target="_blank" rel="noopener noreferrer" class="media-link">
                        <img src="${attachment.preview_url}" 
                             alt="${attachment.description || (isBangumi ? '动画封面' : '动态图片')}" 
                             loading="lazy"
                             ${isLastVisible ? `data-count="${extraCount}"` : ''}
                             onload="this.classList.add('loaded')"
                             onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<div class=\\'image-placeholder\\'></div>')">
                    </a>
                `;
            }
        });
        mediaHtml += '</div>';
        return mediaHtml;
    };

    /**
     * 创建 Bangumi 条目的 HTML 结构
     * @param {object} entry - Bangumi 条目
     * @returns {HTMLElement}
     */
    const createBangumiElement = (entry) => {
        const post = document.createElement('div');
        post.className = 'mastodon-post bangumi-post glass-wrapper card-item hover-effect';
        post.dataset.url = `https://bgm.tv/subject/${entry.subject_id}`;
        
        const img = entry.subject.images?.medium || '';
        const name = entry.subject.name_cn || entry.subject.name;
        const comment = entry.comment ? `<div class="bangumi-comment">${entry.comment}</div>` : '';
        const date = formatDate(entry.updated_at);
        
        // 将Bangumi图片转换为媒体附件格式
        const mediaAttachments = img ? [{
            type: 'image',
            url: img,
            preview_url: img,
            description: name
        }] : [];
        
        const mediaHtml = createMediaHtml(mediaAttachments, true);
        
        post.innerHTML = `
            <div class="reblog-header">
                <span class="reblog-icon">📺</span>
                <span class="reblog-text">在 Bangumi 上完成了《${name}》</span>
            </div>
            <div class="post-content">
                <span class="post-date">${date}</span>
                ${mediaHtml}
                ${comment}
            </div>
        `;
        
        post.addEventListener('click', (e) => {
            if (e.target.tagName === 'IMG') {
                e.preventDefault();
                showImagePreview(e.target.src, mediaAttachments);
                return;
            }
            if (!e.target.closest('a, img, button')) {
                window.open(post.dataset.url, '_blank', 'noopener,noreferrer');
            }
        });
        return post;
    };

    /**
     * 解析API响应头中的Link字段，提取下一页的URL
     * @param {string} linkHeader - 响应头中的 Link 字段值
     * @returns {string|null} - 下一页的URL或null
     */
    const parseLinkHeader = (linkHeader) => {
        if (!linkHeader) return null;
        const nextLink = linkHeader.split(',').find(s => s.includes('rel="next"'));
        if (nextLink) {
            const match = nextLink.match(/<([^>]+)>/);
            return match ? match[1] : null;
        }
        return null;
    };

    /**
     * 格式化日期
     * @param {string} dateString - ISO 格式的日期字符串
     * @returns {string} - 格式化后的日期
     */
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
        
        // 如果是同一天，只显示时间
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString('zh-CN', {
                hour: '2-digit', 
                minute: '2-digit'
            });
        }
        // 其他情况显示完整日期
        else {
            return date.toLocaleDateString('zh-CN', {
                year: '2-digit',
                month: '2-digit', 
                day: '2-digit'
            }) + ' ' + date.toLocaleTimeString('zh-CN', {
                hour: '2-digit', 
                minute: '2-digit'
            });
        }
    };

    /**
     * 创建单条动态的 HTML 结构
     * @param {object} status - 单条动态的数据对象
     * @returns {HTMLElement} - 构建好的 HTML 元素
     */
    const createStatusElement = (status) => {
        const post = document.createElement('div');
        post.className = 'mastodon-post glass-wrapper card-item hover-effect';
        
        // 判断是否为转发内容
        const isReblog = status.reblog !== null;
        const actualStatus = isReblog ? status.reblog : status;
        
        // 存储原始URL（如果是转发，使用转发的URL）
        post.dataset.url = actualStatus.url;

        const mediaHtml = createMediaHtml(actualStatus.media_attachments);

        // 构建HTML内容
        let contentHtml = '';
        
        // 如果是转发，添加转发提示
        if (isReblog) {
            contentHtml += `
                <div class="reblog-header">
                    <span class="reblog-icon">🔄</span>
                    <span class="reblog-text">转发了 @${actualStatus.account.username} 的动态</span>
                </div>
            `;
        }
        
        // 主要内容
        contentHtml += `
            <div class="post-content">
                <span class="post-date">${formatDate(actualStatus.created_at)}</span>
                ${actualStatus.content || '<em>（无文字内容）</em>'}
            </div>
            ${mediaHtml}
        `;
        
        post.innerHTML = contentHtml;
        
        // 添加转发样式类
        if (isReblog) {
            post.classList.add('reblog-post');
        }
        
        // 添加图片点击预览功能
        post.addEventListener('click', (e) => {
            if (e.target.tagName === 'IMG') {
                e.preventDefault();
                showImagePreview(e.target.src, actualStatus.media_attachments);
            }
        });
        
        return post;
    };

    /**
     * 拉取 Mastodon 和 Bangumi 数据，合并后渲染
     * @param {string} mastodonUrl
     * @param {boolean} isFirstLoad
     */
    const fetchAndRenderTimeline = async (mastodonUrl, isFirstLoad = false) => {
        if (state.isLoading) return;
        state.isLoading = true;
        loadMoreBtn.textContent = '加载中...';
        // 首次加载时先显示 loading 占位符，不要立即清空内容
        if (isFirstLoad) {
            timelineContainer.innerHTML = '<div class="timeline-loading">加载中...</div>';
        }
        try {
            // 并行请求 Mastodon 和 Bangumi
            const requests = [fetch(mastodonUrl)];
            if (!state.bangumiFinished) {
                requests.push(fetch(config.bangumiApiUrl + state.bangumiOffset));
            }
            const [mastodonRes, bangumiRes] = await Promise.all(requests);
            // Mastodon
            let mastodonStatuses = [];
            if (mastodonRes && mastodonRes.ok) {
                mastodonStatuses = await mastodonRes.json();
                state.nextPageUrl = parseLinkHeader(mastodonRes.headers.get('Link'));
            }
            // Bangumi
            let bangumiData = { data: [] };
            if (bangumiRes && bangumiRes.ok) {
                bangumiData = await bangumiRes.json();
                // 判断是否到底
                if (bangumiData.data.length < config.bangumiLimit) state.bangumiFinished = true;
            } else if (!bangumiRes) {
                state.bangumiFinished = true;
            }
            // 记录已展示的 Bangumi 条目时间，避免重复
            if (isFirstLoad) state.loadedBangumiDates.clear();
            bangumiData.data = bangumiData.data.filter(item => {
                if (state.loadedBangumiDates.has(item.updated_at)) return false;
                state.loadedBangumiDates.add(item.updated_at);
                return true;
            });
            // 记录已展示的 Mastodon 条目时间，避免重复
            if (isFirstLoad) state.loadedMastodonDates.clear();
            mastodonStatuses = mastodonStatuses.filter(item => {
                if (state.loadedMastodonDates.has(item.created_at)) return false;
                state.loadedMastodonDates.add(item.created_at);
                return true;
            });
            // 合并并按时间排序
            const allItems = [
                ...mastodonStatuses.map(s => ({ type: 'mastodon', data: s, date: s.created_at })),
                ...bangumiData.data.map(b => ({ type: 'bangumi', data: b, date: b.updated_at })),
            ].sort((a, b) => new Date(b.date) - new Date(a.date));
            // 首次加载时替换内容
            if (isFirstLoad) timelineContainer.innerHTML = '';
            allItems.forEach(item => {
                if (item.type === 'mastodon') {
                    timelineContainer.appendChild(createStatusElement(item.data));
                } else {
                    timelineContainer.appendChild(createBangumiElement(item.data));
                }
            });
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            // 判断是否还有更多
            if (state.nextPageUrl || !state.bangumiFinished) {
                loadMoreBtn.style.display = 'block';
            } else {
                loadMoreBtn.style.display = 'none';
                noMorePostsPlaceholder.innerHTML = '<p class="no-more-posts">已经没有更多动态了</p>';
            }
        } catch (error) {
            console.error('获取时间线失败:', error);
            timelineContainer.innerHTML = '<p>动态加载失败，请检查网络或刷新页面。</p>';
        } finally {
            state.isLoading = false;
            loadMoreBtn.textContent = '加载更多';
        }
    };

    /**
     * 处理“加载更多”按钮的点击事件
     */
    const handleLoadMore = () => {
        // 优先加载 Mastodon 下一页，否则加载 Bangumi 下一页
        let mastodonUrl = state.nextPageUrl;
        if (!mastodonUrl && !state.bangumiFinished) {
            // Mastodon 没有更多了，但 Bangumi 还有
            mastodonUrl = config.mastodonApiUrl + '?limit=0'; // 空请求
        }
        state.bangumiOffset += config.bangumiLimit;
        fetchAndRenderTimeline(mastodonUrl, false);
    };

    /**
     * 【新增】处理时间线容器的点击事件（事件委托）
     * @param {Event} event - 点击事件对象
     */
    const handleTimelineClick = (event) => {
        const clickedPost = event.target.closest('.mastodon-post');

        // 如果没有点击在动态上，或者点击的是动态内部的链接/图片等，则不处理
        if (!clickedPost || event.target.closest('a, img, button')) {
            return;
        }

        // 获取存储在data属性中的URL并在新标签页打开
        const postUrl = clickedPost.dataset.url;
        if (postUrl) {
            window.open(postUrl, '_blank', 'noopener,noreferrer');
        }
    };

    /**
     * 显示图片预览模态框
     * @param {string} imageSrc - 当前图片的URL
     * @param {Array} mediaAttachments - 所有媒体附件
     */
    const showImagePreview = (imageSrc, mediaAttachments) => {
        const images = mediaAttachments.filter(att => att.type === 'image');
        const currentIndex = images.findIndex(img => img.preview_url === imageSrc);
        
        // 创建模态框
        const modal = document.createElement('div');
        modal.className = 'image-preview-modal';
        modal.innerHTML = `
            <div class="modal-backdrop" onclick="closeImagePreview()"></div>
            <div class="modal-content">
                <button class="modal-close" onclick="closeImagePreview()">&times;</button>
                ${images.length > 1 ? `
                    <button class="modal-nav modal-prev" onclick="navigateImage(-1)">&#8249;</button>
                    <button class="modal-nav modal-next" onclick="navigateImage(1)">&#8250;</button>
                ` : ''}
                <img class="modal-image" src="${images[currentIndex].url}" alt="预览图片">
                ${images.length > 1 ? `
                    <div class="modal-counter">${currentIndex + 1} / ${images.length}</div>
                ` : ''}
            </div>
        `;
        
        // 存储当前状态
        modal.dataset.currentIndex = currentIndex;
        modal.dataset.images = JSON.stringify(images.map(img => img.url));
        
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
        // 键盘事件监听
        document.addEventListener('keydown', handlePreviewKeydown);
    };

    /**
     * 关闭图片预览
     */
    window.closeImagePreview = () => {
        const modal = document.querySelector('.image-preview-modal');
        if (modal) {
            modal.remove();
            document.body.style.overflow = '';
            document.removeEventListener('keydown', handlePreviewKeydown);
        }
    };

    /**
     * 导航到上一张或下一张图片
     */
    window.navigateImage = (direction) => {
        const modal = document.querySelector('.image-preview-modal');
        if (!modal) return;
        
        const currentIndex = parseInt(modal.dataset.currentIndex);
        const images = JSON.parse(modal.dataset.images);
        const newIndex = (currentIndex + direction + images.length) % images.length;
        
        const modalImage = modal.querySelector('.modal-image');
        const modalCounter = modal.querySelector('.modal-counter');
        
        modalImage.src = images[newIndex];
        modal.dataset.currentIndex = newIndex;
        
        if (modalCounter) {
            modalCounter.textContent = `${newIndex + 1} / ${images.length}`;
        }
    };

    /**
     * 处理预览模态框的键盘事件
     */
    const handlePreviewKeydown = (e) => {
        switch(e.key) {
            case 'Escape':
                closeImagePreview();
                break;
            case 'ArrowLeft':
                navigateImage(-1);
                break;
            case 'ArrowRight':
                navigateImage(1);
                break;
        }
    };

    /**
     * 初始化函数
     */
    // 懒加载滚动处理
    function handleScrollLazyLoad() {
        if (state.isLoading) return;
        const scrollBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
        if (scrollBottom && (state.nextPageUrl || !state.bangumiFinished)) {
            handleLoadMore();
        }
    }

    const init = () => {
        const initialUrl = new URL(config.mastodonApiUrl);
        initialUrl.searchParams.append('limit', config.initialLimit);
        if (config.excludeReplies) initialUrl.searchParams.append('exclude_replies', 'true');
        if (config.excludeReblogs) initialUrl.searchParams.append('exclude_reblogs', 'true');
        state.bangumiOffset = 0;
        state.bangumiFinished = false;
        // 首次加载用 setTimeout 让主线程先渲染页面
        setTimeout(() => {
            fetchAndRenderTimeline(initialUrl.toString(), true);
        }, 0);
        loadMoreBtn.addEventListener('click', handleLoadMore);
        timelineContainer.addEventListener('click', handleTimelineClick);
        window.addEventListener('scroll', handleScrollLazyLoad);
    };

    init();
});
