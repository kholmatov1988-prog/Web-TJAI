import { translate as t } from "./i18n.js";

export const $ = (selector, root = document) => root.querySelector(selector);

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function escapeText(text) {
  return String(text ?? "");
}

export function showNotice(message, kind = "info") {
  const host = $("#noticeHost");
  if (!host) return;
  host.replaceChildren();
  const notice = element("div", `notice notice-${kind}`, message);
  notice.setAttribute("role", kind === "error" ? "alert" : "status");
  host.append(notice);
  if (kind !== "error") window.setTimeout(() => notice.remove(), 3600);
}

export function button(label, className = "button", type = "button") {
  const result = element("button", className, label);
  result.type = type;
  return result;
}

export function setBusy(buttonNode, busy, busyText = "Загрузка…") {
  if (!buttonNode) return;
  if (busy) {
    buttonNode.dataset.originalText = buttonNode.textContent;
    buttonNode.textContent = busyText;
    buttonNode.disabled = true;
  } else {
    buttonNode.textContent = buttonNode.dataset.originalText || buttonNode.textContent;
    buttonNode.disabled = false;
    delete buttonNode.dataset.originalText;
  }
}

export function friendlyError(error) {
  const code = error?.message || error?.error_description || "";
  const language = localStorage.getItem("tjai-web-language") || "ru";
  const known = {
    invalid_credentials: "invalidCredentials",
    email_not_confirmed: "emailNotConfirmed",
    user_already_exists: "userAlreadyExists",
    sign_in_required: "aiNeedsLogin",
    invalid_session: "aiNeedsLogin",
    account_blocked: "accountBlocked",
    profile_unavailable: "profileUnavailable",
    service_not_configured: "aiServiceNotConfigured",
    ai_api_key_invalid: "aiInvalidKey",
    ai_model_unavailable: "aiModelUnavailable",
    ai_temporarily_unavailable: "aiTemporarilyUnavailable",
    empty_ai_response: "aiTemporarilyUnavailable",
    invalid_ai_response: "aiTemporarilyUnavailable",
    invalid_question: "invalidQuestion",
    request_too_large: "questionTooLong",
    rate_limited: "rateLimited",
    conversation_save_failed: "conversationSaveFailed",
    admin_required: "adminRequired",
    last_admin_required: "lastAdminRequired",
    cannot_delete_self: "cannotDeleteSelf",
    demote_admin_before_delete: "demoteAdminFirst",
    user_delete_failed: "userDeleteFailed",
  };
  if (known[code]) return t(language, known[code]);
  if (/already registered/i.test(code)) return t(language, "userAlreadyExists");
  if (/invalid login credentials/i.test(code)) return t(language, "invalidCredentials");
  if (/fetch|network|failed to fetch/i.test(code)) return t(language, "networkError");
  return t(language, "genericError");
}
