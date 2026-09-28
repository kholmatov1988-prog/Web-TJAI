import "./styles.css";
import { renderAuth } from "./auth.js";
import { renderAdmin } from "./admin.js";
import { askTjai, copyText, renderMessages, transcript } from "./chat.js";
import {
  clearAccountMemory, deleteRecord, getGuestData, importGuestData, loadUserData,
  newId, persistChat, persistMessage, persistSettings, saveFavorite, saveSearch,
} from "./data.js";
import { getProfile, supabase } from "./supabase.js";
import { $, button, element, friendlyError, showNotice } from "./ui.js";
import { translate as t } from "./i18n.js";
import { getArticle, getFullArticle, getRelated, languageOptions, normalizeLanguage, searchTitles, suggestTitles, wikipediaErrorMessage } from "./wikipedia.js";

const host = $("#app");
const state = {
  user: null, profile: null, guest: true, data: getGuestData(), activeChatId: null,
  page: "search", language: normalizeLanguage(localStorage.getItem("tjai-web-language") || "ru"),
  theme: localStorage.getItem("tjai-web-theme") || "dark",
};
let suggestionTimer = 0;
let currentArticle = null;

function userId() { return state.user?.id || null; }
function activeChat() { return state.data.chats.find((chat) => chat.id === state.activeChatId) || null; }
function displayName() { return state.profile?.display_name || state.user?.email?.split("@")[0] || "Гость"; }

function setLanguage(language, rerender = true) {
  state.language = normalizeLanguage(language);
  localStorage.setItem("tjai-web-language", state.language);
  state.data.settings = { ...state.data.settings, language: state.language };
  void persistSettings(userId(), state.data.settings).catch(() => {});
  if (!rerender || !host.querySelector(".app-shell")) return;
  const chatValue = $(".chat-input", host)?.value || "";
  const searchValue = $(".search-input", host)?.value || "";
  renderShell();
  const newChatInput = $(".chat-input", host);
  const newSearchInput = $(".search-input", host);
  if (newChatInput) newChatInput.value = chatValue;
  if (newSearchInput) newSearchInput.value = searchValue;
}

function renderAuthScreen() {
  renderAuth(host, enterApp, state.language, (language) => setLanguage(language, false));
}

function applyTheme() {
  document.body.classList.toggle("light", state.theme === "light");
  const toggle = $("#themeToggle", host);
  if (toggle) toggle.textContent = state.theme === "light" ? `☾ ${t(state.language, "darkTheme", "Тёмная")}` : `☼ ${t(state.language, "lightTheme", "Светлая")}`;
}

