import { config, hasSupabaseConfig } from "./config.js";
import { supabase } from "./supabase.js";
import { translate as t } from "./i18n.js";
import { $, button, element, friendlyError, setBusy } from "./ui.js";
import { languageOptions } from "./wikipedia.js";

function authMarkup(language) {
  const root = element("main", "auth-screen");
  root.innerHTML = `
    <section class="auth-card" aria-labelledby="authTitle">
      <div class="brand-mark" aria-hidden="true">TJ</div>
      <div class="brand-word">TJAI</div>
      <label class="field auth-language">${t(language, "selectLanguage")}<select id="authLanguage" aria-label="${t(language, "selectLanguage")}"></select></label>
      <h1 id="authTitle"></h1>
      <p id="authDescription"></p>
      <div id="authControls"></div>
      <p class="auth-message" id="authMessage" role="status" aria-live="polite"></p>
      <p class="privacy-copy" id="privacyCopy"></p>
    </section>`;
  return root;
}

export function renderAuth(container, onEnter, language, onLanguageChange) {
  let currentLanguage = language;
  let stage = localStorage.getItem("tjai-web-welcomed") === "1" ? "choice" : "welcome";
  let mode = "login";
  const page = authMarkup(currentLanguage);
  container.replaceChildren(page);
  const title = $("#authTitle", page);
  const description = $("#authDescription", page);
  const controls = $("#authControls", page);
  const message = $("#authMessage", page);
  const privacy = $("#privacyCopy", page);
  const languageSelect = $("#authLanguage", page);
  const languageLabel = languageSelect.closest("label");
  for (const optionData of languageOptions()) {
    const option = element("option", "", `${optionData.native} · ${optionData.code.toUpperCase()}`);
    option.value = optionData.code;
    option.selected = optionData.code === currentLanguage;
    languageSelect.append(option);
  }
  languageSelect.addEventListener("change", () => {
    const values = Object.fromEntries(new FormData($("form", page) || document.createElement("form")));
    currentLanguage = languageSelect.value;
    languageLabel.firstChild.textContent = `${t(currentLanguage, "selectLanguage")}`;
    languageSelect.setAttribute("aria-label", t(currentLanguage, "selectLanguage"));
    onLanguageChange?.(currentLanguage);
    render();
    for (const [name, value] of Object.entries(values)) {
      const input = $(`[name="${name}"]`, page);
      if (input) input.value = value;
    }
  });

  function setMessage(text, error = true) {
    message.textContent = text;
    message.style.color = error ? "var(--red)" : "#1d786b";
  }

  function enterGuest() {
    localStorage.setItem("tjai-web-welcomed", "1");
    onEnter({ user: null, guest: true });
  }

  function render() {
    controls.replaceChildren();
    message.textContent = "";
    privacy.textContent = stage === "form"
      ? t(currentLanguage, "adminDisclaimer", "Для поддержки и модерации администратор может просматривать переписки TJAI.")
      : "";

    if (stage === "welcome") {
      title.textContent = t(currentLanguage, "welcomeTitle");
      description.textContent = t(currentLanguage, "welcomeText");
      const next = button(t(currentLanguage, "next"), "button button-primary");
      next.addEventListener("click", () => {
        stage = "choice";
        localStorage.setItem("tjai-web-welcomed", "1");
        render();
      });
      controls.append(next);
      return;
    }

    if (stage === "choice") {
      title.textContent = t(currentLanguage, "authTitle");
      description.textContent = hasSupabaseConfig
        ? t(currentLanguage, "accountSyncIntro")
        : t(currentLanguage, "aiServiceNotConfigured");
      const actions = element("div", "auth-form");
      const register = button(t(currentLanguage, "createAccount"), "button button-primary");
      const login = button(t(currentLanguage, "alreadyAccount"), "button");
      const guest = button(t(currentLanguage, "guest"), "button button-quiet");
      register.disabled = login.disabled = !hasSupabaseConfig;
      register.addEventListener("click", () => { mode = "register"; stage = "form"; render(); });
      login.addEventListener("click", () => { mode = "login"; stage = "form"; render(); });
      guest.addEventListener("click", enterGuest);
      actions.append(register, login, guest);
      controls.append(actions);
      return;
    }

    title.textContent = mode === "register" ? t(currentLanguage, "register") : t(currentLanguage, "login");
    description.textContent = mode === "register"
      ? t(currentLanguage, "accountSyncIntro")
      : t(currentLanguage, "accountSyncIntro");
    if (!hasSupabaseConfig || !supabase) {
      setMessage(t(currentLanguage, "aiServiceNotConfigured"));
      const back = button(t(currentLanguage, "previous"), "button button-quiet");
      back.addEventListener("click", () => { stage = "choice"; render(); });
      controls.append(back);
      return;
    }

    const form = element("form", "auth-form");
    form.innerHTML = `
      ${mode === "register" ? `<label class="field">${t(currentLanguage, "name")}<input name="displayName" autocomplete="name" maxlength="80" required></label>` : ""}
      <label class="field">${t(currentLanguage, "email")}<input name="email" type="email" autocomplete="email" required></label>
      <label class="field">${t(currentLanguage, "password")}<input name="password" type="password" autocomplete="${mode === "register" ? "new-password" : "current-password"}" minlength="6" required></label>
      <button class="button button-primary" type="submit">${mode === "register" ? t(currentLanguage, "register") : t(currentLanguage, "login")}</button>`;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = $("button[type=submit]", form);
      const values = new FormData(form);
      const email = String(values.get("email") || "").trim();
      const password = String(values.get("password") || "");
      setBusy(submit, true, t(currentLanguage, "pleaseWait", "Подождите…"));
      setMessage("", false);
      try {
        if (mode === "register") {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { full_name: String(values.get("displayName") || "").trim() },
              emailRedirectTo: window.location.origin,
            },
          });
          if (error) throw error;
          if (!data.session) {
            setMessage(t(currentLanguage, "confirmEmail"), false);
            return;
          }
          onEnter({ user: data.user, guest: false });
          return;
        }
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onEnter({ user: data.user, guest: false });
      } catch (error) {
        setMessage(friendlyError(error));
      } finally {
        setBusy(submit, false);
      }
    });

    const backRow = element("div", "button-row");
    const back = button(t(currentLanguage, "previous"), "button button-quiet");
    back.addEventListener("click", () => { stage = "choice"; render(); });
    backRow.append(back);
    controls.append(form);
    if (config.googleAuthEnabled) {
      const separator = element("div", "auth-separator", t(currentLanguage, "or"));
      const google = button(t(currentLanguage, "google"), "button");
      google.addEventListener("click", async () => {
        setMessage("", false);
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin },
        });
        if (error) setMessage(friendlyError(error));
      });
      controls.append(separator, google);
    }
    controls.append(backRow);
  }

  render();
}
