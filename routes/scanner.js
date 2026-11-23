const crypto = require("crypto");
const express = require("express");
const axios = require("axios");
const validator = require("validator");

const router = express.Router();

const API_BASE =
  process.env.PRODUCT_API_BASE_URL ||
  "https://api.pingaksh.co/api/sold-product/details";
const LOGIN_API_BASE =
  process.env.LOGIN_API_BASE_URL ||
  "https://api.pingaksh.co/api/sold-product/login";
const AUTH_TOKEN = process.env.AuthorizationToken;
const SESSION_COOKIE_NAME = "qr_session";
const SESSION_SECRET =
  process.env.SESSION_SECRET || "pingaksh-retailer-session-secret-key-2026";

// --- Session & Cookie Utilities ---
function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const name = parts.shift().trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join("="));
    }
  });
  return list;
}

function signSession(data) {
  const json = JSON.stringify(data);
  const payload = Buffer.from(json).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function verifySession(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const dotIndex = token.indexOf(".");
  const payload = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);
  if (!payload || !signature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Session attachment middleware
router.use((req, res, next) => {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  req.retailer = verifySession(token);
  next();
});

// --- Dynamic Color & Theming Helpers ---
function hexToRgb(hex) {
  if (!hex || typeof hex !== "string") return null;
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  if (isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function adjustColor(rgb, percent) {
  if (!rgb) return null;
  const factor = 1 + percent / 100;
  return {
    r: Math.min(255, Math.max(0, Math.round(rgb.r * factor))),
    g: Math.min(255, Math.max(0, Math.round(rgb.g * factor))),
    b: Math.min(255, Math.max(0, Math.round(rgb.b * factor))),
  };
}

function rgbToHex(rgb) {
  if (!rgb) return "";
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function generateThemeStyles(themeColor, accentColor, cardColor) {
  const styles = [];
  const themeRgb = hexToRgb(themeColor);
  const accentRgb = hexToRgb(accentColor);
  const customCardRgb = hexToRgb(cardColor);

  if (themeRgb) {
    const deepRgb = adjustColor(themeRgb, -35);
    const midRgb = adjustColor(themeRgb, 20);
    const softRgb = adjustColor(themeRgb, 45);
    const bgRgb = adjustColor(themeRgb, -65);

    styles.push(`--brand: ${rgbToHex(themeRgb)};`);
    styles.push(`--brand-deep: ${rgbToHex(deepRgb)};`);
    styles.push(`--brand-mid: ${rgbToHex(midRgb)};`);
    styles.push(`--brand-soft: ${rgbToHex(softRgb)};`);
    styles.push(`--bg: ${rgbToHex(bgRgb)};`);
    styles.push(`--panel: rgba(${themeRgb.r}, ${themeRgb.g}, ${themeRgb.b}, 0.82);`);

    // Determine card/box colors (either from custom cardColor or automatically derived from themeColor)
    const cardBaseRgb = customCardRgb || adjustColor(themeRgb, 14);
    const cardTopRgb = adjustColor(cardBaseRgb, 10);
    const cardBtmRgb = adjustColor(cardBaseRgb, -18);

    styles.push(`--card-bg: linear-gradient(180deg, rgba(${cardTopRgb.r}, ${cardTopRgb.g}, ${cardTopRgb.b}, 0.75), rgba(${cardBtmRgb.r}, ${cardBtmRgb.g}, ${cardBtmRgb.b}, 0.94));`);
    styles.push(`--card-surface: rgba(${cardBaseRgb.r}, ${cardBaseRgb.g}, ${cardBaseRgb.b}, 0.88);`);
    styles.push(`--box-bg: rgba(${cardBtmRgb.r}, ${cardBtmRgb.g}, ${cardBtmRgb.b}, 0.65);`);
    styles.push(`--input-bg: rgba(${cardBtmRgb.r}, ${cardBtmRgb.g}, ${cardBtmRgb.b}, 0.82);`);
    styles.push(`--group-bg: linear-gradient(180deg, rgba(${cardTopRgb.r}, ${cardTopRgb.g}, ${cardTopRgb.b}, 0.92) 0%, rgba(${cardBtmRgb.r}, ${cardBtmRgb.g}, ${cardBtmRgb.b}, 0.96) 100%);`);
    styles.push(`--accordion-bg: rgba(${cardBtmRgb.r}, ${cardBtmRgb.g}, ${cardBtmRgb.b}, 0.45);`);

    const goldR = accentRgb ? accentRgb.r : 201;
    const goldG = accentRgb ? accentRgb.g : 179;
    const goldB = accentRgb ? accentRgb.b : 122;

    styles.push(`--spec-bg: linear-gradient(135deg, rgba(${goldR}, ${goldG}, ${goldB}, 0.1), rgba(${cardBtmRgb.r}, ${cardBtmRgb.g}, ${cardBtmRgb.b}, 0.65));`);
    styles.push(`--rate-bg: linear-gradient(135deg, rgba(${goldR}, ${goldG}, ${goldB}, 0.14), rgba(${cardBtmRgb.r}, ${cardBtmRgb.g}, ${cardBtmRgb.b}, 0.7));`);
    styles.push(`--price-strip-bg: linear-gradient(135deg, rgba(${goldR}, ${goldG}, ${goldB}, 0.16), rgba(${cardBtmRgb.r}, ${cardBtmRgb.g}, ${cardBtmRgb.b}, 0.75));`);
  } else if (customCardRgb) {
    const cardTopRgb = adjustColor(customCardRgb, 10);
    const cardBtmRgb = adjustColor(customCardRgb, -18);
    styles.push(`--card-bg: linear-gradient(180deg, rgba(${cardTopRgb.r}, ${cardTopRgb.g}, ${cardTopRgb.b}, 0.75), rgba(${cardBtmRgb.r}, ${cardBtmRgb.g}, ${cardBtmRgb.b}, 0.94));`);
    styles.push(`--card-surface: rgba(${customCardRgb.r}, ${customCardRgb.g}, ${customCardRgb.b}, 0.88);`);
    styles.push(`--box-bg: rgba(${cardBtmRgb.r}, ${cardBtmRgb.g}, ${cardBtmRgb.b}, 0.65);`);
    styles.push(`--input-bg: rgba(${cardBtmRgb.r}, ${cardBtmRgb.g}, ${cardBtmRgb.b}, 0.82);`);
  }

  if (accentRgb) {
    const gold2Rgb = adjustColor(accentRgb, 25);
    styles.push(`--gold: ${rgbToHex(accentRgb)};`);
    styles.push(`--gold-2: ${rgbToHex(gold2Rgb)};`);
    styles.push(`--line: rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.28);`);
    styles.push(`--line-strong: rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.55);`);
  }

  return styles.join("\n    ");
}

// --- Product Helpers ---
const isProduct = (product) =>
  product &&
  typeof product === "object" &&
  (product.jewels_code || product.style_no || product.huid_no || product.igi_no || product.product_info);

const lookupLiveProduct = async (code, type = "", b2bCode = "", retailerId = "") => {
  const url = new URL(API_BASE);
  url.searchParams.set("search", code);
  if (type) {
    url.searchParams.set("type", type);
  }
  if (b2bCode) {
    url.searchParams.set("code", b2bCode);
  }
  if (retailerId) {
    url.searchParams.set("retailer_id", retailerId);
  }

  const headers = {
    Accept: "application/json",
    JewelCode: code,
  };
  if (retailerId) {
    headers.RetailerId = retailerId;
  }
  if (AUTH_TOKEN) {
    headers.AuthorizationToken = AUTH_TOKEN;
  }

  const response = await axios.get(url.toString(), {
    timeout: 20000,
    headers,
    validateStatus: (status) => status < 500,
  });

  return response.data || {};
};

// --- Routes ---

// Login page
router.get("/login", (req, res) => {
  if (req.retailer) {
    return res.redirect("/");
  }
  res.render("login", {
    error: null,
  });
});

// Login API handler
router.post("/api/login", async (req, res) => {
  let { mobile, pin } = req.body || {};
  mobile = String(mobile || "").trim();
  pin = String(pin || "").trim();

  if (!mobile || !pin) {
    return res.status(400).json({
      success: false,
      message: "Please enter both mobile number and PIN.",
    });
  }

  // Format mobile to always include +91 prefix
  const digitsOnly = mobile.replace(/\D/g, "");
  let formattedMobile = mobile;
  if (!formattedMobile.startsWith("+91")) {
    if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
      formattedMobile = "+" + digitsOnly;
    } else {
      formattedMobile = "+91" + digitsOnly.slice(-10);
    }
  }

  try {
    console.log(`[LOGIN] Forwarding to backend: ${LOGIN_API_BASE}`, { mobile: formattedMobile });
    const response = await axios.post(
      LOGIN_API_BASE,
      { mobile: formattedMobile, pin },
      {
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(AUTH_TOKEN ? { AuthorizationToken: AUTH_TOKEN } : {}),
        },
        validateStatus: (status) => status < 500,
      }
    );

    const payload = response.data || {};
    console.log(`[LOGIN] Response from backend (${response.status}):`, payload);

    if (response.status === 200 && payload.data && (payload.data.retailer_id || payload.data.mobile)) {
      const retailerData = payload.data;
      const signedToken = signSession(retailerData);

      res.cookie(SESSION_COOKIE_NAME, signedToken, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: "/",
      });

      return res.json({
        success: true,
        message: payload.message || "Login successful",
        data: retailerData,
        redirect: "/",
      });
    }

    return res.status(response.status >= 400 ? response.status : 401).json({
      success: false,
      message: payload.message || "Invalid mobile number or PIN.",
    });
  } catch (err) {
    console.error("Login API request failed:", err.message);
    const apiMsg = err.response?.data?.message;
    return res.status(err.response?.status || 502).json({
      success: false,
      message: apiMsg || "Could not connect to authentication service. Please try again.",
    });
  }
});

// Logout handlers
router.get("/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  res.redirect("/login");
});

router.post("/api/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  res.json({ success: true, redirect: "/login" });
});

