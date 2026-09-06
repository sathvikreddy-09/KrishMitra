// Cloudflare Worker entry point (Workers Static Assets architecture).
//
// Routing:
//   POST /api/chat  -> handled here, forwards to the real OpenAI API
//   everything else -> served from the static assets bucket (env.ASSETS),
//                      i.e. the KrishMitra frontend (public/index.html)
//
// The OpenAI key is read ONLY from env.OPENAI_API_KEY, a Worker secret
// set in the Cloudflare dashboard (or via `wrangler secret put`). It is
// never sent to, or readable by, the browser.

const DEFAULT_MODEL = "gpt-4o-mini"; // vision-capable, cost-effective.
// Override without a code change by setting an OPENAI_MODEL variable in
// the Cloudflare dashboard (e.g. "gpt-5-mini", "gpt-4o").

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat") {
      return handleChat(request, env);
    }

    // Not an API route: serve the static frontend for everything else.
    return env.ASSETS.fetch(request);
  }
};

async function handleChat(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: { message: "Only POST is supported." } }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: { message: "Invalid JSON request body." } }, 400);
  }

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    // Never reveals whether a key exists beyond "not configured yet".
    return jsonResponse(
      { error: { message: "Server is not configured: OPENAI_API_KEY secret is missing." } },
      500
    );
  }

  const systemText = typeof body.system === "string" ? body.system : "";
  const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
  const maxTokens = Number.isFinite(body.max_tokens) ? body.max_tokens : 1000;

  const openaiMessages = [];
  if (systemText) openaiMessages.push({ role: "system", content: systemText });
  for (const m of incomingMessages) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    openaiMessages.push({ role: m.role, content: normalizeContent(m.content) });
  }

  if (openaiMessages.length === 0) {
    return jsonResponse({ error: { message: "No messages provided." } }, 400);
  }

  let upstream;
  try {
    upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || DEFAULT_MODEL,
        max_tokens: maxTokens,
        messages: openaiMessages
      })
    });
  } catch (e) {
    return jsonResponse({ error: { message: "Could not reach OpenAI: " + e.message } }, 502);
  }

  let data;
  try {
    data = await upstream.json();
  } catch (e) {
    return jsonResponse({ error: { message: "OpenAI returned an unreadable response." } }, 502);
  }

  if (!upstream.ok) {
    const message = (data && data.error && data.error.message) || "OpenAI request failed.";
    return jsonResponse({ error: { message: message } }, upstream.status);
  }

  const replyText =
    (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";

  // Same shape the frontend has always parsed (data.content[0].text),
  // so nothing downstream in index.html needed to change.
  return jsonResponse({ content: [{ type: "text", text: replyText }] }, 200);
}

function normalizeContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(function (block) {
      if (block && block.type === "text") {
        return { type: "text", text: String(block.text || "") };
      }
      if (block && block.type === "image" && block.source && block.source.data) {
        var mediaType = block.source.media_type || "image/jpeg";
        return {
          type: "image_url",
          image_url: { url: "data:" + mediaType + ";base64," + block.source.data }
        };
      }
      return { type: "text", text: "" };
    });
  }
  return String(content == null ? "" : content);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...corsHeaders() }
  });
}
