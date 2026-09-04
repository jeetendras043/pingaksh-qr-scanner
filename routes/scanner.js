const express = require("express");
const axios = require("axios");
const validator = require("validator");

const router = express.Router();

const API_BASE =
  process.env.PRODUCT_API_BASE_URL ||
  "https://api.pingaksh.co/api/sold-product/get";
const AUTH_TOKEN = process.env.AuthorizationToken;

const isProduct = (product) =>
  product &&
  typeof product === "object" &&
  (product.jewels_code || product.product_info || product.style_no);

const lookupLiveProduct = async (code) => {
  const url = new URL(API_BASE);
  url.searchParams.set("search", code);

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
  const code = String(req.query.search || req.query.code || "")
    .trim()
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  return lookupProduct(res, code);
});

router.get("/api/product/:code", async (req, res) => {
  const code = String(req.params.code || "")
    .trim()
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  return lookupProduct(res, code);
});

async function lookupProduct(res, code) {
  if (!code || !validator.isAlphanumeric(code)) {
    return res.json({
      success: false,
      message: "Enter a jewels code, IGI, or HUID using letters and numbers only.",
    });
  }

  try {
    const payload = await lookupLiveProduct(code);
    const product = payload.data;

    if (isProduct(product)) {
      return res.json({
        success: true,
        product,
      });
    }

    return res.json({
      success: false,
      message: payload.message || "Product not found.",
    });
  } catch (err) {
    console.error("Product API lookup failed:", err.message);
    const apiMessage = err.response?.data?.message;
    return res.status(502).json({
      success: false,
      message: apiMessage || "Could not reach the jewellery catalogue. Try again.",
    });
  }
}

module.exports = router;
