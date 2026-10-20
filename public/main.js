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

  const escapeHtml = (str) => {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  };

  const showError = (message, kind = "not-found") => {
    const query = (codeInput.value || "").trim();
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

  const renderProduct = (product) => {
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

    const jewelsCode = product.jewels_code || "";
    const styleNo = product.style_no || "";
    const igiNo = product.igi_no || "";
    const huidNo = product.huid_no || "";
    const metalName = product.metal || info.Metal || "";
    const purityVal = product.metal_putiry ?? product.metal_purity;
    const purityStr = purityVal != null ? `${purityVal}%` : (info.Karatage || "");
    const diamondClarity =
      product.diamond_clarity ||
      info.diamond_clarity ||
      diamonds.find((d) => d.clarity || d.diamond_clarity)?.clarity ||
      diamonds.find((d) => d.clarity || d.diamond_clarity)?.diamond_clarity ||
      "";

    const metalDisplay = metalName || "";

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

    const specRows = [
      jewelsCode && ["Jewels code", escapeHtml(jewelsCode)],
      styleDisplayVal && ["Style no.", escapeHtml(styleDisplayVal)],
      huidNo && ["HUID", escapeHtml(huidNo)],
      igiNo && ["IGI certificate", escapeHtml(igiNo)],
      metalName && ["Metal", escapeHtml(metalName)],
      purityStr && ["Purity", escapeHtml(purityStr)],
      product.metal_gwt != null && ["Gross weight (GWT)", `${formatNum(product.metal_gwt, 2)} g`],
      (product.metal_nwt != null || info.metal_weight != null) && [
        "Net weight (NWT)",
        `${formatNum(product.metal_nwt ?? info.metal_weight, 2)} g`,
      ],
      product.metal_rate != null && [
        "Metal rate",
        `${formatINR(product.metal_rate)} / g`,
      ],
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

    const priceRows = [];

    const metalPrice = product.metal_total_price ?? price.metal?.metal_price;
    if (metalPrice != null) {
      const netWt = product.metal_nwt ?? price.metal?.metal_weight;
      const rateStr = product.metal_rate != null ? ` @ ${formatINR(product.metal_rate)}/g` : "";
      const wtStr = netWt != null ? ` (${formatNum(netWt, 2)} g${rateStr})` : "";
      priceRows.push([`Metal${wtStr}`, formatINR(metalPrice)]);
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
      let diaLabel = "Diamonds";
      if (diaSummaryPcs > 0 && diaSummaryWt > 0) {
        diaLabel = `Diamonds (${diaSummaryPcs} pcs · ${formatNum(diaSummaryWt, 3)} ct)`;
      } else if (diaSummaryWt > 0) {
        diaLabel = `Diamonds (${formatNum(diaSummaryWt, 3)} ct)`;
      }
      priceRows.push([diaLabel, formatINR(diaPrice)]);
    }

    const labourAmt =
      product.total_labour ??
      product.labour?.amount ??
      price.manufacturing_price?.manufacturing_price;
    if (labourAmt != null) {
      const labourRate = product.labour?.rate;
      const labourLabel = labourRate
        ? `Labour / Making (@ ${formatINR(labourRate)}/g)`
        : "Labour / Making charges";
      priceRows.push([labourLabel, formatINR(labourAmt)]);
    }

    if (Array.isArray(product.other_charges) && product.other_charges.length > 0) {
      product.other_charges.forEach((charge) => {
        const code = charge.code || "Other";
        priceRows.push([`${code} charge`, formatINR(charge.amount)]);
      });
    } else if (product.total_other_charges != null && product.total_other_charges > 0) {
      priceRows.push(["Other charges", formatINR(product.total_other_charges)]);
    }

    const colourStones = product.colour_stone || [];
    if (price.colour_stone && price.colour_stone.colour_stone_count > 0) {
      priceRows.push([
        `Colour stone · ${price.colour_stone.colour_stone_count} pcs`,
        formatINR(price.colour_stone.colour_stone_price),
      ]);
    } else if (colourStones.length > 0) {
      colourStones.forEach((cs) => {
        priceRows.push([
          `Colour stone (${cs.colour_stone_count ?? 1} pcs)`,
          formatINR(cs.total_amount),
        ]);
      });
    }

    if (product.total_price != null && product.gst_amount != null) {
      priceRows.push(["Subtotal (Excl. GST)", formatINR(product.total_price)]);
    }

    if (product.gst_amount != null) {
      priceRows.push(["GST", formatINR(product.gst_amount)]);
    }

    const grandTotal = product.grand_total ?? product.total_price ?? price.total;
    if (grandTotal != null) {
      priceRows.push(["Grand total", formatINR(grandTotal), true]);
    }

    const hasDiamonds = diamonds.length > 0;

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
              <h2 class="piece-title">
                ${styleDisplayVal
        ? `<span class="piece-title-label">Style</span> <span class="piece-title-value">${escapeHtml(styleDisplayVal)}</span>`
        : `<span class="piece-title-value">${escapeHtml(subCategory || "Jewellery Piece")}</span>`
      }
              </h2>
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
          ? `<div class="spec-card">
                            <span class="spec-label">Metal</span>
                            <b class="spec-value">${escapeHtml(metalDisplay)}</b>
                          </div>`
          : ""
        }
                    ${diamondClarity
          ? `<div class="spec-card">
                            <span class="spec-label">Diamond Clarity</span>
                            <b class="spec-value">${escapeHtml(diamondClarity)}</b>
                          </div>`
          : ""
        }
                  </div>`
        : ""
      }
          </div>
          ${specRows.length
        ? `<details class="product-accordion">
                  <summary>Product details</summary>
                  <ul class="detail-list">${specRows.map(([label, value]) => listRow(label, value)).join("")}</ul>
                </details>`
        : ""
      }
          ${priceRows.length
        ? `<details class="product-accordion price-breakdown-accordion">
                  <summary>Price breakdown</summary>
                  <ul class="detail-list">
                    ${priceRows
          .map(
            ([label, value, total]) =>
              `<li class="${total ? "total" : ""}"><span>${escapeHtml(label)}</span><strong>${value}</strong></li>`
          )
          .join("")}
                  </ul>
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
                          <th>Pcs</th>
                          <th>Weight</th>
                          <th>Rate</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${diamonds
          .map(
            (d) => `<tr>
                              <td>${escapeHtml(d.clarity || d.diamond_clarity || diamondClarity || "—")}</td>
                              <td>${escapeHtml(d.shape || d.diamond_shape || "Round")}</td>
                              <td>${escapeHtml(d.size?.diamond_slieve_size || d.size?.mm_size || d.size || "—")}</td>
                              <td>${d.pcs ?? d.diamond_count ?? "—"}</td>
                              <td>${formatNum(d.weight ?? d.diamond_weight, 3)} ct</td>
                              <td>${d.rate ? formatINR(d.rate) : "—"}</td>
                              <td>${formatINR(d.amount ?? d.total_price)}</td>
                            </tr>`
          )
          .join("")}
                        <tr class="diamond-total">
                          <td>Total</td>
                          <td>—</td>
                          <td>—</td>
                          <td>${diaSummaryPcs}</td>
                          <td>${formatNum(diaSummaryWt, 3)} ct</td>
                          <td>—</td>
                          <td>${formatINR(diaSummaryAmt)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>`
        : ""
      }
          ${colourStones.length
        ? `<details class="product-accordion"><summary>Colour stones</summary><ul class="detail-list">${colourStones.map((cs) => listRow(`${cs.colour_stone_count ?? 0} pcs`, formatINR(cs.total_amount))).join("")}</ul></details>`
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

    // Arrange the result as one clear product story: image, details, price, diamonds.
    const infoColumn = productResult.querySelector(".piece-col-info");
    const mediaColumn = productResult.querySelector(".piece-col-media");
    const priceBreakdown = productResult.querySelector(".price-breakdown-accordion");
    const diamondListing = productResult.querySelector(".diamonds-accordion");
    const productDetails = infoColumn?.querySelector(".product-accordion");
    const productImage = mediaColumn?.querySelector(".piece-visual");
    if (infoColumn) {
      if (productImage) infoColumn.prepend(productImage);
      if (productDetails && priceBreakdown) productDetails.after(priceBreakdown);
      if (priceBreakdown && diamondListing) priceBreakdown.after(diamondListing);
      else if (productDetails && diamondListing) productDetails.after(diamondListing);
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
    setResultView();
    setMode("search", { keepFocus: false });
  };

  const isProduct = (product) =>
    product &&
    typeof product === "object" &&
    (product.jewels_code || product.style_no || product.huid_no || product.igi_no || product.product_info);

  const lookupProduct = async (code) => {
    const res = await fetch(`/api/product?search=${encodeURIComponent(code)}`);
    const data = await res.json();
    return data;
  };

  const fetchProduct = async (rawCode) => {
    const code = extractCode(rawCode);
    if (!code) {
      showError("", "invalid");
      return;
    }
    if (isFetching) return;

    hideError();
    isFetching = true;
    loadingState.hidden = false;
    productResult.innerHTML = "";
    stopScanner();

    try {
      const data = await lookupProduct(code);
      if (data.success && isProduct(data.product)) {
        codeInput.value = code;
        hideError();
        renderProduct(data.product);
      } else {
        hasProduct = false;
        body.classList.remove("view-home");
        body.classList.add("view-result");
        showError(data.message || "Product not found.", "not-found");
      }
    } catch {
      hasProduct = false;
      body.classList.remove("view-home");
      body.classList.add("view-result");
      showError("", "network");
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
