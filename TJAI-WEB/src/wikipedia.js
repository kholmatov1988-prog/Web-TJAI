const SUPPORTED_LANGS = [
  { code: "ru", native: "Русский" }, { code: "en", native: "English" },
  { code: "uk", native: "Українська" }, { code: "be", native: "Беларуская" },
  { code: "kk", native: "Қазақша" }, { code: "tg", native: "Тоҷикӣ" },
  { code: "uz", native: "Oʻzbekcha" }, { code: "ky", native: "Кыргызча" },
  { code: "az", native: "Azərbaycan" }, { code: "hy", native: "Հայերեն" },
  { code: "ka", native: "ქართული" }, { code: "de", native: "Deutsch" },
  { code: "fr", native: "Français" }, { code: "es", native: "Español" },
  { code: "it", native: "Italiano" }, { code: "pt", native: "Português" },
  { code: "pl", native: "Polski" }, { code: "tr", native: "Türkçe" },
  { code: "ar", native: "العربية" }, { code: "zh", native: "中文" },
  { code: "ja", native: "日本語" }, { code: "ko", native: "한국어" },
];
const LANGUAGE_CODES = new Set(SUPPORTED_LANGS.map(({ code }) => code));

export function normalizeLanguage(language) {
  return LANGUAGE_CODES.has(language) ? language : "ru";
}

function safeThumbnail(source) {
  try {
    const url = new URL(source);
    return url.protocol === "https:" && url.hostname === "upload.wikimedia.org" ? url.href : "";
  } catch { return ""; }
}

function apiUrl(lang, params) {
  lang = normalizeLanguage(lang);
  const query = new URLSearchParams({ ...params, format: "json", origin: "*" });
  return `https://${lang}.wikipedia.org/w/api.php?${query}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`wikipedia_${response.status}`);
  return response.json();
}

export async function suggestTitles(query, lang = "ru") {
  if (query.trim().length < 2) return [];
  const payload = await fetchJson(apiUrl(lang, {
    action: "opensearch", search: query.trim(), limit: "6", namespace: "0",
  }));
  return Array.isArray(payload?.[1]) ? payload[1] : [];
}

export async function searchTitles(query, lang = "ru") {
  const payload = await fetchJson(apiUrl(lang, {
    action: "query", list: "search", srsearch: query.trim(), srlimit: "7", srnamespace: "0",
  }));
  return (payload?.query?.search || []).map((item) => ({ title: item.title, snippet: stripTags(item.snippet || "") }));
}

function stripTags(value) {
  const doc = new DOMParser().parseFromString(String(value), "text/html");
  return doc.body.textContent || "";
}

export async function getArticle(title, lang = "ru") {
  lang = normalizeLanguage(lang);
  const payload = await fetchJson(apiUrl(lang, {
    action: "query", prop: "extracts|pageimages|langlinks", exintro: "1", explaintext: "1",
    piprop: "thumbnail", pithumbsize: "360", lllimit: "max", redirects: "1", titles: title,
  }));
  const page = Object.values(payload?.query?.pages || {})[0];
  if (!page || page.missing !== undefined) return null;
  return {
    title: page.title || title,
    extract: page.extract || "Для этой статьи нет краткого описания.",
    thumbnail: safeThumbnail(page.thumbnail?.source || ""),
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent((page.title || title).replaceAll(" ", "_"))}`,
    language: lang,
    languages: (page.langlinks || []).filter((item) => /^[a-z]{2,3}$/.test(item.lang || "")).map((item) => ({
      lang: item.lang,
      label: item["*"] || item.lang,
      url: `https://${item.lang}.wikipedia.org/wiki/${encodeURIComponent(String(item["*"] || "").replaceAll(" ", "_"))}`,
    })),
  };
}

