(function () {
  const body = document.body;
  const codeInput = document.getElementById("codeInput");
  const searchForm = document.getElementById("searchForm");
  const cancelScanBtn = document.getElementById("cancelScanBtn");
  const scanQuickBtn = document.getElementById("scanQuickBtn");
  const newLookupBtn = document.getElementById("newLookupBtn");
  const scannerBox = document.getElementById("scannerBox");
  const scannerFrame = document.querySelector(".scanner-frame");
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const cameraSelect = document.getElementById("cameraSelect");
  const scanResult = document.getElementById("scanResult");
  const productResult = document.getElementById("productResult");
  const errorBox = document.getElementById("errorBox");
  const errorKicker = document.getElementById("errorKicker");
  const errorTitle = document.getElementById("errorTitle");
  const errorMessage = document.getElementById("errorMessage");
  const errorQueryWrap = document.getElementById("errorQueryWrap");
  const errorQuery = document.getElementById("errorQuery");
  const errorRetry = document.getElementById("errorRetry");
  const errorScan = document.getElementById("errorScan");
  const loadingState = document.getElementById("loadingState");
  const modeKicker = document.getElementById("modeKicker");
  const modeTitle = document.getElementById("modeTitle");
  const modeTabs = document.querySelectorAll(".mode-tab");
  const imagePreview = document.getElementById("imagePreview");
  const previewImage = document.getElementById("previewImage");
  const previewCaption = document.getElementById("previewCaption");
  const previewClose = document.getElementById("previewClose");
  const previewPrev = document.getElementById("previewPrev");
  const previewNext = document.getElementById("previewNext");

  let stream = null;
  let scanRaf = 0;
  let scanning = false;
  let detecting = false;
  let barcodeDetector = null;
  let isFetching = false;
  let hasProduct = false;
  let currentMode = "search";
  let galleryImages = [];
  let galleryIndex = 0;
  let galleryTitle = "";
  let currentSearchCode = "";
  let isB2BMode = false;

  const formatINR = (value) => {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Number(value));
  };

  const formatINRDigits = (value) => {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 0,
    }).format(Number(value));
  };

  const formatNum = (value, decimals = 2) => {
    if (value == null) return "—";
    return Number(value).toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatRate = (value) => {
    if (value == null) return "";
    const str = String(value).trim();
    if (!str || str === "—" || str === "-" || str === "0") return "";
    if (/₹|rs\.?|\/|per/i.test(str)) {
      return str;
    }
    const clean = str.replace(/,/g, "");
    const num = Number(clean);
    if (!Number.isNaN(num) && num > 0) {
      const decimals = num % 1 !== 0 ? 2 : 0;
      const formatted = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(num);
      return `${formatted} / g`;
    }
    return "";
  };

  const escapeHtml = (str) => {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  };

  const showError = (message, kind = "not-found", searchedCode = "") => {
    const query = (searchedCode || codeInput.value || "").trim();
    if (query && !codeInput.value) {
      codeInput.value = query;
    }
    const copy = {
      "not-found": {
        kicker: "No match",
        title: "No piece found",
        text: "We could not find jewellery for that search. Check the jewels code, IGI, or HUID and try again.",
      },
      invalid: {
        kicker: "Need a code",
        title: "Enter a valid search",
        text: "Use letters and numbers only for a jewels code, IGI number, or HUID.",
      },
      network: {
        kicker: "Connection",
        title: "Could not reach the atelier",
        text: "The lookup service is not responding. Please try again in a moment.",
      },
    }[kind] || {
      kicker: "Notice",
      title: "Unable to load this piece",
      text: message,
    };

    errorKicker.textContent = copy.kicker;
    errorTitle.textContent = copy.title;
    errorMessage.textContent = copy.text;
    if (query) {
      errorQuery.textContent = query;
      errorQueryWrap.hidden = false;
    } else {
      errorQueryWrap.hidden = true;
    }

    errorBox.hidden = false;
    errorBox.classList.remove("is-animating");
    void errorBox.offsetWidth;
    errorBox.classList.add("is-animating");
    errorBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const hideError = () => {
    errorBox.hidden = true;
    errorBox.classList.remove("is-animating");
  };

  const setHomeView = () => {
    hasProduct = false;
    currentSearchCode = "";
    isB2BMode = false;
    body.classList.remove("view-result");
    body.classList.add("view-home");
    productResult.innerHTML = "";
    codeInput.value = "";
    closePreview();
    hideError();
    setMode("search", { keepFocus: true });
  };

  const setResultView = () => {
    hasProduct = true;
    body.classList.remove("view-home");
    body.classList.add("view-result");
  };

  const extractCode = (raw) => {
    const trimmed = (raw || "").trim();
    let code = "";
    try {
      const url = new URL(trimmed);
      const fromSearch = url.searchParams.get("search") || url.searchParams.get("code") || url.searchParams.get("JewelCode");
      if (fromSearch) code = fromSearch.replace(/[^A-Za-z0-9]/g, "");
    } catch {
      /* not a URL */
    }
    if (!code) {
      const queryMatch = trimmed.match(/[?&](?:search|code|JewelCode)=([A-Za-z0-9]+)/i);
      if (queryMatch) code = queryMatch[1];
    }
    if (!code) {
      const idMatch = trimmed.match(/\b(?:id|jewels?\s*code|code)\s*[:#-]?\s*([A-Za-z0-9]{4,})/i);
      if (idMatch) code = idMatch[1];
    }
    if (!code) {
      const pathMatch = trimmed.match(/\/([A-Za-z0-9]{4,})$/);
      if (pathMatch) code = pathMatch[1];
    }
    if (!code) code = trimmed.replace(/[^A-Za-z0-9]/g, "");
    return code.toUpperCase();
  };

  const listRow = (label, value) =>
    `<li><span>${escapeHtml(label)}</span><strong>${value}</strong></li>`;

  const showPreviewImage = () => {
    const src = galleryImages[galleryIndex];
    if (!src) return;
    previewImage.src = src;
    previewCaption.textContent =
      galleryImages.length > 1
        ? `${galleryTitle} · ${galleryIndex + 1} of ${galleryImages.length}`
        : galleryTitle;
    const many = galleryImages.length > 1;
    previewPrev.hidden = !many;
    previewNext.hidden = !many;
  };

  const openPreview = (index) => {
    if (!galleryImages.length) return;
    galleryIndex = index;
    imagePreview.hidden = false;
    document.body.style.overflow = "hidden";
    showPreviewImage();
    previewClose.focus();
  };

  const closePreview = () => {
    imagePreview.hidden = true;
    document.body.style.overflow = "";
    previewImage.removeAttribute("src");
  };

  const stepPreview = (delta) => {
    if (galleryImages.length < 2) return;
    galleryIndex = (galleryIndex + delta + galleryImages.length) % galleryImages.length;
    showPreviewImage();
  };

  const setMode = (mode, options = {}) => {
    currentMode = mode;
    body.classList.toggle("mode-scan", mode === "scan");
    modeTabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.mode === mode);
    });

    if (mode === "scan") {
      modeKicker.textContent = "Camera";
      modeTitle.textContent = "Scan jewellery tag";
      closePreview();
      hideError();
      startScanner();
    } else {
      modeKicker.textContent = "Lookup";
      modeTitle.textContent = hasProduct ? "Search another piece" : "Search by code, IGI, or HUID";
      stopScanner();
      if (options.keepFocus !== false) codeInput.focus();
    }
  };

  const renderProduct = (product, options = {}) => {
    const isB2B = Boolean(options.isB2B ?? isB2BMode);
    isB2BMode = isB2B;
    const info = product.product_info || {};
    const price = product.price_breaking || {};
    const rawImages = Array.isArray(product.inventory_images)
      ? product.inventory_images
      : Array.isArray(product.images)
        ? product.images
        : typeof product.inventory_images === "string" && product.inventory_images.trim()
          ? [product.inventory_images.trim()]
          : product.image
            ? [product.image]
            : [];

    const images = rawImages
      .map((img) => (typeof img === "string" ? img : img?.url || img?.path || img?.image || ""))
      .map((img) => (typeof img === "string" ? img.trim() : ""))
      .filter((img) => img.length > 0);

    const diamonds = (product.diamonds || []).filter(
      (d) => d.diamond_clarity !== "Total" && d.clarity !== "Total"
    );

    const rawStones = Array.isArray(product.stones)
      ? product.stones
      : Array.isArray(product.colour_stone)
        ? product.colour_stone
        : Array.isArray(product.color_stones)
          ? product.color_stones
          : [];

    const stones = rawStones
      .filter((s) => s && typeof s === "object")
      .filter((s) => s.code !== "Total" && s.name !== "Total" && s.type !== "Total")
      .map((s) => ({
        code: s.code || s.stone_code || s.name || s.type || s.stone_name || "",
        pcs: s.pcs ?? s.pieces ?? s.count ?? s.colour_stone_count ?? s.color_stone_count ?? null,
        weight: s.weight ?? s.stone_weight ?? s.wt ?? null,
        rate: s.rate ?? s.stone_rate ?? null,
        amount: s.amount ?? s.total_amount ?? s.stone_price ?? s.total_price ?? null,
        shape: s.shape || s.stone_shape || "",
        size: s.size?.diamond_slieve_size || s.size?.mm_size || s.size || s.stone_size || "",
        clarity: s.clarity || "",
      }));

    const stoneSummaryPcs =
      product.total_stone_pcs ??
      product.total_colour_stone_pcs ??
      product.total_color_stone_pcs ??
      price.colour_stone?.colour_stone_count ??
      stones.reduce((acc, s) => acc + (Number(s.pcs) || 0), 0);

    const stoneSummaryWt =
      product.total_stone_weight ??
      product.total_colour_stone_weight ??
      product.total_color_stone_weight ??
      price.colour_stone?.colour_stone_weight ??
      stones.reduce((acc, s) => acc + (Number(s.weight) || 0), 0);

    const stoneSummaryAmt =
      product.total_stone_amount ??
      product.total_colour_stone_amount ??
      product.total_color_stone_amount ??
      price.colour_stone?.colour_stone_price ??
      stones.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);

    const hasStones =
      stones.length > 0 ||
      (stoneSummaryAmt != null && stoneSummaryAmt > 0) ||
      (stoneSummaryPcs != null && stoneSummaryPcs > 0) ||
      (stoneSummaryWt != null && stoneSummaryWt > 0);

    const formatStoneName = (code) => {
      if (!code) return "Colour Stone";
      const c = String(code).trim();
      if (/^cs$/i.test(c)) return "Colour Stone (CS)";
      return c.toUpperCase();
    };

    const jewelsCode = product.jewels_code || "";
    const styleNo = product.style_no || "";
    const igiNo = product.igi_no || "";
    const huidNo = product.huid_no || "";
    const metalName = product.metal || info.Metal || "";
    const purityVal = product.metal_purity ?? product.metal_purity;
    const purityStr = purityVal != null ? `${purityVal}%` : (info.Karatage || "");
    const diamondClarity =
      product.diamond_clarity ||
      info.diamond_clarity ||
      diamonds.find((d) => d.clarity || d.diamond_clarity)?.clarity ||
      diamonds.find((d) => d.clarity || d.diamond_clarity)?.diamond_clarity ||
      "";

    const metalDisplay = metalName || "";

    const showB2B = Boolean(
      product.show_b2b === true ||
      product.show_b2b === "true" ||
      product.show_b2b === 1 ||
      product.show_b2b === "1"
    );
    const canShowB2B = isB2B || showB2B;

    const pureMetalRateVal = product.pure_metal_rate_gst ?? product.pure_metal_rate;
    const pureMetalRateStr = formatRate(pureMetalRateVal);

    const rawStyleNo = String(styleNo || "").trim();
    const cleanStyleVal = rawStyleNo.replace(/^style\s*[:#-]?\s*/i, "").trim();
    const styleDisplayVal = cleanStyleVal || rawStyleNo;

    const subCategory =
      info.sub_category ||
      product.sub_category ||
      (styleDisplayVal ? `Style ${styleDisplayVal}` : "Jewellery Piece");

    const categoryKicker =
      info.Category ||
      product.category ||
      (metalName ? `${metalName} Certified Jewellery` : "Pingaksh Diamond Jewellery");

    const productInfoRows = [
      styleDisplayVal && ["Style no.", escapeHtml(styleDisplayVal)],
      jewelsCode && ["Jewels code", escapeHtml(jewelsCode)],
      igiNo && ["IGI certificate", escapeHtml(igiNo)],
      huidNo && ["HUID", escapeHtml(huidNo)],
    ].filter(Boolean);

    const metalInfoRows = [
      metalName && ["Metal", escapeHtml(metalName)],
      purityStr && ["Purity", escapeHtml(purityStr)],
      (product.metal_gwt != null || info.gross_weight != null) && [
        "Gross weight (GWT)",
        `${formatNum(product.metal_gwt ?? info.gross_weight, 2)} g`,
      ],
      (product.metal_nwt != null || info.metal_weight != null) && [
        "Net weight (NWT)",
        `${formatNum(product.metal_nwt ?? info.metal_weight, 2)} g`,
      ],
      product.metal_rate != null && [
        "Metal rate",
        `${formatINR(product.metal_rate)} / g`,
      ],
    ].filter(Boolean);

    const diamondInfoRows = [
      diamondClarity && ["Diamond clarity", escapeHtml(diamondClarity)],
      (product.total_dia_pcs != null || info.total_diamonds != null) && [
        "Total diamonds",
        `${product.total_dia_pcs ?? info.total_diamonds} pcs`,
      ],
      (product.total_dia_weight != null || info.total_diamond_weight != null) && [
        "Total diamond weight",
        `${formatNum(product.total_dia_weight ?? info.total_diamond_weight, 3)} ct`,
      ],
    ].filter(Boolean);

    const detailGroups = [
      {
        id: "product-info",
        title: "Product info",
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/></svg>`,
        rows: productInfoRows,
      },
      {
        id: "metal-info",
        title: "Metal info",
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l7 4v6c0 5-3.5 9.5-7 10-3.5-.5-7-5-7-10V6l7-4z"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>`,
        rows: metalInfoRows,
      },
      {
        id: "diamond-info",
        title: "Diamond info",
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 18 3 22 9 12 22 2 9"/><polyline points="2 9 12 13 22 9"/><line x1="12" y1="3" x2="12" y2="13"/><line x1="6" y1="3" x2="9.5" y2="9"/><line x1="18" y1="3" x2="14.5" y2="9"/></svg>`,
        rows: diamondInfoRows,
      },
    ].filter((g) => g.rows.length > 0);

    const metalIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17l2-7h12l2 7H4z"/><path d="M7 10l2-5h6l2 5"/><path d="M7 17v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2"/></svg>`;
    const diamondIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 18 3 22 9 12 22 2 9"/><polyline points="2 9 12 13 22 9"/><line x1="12" y1="3" x2="12" y2="13"/></svg>`;
    const stoneIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 2 18 2 22 8 18 22 6 22 2 8"/><circle cx="12" cy="12" r="3.2"/></svg>`;
    const labourIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
    const certIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l7 4v6c0 5-3.5 9.5-7 10-3.5-.5-7-5-7-10V6l7-4z"/><polyline points="9 12 11 14 15 10"/></svg>`;

    const subtotalAmt = product.total_price != null ? Number(product.total_price) : null;
    const calcPct = (amt) =>
      subtotalAmt && subtotalAmt > 0 && amt != null && Number(amt) > 0
        ? Math.round((Number(amt) / subtotalAmt) * 100)
        : null;

    const priceBoxes = [];

    const metalPrice = product.metal_total_price ?? price.metal?.metal_price;
    if (metalPrice != null) {
      const netWt = product.metal_nwt ?? price.metal?.metal_weight;
      const rateStr = product.metal_rate != null ? ` @ ${formatINR(product.metal_rate)}/g` : "";
      const wtSubtitle = netWt != null ? `${formatNum(netWt, 2)} g${rateStr}` : (metalDisplay || "Gold");
      priceBoxes.push({
        id: "metal",
        title: "Metal",
        subtitle: wtSubtitle,
        amount: metalPrice,
        formattedAmount: formatINR(metalPrice),
        percent: calcPct(metalPrice),
        icon: metalIcon,
      });
    }

    const legacyDiaTotal = (product.diamonds || []).find(
      (d) => d.diamond_clarity === "Total" || d.clarity === "Total"
    );

    const diaSummaryPcs =
      product.total_dia_pcs ??
      legacyDiaTotal?.diamond_count ??
      diamonds.reduce((acc, d) => acc + (Number(d.pcs ?? d.diamond_count) || 0), 0);
    const diaSummaryWt =
      product.total_dia_weight ??
      legacyDiaTotal?.diamond_weight ??
      diamonds.reduce((acc, d) => acc + (Number(d.weight ?? d.diamond_weight) || 0), 0);
    const diaSummaryAmt =
      product.total_dia_amount ??
      legacyDiaTotal?.total_price ??
      diamonds.reduce((acc, d) => acc + (Number(d.amount ?? d.total_price) || 0), 0);

    const diaPrice = product.total_dia_amount ?? price.diamond?.diamond_price;
    if (diaPrice != null) {
      let diaSub = "Natural diamonds";
      if (diaSummaryPcs > 0 && diaSummaryWt > 0) {
        diaSub = `${diaSummaryPcs} pcs · ${formatNum(diaSummaryWt, 3)} ct`;
      } else if (diaSummaryWt > 0) {
        diaSub = `${formatNum(diaSummaryWt, 3)} ct`;
      }
      priceBoxes.push({
        id: "diamonds",
        title: "Diamonds",
        subtitle: diaSub,
        amount: diaPrice,
        formattedAmount: formatINR(diaPrice),
        percent: calcPct(diaPrice),
        icon: diamondIcon,
      });
    }

    if (stoneSummaryAmt != null && (stoneSummaryAmt > 0 || stones.length > 0)) {
      let stoneTitle = "Colour stones";
      let stoneSub = "Precious gemstones";
      if (stoneSummaryPcs > 1 && stoneSummaryWt > 0) {
        stoneSub = `${stoneSummaryPcs} pcs · ${formatNum(stoneSummaryWt, 2)} ct`;
      } else if (stoneSummaryPcs === 1 && stoneSummaryWt > 0) {
        stoneTitle = "Colour stone";
        stoneSub = `1 pc · ${formatNum(stoneSummaryWt, 2)} ct`;
      } else if (stoneSummaryPcs > 0) {
        stoneSub = `${stoneSummaryPcs} pcs`;
      } else if (stoneSummaryWt > 0) {
        stoneSub = `${formatNum(stoneSummaryWt, 2)} ct`;
      }
      priceBoxes.push({
        id: "stones",
        title: stoneTitle,
        subtitle: stoneSub,
        amount: stoneSummaryAmt,
        formattedAmount: formatINR(stoneSummaryAmt),
        percent: calcPct(stoneSummaryAmt),
        icon: stoneIcon,
      });
    }

    const labourAmt =
      product.total_labour ??
      product.labour?.amount ??
      price.manufacturing_price?.manufacturing_price;
    if (labourAmt != null) {
      const labourRate = product.labour?.rate;
      const labourSub = labourRate
        ? `Rate: ${formatINR(labourRate)}/g`
        : (Number(labourAmt) === 0 ? "No making charges" : "Crafting & finishing");
      priceBoxes.push({
        id: "labour",
        title: "Making Charges",
        subtitle: labourSub,
        amount: labourAmt,
        formattedAmount: formatINR(labourAmt),
        percent: calcPct(labourAmt),
        isZero: Number(labourAmt) === 0,
        icon: labourIcon,
      });
    }

    if (Array.isArray(product.other_charges) && product.other_charges.length > 0) {
      product.other_charges.forEach((charge, idx) => {
        const code = (charge.code || "Other").trim();
        const sub = code === "HUID" ? "Govt. Hallmarking" : (code === "IGI" ? "IGI Certification" : "Service charge");
        priceBoxes.push({
          id: `charge-${idx}-${code.toLowerCase()}`,
          title: `${code} Charge`,
          subtitle: sub,
          amount: charge.amount,
          formattedAmount: formatINR(charge.amount),
          percent: calcPct(charge.amount),
          icon: certIcon,
        });
      });
    } else if (product.total_other_charges != null && product.total_other_charges > 0) {
      priceBoxes.push({
        id: "other-charges",
        title: "Other Charges",
        subtitle: "Certification & services",
        amount: product.total_other_charges,
        formattedAmount: formatINR(product.total_other_charges),
        percent: calcPct(product.total_other_charges),
        icon: certIcon,
      });
    }

    const subtotalStr = product.total_price != null ? formatINR(product.total_price) : null;
    const gstStr = product.gst_amount != null ? formatINR(product.gst_amount) : null;
    const grandTotal = product.grand_total ?? product.total_price ?? price.total;
    const grandTotalStr = grandTotal != null ? formatINR(grandTotal) : null;

    const hasDiamonds = diamonds.length > 0;
    const stonesHaveShape = stones.some((s) => s.shape && s.shape !== "—");
    const stonesHaveSize = stones.some((s) => s.size && s.size !== "—");

    productResult.innerHTML = `
      <article class="piece-card">
        <div class="piece-col piece-col-info">
          ${!images[0]
        ? `<div class="piece-crest" aria-hidden="true">
                  <div class="crest-icon">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6">
                      <polygon points="12 2 2 9 12 22 22 9 12 2" stroke="url(#goldGrad)" />
                      <polyline points="2 9 12 14 22 9" stroke="url(#goldGrad)" />
                      <line x1="12" y1="2" x2="12" y2="14" stroke="url(#goldGrad)" />
                      <defs>
                        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stop-color="#f5e6b3" />
                          <stop offset="100%" stop-color="#c9b37a" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <span class="crest-text">PINGAKSH CERTIFIED JEWELLERY</span>
                </div>`
        : ""
      }
          <div class="piece-intro">
            <div class="piece-head">
              <div class="piece-head-row">
                <h2 class="piece-title">
                  ${styleDisplayVal
        ? `<span class="piece-title-label">Style</span> <span class="piece-title-value">${escapeHtml(styleDisplayVal)}</span>`
        : `<span class="piece-title-value">${escapeHtml(subCategory || "Jewellery Piece")}</span>`
      }
                </h2>
                ${canShowB2B
        ? `<div class="b2b-action-wrap ${isB2B ? "is-unlocked" : ""}">
                  ${!isB2B
            ? `<button type="button" id="b2bTriggerBtn" class="b2b-trigger-btn" aria-expanded="false">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      <span>B2B Breakup</span>
                    </button>`
            : `<div class="b2b-unlocked-badge">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
                      <span>B2B Active</span>
                    </div>
                    <button type="button" id="b2bExitBtn" class="pill-btn b2b-exit-btn">Exit B2B</button>`
          }
                </div>`
        : ""
      }
              </div>
              ${canShowB2B && !isB2B
        ? `<div id="b2bPromptBox" class="b2b-prompt-box" hidden>
                <form id="b2bForm" class="b2b-form" autocomplete="off">
                  <div class="b2b-form-head">
                    <span class="b2b-form-badge">B2B SECURE ACCESS</span>
                    <p class="b2b-form-kicker">Enter secret password to view B2B breakup</p>
                  </div>
                  <div class="b2b-input-row">
                    <div class="b2b-input-shell">
                      <input
                        type="password"
                        id="b2bPasswordInput"
                        name="b2b_secret"
                        placeholder="Secret password"
                        autocomplete="off"
                        spellcheck="false"
                        required
                      />
                      <button type="button" id="b2bTogglePwBtn" class="b2b-pw-toggle" aria-label="Show password">
                        <svg class="eye-open" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        <svg class="eye-closed" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" hidden><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      </button>
                    </div>
                    <button type="submit" id="b2bSubmitBtn" class="gold-btn b2b-submit-btn">Unlock</button>
                    <button type="button" id="b2bCancelBtn" class="pill-btn b2b-cancel-btn">Cancel</button>
                  </div>
                  <p id="b2bErrorMsg" class="b2b-error-msg" hidden></p>
                </form>
              </div>`
        : ""
      }
            </div>
            ${grandTotal != null
        ? `<div class="price-strip">
                    <span class="price-label">Grand Total (Incl. GST)</span>
                    <b class="price-amount"><span class="rupee">₹</span>${formatINRDigits(grandTotal)}</b>
                  </div>`
        : ""
      }
            ${metalDisplay || diamondClarity
        ? `<div class="piece-specs-grid">
                    ${metalDisplay
          ? `<div class="spec-card spec-card-metal">
                            <span class="spec-label">Metal</span>
                            <b class="spec-value">${escapeHtml(metalDisplay)}</b>
                          </div>`
          : ""
        }
                    ${diamondClarity
          ? `<div class="spec-card spec-card-diamond">
                            <span class="spec-label">Diamond Clarity</span>
                            <b class="spec-value">${escapeHtml(diamondClarity)}</b>
                          </div>`
          : ""
        }
                  </div>`
        : ""
      }
            ${pureMetalRateStr
        ? `<div class="spec-card spec-card-rate">
                    <span class="spec-label">Pure Metal Rate (Incl. GST)</span>
                    <b class="spec-value">${escapeHtml(pureMetalRateStr)}</b>
                  </div>`
        : ""
      }
          </div>
          ${detailGroups.length
        ? `<details class="product-accordion product-details-accordion">
                  <summary>Product details</summary>
                  <div class="product-groups-wrap" style="--group-count: ${detailGroups.length};">
                    ${detailGroups
          .map(
            (group) => `
                    <div class="detail-group detail-group-${group.id}">
                      <div class="detail-group-head">
                        <span class="detail-group-icon">${group.icon}</span>
                        <h4 class="detail-group-title">${group.title}</h4>
                      </div>
                      <ul class="detail-list">
                        ${group.rows.map(([label, value]) => listRow(label, value)).join("")}
                      </ul>
                    </div>`
          )
          .join("")}
                  </div>
                </details>`
        : ""
      }
          ${(priceBoxes.length > 0 || grandTotal != null)
        ? `<details class="product-accordion price-breakdown-accordion">
                  <summary>Price breakdown</summary>
                  <div class="price-breakdown-panel">
                    ${priceBoxes.length
          ? `<div class="price-boxes-grid" style="--box-count: ${priceBoxes.length};">
                        ${priceBoxes
            .map(
              (box) => `
                        <div class="price-box price-box-${box.id}">
                          <div class="price-box-head">
                            <span class="price-box-icon">${box.icon}</span>
                            <span class="price-box-title">${escapeHtml(box.title)}</span>
                          </div>
                          ${box.subtitle ? `<div class="price-box-meta">${escapeHtml(box.subtitle)}</div>` : ""}
                          <div class="price-box-amount">
                            <span class="price-box-amt-label">Amount</span>
                            <strong class="price-box-amt-val ${box.isZero ? "is-zero" : ""}">${escapeHtml(box.formattedAmount)}</strong>
                          </div>
                        </div>`
            )
            .join("")}
                      </div>`
          : ""
        }
                    ${(subtotalStr || gstStr || grandTotal != null)
          ? `<div class="price-summary-card">
                        <div class="price-summary-lines">
                          ${subtotalStr
            ? `<div class="price-summary-row">
                                <span class="price-summary-label">
                                  <span>Subtotal</span>
                                  <small>(Excl. GST)</small>
                                </span>
                                <span class="price-summary-val">${escapeHtml(subtotalStr)}</span>
                              </div>`
            : ""
          }
                          ${gstStr
            ? `<div class="price-summary-row">
                                <span class="price-summary-label">
                                  <span>GST</span>
                                  <small>(3%)</small>
                                </span>
                                <span class="price-summary-val price-gst-val">+ ${escapeHtml(gstStr)}</span>
                              </div>`
            : ""
          }
                        </div>
                        ${grandTotal != null
            ? `<div class="price-summary-total">
                              <div class="price-total-info">
                                <span class="price-total-label">Grand Total</span>
                                <span class="price-total-hint">Inclusive of all taxes & charges</span>
                              </div>
                              <div class="price-total-figure">
                                <span class="rupee">₹</span>
                                <span class="price-total-digits">${formatINRDigits(grandTotal)}</span>
                              </div>
                            </div>`
            : ""
          }
                      </div>`
          : ""
        }
                  </div>
                </details>`
        : ""
      }
          ${hasDiamonds
        ? `<details class="product-accordion diamonds-accordion">
                  <summary>Diamond list <span>${diamonds.length} size${diamonds.length === 1 ? "" : "s"} · ${diaSummaryPcs} pcs · ${formatNum(diaSummaryWt, 3)} ct</span></summary>
                  <div class="diamond-table-wrap">
                    <table class="diamond-table">
                      <thead>
                        <tr>
                          <th>Clarity</th>
                          <th>Shape</th>
                          <th>Size</th>
                          <th class="col-num">Pcs</th>
                          <th class="col-num">Weight</th>
                          <th class="col-num">Rate</th>
                          <th class="col-num">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${diamonds
          .map(
            (d) => `<tr>
                              <td>${escapeHtml(d.clarity || d.diamond_clarity || diamondClarity || "—")}</td>
                              <td>${escapeHtml(d.shape || d.diamond_shape || "Round")}</td>
                              <td>${escapeHtml(d.size?.diamond_slieve_size || d.size?.mm_size || d.size || "—")}</td>
                              <td class="col-num">${d.pcs ?? d.diamond_count ?? "—"}</td>
                              <td class="col-num">${formatNum(d.weight ?? d.diamond_weight, 3)} ct</td>
                              <td class="col-num">${d.rate ? formatINR(d.rate) : "—"}</td>
                              <td class="col-num">${formatINR(d.amount ?? d.total_price)}</td>
                            </tr>`
          )
          .join("")}
                        <tr class="diamond-total">
                          <td>Total</td>
                          <td>—</td>
                          <td>—</td>
                          <td class="col-num">${diaSummaryPcs}</td>
                          <td class="col-num">${formatNum(diaSummaryWt, 3)} ct</td>
                          <td class="col-num">—</td>
                          <td class="col-num">${formatINR(diaSummaryAmt)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>`
        : ""
      }
          ${stones.length > 0
        ? `<details class="product-accordion stones-accordion">
                  <summary>Colour stone list <span>${stones.length} item${stones.length === 1 ? "" : "s"} · ${stoneSummaryPcs} pcs · ${formatNum(stoneSummaryWt, 2)} ct</span></summary>
                  <div class="stone-table-wrap diamond-table-wrap">
                    <table class="stone-table diamond-table">
                      <thead>
                        <tr>
                          <th>Type / Code</th>
                          ${stonesHaveShape ? `<th>Shape</th>` : ""}
                          ${stonesHaveSize ? `<th>Size</th>` : ""}
                          <th class="col-num">Pcs</th>
                          <th class="col-num">Weight</th>
                          <th class="col-num">Rate</th>
                          <th class="col-num">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${stones
          .map(
            (s) => `<tr>
                              <td>${escapeHtml(formatStoneName(s.code))}</td>
                              ${stonesHaveShape ? `<td>${escapeHtml(s.shape || "—")}</td>` : ""}
                              ${stonesHaveSize ? `<td>${escapeHtml(s.size || "—")}</td>` : ""}
                              <td class="col-num">${s.pcs ?? "—"}</td>
                              <td class="col-num">${s.weight != null ? `${formatNum(s.weight, 2)} ct` : "—"}</td>
                              <td class="col-num">${s.rate != null ? `${formatINR(s.rate)} / ct` : "—"}</td>
                              <td class="col-num">${formatINR(s.amount)}</td>
                            </tr>`
          )
          .join("")}
                        <tr class="stone-total diamond-total">
                          <td>Total</td>
                          ${stonesHaveShape ? `<td>—</td>` : ""}
                          ${stonesHaveSize ? `<td>—</td>` : ""}
                          <td class="col-num">${stoneSummaryPcs}</td>
                          <td class="col-num">${formatNum(stoneSummaryWt, 2)} ct</td>
                          <td class="col-num">—</td>
                          <td class="col-num">${formatINR(stoneSummaryAmt)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>`
        : ""
      }
        </div>
        <div class="piece-col piece-col-media">${images.length > 0
        ? `<div class="piece-visual">
                <button type="button" class="image-open" data-image-index="0" aria-label="Enlarge product image">
                  <img id="mainProductImg" src="${escapeHtml(images[0])}" alt="${escapeHtml(subCategory)}">
                </button>
                ${images.length > 1
          ? `<div class="piece-thumbnails">
                        ${images
            .map(
              (src, idx) => `
                            <button type="button" class="piece-thumb-btn ${idx === 0 ? "is-active" : ""}" data-image-index="${idx}" aria-label="View photo ${idx + 1}">
                              <img src="${escapeHtml(src)}" alt="Thumbnail ${idx + 1}">
                            </button>`
            )
            .join("")}
                      </div>`
          : ""
        }
                <p class="zoom-hint">Click image to enlarge${images.length > 1 ? ` · ${images.length} photos` : ""}</p>
              </div>`
        : ""
      }</div>
      </article>`;

    // Arrange the result as one clear product story: image, details, price, diamonds, stones.
    const infoColumn = productResult.querySelector(".piece-col-info");
    const mediaColumn = productResult.querySelector(".piece-col-media");
    const priceBreakdown = productResult.querySelector(".price-breakdown-accordion");
    const diamondListing = productResult.querySelector(".diamonds-accordion");
    const stoneListing = productResult.querySelector(".stones-accordion");
    const productDetails =
      infoColumn?.querySelector(".product-details-accordion") ||
      infoColumn?.querySelector(".product-accordion");
    const productImage = mediaColumn?.querySelector(".piece-visual");
    if (infoColumn) {
      if (productImage) infoColumn.prepend(productImage);
      if (productDetails && priceBreakdown) productDetails.after(priceBreakdown);
      if (priceBreakdown && diamondListing) priceBreakdown.after(diamondListing);
      else if (productDetails && diamondListing) productDetails.after(diamondListing);
      if (diamondListing && stoneListing) diamondListing.after(stoneListing);
      else if (priceBreakdown && stoneListing) priceBreakdown.after(stoneListing);
      else if (productDetails && stoneListing) productDetails.after(stoneListing);
    }
    if (mediaColumn) mediaColumn.remove();

    galleryImages = images;
    galleryTitle = subCategory;
    galleryIndex = 0;

    const mainImg = productResult.querySelector("#mainProductImg");
    const openBtn = productResult.querySelector(".image-open");
    const thumbBtns = productResult.querySelectorAll(".piece-thumb-btn");

    if (openBtn) {
      openBtn.addEventListener("click", () => openPreview(galleryIndex));
    }

    thumbBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.imageIndex) || 0;
        galleryIndex = idx;
        if (mainImg && galleryImages[idx]) {
          mainImg.src = galleryImages[idx];
        }
        thumbBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
      });
    });

    const b2bTriggerBtn = productResult.querySelector("#b2bTriggerBtn");
    const b2bPromptBox = productResult.querySelector("#b2bPromptBox");
    const b2bCancelBtn = productResult.querySelector("#b2bCancelBtn");
    const b2bForm = productResult.querySelector("#b2bForm");
    const b2bPasswordInput = productResult.querySelector("#b2bPasswordInput");
    const b2bTogglePwBtn = productResult.querySelector("#b2bTogglePwBtn");
    const b2bErrorMsg = productResult.querySelector("#b2bErrorMsg");
    const b2bSubmitBtn = productResult.querySelector("#b2bSubmitBtn");
    const b2bExitBtn = productResult.querySelector("#b2bExitBtn");

    if (b2bTriggerBtn && b2bPromptBox) {
      b2bTriggerBtn.addEventListener("click", () => {
        b2bTriggerBtn.hidden = true;
        b2bPromptBox.hidden = false;
        b2bPasswordInput?.focus();
      });
    }

    if (b2bCancelBtn && b2bPromptBox && b2bTriggerBtn) {
      b2bCancelBtn.addEventListener("click", () => {
        b2bPromptBox.hidden = true;
        b2bTriggerBtn.hidden = false;
        if (b2bErrorMsg) b2bErrorMsg.hidden = true;
        if (b2bPasswordInput) b2bPasswordInput.value = "";
      });
    }

    if (b2bTogglePwBtn && b2bPasswordInput) {
      b2bTogglePwBtn.addEventListener("click", () => {
        const isPw = b2bPasswordInput.type === "password";
        b2bPasswordInput.type = isPw ? "text" : "password";
        b2bTogglePwBtn.setAttribute("aria-label", isPw ? "Hide password" : "Show password");
        const eyeOpen = b2bTogglePwBtn.querySelector(".eye-open");
        const eyeClosed = b2bTogglePwBtn.querySelector(".eye-closed");
        if (eyeOpen) eyeOpen.hidden = isPw;
        if (eyeClosed) eyeClosed.hidden = !isPw;
      });
    }

    if (b2bForm) {
      b2bForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const secretCode = (b2bPasswordInput?.value || "").trim();
        if (!secretCode) return;

        if (b2bSubmitBtn) {
          b2bSubmitBtn.disabled = true;
          b2bSubmitBtn.textContent = "Verifying…";
        }
        if (b2bErrorMsg) b2bErrorMsg.hidden = true;

        const targetCode = jewelsCode || currentSearchCode || codeInput.value;

        try {
          const data = await lookupProduct(targetCode, "b2b", secretCode);
          if (data.success && isProduct(data.product)) {
            isB2BMode = true;
            if (data.product.show_b2b === undefined && data.show_b2b !== undefined) {
              data.product.show_b2b = data.show_b2b;
            }
            if (data.product.pure_metal_rate_gst === undefined && data.pure_metal_rate_gst !== undefined) {
              data.product.pure_metal_rate_gst = data.pure_metal_rate_gst;
            }
            renderProduct(data.product, { isB2B: true });
          } else {
            if (b2bErrorMsg) {
              b2bErrorMsg.textContent = data.message || "Invalid code.";
              b2bErrorMsg.hidden = false;
            }
            b2bPasswordInput?.select();
          }
        } catch {
          if (b2bErrorMsg) {
            b2bErrorMsg.textContent = "Failed to verify breakup code. Try again.";
            b2bErrorMsg.hidden = false;
          }
        } finally {
          if (b2bSubmitBtn) {
            b2bSubmitBtn.disabled = false;
            b2bSubmitBtn.textContent = "Unlock";
          }
        }
      });
    }

    if (b2bExitBtn) {
      b2bExitBtn.addEventListener("click", () => {
        isB2BMode = false;
        const targetCode = jewelsCode || currentSearchCode || codeInput.value;
        fetchProduct(targetCode);
      });
    }

    setResultView();
    setMode("search", { keepFocus: false });
  };

  const isProduct = (product) =>
    product &&
    typeof product === "object" &&
    (product.jewels_code || product.style_no || product.huid_no || product.igi_no || product.product_info);

  const lookupProduct = async (code, type = "", breakupCode = "") => {
    let url = `/api/product?search=${encodeURIComponent(code)}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;
    if (breakupCode) url += `&code=${encodeURIComponent(breakupCode)}`;
    const res = await fetch(url);
    const data = await res.json();
    return data;
  };

  const fetchProduct = async (rawCode, options = {}) => {
    const code = extractCode(rawCode);
    if (!code) {
      hasProduct = false;
      body.classList.remove("view-home");
      body.classList.add("view-result");
      setMode("search", { keepFocus: false });
      showError("", "invalid");
      return;
    }
    if (isFetching) return;

    hideError();
    isFetching = true;
    loadingState.hidden = false;
    productResult.innerHTML = "";
    currentSearchCode = code;
    codeInput.value = code;
    setMode("search", { keepFocus: false });

    try {
      const data = await lookupProduct(code, options.type, options.breakupCode);
      if (data.success && isProduct(data.product)) {
        currentSearchCode = code;
        codeInput.value = code;
        isB2BMode = options.type === "b2b";
        hideError();
        if (data.product.show_b2b === undefined && data.show_b2b !== undefined) {
          data.product.show_b2b = data.show_b2b;
        }
        if (data.product.pure_metal_rate_gst === undefined && data.pure_metal_rate_gst !== undefined) {
          data.product.pure_metal_rate_gst = data.pure_metal_rate_gst;
        }
        renderProduct(data.product, { isB2B: isB2BMode });
      } else {
        hasProduct = false;
        body.classList.remove("view-home");
        body.classList.add("view-result");
        setMode("search", { keepFocus: false });
        showError(data.message || "Product not found.", "not-found", code);
      }
    } catch {
      hasProduct = false;
      body.classList.remove("view-home");
      body.classList.add("view-result");
      setMode("search", { keepFocus: false });
      showError("", "network", code);
    } finally {
      isFetching = false;
      loadingState.hidden = true;
    }
  };

  const stopScanner = () => {
    scanning = false;
    detecting = false;
    if (scanRaf) {
      cancelAnimationFrame(scanRaf);
      scanRaf = 0;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video.srcObject = null;
    scannerFrame?.classList.remove("is-live");
    scannerBox.hidden = true;
    scanResult.textContent = "Hold the jewellery tag close, within the frame";
  };

  const fillCameraList = async (selectedId) => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    cameraSelect.innerHTML = cams
      .map((cam, i) => {
        const label = cam.label || `Camera ${i + 1}`;
        const selected = cam.deviceId === selectedId ? "selected" : "";
        return `<option value="${cam.deviceId}" ${selected}>${label}</option>`;
      })
      .join("");
    cameraSelect.hidden = cams.length < 2;
    const wrap = cameraSelect.closest(".camera-select-wrap");
    if (wrap) wrap.hidden = cams.length < 2;
  };

  const openCamera = async (deviceId) => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }

    const base = {
      audio: false,
      video: deviceId
        ? {
          deviceId: { exact: deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        }
        : {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia(base);
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    await video.play();
    scannerFrame?.classList.add("is-live");
    const track = stream.getVideoTracks()[0];
    await fillCameraList(track?.getSettings?.().deviceId);
  };

  const decodeCrop = (ctx, videoEl, xRatio, yRatio, wRatio, hRatio, outW) => {
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (!vw || !vh) return null;
    const sx = Math.floor(vw * xRatio);
    const sy = Math.floor(vh * yRatio);
    const sw = Math.max(32, Math.floor(vw * wRatio));
    const sh = Math.max(32, Math.floor(vh * hRatio));
    const outH = Math.max(32, Math.round((outW * sh) / sw));
    canvas.width = outW;
    canvas.height = outH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, outW, outH);
    return ctx.getImageData(0, 0, outW, outH);
  };

  const tryJsQR = (imageData) => {
    if (!imageData || typeof jsQR !== "function") return null;
    const qr = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });
    return qr?.data || null;
  };

  const detectOnce = async (ctx) => {
    if (barcodeDetector) {
      try {
        const codes = await barcodeDetector.detect(video);
        if (codes?.[0]?.rawValue) return codes[0].rawValue;
      } catch {
        /* keep jsQR fallback */
      }
    }

    const crops = [
      decodeCrop(ctx, video, 0.22, 0.18, 0.56, 0.64, 720),
      decodeCrop(ctx, video, 0.3, 0.26, 0.4, 0.48, 640),
      decodeCrop(ctx, video, 0.34, 0.3, 0.32, 0.4, 560),
    ];

    for (const imageData of crops) {
      const value = tryJsQR(imageData);
      if (value) return value;
    }
    return null;
  };

  const scanLoop = async (ctx) => {
    if (!scanning) return;
    if (video.readyState >= video.HAVE_CURRENT_DATA && !detecting && !isFetching) {
      detecting = true;
      try {
        const value = await detectOnce(ctx);
        if (value && scanning) {
          scanResult.textContent = "Tag found";
          stopScanner();
          setMode("search", { keepFocus: false });
          fetchProduct(value);
          return;
        }
      } catch {
        /* continue scanning */
      }
      detecting = false;
    }
    scanRaf = requestAnimationFrame(() => scanLoop(ctx));
  };

  const startScanner = async () => {
    hideError();
    scannerBox.hidden = false;
    scanResult.textContent = "Starting camera…";

    if (!navigator.mediaDevices?.getUserMedia) {
      scanResult.textContent = "Camera is not supported in this browser. Enter the code instead.";
      return;
    }

    try {
      if ("BarcodeDetector" in window) {
        try {
          barcodeDetector = new BarcodeDetector({ formats: ["qr_code"] });
        } catch {
          barcodeDetector = null;
        }
      }

      await openCamera(cameraSelect.value || undefined);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      scanning = true;
      scanResult.textContent = "Hold the jewellery tag close, within the frame";
      scanLoop(ctx);
    } catch {
      scanResult.textContent = "Camera access denied. Allow camera, or enter the code instead.";
    }
  };

  cameraSelect.addEventListener("change", async () => {
    if (currentMode !== "scan") return;
    scanning = false;
    detecting = false;
    if (scanRaf) cancelAnimationFrame(scanRaf);
    scanResult.textContent = "Switching camera…";
    try {
      await openCamera(cameraSelect.value);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      scanning = true;
      scanResult.textContent = "Hold the jewellery tag close, within the frame";
      scanLoop(ctx);
    } catch {
      scanResult.textContent = "Could not switch camera.";
    }
  });

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    fetchProduct(codeInput.value);
  });

  codeInput.addEventListener("input", () => {
    const start = codeInput.selectionStart;
    const end = codeInput.selectionEnd;
    codeInput.value = codeInput.value.toUpperCase();
    if (start != null && end != null) {
      codeInput.setSelectionRange(start, end);
    }
  });

  modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
  });

  scanQuickBtn.addEventListener("click", () => setMode("scan"));

  cancelScanBtn.addEventListener("click", () => setMode("search"));
  newLookupBtn.addEventListener("click", () => {
    hideError();
    closePreview();
    setHomeView();
  });

  errorRetry.addEventListener("click", () => {
    hideError();
    setMode("search");
    codeInput.focus();
    codeInput.select();
  });

  errorScan.addEventListener("click", () => {
    hideError();
    setMode("scan");
  });

  previewClose.addEventListener("click", closePreview);
  previewPrev.addEventListener("click", () => stepPreview(-1));
  previewNext.addEventListener("click", () => stepPreview(1));
  imagePreview.addEventListener("click", (e) => {
    if (e.target === imagePreview) closePreview();
  });
  document.addEventListener("keydown", (e) => {
    if (imagePreview.hidden) return;
    if (e.key === "Escape") closePreview();
    if (e.key === "ArrowLeft") stepPreview(-1);
    if (e.key === "ArrowRight") stepPreview(1);
  });

  window.addEventListener("beforeunload", stopScanner);
})();
