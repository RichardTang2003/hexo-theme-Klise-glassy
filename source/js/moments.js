document.addEventListener('DOMContentLoaded', () => {
    // =========================================================
    // 配置（从 Hexo 主题配置传递到 window.momentsConfig）
    // =========================================================
    const DEFAULTS = {
        mastodon: {
            enable: false,
            api: '',
            initialLimit: 5,
            loadMoreLimit: 10,
            excludeReplies: true, // 请不要改这里，还没写好评论部分
            excludeReblogs: false, // 是否允许显示转发内容（true=排除转发）
        },
        misskey: {
            enable: false,
            url: '',
            initialLimit: 5,
            loadMoreLimit: 10,
            excludeReplies: true,
            excludeReblogs: false,
        },
        bangumi: {
            enable: false,
            api: '',
            initialLimit: 5,
            loadMoreLimit: 3,
        },
    };

    const externalConfig = window.momentsConfig || {};

    const toNumber = (value, fallback) => {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? n : fallback;
    };

    const normalizeConfig = (raw) => {
        const mastodonRaw = raw.mastodon || {};
        const misskeyRaw = raw.misskey || {};
        const bangumiRaw = raw.bangumi || {};

        const normalizeMastodonLike = (sourceRaw, defaults) => ({
            enable: sourceRaw.enable !== undefined ? Boolean(sourceRaw.enable) : defaults.enable,
            api: sourceRaw.api || sourceRaw.url || defaults.api,
            initialLimit: toNumber(sourceRaw.initialLimit, defaults.initialLimit),
            loadMoreLimit: toNumber(sourceRaw.loadMoreLimit, defaults.loadMoreLimit),
            excludeReplies: sourceRaw.excludeReplies !== undefined ? Boolean(sourceRaw.excludeReplies) : defaults.excludeReplies,
            excludeReblogs: sourceRaw.excludeReblogs !== undefined ? Boolean(sourceRaw.excludeReblogs) : defaults.excludeReblogs,
        });

        return {
            mastodon: normalizeMastodonLike(mastodonRaw, DEFAULTS.mastodon),
            misskey: {
                enable: misskeyRaw.enable !== undefined ? Boolean(misskeyRaw.enable) : DEFAULTS.misskey.enable,
                url: misskeyRaw.url || misskeyRaw.api || DEFAULTS.misskey.url,
                initialLimit: toNumber(misskeyRaw.initialLimit, DEFAULTS.misskey.initialLimit),
                loadMoreLimit: toNumber(misskeyRaw.loadMoreLimit, DEFAULTS.misskey.loadMoreLimit),
                excludeReplies: misskeyRaw.excludeReplies !== undefined ? Boolean(misskeyRaw.excludeReplies) : DEFAULTS.misskey.excludeReplies,
                excludeReblogs: misskeyRaw.excludeReblogs !== undefined ? Boolean(misskeyRaw.excludeReblogs) : DEFAULTS.misskey.excludeReblogs,
            },
            bangumi: {
                enable: bangumiRaw.enable !== undefined ? Boolean(bangumiRaw.enable) : DEFAULTS.bangumi.enable,
                api: bangumiRaw.api || bangumiRaw.url || DEFAULTS.bangumi.api,
                initialLimit: toNumber(bangumiRaw.initialLimit, DEFAULTS.bangumi.initialLimit),
                loadMoreLimit: toNumber(bangumiRaw.loadMoreLimit, DEFAULTS.bangumi.loadMoreLimit),
            },
        };
    };

    const config = normalizeConfig(externalConfig);

    // =========================================================
    // DOM
    // =========================================================
    const dom = {
        timelineContainer: document.getElementById('mastodon-timeline'),
        loadMoreBtn: document.getElementById('load-more-btn'),
        noMorePostsPlaceholder: document.getElementById('no-more-posts-placeholder'),
    };

    if (!dom.timelineContainer || !dom.loadMoreBtn) {
        console.warn('[moments] 缺少必要 DOM 元素，初始化终止。');
        return;
    }

    // =========================================================
    // 工具函数
    // =========================================================
    const parseLinkHeader = (linkHeader) => {
        if (!linkHeader) return null;
        const nextLink = linkHeader.split(',').find(s => s.includes('rel="next"'));
        if (!nextLink) return null;
        const match = nextLink.match(/<([^>]+)>/);
        return match ? match[1] : null;
    };

    const safeNewUrl = (urlLike) => {
        try {
            return new URL(urlLike);
        } catch {
            return null;
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        if (Number.isNaN(date.getTime())) return '';

        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }

        return date.toLocaleDateString('zh-CN', { year: '2-digit', month: '2-digit', day: '2-digit' }) + ' ' +
            date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    };

    const createMediaHtml = (mediaAttachments, isBangumi = false) => {
        const images = (mediaAttachments || []).filter(att => att && att.type === 'image');
        if (images.length === 0) return '';

        const visibleImages = images.slice(0, 9);
        const extraCount = images.length - visibleImages.length;
        let mediaHtml = '<div class="media-attachments">';

        visibleImages.forEach((attachment, index) => {
            const isLastVisible = index === visibleImages.length - 1 && extraCount > 0;
            const alt = attachment.description || (isBangumi ? '动画封面' : '动态图片');
            const preview = attachment.preview_url || attachment.url;
            const url = attachment.url || attachment.preview_url;

            if (!preview || !url) return;

            mediaHtml += `
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="media-link">
                    <img src="${preview}"
                         alt="${alt}"
                         loading="lazy"
                         ${isLastVisible ? `data-count="${extraCount}"` : ''}
                         onload="this.classList.add('loaded')"
                         onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<div class=\\'image-placeholder\\'></div>')">
                </a>
            `;
        });

        mediaHtml += '</div>';
        return mediaHtml;
    };

    // =========================================================
    // 图片预览（模块）
    // =========================================================
    const createImagePreview = () => {
        let modal = null;
        let images = [];
        let currentIndex = 0;

        const close = () => {
            if (!modal) return;
            modal.remove();
            modal = null;
            images = [];
            currentIndex = 0;
            document.body.style.overflow = '';
            document.removeEventListener('keydown', handleKeydown);
        };

        const update = () => {
            if (!modal || images.length === 0) return;
            const img = modal.querySelector('.modal-image');
            const counter = modal.querySelector('.modal-counter');

            if (img) img.src = images[currentIndex];
            if (counter) counter.textContent = `${currentIndex + 1} / ${images.length}`;
        };

        const navigate = (direction) => {
            if (!modal || images.length <= 1) return;
            currentIndex = (currentIndex + direction + images.length) % images.length;
            update();
        };

        const handleKeydown = (e) => {
            switch (e.key) {
                case 'Escape':
                    close();
                    break;
                case 'ArrowLeft':
                    navigate(-1);
                    break;
                case 'ArrowRight':
                    navigate(1);
                    break;
            }
        };

        const open = (imageSrc, mediaAttachments) => {
            const imageAttachments = (mediaAttachments || [])
                .filter(att => att && att.type === 'image')
                .map(att => ({
                    url: att.url || att.preview_url,
                    preview_url: att.preview_url || att.url,
                }))
                .filter(att => att.url);

            if (imageAttachments.length === 0) return;

            images = imageAttachments.map(att => att.url);
            const initialIndex = imageAttachments.findIndex(att => att.preview_url === imageSrc || att.url === imageSrc);
            currentIndex = initialIndex >= 0 ? initialIndex : 0;

            modal = document.createElement('div');
            modal.className = 'image-preview-modal';
            modal.innerHTML = `
                <div class="modal-backdrop"></div>
                <div class="modal-content">
                    <button class="modal-close" type="button" aria-label="关闭预览">&times;</button>
                    ${images.length > 1 ? `
                        <button class="modal-nav modal-prev" type="button" aria-label="上一张">&#8249;</button>
                        <button class="modal-nav modal-next" type="button" aria-label="下一张">&#8250;</button>
                    ` : ''}
                    <img class="modal-image" src="${images[currentIndex]}" alt="预览图片">
                    ${images.length > 1 ? `<div class="modal-counter">${currentIndex + 1} / ${images.length}</div>` : ''}
                </div>
            `;

            document.body.appendChild(modal);
            document.body.style.overflow = 'hidden';

            modal.querySelector('.modal-backdrop')?.addEventListener('click', close);
            modal.querySelector('.modal-close')?.addEventListener('click', close);
            modal.querySelector('.modal-prev')?.addEventListener('click', () => navigate(-1));
            modal.querySelector('.modal-next')?.addEventListener('click', () => navigate(1));
            document.addEventListener('keydown', handleKeydown);
        };

        return { open, close };
    };

    const imagePreview = createImagePreview();

    // =========================================================
    // 渲染器（模块）
    // =========================================================
    const mediaAttachmentsByPost = new WeakMap();

    const createBangumiElement = (entry) => {
        const post = document.createElement('div');
        post.className = 'moment-item mastodon-post bangumi-post glass-wrapper card-item hover-effect';
        post.dataset.url = `https://bgm.tv/subject/${entry.subject_id}`;

        const img = entry.subject?.images?.medium || '';
        const name = entry.subject?.name_cn || entry.subject?.name || '';
        const comment = entry.comment ? `<div class="bangumi-comment">${entry.comment}</div>` : '';
        const date = formatDate(entry.updated_at);

        const mediaAttachments = img ? [{
            type: 'image',
            url: img,
            preview_url: img,
            description: name,
        }] : [];

        mediaAttachmentsByPost.set(post, mediaAttachments);

        post.innerHTML = `
            <div class="reblog-header">
                <span class="reblog-icon">📺</span>
                <span class="reblog-text">在 Bangumi 上完成了《${name}》</span>
            </div>
            <div class="post-content">
                <span class="post-date">${date}</span>
                ${createMediaHtml(mediaAttachments, true)}
                ${comment}
            </div>
        `;

        return post;
    };

    const createStatusElement = (status, sourceName) => {
        const post = document.createElement('div');
        post.className = 'moment-item mastodon-post glass-wrapper card-item hover-effect';

        const isReblog = status.reblog !== null && status.reblog !== undefined;
        const actualStatus = isReblog ? status.reblog : status;

        post.dataset.url = actualStatus.url || actualStatus.uri || '';
        post.dataset.source = sourceName;

        const mediaAttachments = actualStatus.media_attachments || [];
        mediaAttachmentsByPost.set(post, mediaAttachments);

        const author = actualStatus.account?.acct || actualStatus.account?.username || '';
        const displayDate = isReblog ? status.created_at : actualStatus.created_at;
        const reblogHeader = isReblog ? `
            <div class="reblog-header">
                <span class="reblog-icon">🔄</span>
                <span class="reblog-text">转发了 @${author} 的动态</span>
            </div>
        ` : '';

        post.innerHTML = `
            ${reblogHeader}
            <div class="post-content">
                <span class="post-date">${formatDate(displayDate)}</span>
                ${actualStatus.content || '<em>（无文字内容）</em>'}
            </div>
            ${createMediaHtml(mediaAttachments)}
        `;

        if (isReblog) post.classList.add('reblog-post');

        return post;
    };

    // =========================================================
    // 数据源（模块）
    // =========================================================
    const createMastodonLikeSource = ({ name, enable, api, initialLimit, loadMoreLimit, excludeReplies, excludeReblogs }) => {
        let nextPageUrl = null;
        let didFetch = false;
        let finished = false;

        const reset = () => {
            nextPageUrl = null;
            didFetch = false;
            finished = false;
        };

        const hasMore = () => {
            if (!enable) return false;
            if (finished) return false;
            return !didFetch || Boolean(nextPageUrl);
        };

        const buildRequestUrl = () => {
            const base = nextPageUrl || api;
            const url = safeNewUrl(base);
            if (!url) return null;

            const limit = didFetch ? loadMoreLimit : initialLimit;
            url.searchParams.set('limit', String(limit));

            if (excludeReplies) url.searchParams.set('exclude_replies', 'true');
            else url.searchParams.delete('exclude_replies');

            if (excludeReblogs) url.searchParams.set('exclude_reblogs', 'true');
            else url.searchParams.delete('exclude_reblogs');

            return url.toString();
        };

        const fetchNext = async () => {
            if (!enable) return [];
            if (finished) return [];
            if (didFetch && !nextPageUrl) {
                finished = true;
                return [];
            }

            if (!api) {
                finished = true;
                throw new Error(`[${name}] 未配置 api/url`);
            }

            const requestUrl = buildRequestUrl();
            if (!requestUrl) {
                finished = true;
                throw new Error(`[${name}] api/url 无效：${api}`);
            }

            const res = await fetch(requestUrl);
            if (!res.ok) {
                throw new Error(`[${name}] 请求失败：${res.status} ${res.statusText}`);
            }

            const statuses = await res.json();
            nextPageUrl = parseLinkHeader(res.headers.get('Link'));
            didFetch = true;
            if (!nextPageUrl) finished = true;

            if (!Array.isArray(statuses)) return [];

            return statuses.map(status => ({
                kind: 'status',
                source: name,
                id: String(status.id || status.uri || status.url || status.created_at || ''),
                date: status.created_at,
                data: status,
            }));
        };

        return { name, enable, reset, hasMore, fetchNext };
    };

    const escapeHtml = (unsafe) => String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const renderPlainTextAsHtml = (text) => {
        const safe = escapeHtml(text || '');
        if (!safe.trim()) return '';
        return `<p>${safe.replace(/\n/g, '<br>')}</p>`;
    };

    const parseMisskeyProfileUrl = (urlLike) => {
        const url = safeNewUrl(urlLike);
        if (!url) return null;

        // 常见形式：
        // - https://example.com/@username
        // - https://example.com/users/<userId>
        const path = url.pathname || '/';

        const atMatch = path.match(/^\/@([^\/?#]+)/);
        const userMatch = path.match(/^\/users\/([^\/?#]+)/);

        return {
            origin: url.origin,
            username: atMatch ? decodeURIComponent(atMatch[1]) : null,
            userId: userMatch ? decodeURIComponent(userMatch[1]) : null,
        };
    };

    const adaptMisskeyNoteToStatus = (note, origin) => {
        const buildNoteUrl = (id) => `${origin}/notes/${id}`;

        const convertFiles = (files) => (Array.isArray(files) ? files : [])
            .map(file => ({
                type: (file?.type || '').startsWith('image/') ? 'image' : (file?.type || 'unknown'),
                url: file?.url || '',
                preview_url: file?.thumbnailUrl || file?.url || '',
                description: file?.comment || file?.name || '',
            }))
            .filter(att => att.url && att.preview_url);

        const user = note?.user || {};
        const username = user.username || '';
        const acct = user.host ? `${username}@${user.host}` : username;

        const contentParts = [];
        if (note?.cw) {
            contentParts.push(`<p><strong>CW:</strong> ${escapeHtml(note.cw)}</p>`);
        }
        if (note?.text) {
            contentParts.push(renderPlainTextAsHtml(note.text));
        }
        if (contentParts.length === 0) {
            contentParts.push('<em>（无文字内容）</em>');
        }

        return {
            id: note?.id,
            created_at: note?.createdAt,
            url: note?.id ? buildNoteUrl(note.id) : '',
            account: { username, acct },
            content: contentParts.join(''),
            media_attachments: convertFiles(note?.files),
        };
    };

    const createMisskeySource = ({ enable, url, initialLimit, loadMoreLimit, excludeReplies, excludeReblogs }) => {
        let didFetch = false;
        let finished = false;
        let untilId = null;
        let resolved = null; // { origin, userId }

        const reset = () => {
            didFetch = false;
            finished = false;
            untilId = null;
            resolved = null;
        };

        const hasMore = () => enable && !finished;

        const resolveUser = async () => {
            if (resolved) return resolved;
            if (!url) throw new Error('[misskey] 未配置 url');

            const parsed = parseMisskeyProfileUrl(url);
            if (!parsed) throw new Error(`[misskey] url 无效：${url}`);

            if (parsed.userId) {
                resolved = { origin: parsed.origin, userId: parsed.userId };
                return resolved;
            }

            if (!parsed.username) {
                throw new Error('[misskey] url 需要是用户主页（例如 https://实例/@username 或 https://实例/users/<id>）');
            }

            const res = await fetch(`${parsed.origin}/api/users/show`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: parsed.username }),
            });

            if (!res.ok) throw new Error(`[misskey] users/show 失败：${res.status} ${res.statusText}`);
            const user = await res.json();
            if (!user?.id) throw new Error('[misskey] users/show 未返回用户 id');

            resolved = { origin: parsed.origin, userId: user.id };
            return resolved;
        };

        const fetchNext = async () => {
            if (!enable) return [];
            if (finished) return [];

            const { origin, userId } = await resolveUser();
            const limit = didFetch ? loadMoreLimit : initialLimit;

            const payload = {
                userId,
                limit,
                withReplies: !excludeReplies,
                withRenotes: !excludeReblogs,
            };
            if (untilId) payload.untilId = untilId;

            const res = await fetch(`${origin}/api/users/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error(`[misskey] users/notes 失败：${res.status} ${res.statusText}`);
            const notes = await res.json();
            didFetch = true;

            const list = Array.isArray(notes) ? notes : [];
            if (list.length > 0) {
                untilId = list[list.length - 1]?.id || untilId;
            }
            if (list.length < limit) finished = true;

            return list.map(note => {
                const isRenote = Boolean(note?.renote);
                const status = adaptMisskeyNoteToStatus(note, origin);
                if (isRenote) {
                    const original = adaptMisskeyNoteToStatus(note.renote, origin);
                    return {
                        kind: 'status',
                        source: 'misskey',
                        id: String(note.id || ''),
                        date: note.createdAt,
                        data: { ...status, reblog: original },
                    };
                }

                return {
                    kind: 'status',
                    source: 'misskey',
                    id: String(note.id || ''),
                    date: note.createdAt,
                    data: status,
                };
            });
        };

        return { name: 'misskey', enable, reset, hasMore, fetchNext };
    };

    const buildBangumiUrl = (baseUrl, offset, limit) => {
        const url = safeNewUrl(baseUrl);
        if (url) {
            if (limit) url.searchParams.set('limit', String(limit));
            url.searchParams.set('offset', String(offset));
            return url.toString();
        }

        if (baseUrl.includes('offset=')) {
            return baseUrl.replace(/([?&]offset=)(\d*)/, `$1${offset}`);
        }

        const joiner = baseUrl.includes('?') ? '&' : '?';
        return `${baseUrl}${joiner}offset=${offset}${limit ? `&limit=${limit}` : ''}`;
    };

    const createBangumiSource = ({ enable, api, initialLimit, loadMoreLimit }) => {
        let offset = 0;
        let didFetch = false;
        let finished = false;

        const reset = () => {
            offset = 0;
            didFetch = false;
            finished = false;
        };

        const hasMore = () => enable && !finished;

        const fetchNext = async () => {
            if (!enable) return [];
            if (finished) return [];
            if (!api) {
                finished = true;
                throw new Error('[bangumi] 未配置 api/url');
            }

            const limit = didFetch ? loadMoreLimit : initialLimit;
            const requestUrl = buildBangumiUrl(api, offset, limit);

            const res = await fetch(requestUrl);
            if (!res.ok) {
                throw new Error(`[bangumi] 请求失败：${res.status} ${res.statusText}`);
            }

            const payload = await res.json();
            const data = Array.isArray(payload?.data) ? payload.data : [];

            didFetch = true;
            offset += limit;
            if (data.length < limit) finished = true;

            return data.map(entry => ({
                kind: 'bangumi',
                source: 'bangumi',
                id: `${entry.subject_id || ''}:${entry.updated_at || ''}`,
                date: entry.updated_at,
                data: entry,
            }));
        };

        return { name: 'bangumi', enable, reset, hasMore, fetchNext };
    };

    // =========================================================
    // App（聚合/加载/交互）
    // =========================================================
    const sources = [
        createMastodonLikeSource({ name: 'mastodon', ...config.mastodon }),
        createMisskeySource(config.misskey),
        createBangumiSource(config.bangumi),
    ].filter(s => s.enable);

    const appState = {
        isLoading: false,
        renderedKeys: new Set(),
    };

    const setLoadingUi = (isLoading) => {
        dom.loadMoreBtn.disabled = isLoading;
        dom.loadMoreBtn.textContent = isLoading ? '加载中...' : '加载更多';
    };

    const updateLoadMoreVisibility = () => {
        const hasMore = sources.some(s => s.hasMore());
        dom.loadMoreBtn.style.display = hasMore ? 'block' : 'none';
        if (!hasMore && dom.noMorePostsPlaceholder) {
            dom.noMorePostsPlaceholder.innerHTML = '<p class="no-more-posts">已经没有更多动态了</p>';
        }
    };

    const renderItems = (items, { replace = false } = {}) => {
        const fragment = document.createDocumentFragment();

        items.forEach(item => {
            let el = null;
            if (item.kind === 'status') el = createStatusElement(item.data, item.source);
            if (item.kind === 'bangumi') el = createBangumiElement(item.data);
            if (!el) return;
            fragment.appendChild(el);
        });

        if (replace) dom.timelineContainer.innerHTML = '';
        dom.timelineContainer.appendChild(fragment);
    };

    const loadNextPage = async ({ isFirstLoad }) => {
        if (appState.isLoading) return;
        if (sources.length === 0) {
            dom.timelineContainer.innerHTML = '<p>未启用任何动态源，请检查主题配置。</p>';
            return;
        }

        appState.isLoading = true;
        setLoadingUi(true);

        if (isFirstLoad) {
            dom.noMorePostsPlaceholder && (dom.noMorePostsPlaceholder.innerHTML = '');
            dom.timelineContainer.innerHTML = `
                <div class="timeline-loading">
                    <div class="spinner"></div>
                    <span>正在加载动态...</span>
                </div>
            `;
            appState.renderedKeys.clear();
            sources.forEach(s => s.reset());
        }

        try {
            const activeSources = sources.filter(s => s.hasMore());
            const results = await Promise.allSettled(activeSources.map(s => s.fetchNext()));

            const items = [];
            const errors = [];

            results.forEach((result, idx) => {
                if (result.status === 'fulfilled') {
                    items.push(...result.value);
                } else {
                    const sourceName = activeSources[idx]?.name || 'unknown';
                    errors.push({ source: sourceName, error: result.reason });
                    console.error('[moments] 源加载失败:', sourceName, result.reason);
                }
            });

            const uniqueItems = items
                .filter(item => item && item.date)
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .filter(item => {
                    const key = `${item.source}:${item.kind}:${item.id}`;
                    if (appState.renderedKeys.has(key)) return false;
                    appState.renderedKeys.add(key);
                    return true;
                });

            if (isFirstLoad) {
                dom.timelineContainer.innerHTML = '';
            }

            if (uniqueItems.length > 0) {
                renderItems(uniqueItems, { replace: false });
            } else if (isFirstLoad && errors.length > 0) {
                dom.timelineContainer.innerHTML = '<p>动态加载失败，请检查网络或配置后刷新页面。</p>';
            } else if (isFirstLoad) {
                dom.timelineContainer.innerHTML = '<p>暂时没有可展示的动态。</p>';
            }

            updateLoadMoreVisibility();
        } catch (error) {
            console.error('[moments] 获取时间线失败:', error);
            if (isFirstLoad) dom.timelineContainer.innerHTML = '<p>动态加载失败，请检查网络或刷新页面。</p>';
        } finally {
            appState.isLoading = false;
            setLoadingUi(false);
        }
    };

    const handleTimelineClick = (event) => {
        if (!(event.target instanceof Element)) return;
        const clickedPost = event.target.closest('.moment-item');
        if (!clickedPost) return;

        // 图片预览：点击图片时阻止默认跳转，打开模态框
        const clickedImage = event.target.closest('.media-attachments img');
        if (clickedImage) {
            event.preventDefault();
            event.stopPropagation();
            const attachments = mediaAttachmentsByPost.get(clickedPost) || [];
            imagePreview.open(clickedImage.src, attachments);
            return;
        }

        // 点击链接/按钮等交互元素时，不做卡片跳转处理
        if (event.target.closest('a, button')) return;

        const postUrl = clickedPost.dataset.url;
        if (postUrl) {
            window.open(postUrl, '_blank', 'noopener,noreferrer');
        }
    };

    const handleLoadMore = () => {
        loadNextPage({ isFirstLoad: false });
    };

    const handleScrollLazyLoad = () => {
        if (appState.isLoading) return;
        const scrollBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
        if (scrollBottom && sources.some(s => s.hasMore())) {
            handleLoadMore();
        }
    };

    const init = () => {
        dom.loadMoreBtn.addEventListener('click', handleLoadMore);
        dom.timelineContainer.addEventListener('click', handleTimelineClick);
        window.addEventListener('scroll', handleScrollLazyLoad);

        // 首次加载用 setTimeout 让主线程先渲染页面
        setTimeout(() => {
            loadNextPage({ isFirstLoad: true });
        }, 0);
    };

    init();
});