// Main portal route (protected by session)
router.get("/", (req, res) => {
  if (!req.retailer) {
    return res.redirect("/login");
  }

  const themeStyles = generateThemeStyles(
    req.retailer.theme_color,
    req.retailer.accent_color,
    req.retailer.card_color || req.retailer.panel_color || req.retailer.box_color
  );

  res.render("index", {
    product: null,
    error: null,
    retailer: req.retailer,
    themeStyles,
  });
});

// Lookup APIs (protected by session)
router.get("/api/product", async (req, res) => {
  if (!req.retailer) {
    return res.status(401).json({
      success: false,
      message: "Session expired. Please log in again.",
      requireLogin: true,
    });
  }

  const type = req.query.type ? String(req.query.type).trim() : "";
  const b2bCode =
    req.query.breakup_code ||
    req.query.b2bCode ||
    req.query.b2b_code ||
    (type === "b2b" ? req.query.code : "") ||
    "";

  const code = String(
    req.query.search ||
    (type !== "b2b" ? req.query.code : "") ||
    ""
  )
    .trim()
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

  return lookupProduct(res, code, type, String(b2bCode).trim(), req.retailer?.retailer_id);
});

router.get("/api/product/:code", async (req, res) => {
  if (!req.retailer) {
    return res.status(401).json({
      success: false,
      message: "Session expired. Please log in again.",
      requireLogin: true,
    });
  }

  const code = String(req.params.code || "")
    .trim()
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  const type = req.query.type ? String(req.query.type).trim() : "";
  const b2bCode =
    req.query.breakup_code ||
    req.query.b2bCode ||
    req.query.b2b_code ||
    (type === "b2b" ? req.query.code : "") ||
    "";
  return lookupProduct(res, code, type, String(b2bCode).trim(), req.retailer?.retailer_id);
});