function renderShell() {
  host.innerHTML = `
    <div class="notice-host" id="noticeHost"></div>
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-brand"><div class="brand-mark" aria-hidden="true">TJ</div><span>TJAI</span></div>
        <nav class="sidebar-nav side-section" aria-label="Разделы">
          <button class="side-button" data-page="search"><span class="side-icon">⌕</span>${t(state.language, "tabSearch", "Поиск")}</button>
          <button class="side-button" data-page="chat"><span class="side-icon">✦</span>${t(state.language, "chat", "Чат TJAI")}</button>
          <button class="side-button" data-page="history"><span class="side-icon">◷</span>${t(state.language, "history", "История")}</button>
          <button class="side-button" data-page="favorites"><span class="side-icon">☆</span>${t(state.language, "favorites", "Избранное")}</button>
          <button class="side-button" data-page="admin" id="adminNav" hidden><span class="side-icon">⚙</span>${t(state.language, "adminPanel", "Админ-панель")}</button>
        </nav>
        <div class="side-section">
          <div class="side-label">${t(state.language, "recentChats", "Последние чаты")}</div>
          <div class="side-list" id="chatLinks"></div>
          <button class="side-button" id="newChatSide"><span class="side-icon">＋</span>${t(state.language, "newChat")}</button>
        </div>
        <div class="sidebar-bottom">
          <div class="account-card">
            <div class="avatar" id="avatarText"></div>
            <div class="account-info"><strong id="accountName"></strong><span id="accountType"></span></div>
            <button class="button button-small button-quiet" id="signOut" aria-label="Выйти">⋯</button>
          </div>
        </div>
      </aside>
      <main class="main-column">
        <header class="topbar">
          <div class="top-title" id="topTitle">${t(state.language, "searchTitle", "Поиск по Википедии")}</div>
          <div class="top-right"><label class="field" style="display:flex;align-items:center;gap:7px">${t(state.language, "selectLanguage")}
            <select id="languageSelect" aria-label="${t(state.language, "selectLanguage")}" style="height:36px;padding:0 9px;border:1px solid var(--line);border-radius:10px;background:var(--soft);color:var(--ink)"></select>
          </label><button id="themeToggle" class="button button-small" type="button"></button></div>
        </header>
        <section class="main-content" id="mainContent"></section>
      </main>
    </div>`;
  const langSelect = $("#languageSelect", host);
  for (const lang of languageOptions()) {
    const option = element("option", "", `${lang.native} · ${lang.code.toUpperCase()}`);
    option.value = lang.code;
    option.selected = lang.code === state.language;
    langSelect.append(option);
  }
  langSelect.addEventListener("change", () => {
    setLanguage(langSelect.value);
  });
  $("#themeToggle", host).addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    localStorage.setItem("tjai-web-theme", state.theme);
    state.data.settings = { ...state.data.settings, theme: state.theme };
    void persistSettings(userId(), state.data.settings).catch((error) => showNotice(friendlyError(error), "error"));
    applyTheme();
  });
  host.querySelectorAll("[data-page]").forEach((node) => node.addEventListener("click", () => navigate(node.dataset.page)));
  $("#newChatSide", host).addEventListener("click", () => {
    state.activeChatId = null;
    navigate("chat");
  });
  $("#signOut", host).addEventListener("click", signOut);
  renderSidebar();
  applyTheme();
  renderPage();
}

function renderSidebar() {
  const chatLinks = $("#chatLinks", host);
  if (!chatLinks) return;
  chatLinks.replaceChildren();
  for (const chat of state.data.chats.slice(0, 12)) {
    const item = button(chat.title || t(state.language, "savedChat", "Сохранённый чат"), `side-button ${chat.id === state.activeChatId ? "active" : ""}`);
    item.addEventListener("click", () => { state.activeChatId = chat.id; navigate("chat"); });
    chatLinks.append(item);
  }
  const name = displayName();
  $("#accountName", host).textContent = name;
  $("#accountType", host).textContent = state.user ? state.user.email || "TJAI" : t(state.language, "guest", "Гостевой режим");
  $("#avatarText", host).textContent = (name[0] || "T").toUpperCase();
  $("#adminNav", host).hidden = state.profile?.role !== "admin";
}

function navigate(page) {
  state.page = page;
  host.querySelectorAll("[data-page]").forEach((item) => item.classList.toggle("active", item.dataset.page === page));
  const labels = {
    search: t(state.language, "searchTitle", "Поиск по Википедии"),
    chat: t(state.language, "chat", "Чат TJAI"),
    history: t(state.language, "history", "История"),
    favorites: t(state.language, "favorites", "Избранное"),
    admin: t(state.language, "adminPanel", "Админ-панель"),
  };
  $("#topTitle", host).textContent = labels[page] || "TJAI";
  renderPage();
}

function renderPage() {
  const main = $("#mainContent", host);
  if (!main) return;
  main.replaceChildren();
  if (state.page === "search") renderSearchPage(main);
  else if (state.page === "chat") renderChatPage(main);
  else if (state.page === "history") renderHistoryPage(main);
  else if (state.page === "favorites") renderFavoritesPage(main);
  else if (state.page === "admin") {
    if (state.profile?.role !== "admin") {
      navigate("search");
      return;
    }
    void renderAdmin(main, { currentUserId: userId(), reload: reloadData });
  }
}

