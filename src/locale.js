// Picks the visitor's country from browser settings (no network lookups) and gives Spotify's own
// names for the data-download boxes in that country's usual language(s).
// Labels come from Spotify's "Understanding my data" support article in each language.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.SpotifyPersona = root.SpotifyPersona || {}).locale = api;
})(typeof self !== "undefined" ? self : this, function () {
  // `request` is the button label, only where it is confirmed from the real page.
  const LABELS = {
    sv:      { name: "Svenska",    extended: "Utökad streaminghistorik",           technical: "Teknisk logginformation",            request: "Begär data" },
    no:      { name: "Norsk",      extended: "Utvidet strømmehistorikk",           technical: "Teknisk logginformasjon" },
    da:      { name: "Dansk",      extended: "Udvidet streaminghistorik",          technical: "Tekniske logoplysninger" },
    fi:      { name: "Suomi",      extended: "Laajennettu striimaushistoria",      technical: "Tekniset lokitiedot" },
    de:      { name: "Deutsch",    extended: "Erweiterter Streamingverlauf",       technical: "Daten des technischen Protokolls" },
    fr:      { name: "Français",   extended: "Historique de streaming étendu",     technical: "Informations sur le journal technique" },
    it:      { name: "Italiano",   extended: "Cronologia di ascolto estesa",       technical: "Informazioni del registro tecnico" },
    nl:      { name: "Nederlands", extended: "Uitgebreide streaminggeschiedenis",  technical: "Technische logboekinformatie" },
    es:      { name: "Español",    extended: "Historial de reproducción ampliado", technical: "Información de registro técnico" },
    "pt-PT": { name: "Português",  extended: "Histórico de streaming alargado",    technical: "Informações do registo técnico" },
    "pt-BR": { name: "Português",  extended: "Histórico ampliado de streams",      technical: "Informações técnicas de registro" },
    pl:      { name: "Polski",     extended: "Rozszerzona historia odtwarzania",   technical: "Techniczne pliki dziennika" }
  };

  // The language(s) most people use Spotify in, per country. English-only countries are left out.
  const COUNTRY_LANGUAGES = {
    SE: ["sv"], NO: ["no"], DK: ["da"], FI: ["fi", "sv"], AX: ["sv"],
    DE: ["de"], AT: ["de"], LI: ["de"], CH: ["de", "fr", "it"], LU: ["fr", "de"],
    FR: ["fr"], MC: ["fr"], BE: ["nl", "fr"], CA: ["fr"],
    IT: ["it"], SM: ["it"], NL: ["nl"],
    ES: ["es"], AD: ["es"], MX: ["es"], AR: ["es"], CL: ["es"], CO: ["es"], PE: ["es"], UY: ["es"],
    PT: ["pt-PT"], BR: ["pt-BR"], PL: ["pl"]
  };

  const TIME_ZONES = {
    "Europe/Stockholm": "SE", "Europe/Oslo": "NO", "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI", "Europe/Mariehamn": "AX",
    "Europe/Berlin": "DE", "Europe/Vienna": "AT", "Europe/Zurich": "CH", "Europe/Vaduz": "LI", "Europe/Luxembourg": "LU",
    "Europe/Paris": "FR", "Europe/Monaco": "MC", "Europe/Brussels": "BE", "Europe/Rome": "IT", "Europe/San_Marino": "SM",
    "Europe/Amsterdam": "NL", "Europe/Madrid": "ES", "Atlantic/Canary": "ES", "Europe/Andorra": "AD", "Europe/Lisbon": "PT",
    "Atlantic/Madeira": "PT", "Atlantic/Azores": "PT", "Europe/Warsaw": "PL", "America/Sao_Paulo": "BR", "America/Mexico_City": "MX",
    "America/Argentina/Buenos_Aires": "AR", "America/Buenos_Aires": "AR", "America/Santiago": "CL", "America/Bogota": "CO",
    "America/Lima": "PE", "America/Montevideo": "UY", "America/Toronto": "CA", "America/Montreal": "CA", "America/Vancouver": "CA",
    "Europe/London": "GB", "Europe/Dublin": "IE", "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US",
    "America/Los_Angeles": "US", "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Pacific/Auckland": "NZ"
  };

  // Where a browser language has no region, assume its home country.
  const LANGUAGE_HOMES = { sv: "SE", nb: "NO", nn: "NO", no: "NO", da: "DK", fi: "FI", de: "DE", fr: "FR", it: "IT", nl: "NL", es: "ES", pt: "PT", pl: "PL" };

  /**
   * Best guess at the visitor's country: the time zone first (closest to where they are),
   * then the region of their browser language, then the home country of that language.
   */
  function detectCountry({ timeZone = "", languages = [] } = {}) {
    if (TIME_ZONES[timeZone]) return TIME_ZONES[timeZone];
    for (const tag of languages) {
      const region = tag.split("-").find((part, i) => i > 0 && /^[A-Za-z]{2}$/.test(part));
      if (region) return region.toUpperCase();
    }
    for (const tag of languages) {
      const home = LANGUAGE_HOMES[tag.split("-")[0].toLowerCase()];
      if (home) return home;
    }
    return null;
  }

  /** Spotify's box labels in the country's usual language(s); empty when English is the norm. */
  function labelsFor(country) {
    return (COUNTRY_LANGUAGES[country] || []).map(lang => ({ lang, ...LABELS[lang] }));
  }

  /** Two regional-indicator letters, which render as the country's flag. */
  function flagOf(country) {
    return /^[A-Z]{2}$/.test(country || "") ? String.fromCodePoint(...[...country].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : "";
  }

  return { detectCountry, labelsFor, flagOf, LABELS, COUNTRY_LANGUAGES };
});
