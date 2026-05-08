import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import ru from "./locales/ru.json";
import tr from "./locales/tr.json";

export const supportedLanguages = ["ru", "en", "tr"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (supportedLanguages as readonly string[]).includes(value);
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
      tr: { translation: tr },
    },
    fallbackLng: "ru",
    supportedLngs: supportedLanguages,
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "car-wash-lang",
      caches: ["localStorage"],
    },
  });

export default i18n;
