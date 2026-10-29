// ==UserScript==
// @name         B站关注时间
// @namespace    https://greasyfork.org/zh-CN/scripts/448006-b%E7%AB%99%E5%85%B3%E6%B3%A8%E6%97%B6%E9%97%B4
// @version      1.1
// @description  查看B站关注时间
// @author       NoahRe1
// @match        https://space.bilibili.com/*
// @grant        none
// @license      GPL-3.0 License
// ==/UserScript==

(function() {
    'use strict';

    // uid -> Promise<'YYYY-MM-DD' | null>，null 表示未关注/获取失败，避免重复请求
    const cache = new Map();

    function fetchFollowTime(uid) {
        const p = fetch('https://api.bilibili.com/x/space/acc/relation?mid=' + uid, { credentials: 'include' })
            .then(r => r.json())
            .then(json => {
                const rel = json.data && json.data.relation;
                if (rel && rel.attribute === 2 && rel.mtime) {
                    const d = new Date(rel.mtime * 1000);
                    const pad = n => String(n).padStart(2, '0');
                    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
                }
                return null;
            })
            .catch(() => null);
        cache.set(uid, p);
        return p;
    }

    function insert() {
        const stats = document.querySelector('.nav-statistics');
        if (!stats) return;
        const m = location.pathname.match(/^\/(\d+)/);
        if (!m) return;
        const uid = m[1];

        const existing = stats.querySelector('.bili-follow-time');
        if (existing) {
            if (existing.dataset.uid === uid) return;
            existing.remove(); // SPA 内切换了用户，旧数据作废
        }

        (cache.get(uid) || fetchFollowTime(uid)).then(v => {
            const statsNow = document.querySelector('.nav-statistics');
            if (!v || !statsNow || statsNow.querySelector('.bili-follow-time')) return;
            if (!location.pathname.startsWith('/' + uid)) return; // 已切到别的页面

            // 克隆最后一个统计项（div 结构的"播放数"）作为模板
            const item = statsNow.querySelector('.nav-statistics__item:last-child').cloneNode(true);
            item.classList.add('bili-follow-time');
            item.dataset.uid = uid;
            item.querySelector('.nav-statistics__item-text').textContent = '关注时间';
            const num = item.querySelector('.nav-statistics__item-num');
            num.textContent = v;
            num.removeAttribute('title');
            statsNow.appendChild(item);
        });
    }

    // 轮询兜底：覆盖首次加载与站内 SPA 切页，每秒一次、已插入时开销可忽略
    setInterval(insert, 1000);
})();