async function lookupProduct(res, code, type = "", b2bCode = "", retailerId = "") {
  if (!code || !validator.isAlphanumeric(code)) {
    return res.json({
      success: false,
      message: "Enter a jewels code, IGI, or HUID using letters and numbers only.",
    });
  }

  if (type === "b2b" && !b2bCode) {
    return res.json({
      success: false,
      message: "Enter secret password for B2B breakup.",
    });
  }

  try {
    const payload = await lookupLiveProduct(code, type, b2bCode, retailerId);
    const product = payload.data;

    if (isProduct(product)) {
      if (product.show_b2b === undefined && payload.show_b2b !== undefined) {
        product.show_b2b = payload.show_b2b;
      }
      if (product.pure_metal_rate_gst === undefined) {
        if (payload.pure_metal_rate_gst !== undefined) {
          product.pure_metal_rate_gst = payload.pure_metal_rate_gst;
        } else if (payload.pure_metal_rate !== undefined) {
          product.pure_metal_rate_gst = payload.pure_metal_rate;
        } else if (product.pure_metal_rate !== undefined) {
          product.pure_metal_rate_gst = product.pure_metal_rate;
        }
      }
      return res.json({
        success: true,
        product,
        show_b2b: product.show_b2b,
        pure_metal_rate_gst: product.pure_metal_rate_gst,
        isB2B: type === "b2b",
      });
    }

    return res.json({
      success: false,
      message: payload.message || (type === "b2b" ? "Invalid code." : "Product not found."),
    });
  } catch (err) {
    console.error("Product API lookup failed:", err.message);
    const apiMessage = err.response?.data?.message;
    return res.status(err.response?.status || 502).json({
      success: false,
      message: apiMessage || "Could not reach the jewellery catalogue. Try again.",
    });
  }
}

module.exports = router;
