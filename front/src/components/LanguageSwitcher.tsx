import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

import { isSupportedLanguage, supportedLanguages } from "../i18n";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = isSupportedLanguage(i18n.resolvedLanguage ?? "")
    ? i18n.resolvedLanguage!
    : "ru";

  return (
    <label className="language-switcher">
      <Globe aria-hidden size={16} />
      <span className="language-switcher__label">{t("common.language.label")}</span>
      <select
        aria-label={t("common.language.label")}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
        value={current}
      >
        {supportedLanguages.map((code) => (
          <option key={code} value={code}>
            {t(`common.language.${code}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
