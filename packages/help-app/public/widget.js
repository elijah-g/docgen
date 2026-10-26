/*!
 * docgen help chat — drop-in widget (scope.md "Help chat": "a drop-in widget inside the app
 * (one script tag or a React component)"; build-plan.md M15 step 6).
 *
 * Usage, in the app being documented (not the help site itself):
 *   <script src="https://your-help-site.example.com/widget.js" data-help-url="https://your-help-site.example.com"></script>
 *
 * Sends `location.pathname` as `currentPath` on every question, so retrieval can boost the
 * walkthrough the reader is actually looking at. Talks to `<data-help-url>/api/chat` directly —
 * that route must list this app's origin in `docgen.config.ts`'s `chat.allowedOrigins` (see
 * packages/engine/src/chat/cors.ts) or the browser will block the response.
 *
 * No build step, no dependencies, no React required — plain DOM + fetch. For a React app,
 * import the `ChatWidget` component documented in this package's README instead.
 */
(function () {
  "use strict";

  var currentScript = document.currentScript;
  var helpUrl = (currentScript && currentScript.getAttribute("data-help-url")) || "";
  if (!helpUrl) {
    console.error("[docgen widget] missing data-help-url attribute on the widget.js <script> tag");
    return;
  }
  helpUrl = helpUrl.replace(/\/$/, "");

  var history = [];
  var busy = false;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    for (var k in attrs || {}) node.setAttribute(k, attrs[k]);
    (children || []).forEach(function (c) {
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  // Shadow DOM keeps the host app's CSS and the widget's apart in both directions.
  var host = el("div", { "data-docgen-widget": "" });
  var shadow = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  var style = document.createElement("style");
  style.textContent = [
    ":host{all:initial}",
    ".dg{--p:#111827;--pf:#fff;--font:system-ui,-apple-system,'Segoe UI',sans-serif;position:fixed;bottom:16px;right:16px;z-index:2147483000;font:14px/1.45 var(--font);color:#111827}",
    ".dg *{box-sizing:border-box;font:inherit}",
    ".panel{display:none;flex-direction:column;width:min(24rem,calc(100vw - 32px));height:min(34rem,calc(100vh - 32px));background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 24px 60px -12px rgba(15,23,42,.35);overflow:hidden}",
    ".panel.open{display:flex}",
    ".head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #eef0f3;background:#fafbfc}",
    ".mark{width:32px;height:32px;border-radius:999px;background:var(--p);color:var(--pf);display:grid;place-items:center;flex:none;overflow:hidden}",
    ".mark img{width:22px;height:22px;object-fit:contain}",
    ".title{font-weight:600}.sub{font-size:12px;color:#6b7280}",
    ".x{margin-left:auto;border:0;background:none;cursor:pointer;color:#6b7280;padding:6px;border-radius:8px}.x:hover{background:#f1f3f5;color:#111827}",
    ".msgs{flex:1;overflow-y:auto;padding:14px}",
    ".empty{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#6b7280;gap:6px}",
    ".empty b{color:#111827}",
    ".b{margin:6px 0;padding:8px 12px;border-radius:16px;max-width:88%;white-space:pre-wrap;word-wrap:break-word}",
    ".b.user{margin-left:auto;background:var(--p);color:var(--pf);border-bottom-right-radius:6px}",
    ".b.assistant{background:#f1f3f5;border-bottom-left-radius:6px}",
    ".cites{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 12px;padding:0;list-style:none}",
    ".cites a{display:inline-block;border:1px solid #e5e7eb;border-radius:999px;padding:3px 10px;font-size:12px;color:#374151;text-decoration:none}",
    ".cites a:hover{border-color:var(--p);color:var(--p)}",
    "form{display:flex;gap:8px;align-items:center;padding:10px;border-top:1px solid #eef0f3;background:#fafbfc}",
    "input{flex:1;min-width:0;border:1px solid #d1d5db;border-radius:999px;padding:8px 14px;outline:none;background:#fff;color:#111827}",
    "input:focus{border-color:var(--p);box-shadow:0 0 0 3px color-mix(in srgb,var(--p) 20%,transparent)}",
    ".send{width:36px;height:36px;border:0;border-radius:999px;background:var(--p);color:var(--pf);cursor:pointer;display:grid;place-items:center;flex:none}",
    ".toggle{display:inline-flex;align-items:center;gap:8px;border:0;background:var(--p);color:var(--pf);border-radius:999px;padding:10px 16px 10px 12px;cursor:pointer;font-weight:600;box-shadow:0 8px 24px -6px rgba(15,23,42,.35)}",
    ".toggle.hidden{display:none}",
  ].join("\n");
  shadow.appendChild(style);

  var ICON_CHAT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICON_SEND = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>';
  var ICON_X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  var root = el("div", { class: "dg" });
  var panel = el("div", { class: "panel", role: "dialog", "aria-label": "Help chat" });
  var mark = el("span", { class: "mark" });
  mark.innerHTML = ICON_CHAT;
  var titleEl = el("div", { class: "title" }, ["Help chat"]);
  var header = el("div", { class: "head" }, [mark, el("div", {}, [titleEl, el("div", { class: "sub" }, ["Answers come from the help guides"])])]);
  var closeBtn = el("button", { class: "x", type: "button", "aria-label": "Close help chat" });
  closeBtn.innerHTML = ICON_X;
  header.appendChild(closeBtn);

  var messages = el("div", { class: "msgs" });
  var empty = el("div", { class: "empty" }, [
    el("b", {}, ["Ask a question"]),
    el("div", { style: "font-size:12px;max-width:16rem" }, ["You'll get an answer with links to the guide that shows how."]),
  ]);
  messages.appendChild(empty);
  var form = el("form", {});
  var input = el("input", { placeholder: "Ask a question…", "aria-label": "Ask the help chat" });
  var sendBtn = el("button", { type: "submit", class: "send", "aria-label": "Send" });
  sendBtn.innerHTML = ICON_SEND;
  form.appendChild(input);
  form.appendChild(sendBtn);

  panel.appendChild(header);
  panel.appendChild(messages);
  panel.appendChild(form);

  var toggle = el("button", { type: "button", class: "toggle" });
  toggle.innerHTML = ICON_CHAT;
  toggle.appendChild(document.createTextNode("Ask a question"));

  root.appendChild(panel);
  root.appendChild(toggle);
  shadow.appendChild(root);
  document.body.appendChild(host);

  // The help site's brand (written by the docgen engine): colour, name, logo and font, so the
  // widget looks like part of the app rather than a third-party bolt-on.
  fetch(helpUrl + "/brand/theme.json")
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (t) {
      if (!t) return;
      if (t.primary) root.style.setProperty("--p", t.primary);
      if (t.primaryForeground) root.style.setProperty("--pf", t.primaryForeground);
      if (t.fontFamily) root.style.setProperty("--font", t.fontFamily);
      if (t.name) {
        titleEl.textContent = t.name + " help";
        panel.setAttribute("aria-label", t.name + " help chat");
      }
      if (t.logo) {
        mark.style.background = "#fff";
        mark.innerHTML = "";
        mark.appendChild(el("img", { src: helpUrl + t.logo, alt: "" }));
      }
    })
    .catch(function () {});

  toggle.addEventListener("click", function () {
    panel.classList.add("open");
    toggle.classList.add("hidden");
    input.focus();
  });
  closeBtn.addEventListener("click", function () {
    panel.classList.remove("open");
    toggle.classList.remove("hidden");
  });
  panel.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeBtn.click();
  });

  function addBubble(role, text) {
    if (empty.parentNode) empty.parentNode.removeChild(empty);
    var bubble = el("div", { class: "b " + role });
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  function addCitations(citations) {
    if (!citations || !citations.length) return;
    var list = el("ul", { class: "cites" });
    citations.forEach(function (c) {
      var li = el("li", {});
      var a = el("a", { href: helpUrl + c.url, target: "_blank", rel: "noreferrer" }, [
        c.n + " · " + c.title + (c.heading ? " — " + c.heading : ""),
      ]);
      li.appendChild(a);
      list.appendChild(li);
    });
    messages.appendChild(list);
  }

  async function ask(question) {
    if (!question.trim() || busy) return;
    busy = true;
    addBubble("user", question);
    var answerBubble = addBubble("assistant", "…");
    history.push({ role: "user", content: question });

    try {
      var res = await fetch(helpUrl + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question, currentPath: location.pathname, history: history.slice(0, -1) }),
      });

      if (!res.ok || !res.body) {
        var errBody = await res.json().catch(function () {
          return { error: "request failed (" + res.status + ")" };
        });
        answerBubble.textContent = errBody.error || "something went wrong";
        return;
      }

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";
      var answer = "";
      answerBubble.textContent = "";

      for (;;) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        var newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
          var line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;
          var event = JSON.parse(line);
          if (event.type === "meta") {
            addCitations(event.citations);
          } else if (event.type === "delta") {
            answer += event.text;
            answerBubble.textContent = answer;
          } else if (event.type === "error") {
            answerBubble.textContent = event.message;
          }
        }
      }
      history.push({ role: "assistant", content: answer });
    } catch (err) {
      answerBubble.textContent = "couldn't reach help chat";
    } finally {
      busy = false;
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = input.value;
    input.value = "";
    void ask(q);
  });
})();
