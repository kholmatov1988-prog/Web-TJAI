import { supabase } from "./supabase.js";
import { button, element, friendlyError, showNotice } from "./ui.js";
import { translate as t } from "./i18n.js";

const language = () => localStorage.getItem("tjai-web-language") || "ru";

async function adminRequest(payload) {
  if (!supabase) throw new Error("admin_unavailable");
  const { data, error } = await supabase.functions.invoke("admin-users", { body: payload });
  if (error) {
    let code = error.message;
    if (error.context && typeof error.context.clone === "function") {
      try { code = (await error.context.clone().json()).error || code; } catch { /* keep message */ }
    }
    throw new Error(code || "admin_operation_failed");
  }
  return data;
}

function labeledButton(text, action, className = "button button-small") {
  const node = button(text, className);
  node.addEventListener("click", action);
  return node;
}

export async function renderAdmin(container, { currentUserId, reload }) {
  container.replaceChildren();
  container.append(element("div", "hero", ""));
  const hero = container.firstElementChild;
  hero.append(element("h1", "", t(language(), "adminPanel")));
  hero.append(element("p", "", t(language(), "adminIntro")));
  const statsGrid = element("section", "admin-grid");
  const actions = element("div", "button-row");
  const reloadButton = button(t(language(), "adminRefresh"), "button button-small");
  const pageLabel = element("span", "side-label", `${t(language(), "adminPage")} 1`);
  const prevButton = button(t(language(), "previous"), "button button-small");
  const nextButton = button(t(language(), "nextPage"), "button button-small");
  const search = element("input", "admin-search");
  search.placeholder = t(language(), "adminSearch");
  search.type = "search";
  search.setAttribute("aria-label", search.placeholder);
  actions.append(reloadButton, prevButton, pageLabel, nextButton);
  const usersTitle = element("h2", "section-title", t(language(), "adminUsers"));
  const usersHost = element("section", "");
  const detailTitle = element("h2", "section-title", t(language(), "adminChats"));
  const details = element("section", "panel");
  details.append(element("div", "empty-state", t(language(), "adminSelectUser")));
  const auditTitle = element("h2", "section-title", t(language(), "adminAudit"));
  const auditHost = element("section", "panel");
  container.append(statsGrid, usersTitle, search, actions, usersHost, detailTitle, details, auditTitle, auditHost);

  let page = 1;
  let allUsers = [];
  let busy = false;
  async function load() {
    if (busy) return;
    busy = true;
    reloadButton.disabled = prevButton.disabled = nextButton.disabled = true;
    try {
      const [stats, users, audit] = await Promise.all([
        adminRequest({ action: "stats" }),
        adminRequest({ action: "list_users", page }),
        adminRequest({ action: "audit" }),
      ]);
      const counts = [
        [t(language(), "adminRegistered"), stats.registeredUsers], [t(language(), "adminBlocked"), stats.blockedUsers], [t(language(), "adminSavedChats"), stats.chats],
      ];
      statsGrid.replaceChildren();
      for (const [label, value] of counts) {
        const stat = element("div", "admin-stat");
        stat.append(element("span", "", label), element("strong", "", String(value ?? 0)));
        statsGrid.append(stat);
      }
      allUsers = users.users || [];
      pageLabel.textContent = `${t(language(), "adminPage")} ${page}`;
      drawUsers();
      auditHost.replaceChildren();
      if (!(audit.events || []).length) auditHost.append(element("div", "empty-state", t(language(), "adminNoAudit")));
      for (const entry of audit.events || []) {
        const row = element("div", "history-item");
        row.append(element("span", "", `${entry.action} · ${new Date(entry.created_at).toLocaleString("ru-RU")}`));
        auditHost.append(row);
      }
    } catch (error) {
      showNotice(friendlyError(error), "error");
      usersHost.replaceChildren(element("div", "empty-state", t(language(), "adminLoadFailed")));
    } finally {
      busy = false;
      reloadButton.disabled = prevButton.disabled = nextButton.disabled = false;
    }
  }

  function drawUsers() {
    const needle = search.value.trim().toLocaleLowerCase();
    usersHost.replaceChildren();
    const filtered = allUsers.filter((user) => `${user.email} ${user.displayName}`.toLocaleLowerCase().includes(needle));
    if (!filtered.length) usersHost.append(element("div", "empty-state", t(language(), "adminNoUsers")));
    for (const user of filtered) {
      const row = element("article", "admin-user-row");
      const info = element("div", "admin-user-main");
      info.append(element("strong", "", user.email || t(language(), "noEmail")));
      info.append(element("span", "", `${user.displayName || t(language(), "noName")} · ${user.role === "admin" ? t(language(), "adminRole") : t(language(), "userRole")} · ${new Date(user.createdAt).toLocaleDateString(language())}${user.blocked ? " · " + t(language(), "adminBlocked") : ""}`));
      const controls = element("div", "admin-actions");
      const role = labeledButton(user.role === "admin" ? t(language(), "revokeAdmin") : t(language(), "grantAdmin"), async () => {
        if (!window.confirm(`${user.role === "admin" ? t(language(), "confirmRevokeAdmin") : t(language(), "confirmGrantAdmin")} ${user.email}?`)) return;
        await act({ action: "set_role", targetUserId: user.id, role: user.role === "admin" ? "user" : "admin" });
      });
      const block = labeledButton(user.blocked ? t(language(), "unblock") : t(language(), "block"), async () => {
        if (user.id === currentUserId && !user.blocked) return showNotice(t(language(), "cannotBlockSelf"), "error");
        await act({ action: "set_block", targetUserId: user.id, blocked: !user.blocked });
      });
      const chats = labeledButton(t(language(), "conversations"), () => viewChats(user));
      const remove = labeledButton(t(language(), "deleteAccount"), async () => {
        if (user.id === currentUserId) return showNotice(t(language(), "cannotDeleteSelf"), "error");
        const accepted = window.confirm(`${t(language(), "deleteAccountConfirm")} ${user.email}?`);
        if (accepted) await act({ action: "delete_user", targetUserId: user.id });
      }, "button button-small button-danger");
      controls.append(role, block, chats, remove);
      row.append(info, controls);
      usersHost.append(row);
    }
  }

  async function act(payload) {
    try {
      await adminRequest(payload);
      showNotice(t(language(), "changesSaved"), "success");
      await load();
      await reload();
    } catch (error) {
      showNotice(friendlyError(error), "error");
    }
  }

  async function viewChats(user) {
    details.replaceChildren(element("p", "", `${t(language(), "account")}: ${user.email}`));
    try {
      const data = await adminRequest({ action: "view_chats", targetUserId: user.id });
      if (!(data.chats || []).length) details.append(element("div", "empty-state", t(language(), "noConversations")));
      for (const chat of data.chats || []) {
        const row = element("article", "admin-chat-row");
        row.append(element("strong", "", chat.title || "Чат"));
        const transcript = element("div", "admin-transcript");
        const messages = (data.messages || []).filter((message) => message.chat_id === chat.id);
        transcript.textContent = messages.map((message) => `${message.role === "user" ? t(language(), "userRole") : "TJAI"}: ${message.content}`).join("\n\n") || t(language(), "emptyConversation");
        const remove = labeledButton(t(language(), "deleteConversation"), async () => {
          if (window.confirm(`${t(language(), "deleteConversationConfirm")} ${chat.title || "TJAI"}?`)) await act({ action: "delete_chat", targetUserId: user.id, chatId: chat.id });
        }, "button button-small button-danger");
        row.append(remove, transcript);
        details.append(row);
      }
    } catch (error) {
      showNotice(friendlyError(error), "error");
    }
  }

  search.addEventListener("input", drawUsers);
  reloadButton.addEventListener("click", load);
  prevButton.addEventListener("click", () => { if (page > 1) { page -= 1; load(); } });
  nextButton.addEventListener("click", () => { page += 1; load(); });
  await load();
}
