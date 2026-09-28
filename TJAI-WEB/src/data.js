import { supabase } from "./supabase.js";

const GUEST_KEY = "tjai-web-guest-data-v1";

function emptyData() {
  return { chats: [], searchHistory: [], favorites: [], notes: [], settings: {} };
}

function readGuest() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_KEY) || "{}");
    return {
      ...emptyData(),
      chats: Array.isArray(parsed.chats) ? parsed.chats : [],
      searchHistory: Array.isArray(parsed.searchHistory) ? parsed.searchHistory : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      settings: parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {},
    };
  } catch {
    return emptyData();
  }
}

function writeGuest(data) {
  localStorage.setItem(GUEST_KEY, JSON.stringify(data));
}

export function newId() {
  return crypto.randomUUID();
}

export async function loadUserData(userId) {
  if (!userId || !supabase) return readGuest();
  const [chatResult, searchResult, favoriteResult, noteResult, settingsResult] = await Promise.all([
    supabase.from("chats").select("id,title,created_at,updated_at").order("updated_at", { ascending: false }).limit(100),
    supabase.from("search_history").select("id,query,title,language,article_url,created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("favorites").select("id,title,language,article_url,created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("notes").select("id,title,body,source_url,created_at,updated_at").order("updated_at", { ascending: false }).limit(500),
    supabase.from("user_settings").select("settings").maybeSingle(),
  ]);
  for (const result of [chatResult, searchResult, favoriteResult, noteResult, settingsResult]) {
    if (result.error) throw result.error;
  }
  const chats = chatResult.data || [];
  let messages = [];
  if (chats.length) {
    const result = await supabase.from("messages")
      .select("id,chat_id,role,content,created_at")
      .in("chat_id", chats.map((chat) => chat.id))
      .order("created_at", { ascending: true }).limit(5000);
    if (result.error) throw result.error;
    messages = result.data || [];
  }
  const byChat = new Map(chats.map((chat) => [chat.id, { ...chat, messages: [] }]));
  for (const message of messages) byChat.get(message.chat_id)?.messages.push(message);
  return {
    chats: [...byChat.values()],
    searchHistory: searchResult.data || [],
    favorites: favoriteResult.data || [],
    notes: noteResult.data || [],
    settings: settingsResult.data?.settings || {},
  };
}

export async function persistChat(userId, chat) {
  if (!userId || !supabase) {
    const data = readGuest();
    const index = data.chats.findIndex((item) => item.id === chat.id);
    if (index < 0) data.chats.unshift(chat);
    else data.chats[index] = chat;
    writeGuest(data);
    return;
  }
  const { error } = await supabase.from("chats").upsert({
    id: chat.id, owner_id: userId, title: chat.title || "Новый чат",
    created_at: chat.created_at, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function persistMessage(userId, chatId, message) {
  if (!userId || !supabase) {
    const data = readGuest();
    const chat = data.chats.find((item) => item.id === chatId);
    if (chat && !chat.messages.some((item) => item.id === message.id)) chat.messages.push(message);
    writeGuest(data);
    return;
  }
  const { error } = await supabase.from("messages").upsert({
    id: message.id, owner_id: userId, chat_id: chatId,
    role: message.role, content: message.content, created_at: message.created_at,
  });
  if (error) throw error;
}

export async function saveSearch(userId, item) {
  if (!userId || !supabase) {
    const data = readGuest();
    data.searchHistory.unshift(item);
    data.searchHistory = data.searchHistory.slice(0, 500);
    writeGuest(data);
    return;
  }
  const { error } = await supabase.from("search_history").upsert({ ...item, owner_id: userId });
  if (error) throw error;
}

export async function saveFavorite(userId, item) {
  if (!userId || !supabase) {
    const data = readGuest();
    if (!data.favorites.some((favorite) => favorite.article_url === item.article_url)) data.favorites.unshift(item);
    writeGuest(data);
    return;
  }
  const { error } = await supabase.from("favorites").upsert({ ...item, owner_id: userId }, { onConflict: "owner_id,article_url" });
  if (error) throw error;
}

export async function persistSettings(userId, settings) {
  if (!userId || !supabase) {
    const data = readGuest();
    data.settings = settings;
    writeGuest(data);
    return;
  }
  const { error } = await supabase.from("user_settings").upsert({ owner_id: userId, settings });
  if (error) throw error;
}

export async function deleteRecord(userId, resource, id) {
  if (!userId || !supabase) {
    const data = readGuest();
    if (resource === "search_history") data.searchHistory = data.searchHistory.filter((item) => item.id !== id);
    if (resource === "favorites") data.favorites = data.favorites.filter((item) => item.id !== id);
    if (resource === "chats") data.chats = data.chats.filter((item) => item.id !== id);
    writeGuest(data);
    return;
  }
  const { error } = await supabase.from(resource).delete().eq("id", id);
  if (error) throw error;
}

export async function importGuestData(userId) {
  if (!userId || !supabase) return false;
  const guest = readGuest();
  const hasData = guest.chats.length || guest.searchHistory.length || guest.favorites.length || guest.notes.length || Object.keys(guest.settings).length;
  if (!hasData) return false;
  const accepted = window.confirm("Перенести гостевые чаты, историю поиска и сохранённое в этот аккаунт?");
  if (!accepted) return false;
  for (const chat of guest.chats) {
    await persistChat(userId, chat);
    for (const message of chat.messages || []) await persistMessage(userId, chat.id, message);
  }
  for (const item of guest.searchHistory) await saveSearch(userId, item);
  for (const item of guest.favorites) await saveFavorite(userId, item);
  for (const item of guest.notes) {
    const { error } = await supabase.from("notes").upsert({ ...item, owner_id: userId });
    if (error) throw error;
  }
  if (Object.keys(guest.settings).length) {
    const { data: existing, error } = await supabase.from("user_settings").select("settings").maybeSingle();
    if (error) throw error;
    await persistSettings(userId, { ...guest.settings, ...(existing?.settings || {}) });
  }
  localStorage.removeItem(GUEST_KEY);
  return true;
}

export function getGuestData() {
  return readGuest();
}

export function clearAccountMemory() {
  return emptyData();
}
