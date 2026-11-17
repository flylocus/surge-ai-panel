// ============================================================
// Surge Panel Script: AI Services Availability & Node Monitor
// Target Services: ChatGPT (OpenAI), Google Gemini, Anthropic Claude
// Features: Real-time latency, HTTP accessibility status, active proxy node,
//           landing country/region & Cloudflare edge datacenter code (colo).
// Runtime Compatibility: Surge iOS (4.9.3+) & Surge macOS (5.7.5+)
// ============================================================

(function () {
  "use strict";

  var DEFAULT_TIMEOUT = 5000;
  var SCRIPT_TOTAL_TIMEOUT = 12000;
  var UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

  function safeRun(fn) {
    try {
      fn();
    } catch (e) {
      $done({
        title: "AI 状态检测异常",
        content: "运行时错误: " + String(e && e.message ? e.message : e),
        icon: "exclamationmark.triangle.fill",
        "icon-color": "#FF9500",
        style: "alert"
      });
    }
  }

  function parseArgs(raw) {
    var result = Object.create(null);
    if (!raw || typeof raw !== "string") return result;
    var pairs = raw.split("&");
    for (var i = 0; i < pairs.length; i++) {
      var part = pairs[i];
      if (!part) continue;
      var idx = part.indexOf("=");
      if (idx === -1) {
        result[decodeURIComponent(part).trim()] = "";
      } else {
        var k = decodeURIComponent(part.slice(0, idx)).trim();
        var v = decodeURIComponent(part.slice(idx + 1)).trim();
        result[k] = v;
      }
    }
    return result;
  }

  function parseBool(val, defaultVal) {
    if (val === undefined || val === null || val === "") return defaultVal;
    var s = String(val).trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
    return defaultVal;
  }

  function truncateNodeName(name, maxLen) {
    if (!name) return "默认规则";
    var chars = Array.from ? Array.from(name) : name.split("");
    if (chars.length <= maxLen) return name;
    return chars.slice(0, maxLen - 1).join("") + "…";
  }

  function parseTrace(body) {
    var res = { loc: "", colo: "", ip: "" };
    if (!body || typeof body !== "string") return res;
    var lines = body.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf("loc=") === 0) res.loc = line.slice(4).toUpperCase();
      else if (line.indexOf("colo=") === 0) res.colo = line.slice(5).toUpperCase();
      else if (line.indexOf("ip=") === 0) res.ip = line.slice(3);
    }
    return res;
  }

  function getPolicyGroups() {
    return new Promise(function (resolve) {
      if (typeof $httpAPI !== "function") {
        resolve(null);
        return;
      }
      $httpAPI("GET", "/v1/policy_groups", null, function (data) {
        if (!data || typeof data !== "object") {
          resolve(null);
        } else {
          resolve(data);
        }
      });
    });
  }

  function resolveFinalNode(groupName, groupsData, depth) {
    if (!groupName || !groupsData) return groupName || "";
    if (!depth) depth = 0;
    if (depth > 6) return groupName;

    var current = groupsData[groupName];
    if (!current) return groupName;

    var nextPolicy = "";
    if (typeof current === "string") {
      nextPolicy = current.trim();
    } else if (typeof current === "object" && current !== null) {
      nextPolicy = (current.policy || current.currentPolicy || current["current-policy"] || current.select || "").trim();
    }

    if (!nextPolicy || nextPolicy === groupName) {
      return groupName;
    }

    if (groupsData[nextPolicy]) {
      return resolveFinalNode(nextPolicy, groupsData, depth + 1);
    }

    return nextPolicy;
  }

  function findMatchedPolicy(preferredName, candidates, groupsData) {
    if (preferredName && preferredName.trim() !== "") {
      var trimmed = preferredName.trim();
      if (!groupsData) return trimmed;
      if (groupsData[trimmed]) return trimmed;
      // Case-insensitive match
      var keys = Object.keys(groupsData);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase() === trimmed.toLowerCase()) return keys[i];
      }
      return trimmed;
    }

    if (!groupsData) return "";
    var allKeys = Object.keys(groupsData);
    for (var c = 0; c < candidates.length; c++) {
      var cand = candidates[c];
      for (var k = 0; k < allKeys.length; k++) {
        var groupKey = allKeys[k];
        if (groupKey.toLowerCase() === cand.toLowerCase()) {
          return groupKey;
        }
      }
    }
    return "";
  }

  function httpGet(options) {
    return new Promise(function (resolve) {
      var opt = {
        url: options.url,
        headers: options.headers || { "User-Agent": UA },
        timeout: options.timeout || DEFAULT_TIMEOUT
      };
      if (options.policy && options.policy !== "") {
        opt.policy = options.policy;
      }
      var start = Date.now();
      $httpClient.get(opt, function (err, resp, body) {
        var elapsed = Date.now() - start;
        if (err) {
          resolve({ error: err, status: 0, body: "", latency: elapsed });
        } else {
          resolve({
            error: null,
            status: resp ? resp.status : 0,
            headers: resp ? resp.headers : {},
            body: body || "",
            latency: elapsed
          });
        }
      });
    });
  }

  // 1. ChatGPT Check
  function checkChatGPT(policyName, timeout) {
    return new Promise(function (resolve) {
      var traceUrl = "https://chatgpt.com/cdn-cgi/trace";
      var homeUrl = "https://chatgpt.com/";
      
      httpGet({ url: traceUrl, policy: policyName, timeout: timeout }).then(function (traceRes) {
        var trace = parseTrace(traceRes.body);
        var loc = trace.loc || "";
        var colo = trace.colo || "";

        if (traceRes.error && traceRes.status === 0) {
          resolve({
            service: "ChatGPT",
            ok: false,
            latency: traceRes.latency,
            statusText: "⚪️ 超时/网络断开",
            loc: loc,
            colo: colo
          });
          return;
        }

        // Region check
        if (loc === "CN" || loc === "HK" || loc === "RU" || loc === "IR") {
          resolve({
            service: "ChatGPT",
            ok: false,
            latency: traceRes.latency,
            statusText: "🟡 地区受限(" + loc + ")",
            loc: loc,
            colo: colo
          });
          return;
        }

        // Verification on chatgpt.com frontend
        httpGet({ url: homeUrl, policy: policyName, timeout: timeout }).then(function (homeRes) {
          var latency = Math.round((traceRes.latency + homeRes.latency) / 2);
          if (homeRes.status === 403) {
            resolve({
              service: "ChatGPT",
              ok: false,
              latency: latency,
              statusText: "🔴 阻断(403 WAF)",
              loc: loc,
              colo: colo
            });
          } else if (homeRes.status >= 200 && homeRes.status < 400) {
            resolve({
              service: "ChatGPT",
              ok: true,
              latency: latency,
              statusText: "🟢 " + latency + "ms",
              loc: loc,
              colo: colo
            });
          } else {
            resolve({
              service: "ChatGPT",
              ok: true,
              latency: traceRes.latency,
              statusText: "🟢 " + traceRes.latency + "ms",
              loc: loc,
              colo: colo
            });
          }
        });
      });
    });
  }

  // 2. Gemini Check
  function checkGemini(policyName, timeout) {
    return new Promise(function (resolve) {
      var targetUrl = "https://gemini.google.com";
      httpGet({ url: targetUrl, policy: policyName, timeout: timeout }).then(function (res) {
        if (res.error && res.status === 0) {
          resolve({
            service: "Gemini",
            ok: false,
            latency: res.latency,
            statusText: "⚪️ 超时/网络断开",
            loc: "",
            colo: ""
          });
          return;
        }

        var locHeader = (res.headers && (res.headers.location || res.headers.Location)) || "";
        var isUnsupported = locHeader.indexOf("unsupported") !== -1 || res.status === 451;

        if (isUnsupported) {
          resolve({
            service: "Gemini",
            ok: false,
            latency: res.latency,
            statusText: "🟡 地区受限",
            loc: "",
            colo: ""
          });
        } else if (res.status >= 200 && res.status < 400) {
          resolve({
            service: "Gemini",
            ok: true,
            latency: res.latency,
            statusText: "🟢 " + res.latency + "ms",
            loc: "",
            colo: ""
          });
        } else {
          resolve({
            service: "Gemini",
            ok: false,
            latency: res.latency,
            statusText: "🔴 异常(" + res.status + ")",
            loc: "",
            colo: ""
          });
        }
      });
    });
  }

  // 3. Claude Check
  function checkClaude(policyName, timeout) {
    return new Promise(function (resolve) {
      var traceUrl = "https://claude.ai/cdn-cgi/trace";
      var loginUrl = "https://claude.ai/login";

      httpGet({ url: traceUrl, policy: policyName, timeout: timeout }).then(function (traceRes) {
        var trace = parseTrace(traceRes.body);
        var loc = trace.loc || "";
        var colo = trace.colo || "";

        if (traceRes.error && traceRes.status === 0) {
          resolve({
            service: "Claude",
            ok: false,
            latency: traceRes.latency,
            statusText: "⚪️ 超时/网络断开",
            loc: loc,
            colo: colo
          });
          return;
        }

        httpGet({ url: loginUrl, policy: policyName, timeout: timeout }).then(function (loginRes) {
          var latency = Math.round((traceRes.latency + loginRes.latency) / 2);
          var body = loginRes.body || "";
          var isGeoBlocked = loginRes.status === 403 || body.indexOf("unavailable in your region") !== -1 || body.indexOf("App unavailable") !== -1;

          if (isGeoBlocked) {
            resolve({
              service: "Claude",
              ok: false,
              latency: latency,
              statusText: "🟡 地区受限/阻断",
              loc: loc,
              colo: colo
            });
          } else if (loginRes.status >= 200 && loginRes.status < 400) {
            resolve({
              service: "Claude",
              ok: true,
              latency: latency,
              statusText: "🟢 " + latency + "ms",
              loc: loc,
              colo: colo
            });
          } else {
            resolve({
              service: "Claude",
              ok: true,
              latency: traceRes.latency,
              statusText: "🟢 " + traceRes.latency + "ms",
              loc: loc,
              colo: colo
            });
          }
        });
      });
    });
  }

  // Main Entry
  safeRun(function () {
    var rawArgs = typeof $argument !== "undefined" ? $argument : "";
    var args = parseArgs(rawArgs);

    var timeout = parseInt(args.timeout, 10);
    if (isNaN(timeout) || timeout <= 0) timeout = DEFAULT_TIMEOUT;
    var showColo = parseBool(args.show_colo, true);

    getPolicyGroups().then(function (groupsData) {
      var chatgptGroup = findMatchedPolicy(args.chatgpt_policy, ["AI Suite", "ChatGPT", "OpenAI", "AI 服务", "AI", "Global"], groupsData);
      var geminiGroup = findMatchedPolicy(args.gemini_policy, ["Gemini", "Google", "AI Suite", "Global"], groupsData);
      var claudeGroup = findMatchedPolicy(args.claude_policy, ["Claude", "Claude-Relay", "Anthropic", "AI Suite", "Global"], groupsData);

      var chatgptNode = resolveFinalNode(chatgptGroup, groupsData);
      var geminiNode = resolveFinalNode(geminiGroup, groupsData);
      var claudeNode = resolveFinalNode(claudeGroup, groupsData);

      var p1 = checkChatGPT(chatgptGroup, timeout);
      var p2 = checkGemini(geminiGroup, timeout);
      var p3 = checkClaude(claudeGroup, timeout);

      var timeoutPromise = new Promise(function (resolve) {
        setTimeout(function () {
          resolve("SCRIPT_TIMEOUT");
        }, SCRIPT_TOTAL_TIMEOUT);
      });

      Promise.race([Promise.all([p1, p2, p3]), timeoutPromise]).then(function (res) {
        if (res === "SCRIPT_TIMEOUT") {
          $done({
            title: "🤖 AI 服务与节点检测",
            content: "检测超时，请检查当前网络连接或代理节点状态。",
            icon: "exclamationmark.triangle.fill",
            "icon-color": "#FF9500",
            style: "alert"
          });
          return;
        }

        var rChat = res[0];
        var rGemini = res[1];
        var rClaude = res[2];

        function formatLine(tag, result, nodeName) {
          var line = tag + ": " + result.statusText;
          var dispNode = truncateNodeName(nodeName, 14);
          var detail = "";
          if (showColo) {
            if (result.loc && result.colo) {
              detail = " [" + result.loc + "·" + result.colo + "]";
            } else if (result.loc) {
              detail = " [" + result.loc + "]";
            }
          }
          line += " · " + dispNode + detail;
          return line;
        }

        var lines = [
          formatLine("ChatGPT", rChat, chatgptNode),
          formatLine("Gemini ", rGemini, geminiNode),
          formatLine("Claude ", rClaude, claudeNode)
        ];

        var allOk = rChat.ok && rGemini.ok && rClaude.ok;
        var anyOk = rChat.ok || rGemini.ok || rClaude.ok;

        var panelTitle = "🤖 AI 服务与节点检测";
        var panelStyle = "good";
        var iconName = "sparkles";
        var iconColor = "#10A37F";

        if (allOk) {
          panelStyle = "good";
          iconName = "sparkles";
          iconColor = "#10A37F";
        } else if (anyOk) {
          panelStyle = "alert";
          iconName = "exclamationmark.triangle.fill";
          iconColor = "#FF9500";
        } else {
          panelStyle = "error";
          iconName = "xmark.octagon.fill";
          iconColor = "#FF3B30";
        }

        $done({
          title: panelTitle,
          content: lines.join("\n"),
          icon: iconName,
          "icon-color": iconColor,
          style: panelStyle
        });
      });
    });
  });
})();
