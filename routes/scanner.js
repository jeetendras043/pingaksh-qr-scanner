const express = require("express");
const axios = require("axios");
const validator = require("validator");

const router = express.Router();

const API_BASE =
  process.env.PRODUCT_API_BASE_URL ||
  "http://localhost:3000/api/sold-product/details";
const AUTH_TOKEN = process.env.AuthorizationToken;

const isProduct = (product) =>
  product &&
  typeof product === "object" &&
  (product.jewels_code || product.style_no || product.huid_no || product.igi_no || product.product_info);

const lookupLiveProduct = async (code, type = "", b2bCode = "") => {
  const url = new URL(API_BASE);
  url.searchParams.set("search", code);
  if (type) {
    url.searchParams.set("type", type);
  }
  if (b2bCode) {
    url.searchParams.set("code", b2bCode);
  }

  const headers = {
    Accept: "application/json",
    JewelCode: code,
  };
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

router.get("/", (req, res) => {
  res.render("index", {
    product: null,
    error: null,
  });
});

router.get("/api/product", async (req, res) => {
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

  return lookupProduct(res, code, type, String(b2bCode).trim());
});

router.get("/api/product/:code", async (req, res) => {
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
  return lookupProduct(res, code, type, String(b2bCode).trim());
});

async function lookupProduct(res, code, type = "", b2bCode = "") {
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
    const payload = await lookupLiveProduct(code, type, b2bCode);
    const product = payload.data;

    if (isProduct(product)) {
      return res.json({
        success: true,
        product,
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
