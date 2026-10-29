// ==UserScript==
// @name         B站评论区一键@面板
// @namespace    zcode.bili.at-panel
// @version      0.1.0
// @description  视频页右下角小面板：填入要@的昵称，一键生成B站评论格式（@昵称+空格）的提及文本并复制到剪贴板，自己粘贴进评论框发送
// @match        *://www.bilibili.com/video/*
// @match        *://bilibili.com/video/*
// @run-at       document-idle
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  "use strict";

  // B站单条评论 @ 提及人数上限（超出只警告，仍复制全部，由用户自己决定怎么发）
  var AT_LIMIT_PER_COMMENT = 10;

  // ---------- 纯逻辑 ----------

  // 按空白/中英文逗号分号顿号分隔，剥掉手打的 @ 前缀，去重保序
  function parseNames(text) {
    var tokens = String(text || "").split(/[\s,，、;；]+/);
    var seen = {};
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i].replace(/^[@＠]+/, "").trim();
      if (t && !seen[t]) {
        seen[t] = true;
        out.push(t);
      }
    }
    return out;
  }

  // "@昵称 " 串：每个昵称后带一个空格，作为 @ 解析的结束符（B站昵称不含空格，无歧义）
  function formatMentions(names) {
    var s = "";
    for (var i = 0; i < names.length; i++) {
      s += "@" + names[i] + " ";
    }
    return s;
  }

  // ---------- 剪贴板（clipboard API 优先，GM / execCommand 兜底） ----------
  function copyText(text) {
    return new Promise(function (resolve, reject) {
      function gmFallback() {
        try {
          if (typeof GM_setClipboard === "function") {
            GM_setClipboard(text);
            resolve();
            return true;
          }
        } catch (e) {}
        return false;
      }
      function execCommandFallback() {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try {
          ok = document.execCommand("copy");
        } catch (e) {}
        ta.remove();
        if (ok) resolve();
        else reject(new Error("复制失败"));
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(resolve, function () {
            if (!gmFallback()) execCommandFallback();
          });
        } else if (!gmFallback()) {
          execCommandFallback();
        }
      } catch (e) {
        if (!gmFallback()) execCommandFallback();
      }
    });
  }

  // ---------- UI ----------
  var BTN_ID = "bili-at-panel-fab";
  var PANEL_ID = "bili-at-panel-box";

  var panel = null;

  function buildFab() {
    var fab = document.createElement("button");
    fab.id = BTN_ID;
    fab.textContent = "＠";
    fab.title = "一键@面板：生成提及文本并复制";
    Object.assign(fab.style, {
      position: "fixed",
      right: "20px",
      bottom: "160px",
      zIndex: "2147483000",
      width: "44px",
      height: "44px",
      borderRadius: "50%",
      border: "none",
      background: "#FB7299",
      color: "#fff",
      fontSize: "20px",
      lineHeight: "44px",
      textAlign: "center",
      cursor: "pointer",
      boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
    });
    fab.addEventListener("click", togglePanel);
    document.body.appendChild(fab);
    return fab;
  }

  function togglePanel() {
    if (panel) {
      panel.remove();
      panel = null;
      return;
    }
    panel = buildPanel();
    document.body.appendChild(panel);
  }

  function buildPanel() {
    var box = document.createElement("div");
    box.id = PANEL_ID;
    Object.assign(box.style, {
      position: "fixed",
      right: "20px",
      bottom: "214px",
      zIndex: "2147483000",
      width: "300px",
      background: "#fff",
      border: "1px solid #E3E5E7",
      borderRadius: "10px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
      padding: "10px 12px",
      fontFamily: "inherit",
      fontSize: "13px",
      color: "#18191C",
    });

    var title = document.createElement("div");
    title.textContent = "一键@名单";
    Object.assign(title.style, { fontWeight: "bold", marginBottom: "6px" });
    box.appendChild(title);

    var ta = document.createElement("textarea");
    ta.placeholder = "每行一个昵称，也可用逗号/空格分隔\n（带不带@都行，自动去重）";
    Object.assign(ta.style, {
      width: "100%",
      height: "110px",
      boxSizing: "border-box",
      resize: "vertical",
      border: "1px solid #E3E5E7",
      borderRadius: "6px",
      padding: "6px",
      fontSize: "13px",
      outline: "none",
    });
    box.appendChild(ta);

    var meta = document.createElement("div");
    Object.assign(meta.style, { margin: "6px 0", color: "#9499A0", minHeight: "18px" });
    box.appendChild(meta);

    function updateMeta() {
      var names = parseNames(ta.value);
      var over = names.length > AT_LIMIT_PER_COMMENT;
      meta.textContent = names.length
        ? "已填 " + names.length + " 人" + (over ? " ⚠ 单条评论最多@" + AT_LIMIT_PER_COMMENT + "人" : "")
        : "填好名字后点下方按钮";
      meta.style.color = over ? "#F0773C" : "#9499A0";
    }
    ta.addEventListener("input", updateMeta);

    var row = document.createElement("div");
    Object.assign(row.style, { display: "flex", gap: "8px" });
    box.appendChild(row);

    var copyBtn = document.createElement("button");
    copyBtn.textContent = "生成并复制";
    Object.assign(copyBtn.style, {
      flex: "1",
      padding: "6px 0",
      border: "none",
      borderRadius: "6px",
      background: "#FB7299",
      color: "#fff",
      cursor: "pointer",
      fontSize: "13px",
    });
    copyBtn.addEventListener("click", function () {
      var names = parseNames(ta.value);
      if (!names.length) {
        meta.textContent = "先填至少一个昵称";
        meta.style.color = "#F0773C";
        return;
      }
      copyText(formatMentions(names)).then(
        function () {
          copyBtn.textContent = "✓ 已复制 " + names.length + " 人";
          setTimeout(function () {
            copyBtn.textContent = "生成并复制";
          }, 1500);
        },
        function () {
          meta.textContent = "复制失败，请手动全选生成结果";
          meta.style.color = "#F0773C";
        }
      );
    });
    row.appendChild(copyBtn);

    var clearBtn = document.createElement("button");
    clearBtn.textContent = "清空";
    Object.assign(clearBtn.style, {
      padding: "6px 14px",
      border: "1px solid #E3E5E7",
      borderRadius: "6px",
      background: "#fff",
      color: "#61666D",
      cursor: "pointer",
      fontSize: "13px",
    });
    clearBtn.addEventListener("click", function () {
      ta.value = "";
      updateMeta();
    });
    row.appendChild(clearBtn);

    updateMeta();
    return box;
  }

  // ---------- 初始化（幂等，SPA 重复注入不叠加） ----------
  function init() {
    if (document.getElementById(BTN_ID)) return;
    buildFab();
  }

  // 供实机验收/控制台单测
  window.__biliAtPanel = { parseNames: parseNames, formatMentions: formatMentions, version: "0.1.0" };

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
