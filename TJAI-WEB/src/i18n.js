import localeData from "./ui-translations.json";
import baseTranslations from "./python-translations.json";

const localeIndex = new Map(localeData.languages.map((code, index) => [code, index]));

export function translate(language, key, fallback = "") {
  const index = localeIndex.get(language) ?? localeIndex.get("ru") ?? 0;
  const values = localeData.messages[key];
  return values?.[index] || baseTranslations[language]?.[key] || values?.[localeIndex.get("ru")] || baseTranslations.ru?.[key] || fallback || key;
}
