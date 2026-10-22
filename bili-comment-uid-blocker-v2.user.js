// ==UserScript==
// @name         B站评论区一键隐藏 · 印章版
// @namespace    zcode.bili.uid-blocker.v2
// @version      0.2.0
// @description  在B站评论区昵称旁添加"隐藏"按钮，点击后该评论盖上半透明禁止印章，2秒后消失；该用户所有评论（含楼中楼）自动处理
// @match        *://www.bilibili.com/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  "use strict";

  const STORE_KEY = "biliUidBlockList_v1"; // 与 v1 共用名单
  const SCAN_INTERVAL_MS = 600;
  const STAMP_HIDE_MS = 2000; // 盖章到消失的间隔

  // 印章图标：图灵测试拒绝章
  const STAMP_ICON_SRC =
    "https://i0.hdslb.com/bfs/new_dyn/43ff4b446e90aa547fbb43f2932c8a683494363239811910.png";

  // ---------- 存储（GM 优先，localStorage 兜底） ----------
  function loadList() {
    try {
      const raw = typeof GM_getValue === "function" ? GM_getValue(STORE_KEY) : localStorage.getItem(STORE_KEY);
      return JSON.parse(raw || "{}");
    } catch (e) {
      return {};
    }
  }
  function saveList(list) {
    const raw = JSON.stringify(list);
    if (typeof GM_setValue === "function") GM_setValue(STORE_KEY, raw);
    else localStorage.setItem(STORE_KEY, raw);
  }

  // ---------- 从 bili-comment-user-info 提取用户 ----------
  function extractUser(commentEl) {
    const ui = commentEl.shadowRoot && commentEl.shadowRoot.querySelector("bili-comment-user-info");
    if (!ui || !ui.shadowRoot) return null;
    const info = ui.shadowRoot.querySelector("#info");
    if (!info) return null;
    const nameEl = info.querySelector("#user-name[data-user-profile-id]");
    let mid = nameEl ? nameEl.getAttribute("data-user-profile-id") : null;
    let name = nameEl ? (nameEl.textContent || "").trim() : "";
    if (!mid) {
      const avatar = commentEl.shadowRoot.querySelector("a#user-avatar[href*='space.bilibili.com']");
      const m = avatar && avatar.getAttribute("href").match(/space\.bilibili\.com\/(\d+)/);
      if (m) mid = m[1];
    }
    if (!mid) return null;
    return { mid, name: name || mid, infoEl: info, uiEl: ui };
  }

  // ---------- 宿主定位 / 隐藏恢复 ----------
  function hostToHide(commentEl) {
    if (commentEl.tagName === "BILI-COMMENT-RENDERER") {
      const root = commentEl.getRootNode();
      return root && root.host ? root.host : commentEl; // bili-comment-thread-renderer
    }
    return commentEl; // bili-comment-reply-renderer
  }
  function hideHost(host) {
    host.style.display = "none";
    host.dataset.biliUidBlocked = "1";
  }
  function unhideHost(host) {
    if (host.dataset.biliUidBlocked === "1" || host.dataset.biliUidStampedMid) {
      host.style.display = "";
      delete host.dataset.biliUidBlocked;
      delete host.dataset.biliUidStampedMid; // 残留标记会让下次隐藏误判"章还在"
      removeOverlay(host);
    }
  }

  // ---------- 印章图层 ----------
  const STAMP_FLAG = "data-bili-uid-stamp";
  function makeOverlay() {
    const ov = document.createElement("div");
    ov.setAttribute(STAMP_FLAG, "1");
    Object.assign(ov.style, {
      position: "absolute",
      inset: "0",
      background: "rgba(255,255,255,0.55)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "10",
      pointerEvents: "none",
      borderRadius: "8px",
    });
    const img = document.createElement("img");
    img.src = STAMP_ICON_SRC;
    Object.assign(img.style, {
      width: "320px",
      maxWidth: "62%",
      maxHeight: "75%",
      objectFit: "contain",
      opacity: "0.9",
      transform: "rotate(-6deg)",
    });
    ov.appendChild(img);
    return ov;
  }
  function removeOverlay(host) {
    const ov = host.shadowRoot && host.shadowRoot.querySelector("[" + STAMP_FLAG + "]");
    if (ov) ov.remove();
    host.style.position = "";
  }
  // 盖章 → 停 STAMP_HIDE_MS → 直接消失
  function stampAndHide(commentEl, mid) {
    const host = hostToHide(commentEl);
    if (!host.shadowRoot) {
      hideHost(host);
      return;
    }
    // 防虚拟列表复用串号：宿主换了用户就清掉旧章
    if (host.dataset.biliUidStampedMid && host.dataset.biliUidStampedMid !== mid) {
      removeOverlay(host);
      delete host.dataset.biliUidStampedMid;
    }
    if (host.dataset.biliUidStampedMid === mid) return; // 已盖章，等定时器收尾
    host.style.position = "relative";
    host.shadowRoot.appendChild(makeOverlay());
    host.dataset.biliUidStampedMid = mid;
    setTimeout(() => {
      if (host.dataset.biliUidStampedMid !== mid) return; // 已被复用/清理，交给 scan
      removeOverlay(host);
      hideHost(host);
    }, STAMP_HIDE_MS);
  }

  // ---------- 按钮 ----------
  const BTN_FLAG = "data-bili-uid-blocker-btn";
  function ensureButton(user) {
    const info = user.infoEl;
    let btn = info.querySelector("button[" + BTN_FLAG + "]");
    if (!btn) {
      btn = document.createElement("button");
      btn.setAttribute(BTN_FLAG, "1");
      Object.assign(btn.style, {
        marginLeft: "6px",
        padding: "0 6px",
        fontSize: "12px",
        lineHeight: "18px",
        color: "#9499A0",
        background: "transparent",
        border: "1px solid #E3E5E7",
        borderRadius: "4px",
        cursor: "pointer",
      });
      btn.addEventListener("mouseenter", () => (btn.style.color = "#FB7299"));
      btn.addEventListener("mouseleave", () => (btn.style.color = "#9499A0"));
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const list = loadList();
        list[user.mid] = { name: user.name, ts: Date.now() };
        saveList(list);
        scan();
      });
      info.appendChild(btn);
    }
    btn.textContent = "サヨナラ！";
    btn.title = "隐藏 " + user.name + "（UID " + user.mid + "），隐藏其所有评论";
  }

  function removeButton(infoEl) {
    const btn = infoEl.querySelector("button[" + BTN_FLAG + "]");
    if (btn) btn.remove();
  }

  // ---------- 处理单条评论 ----------
  function processComment(commentEl) {
    if (!commentEl.shadowRoot) return;
    const user = extractUser(commentEl);
    if (!user) return;
    const blocked = !!loadList()[user.mid];
    if (blocked) {
      stampAndHide(commentEl, user.mid);
      return;
    }
    unhideHost(hostToHide(commentEl));
    // 防虚拟列表复用串号：mid 变了就重建按钮
    if (user.uiEl.dataset.blockerMid !== user.mid) {
      removeButton(user.infoEl);
      user.uiEl.dataset.blockerMid = user.mid;
    }
    ensureButton(user);
  }

  // ---------- 扫描 ----------
  function scan() {
    const app = document.querySelector("#commentapp");
    if (!app) return;
    const comments = app.querySelector("bili-comments") || app.firstElementChild;
    if (!comments || !comments.shadowRoot) return;
    for (const thread of comments.shadowRoot.querySelectorAll("bili-comment-thread-renderer")) {
      if (!thread.shadowRoot) continue;
      const cr = thread.shadowRoot.querySelector("bili-comment-renderer");
      if (cr) processComment(cr);
      const rr = thread.shadowRoot.querySelector("bili-comment-replies-renderer");
      if (rr && rr.shadowRoot) {
        for (const sub of rr.shadowRoot.querySelectorAll("bili-comment-reply-renderer")) {
          processComment(sub);
        }
      }
    }
  }

  // ---------- 菜单 ----------
  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("查看隐藏名单", () => {
      const list = loadList();
      const lines = Object.entries(list).map(([mid, v]) => v.name + "（" + mid + "）");
      alert(lines.length ? "已隐藏 " + lines.length + " 人：\n" + lines.join("\n") : "隐藏名单为空");
    });
    GM_registerMenuCommand("清空隐藏名单", () => {
      if (confirm("确定清空全部隐藏记录？")) {
        saveList({});
        scan();
      }
    });
  }

  setInterval(scan, SCAN_INTERVAL_MS);
})();