function hero(title, description) {
  const section = element("div", "hero");
  section.append(element("h1", "", title), element("p", "", description));
  return section;
}

function renderSearchPage(main) {
  main.append(hero(t(state.language, "appTitle", "Поисковое приложение"), t(state.language, "subtitle", "Ищите статьи и задавайте вопросы TJAI.")));
  const panel = element("section", "panel");
  const form = element("form", "search-row");
  const input = element("input", "search-input");
  input.type = "search";
  input.maxLength = 250;
  input.placeholder = t(state.language, "searchPlaceholder", "Введите тему или название статьи");
  input.autocomplete = "off";
  input.setAttribute("aria-label", input.placeholder);
  const submit = button(t(state.language, "searchButton", "Найти"), "button button-primary", "submit");
  form.append(input, submit);
  const suggestions = element("div", "suggestions");
  const results = element("div", "");
  panel.append(form, suggestions, results);
  main.append(panel);
  if (!state.data.searchHistory.length) {
    const hint = element("div", "empty-state search-hint", t(state.language, "resultEmpty", "Введите запрос, чтобы начать поиск."));
    main.append(hint);
  }
  input.addEventListener("input", () => {
    window.clearTimeout(suggestionTimer);
    const query = input.value.trim();
    if (query.length < 2) { suggestions.replaceChildren(); return; }
    suggestionTimer = window.setTimeout(async () => {
      try {
        const titles = await suggestTitles(query, state.language);
        suggestions.replaceChildren();
        for (const title of titles) {
          const choice = button(title, "suggestion");
          choice.addEventListener("click", () => { input.value = title; form.requestSubmit(); });
          suggestions.append(choice);
        }
      } catch { suggestions.replaceChildren(); }
    }, 240);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    main.querySelector(".search-hint")?.remove();
    suggestions.replaceChildren();
    results.replaceChildren(element("div", "empty-state", t(state.language, "searching", "Ищем в Википедии…")));
    submit.disabled = true;
    try {
      const found = await searchTitles(query, state.language);
      results.replaceChildren();
      if (!found.length) { results.append(element("div", "empty-state", t(state.language, "notFound", "По этому запросу ничего не найдено."))); return; }
      results.append(element("h2", "section-title", t(state.language, "searchResults", "Результаты поиска")));
      for (const result of found) {
        const choice = button(result.title, "suggestion");
        choice.title = result.snippet;
        choice.addEventListener("click", () => void openArticle(result.title, query, results));
        results.append(choice);
      }
      await openArticle(found[0].title, query, results);
    } catch (error) {
      results.replaceChildren(element("div", "empty-state", wikipediaErrorMessage(error)));
    } finally { submit.disabled = false; }
  });
}

