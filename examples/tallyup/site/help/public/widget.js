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

  var root = el("div", { style: "position:fixed;bottom:16px;right:16px;z-index:2147483000;font:14px system-ui,sans-serif;" });
  var panel = el("div", {
    style:
      "display:none;width:320px;height:400px;background:#fff;border:1px solid #ddd;border-radius:8px;" +
      "box-shadow:0 4px 16px rgba(0,0,0,.15);flex-direction:column;overflow:hidden;",
  });
  panel.style.display = "none";
  var header = el("div", { style: "display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid #eee;" }, [
    el("strong", {}, ["Help chat"]),
  ]);
  var closeBtn = el("button", { style: "border:none;background:none;cursor:pointer;font-size:16px;" }, ["✕"]);
  header.appendChild(closeBtn);

  var messages = el("div", { style: "flex:1;overflow-y:auto;padding:8px 12px;" });
  var form = el("form", { style: "display:flex;gap:4px;border-top:1px solid #eee;padding:8px;" });
  var input = el("input", { style: "flex:1;border:1px solid #ccc;border-radius:4px;padding:6px 8px;", placeholder: "Ask a question…" });
  var sendBtn = el("button", { type: "submit", style: "border:none;background:#111;color:#fff;border-radius:4px;padding:6px 12px;cursor:pointer;" }, ["Send"]);
  form.appendChild(input);
  form.appendChild(sendBtn);

  panel.appendChild(header);
  panel.appendChild(messages);
  panel.appendChild(form);

  var toggle = el(
    "button",
    { style: "border:none;background:#111;color:#fff;border-radius:999px;padding:10px 18px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2);" },
    ["Help"],
  );

  root.appendChild(panel);
  root.appendChild(toggle);
  document.body.appendChild(root);

  toggle.addEventListener("click", function () {
    panel.style.display = "flex";
    toggle.style.display = "none";
  });
  closeBtn.addEventListener("click", function () {
    panel.style.display = "none";
    toggle.style.display = "block";
  });

  function addBubble(role, text) {
    var bubble = el("div", {
      style:
        "margin:6px 0;padding:6px 10px;border-radius:8px;max-width:85%;white-space:pre-wrap;" +
        (role === "user" ? "margin-left:auto;background:#eef;" : "background:#f3f3f3;"),
    });
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  function addCitations(citations) {
    if (!citations || !citations.length) return;
    var list = el("ul", { style: "margin:2px 0 10px;padding-left:16px;font-size:12px;color:#666;" });
    citations.forEach(function (c) {
      var li = el("li", {});
      var a = el("a", { href: helpUrl + c.url, target: "_blank", rel: "noreferrer" }, [
        "[" + c.n + "] " + c.title + (c.heading ? " — " + c.heading : ""),
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
