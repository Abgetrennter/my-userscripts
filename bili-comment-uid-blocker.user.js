// ==UserScript==
// @name         B站评论区一键拉黑
// @namespace    zcode.bili.uid-blocker
// @version      0.1.0
// @description  在B站评论区昵称旁添加"拉黑"按钮，点击后UID存入本地，该用户的所有评论（含楼中楼）自动隐藏
// @match        *://www.bilibili.com/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  "use strict";

  const STORE_KEY = "biliUidBlockList_v1";
  const SCAN_INTERVAL_MS = 600;

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
    // 兜底：从头像链接解析 mid
    if (!mid) {
      const avatar = commentEl.shadowRoot.querySelector("a#user-avatar[href*='space.bilibili.com']");
      const m = avatar && avatar.getAttribute("href").match(/space\.bilibili\.com\/(\d+)/);
      if (m) mid = m[1];
    }
    if (!mid) return null;
    return { mid, name: name || mid, infoEl: info, uiEl: ui };
  }

  // ---------- 隐藏 / 恢复 ----------
  // 主评论隐藏整个楼层（含楼中楼），楼中楼回复只隐藏自己
  function hostToHide(commentEl) {
    if (commentEl.tagName === "BILI-COMMENT-RENDERER") {
      const root = commentEl.getRootNode();
      return root && root.host ? root.host : commentEl; // bili-comment-thread-renderer
    }
    return commentEl; // bili-comment-reply-renderer
  }
  function setHidden(commentEl, hidden) {
    const host = hostToHide(commentEl);
    if (hidden) {
      host.style.display = "none";
      host.dataset.biliUidBlocked = "1";
    } else if (host.dataset.biliUidBlocked === "1") {
      host.style.display = "";
      delete host.dataset.biliUidBlocked;
    }
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
    btn.textContent = "拉黑";
    btn.title = "拉黑 " + user.name + "（UID " + user.mid + "），隐藏其所有评论";
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
      setHidden(commentEl, true);
      return;
    }
    setHidden(commentEl, false);
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
    GM_registerMenuCommand("查看拉黑名单", () => {
      const list = loadList();
      const lines = Object.entries(list).map(([mid, v]) => v.name + "（" + mid + "）");
      alert(lines.length ? "已拉黑 " + lines.length + " 人：\n" + lines.join("\n") : "拉黑名单为空");
    });
    GM_registerMenuCommand("清空拉黑名单", () => {
      if (confirm("确定清空全部拉黑记录？")) {
        saveList({});
        scan();
      }
    });
  }

  setInterval(scan, SCAN_INTERVAL_MS);
})();