async function openArticle(title, query, hostNode) {
  hostNode.querySelector(".article-detail")?.remove();
  const detail = element("section", "article-detail");
  detail.append(element("div", "empty-state", t(state.language, "loadingArticle", "Загружаем статью…")));
  hostNode.append(detail);
  try {
    const article = await getArticle(title, state.language);
    if (!article) { detail.replaceChildren(element("div", "empty-state", t(state.language, "articleNotFound", "Статья не найдена."))); return; }
    currentArticle = article;
    detail.replaceChildren();
    const card = element("article", "result-card");
    const body = element("div", "");
    body.append(element("h2", "", article.title), element("p", "", article.extract));
    const meta = element("div", "result-meta");
    const link = element("a", "", t(state.language, "openWikipedia", "Открыть в Википедии"));
    link.href = article.url; link.target = "_blank"; link.rel = "noopener noreferrer";
    meta.append(link);
    const favorite = button(`☆ ${t(state.language, "addFavorite", "В избранное")}`, "button button-small");
    favorite.addEventListener("click", async () => {
      try {
        if (state.data.favorites.some((item) => item.article_url === article.url)) {
          showNotice(t(state.language, "alreadyFavorite", "Эта статья уже есть в избранном."));
          return;
        }
        const item = { id: newId(), title: article.title, language: article.language, article_url: article.url, created_at: new Date().toISOString() };
        await saveFavorite(userId(), item);
        state.data.favorites.unshift(item);
        showNotice(t(state.language, "articleSaved", "Статья сохранена"), "success");
      } catch (error) { showNotice(friendlyError(error), "error"); }
    });
    meta.append(favorite);
    for (const language of article.languages.slice(0, 6)) {
      const langLink = element("a", "", language.lang.toUpperCase());
      langLink.href = language.url; langLink.target = "_blank"; langLink.rel = "noopener noreferrer";
      langLink.title = language.label;
      meta.append(langLink);
    }
    body.append(meta);
    card.append(body);
    if (article.thumbnail) {
      const image = element("img"); image.src = article.thumbnail; image.alt = ""; image.loading = "lazy";
      card.append(image);
    }
    detail.append(card);
    const fullArticle = element("div", "full-article full-article-expanded");
    fullArticle.append(element("div", "full-loading", t(state.language, "fullLoading", "Загружаем полный текст статьи…")));
    detail.append(fullArticle);
    void getFullArticle(article.title, state.language)
      .then((content) => fullArticle.replaceChildren(content))
      .catch(() => fullArticle.replaceChildren(element("div", "full-loading", t(state.language, "fullUnavailable", "Полный текст временно недоступен. Откройте статью в Википедии."))));
    const search = { id: newId(), query: query || title, title: article.title, language: state.language, article_url: article.url, created_at: new Date().toISOString() };
    await saveSearch(userId(), search);
    state.data.searchHistory.unshift(search);
    const related = await getRelated(article.title, state.language);
    if (related.length) {
      detail.append(element("h3", "section-title", t(state.language, "relatedArticles", "Похожие статьи")));
      const list = element("div", "suggestions");
      for (const item of related) {
        const relatedButton = button(item.title, "suggestion");
        relatedButton.addEventListener("click", () => void openArticle(item.title, query, hostNode));
        list.append(relatedButton);
      }
      detail.append(list);
    }
  } catch (error) {
    detail.replaceChildren(element("div", "empty-state", wikipediaErrorMessage(error)));
  }
}

function renderChatPage(main) {
  main.append(hero(t(state.language, "tabAi", "Чат с TJAI"), state.user ? t(state.language, "chatIntro") : t(state.language, "guestMode")));
  const panel = element("section", "panel chat-layout");
  const toolbar = element("div", "chat-toolbar");
  const copyAll = button(t(state.language, "copyAll", "Копировать диалог"), "button button-small");
  copyAll.addEventListener("click", () => void copyText(transcript(activeChat())));
  toolbar.append(copyAll);
  const messagesHost = element("div", "chat-messages");
  renderMessages(messagesHost, activeChat(), copyText);
  const form = element("form", "chat-compose");
  const input = element("textarea", "chat-input");
  input.rows = 2; input.placeholder = t(state.language, "chatPlaceholder", "Напишите вопрос…"); input.setAttribute("aria-label", input.placeholder);
  const send = button(t(state.language, "sendButton", "Отправить"), "button button-primary", "submit");
  form.append(input, send);
  form.addEventListener("submit", (event) => { event.preventDefault(); void sendMessage(input, send, messagesHost); });
  input.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") form.requestSubmit();
  });
  panel.append(toolbar, messagesHost, form);
  main.append(panel);
}

