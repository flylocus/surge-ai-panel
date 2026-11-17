// Unit test for Surge AI Panel logic
const assert = require('assert');

// 1. Test argument parsing
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

const args = parseArgs("chatgpt_policy=AI Suite&gemini_policy=Gemini&claude_policy=Claude&timeout=5000&show_colo=true");
assert.strictEqual(args.chatgpt_policy, "AI Suite");
assert.strictEqual(args.gemini_policy, "Gemini");
assert.strictEqual(args.claude_policy, "Claude");
assert.strictEqual(args.timeout, "5000");
assert.strictEqual(args.show_colo, "true");

// 2. Test recursive node resolution
function resolveFinalNode(groupName, groupsData, depth) {
  if (!groupName || !groupsData) return groupName || "默认规则";
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

const mockGroups = {
  "AI Suite": "🇺🇸 US-Node-01",
  "Claude": "Claude-Relay",
  "Claude-Relay": {
    "policy": "🟢 Proxy-Chain-02"
  },
  "Gemini": {
    "policy": "🇯🇵 JP-Node-03"
  }
};

assert.strictEqual(resolveFinalNode("AI Suite", mockGroups), "🇺🇸 US-Node-01");
assert.strictEqual(resolveFinalNode("Claude", mockGroups), "🟢 Proxy-Chain-02");
assert.strictEqual(resolveFinalNode("Gemini", mockGroups), "🇯🇵 JP-Node-03");
assert.strictEqual(resolveFinalNode("NonExistent", mockGroups), "NonExistent");

// 3. Test trace parser
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

const mockTrace = `fl=123f45\nh=chatgpt.com\nip=104.28.1.1\nloc=US\ncolo=SJC\n`;
const parsed = parseTrace(mockTrace);
assert.strictEqual(parsed.loc, "US");
assert.strictEqual(parsed.colo, "SJC");
assert.strictEqual(parsed.ip, "104.28.1.1");

// 4. Test format string
function truncateNodeName(name, maxLen) {
  if (!name) return "";
  var chars = Array.from ? Array.from(name) : name.split("");
  if (chars.length <= maxLen) return name;
  return chars.slice(0, maxLen - 1).join("") + "…";
}

assert.strictEqual(truncateNodeName("🟢 Proxy-Chain-Super-Long", 12), "🟢 Proxy-Cha…");
assert.strictEqual(truncateNodeName("🇺🇸 AWS", 10), "🇺🇸 AWS");

console.log("All unit tests passed successfully!");