const ARTICLE_TAGS = new Set([
  "a", "audio", "b", "blockquote", "br", "caption", "cite", "code", "dd", "div", "dl", "dt",
  "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "iframe", "img", "li",
  "ol", "p", "picture", "pre", "small", "source", "span", "strong", "sub", "sup", "table",
  "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);
const ARTICLE_DROP_CONTENT = new Set(["script", "style", "object", "embed", "svg", "math", "form", "button", "input"]);
const ARTICLE_ATTRIBUTES = new Set([
  "alt", "colspan", "controls", "dir", "height", "href", "lang", "preload", "rowspan", "scope", "src", "title", "type", "width",
]);

function safeArticleMedia(value, language) {
  if (!value) return "";
  try {
    const url = new URL(value, `https://${language}.wikipedia.org`);
    return url.protocol === "https:" && ["upload.wikimedia.org", "commons.wikimedia.org"].includes(url.hostname) ? url.href : "";
  } catch { return ""; }
}

function safeArticleMap(value, language) {
  if (!value) return "";
  try {
    const url = new URL(value, `https://${language}.wikipedia.org`);
    const trustedMap = url.hostname === "maps.wikimedia.org"
      || (url.hostname === "www.openstreetmap.org" && url.pathname === "/export/embed.html");
    return url.protocol === "https:" && trustedMap ? url.href : "";
  } catch { return ""; }
}

function sanitizeArticleChildren(parent, language) {
  const decoder = document.createElement("textarea");
  for (const child of [...parent.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) {
      let text = child.textContent || "";
      for (let layer = 0; layer < 2 && /&(?:#\d+|#x[\da-f]+|[a-z]+);/i.test(text); layer += 1) {
        decoder.innerHTML = text;
        const decoded = decoder.value;
        if (decoded === text) break;
        text = decoded;
      }
      child.textContent = text;
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName.toLowerCase();
    if (ARTICLE_DROP_CONTENT.has(tag)) {
      child.remove();
      continue;
    }
    sanitizeArticleChildren(child, language);
    if (!ARTICLE_TAGS.has(tag)) {
      child.replaceWith(...child.childNodes);
      continue;
    }

    const originalClass = child.className;
    const keepClasses = typeof originalClass === "string"
      ? originalClass.split(/\s+/).filter((name) => ["infobox", "wikitable", "thumb", "thumbinner", "thumbcaption", "gallery", "gallerybox", "gallerytext", "toc", "navbox", "ambox", "plainlinks", "center"].includes(name))
      : [];
    const attributes = [...child.attributes];
    const originalSrc = child.getAttribute("src") || "";
    const mapSrc = tag === "iframe" ? safeArticleMap(originalSrc, language) : "";
    const lazySource = child.getAttribute("data-src") || child.getAttribute("data-original") || "";
    const srcsetSource = child.getAttribute("srcset")?.split(",")[0]?.trim().split(/\s+/)[0] || "";
    const mediaSrc = [originalSrc, lazySource, srcsetSource]
      .map((candidate) => safeArticleMedia(candidate, language))
      .find(Boolean) || "";
    for (const attribute of attributes) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "style" || name.startsWith("data-") || name === "srcset" || name === "src" || name === "class" || name === "id") {
        child.removeAttribute(attribute.name);
      } else if (!ARTICLE_ATTRIBUTES.has(name)) {
        child.removeAttribute(attribute.name);
      }
    }
    if (keepClasses.length) child.className = keepClasses.map((name) => `wiki-${name}`).join(" ");
    if (tag === "iframe") {
      if (!mapSrc) { child.remove(); continue; }
      child.setAttribute("src", mapSrc);
      child.setAttribute("loading", "lazy");
      child.setAttribute("sandbox", "allow-scripts allow-same-origin");
      child.setAttribute("referrerpolicy", "no-referrer");
    } else if (tag === "img" || tag === "source") {
      if (mediaSrc) child.setAttribute("src", mediaSrc);
      else child.remove();
    } else if (tag === "audio") {
      child.setAttribute("controls", "");
      child.setAttribute("preload", "none");
      if (child.hasAttribute("src")) {
        const src = safeArticleMedia(child.getAttribute("src"), language);
        if (src) child.setAttribute("src", src);
        else child.removeAttribute("src");
      }
    } else if (tag === "a") {
      const href = child.getAttribute("href");
      if (href?.startsWith("#")) {
        child.removeAttribute("href");
      } else if (href) {
        try {
          const url = new URL(href, `https://${language}.wikipedia.org`);
          if (!["http:", "https:"].includes(url.protocol)) child.removeAttribute("href");
          else {
            child.href = url.href;
            child.target = "_blank";
            child.rel = "noopener noreferrer";
          }
        } catch { child.removeAttribute("href"); }
      }
    }
  }
}

export async function getFullArticle(title, lang = "ru") {
  lang = normalizeLanguage(lang);
  const payload = await fetchJson(apiUrl(lang, {
    action: "parse", page: title, prop: "text", formatversion: "2", redirects: "1",
  }));
  const parsedText = payload?.parse?.text;
  const rawHtml = typeof parsedText === "string" ? parsedText : parsedText?.["*"];
  if (typeof rawHtml !== "string" || !rawHtml.trim()) throw new Error("wikipedia_article_empty");
  const parsed = new DOMParser().parseFromString(rawHtml, "text/html");
  const source = parsed.querySelector(".mw-parser-output") || parsed.body;
  const content = document.createElement("div");
  content.className = "wiki-article";
  for (const node of [...source.childNodes]) content.append(document.importNode(node, true));
  sanitizeArticleChildren(content, lang);
  return content;
}

export async function getRelated(title, lang = "ru") {
  lang = normalizeLanguage(lang);
  try {
    const payload = await fetchJson(`https://${lang}.wikipedia.org/api/rest_v1/page/related/${encodeURIComponent(title.replaceAll(" ", "_"))}`);
    return (payload?.pages || []).slice(0, 6).map((page) => ({
      title: page.title,
      extract: page.extract || "",
      thumbnail: safeThumbnail(page.thumbnail?.source || ""),
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
    }));
  } catch {
    return [];
  }
}

export function languageOptions() {
  return SUPPORTED_LANGS;
}

export function wikipediaErrorMessage(error) {
  if (String(error?.message || "").startsWith("wikipedia_")) return "Википедия сейчас не отвечает. Попробуйте ещё раз позже.";
  return "Не удалось подключиться к Википедии. Проверьте интернет и попробуйте снова.";
}