async function sendMessage(input, send, messagesHost) {
  const question = input.value.trim();
  if (!question) return;
  if (question.length > 12000) {
    showNotice(t(state.language, "questionTooLong", "Вопрос слишком длинный. Сократите его до 12 000 символов."), "error");
    return;
  }
  if (!state.user) { showNotice(t(state.language, "aiNeedsLogin"), "error"); return; }
  input.value = "";
  let chat = activeChat();
  if (!chat) {
    chat = { id: newId(), title: question.slice(0, 80), created_at: new Date().toISOString(), messages: [] };
    state.data.chats.unshift(chat);
    state.activeChatId = chat.id;
  } else if (!chat.messages.length) chat.title = question.slice(0, 80);
  const userMessage = { id: newId(), role: "user", content: question, created_at: new Date().toISOString() };
  chat.messages.push(userMessage);
  renderMessages(messagesHost, chat, copyText);
  renderSidebar();
  send.disabled = true;
  let syncFailed = false;
  let pending = null;
  try {
    try {
      await persistChat(userId(), chat);
      await persistMessage(userId(), chat.id, userMessage);
    } catch {
      syncFailed = true;
    }
    pending = element("div", "empty-state", t(state.language, "thinking", "TJAI думает…"));
    messagesHost.append(pending);
    const answer = await askTjai(question, state.language);
    pending.remove();
    const response = { id: newId(), role: "assistant", content: answer, created_at: new Date().toISOString() };
    chat.messages.push(response);
    try {
      await persistMessage(userId(), chat.id, response);
      await persistChat(userId(), chat);
    } catch {
      syncFailed = true;
    }
    renderMessages(messagesHost, chat, copyText);
    if (syncFailed) showNotice(t(state.language, "conversationSaveFailed"), "error");
  } catch (error) {
    pending?.remove();
    renderMessages(messagesHost, chat, copyText);
    showNotice(friendlyError(error), "error");
  } finally { send.disabled = false; renderSidebar(); }
}

function renderHistoryPage(main) {
  main.append(hero(t(state.language, "history", "История"), t(state.language, "historyIntro")));
  main.append(element("h2", "section-title", t(state.language, "conversations", "Переписки")));
  const chats = element("section", "history-list");
  if (!state.data.chats.length) chats.append(element("div", "empty-state", t(state.language, "noSavedChats", "Сохранённых переписок пока нет.")));
  for (const chat of state.data.chats) {
    const row = element("div", "history-item");
    const open = button(`${chat.title || t(state.language, "chat")} · ${(chat.messages || []).length} ${t(state.language, "messagesWord", "сообщений")}`, "button button-quiet");
    open.addEventListener("click", () => { state.activeChatId = chat.id; navigate("chat"); });
    const remove = button(t(state.language, "delete", "Удалить"), "button button-small button-danger");
    remove.addEventListener("click", async () => {
      if (!window.confirm(t(state.language, "deleteOwnChat", "Удалить эту переписку?"))) return;
      try {
        await deleteRecord(userId(), "chats", chat.id);
        state.data.chats = state.data.chats.filter((item) => item.id !== chat.id);
        if (state.activeChatId === chat.id) state.activeChatId = null;
        renderSidebar(); renderHistoryPage(main);
      } catch (error) { showNotice(friendlyError(error), "error"); }
    });
    row.append(open, remove); chats.append(row);
  }
  main.append(chats, element("h2", "section-title", t(state.language, "searches", "Поиски")));
  const searches = element("section", "history-list");
  if (!state.data.searchHistory.length) searches.append(element("div", "empty-state", t(state.language, "searchHistoryEmpty", "Поисков пока нет.")));
  for (const item of state.data.searchHistory.slice(0, 150)) {
    const row = element("div", "history-item");
    const open = button(`${item.query || item.title} · ${item.title || ""}`, "button button-quiet");
    open.addEventListener("click", () => { navigate("search"); void openArticle(item.title, item.query, $("#mainContent", host)); });
    const remove = button(t(state.language, "delete", "Удалить"), "button button-small button-danger");
    remove.addEventListener("click", async () => {
      try {
        await deleteRecord(userId(), "search_history", item.id);
        state.data.searchHistory = state.data.searchHistory.filter((entry) => entry.id !== item.id);
        renderHistoryPage(main);
      } catch (error) { showNotice(friendlyError(error), "error"); }
    });
    row.append(open, remove); searches.append(row);
  }
  main.append(searches);
}

