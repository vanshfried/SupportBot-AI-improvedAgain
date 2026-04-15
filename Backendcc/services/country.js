import { pool } from "../db.js";
import { parsePhoneNumberFromString } from "libphonenumber-js";

let countriesByIso = new Map();
let countriesByCode = new Map();
let isLoaded = false;
let loadingPromise = null;
/* =========================
   LOAD COUNTRIES (ONCE)
========================= */
export async function loadCountries() {
  if (isLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      console.log("📡 Loading countries...");

      const res = await pool.query(
        `SELECT id, name, phone_code, iso_code FROM countries`,
      );

      countriesByIso.clear();
      countriesByCode.clear();

      for (const c of res.rows) {
        const phoneCode = String(c.phone_code);
        const iso = c.iso_code?.toUpperCase();

        if (iso) countriesByIso.set(iso, c);

        if (phoneCode && !countriesByCode.has(phoneCode)) {
          countriesByCode.set(phoneCode, c);
        }
      }

      isLoaded = true;

      console.log("✅ Countries loaded:", res.rows.length);
    } catch (err) {
      console.error("❌ DB ERROR:", err.message);
    } finally {
      loadingPromise = null; // ✅ CRITICAL FIX
    }
  })();

  return loadingPromise;
}

/* =========================
   DETECT COUNTRY
========================= */
export function detectCountry(phone) {
  try {
    if (!phone) return null;

    const parsed = parsePhoneNumberFromString("+" + phone);

    if (!parsed || !parsed.isValid()) return null;

    return {
      iso: parsed.country || null,
      callingCode: String(parsed.countryCallingCode),
    };
  } catch (err) {
    console.error("❌ detectCountry error:", err.message);
    return null;
  }
}

/* =========================
   MAP TO DB COUNTRY
========================= */
export async function mapToCountryId(detected) {
  if (!detected) return null;

  // 🔁 auto-load if not ready
  if (!isLoaded) {
    console.warn("⚠️ Countries not loaded yet, loading now...");
    await loadCountries();
  }

  let match = null;

  // ✅ ISO first
  if (detected.iso) {
    match = countriesByIso.get(detected.iso);
  }

  // 🔁 fallback
  if (!match && detected.callingCode) {
    match = countriesByCode.get(detected.callingCode);
  }

  if (!match) {
    console.warn("⚠️ No country match:", detected);
  }

  return match || null;
}

export async function resolveCountry(phone) {
  const detected = detectCountry(phone);
  return await mapToCountryId(detected);
}
// optional helper
export async function resolveCountryFull(phone) {
  const detected = detectCountry(phone);
  const country = await mapToCountryId(detected);

  return { detected, country };
}