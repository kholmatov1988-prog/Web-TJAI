import { supabase } from "./supabase.js";
import { $, button, element, friendlyError, showNotice } from "./ui.js";
import { translate as t } from "./i18n.js";

export function renderMessages(host, chat, onCopy) {
  host.replaceChildren();
  const messages = chat?.messages || [];
  if (!messages.length) {
    host.append(element("div", "empty-state", t(localStorage.getItem("tjai-web-language") || "ru", "emptyChat")));
    return;
  }
  for (const message of messages) {
    const node = element("article", `message ${message.role === "user" ? "message-user" : "message-assistant"}`);
    node.append(element("div", "message-label", message.role === "user" ? t(localStorage.getItem("tjai-web-language") || "ru", "you") : "TJAI"));
    node.append(element("div", "message-content", message.content || ""));
    const actions = element("div", "message-actions");
    const copy = button(t(localStorage.getItem("tjai-web-language") || "ru", "copy"), "message-copy");
    copy.addEventListener("click", () => onCopy(message.content || ""));
    actions.append(copy);
    node.append(actions);
    host.append(node);
  }
  host.scrollTop = host.scrollHeight;
}

export async function askTjai(question, lang) {
  if (!supabase) throw new Error("sign_in_required");
  const { data: sessionResult } = await supabase.auth.getSession();
  if (!sessionResult?.session) throw new Error("sign_in_required");
  const { data, error } = await supabase.functions.invoke("tjai-chat", { body: { question, lang } });
  if (error) {
    let code = error.message;
    if (error.context && typeof error.context.clone === "function") {
      try {
        const payload = await error.context.clone().json();
        code = payload.error || payload.message || payload.code || code;
      } catch { /* use the SDK message */ }
    }
    throw new Error(code || "ai_temporarily_unavailable");
  }
  if (!data?.answer) throw new Error("ai_temporarily_unavailable");
  return data.answer;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text ?? ""));
    showNotice(t(localStorage.getItem("tjai-web-language") || "ru", "copied"), "success");
    return true;
  } catch {
    showNotice(t(localStorage.getItem("tjai-web-language") || "ru", "copyFailed"), "error");
    return false;
  }
}

export function transcript(chat) {
  return (chat?.messages || []).map((message) => `${message.role === "user" ? t(localStorage.getItem("tjai-web-language") || "ru", "you") : "TJAI"}:\n${message.content || ""}`).join("\n\n");
}