function renderFavoritesPage(main) {
  main.append(hero(t(state.language, "favorites", "Избранное"), t(state.language, "favoritesIntro")));
  const list = element("section", "history-list");
  if (!state.data.favorites.length) list.append(element("div", "empty-state", t(state.language, "favoritesEmpty", "Сохранённых статей пока нет.")));
  for (const item of state.data.favorites) {
    const row = element("div", "history-item");
    const link = element("a", "", item.title || item.article_url);
    link.href = item.article_url; link.target = "_blank"; link.rel = "noopener noreferrer";
    const remove = button(t(state.language, "delete", "Удалить"), "button button-small button-danger");
    remove.addEventListener("click", async () => {
      try {
        await deleteRecord(userId(), "favorites", item.id);
        state.data.favorites = state.data.favorites.filter((favorite) => favorite.id !== item.id);
        renderFavoritesPage(main);
      } catch (error) { showNotice(friendlyError(error), "error"); }
    });
    row.append(link, remove); list.append(row);
  }
  main.append(list);
}

async function reloadData() {
  if (state.user) {
    try { state.profile = await getProfile(userId()); }
    catch { state.profile = null; }
    if (!state.profile || state.profile.blocked_at) {
      state.user = null;
      state.profile = null;
      state.data = getGuestData();
      state.activeChatId = null;
      renderAuthScreen();
      return;
    }
  }
  state.data = state.user ? await loadUserData(userId()) : getGuestData();
  if (state.page === "admin" && state.profile?.role !== "admin") state.page = "search";
  renderSidebar();
  renderPage();
}

async function enterApp({ user, guest }) {
  localStorage.setItem("tjai-web-welcomed", "1");
  state.user = user || null;
  state.guest = Boolean(guest);
  state.profile = null;
  state.data = clearAccountMemory();
  state.activeChatId = null;
  if (state.user) {
    try {
      state.profile = await getProfile(state.user.id);
      if (!state.profile) throw new Error("profile_unavailable");
      if (state.profile.blocked_at) {
        await supabase.auth.signOut();
        state.user = null;
        state.profile = null;
        renderAuthScreen();
        window.alert("Аккаунт временно заблокирован. Обратитесь к администратору TJAI.");
        return;
      }
      await importGuestData(state.user.id);
      state.data = await loadUserData(state.user.id);
      if (languageOptions().some((item) => item.code === state.data.settings.language)) {
        state.language = state.data.settings.language;
        localStorage.setItem("tjai-web-language", state.language);
      }
      if (["dark", "light"].includes(state.data.settings.theme)) {
        state.theme = state.data.settings.theme;
        localStorage.setItem("tjai-web-theme", state.theme);
      }
    } catch (error) {
      showNotice(friendlyError(error), "error");
      state.data = clearAccountMemory();
    }
  } else {
    state.data = getGuestData();
  }
  state.page = "search";
  renderShell();
}

async function signOut() {
  if (state.user && supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) showNotice(friendlyError(error), "error");
  }
  state.user = null;
  state.profile = null;
  state.data = getGuestData();
  state.activeChatId = null;
  renderAuthScreen();
}

async function boot() {
  if (languageOptions().some((item) => item.code === state.data.settings.language)) {
    state.language = state.data.settings.language;
    localStorage.setItem("tjai-web-language", state.language);
  }
  applyTheme();
  if (supabase) {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" && state.user) {
        state.user = null;
        state.profile = null;
        state.data = getGuestData();
        state.activeChatId = null;
        renderAuthScreen();
      } else if (event === "SIGNED_IN" && session?.user && state.user?.id !== session.user.id) {
        window.setTimeout(() => {
          if (state.user?.id !== session.user.id) void enterApp({ user: session.user, guest: false });
        }, 0);
      }
    });
    const { data, error } = await supabase.auth.getSession();
    if (error) showNotice(friendlyError(error), "error");
    if (data?.session?.user) {
      await enterApp({ user: data.session.user, guest: false });
      return;
    }
  }
  renderAuthScreen();
}

void boot();
