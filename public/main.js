(function () {
  const body = document.body;
  const codeInput = document.getElementById("codeInput");
  const searchForm = document.getElementById("searchForm");
  const cancelScanBtn = document.getElementById("cancelScanBtn");
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
    const images = product.inventory_images || [];
    const diamonds = (product.diamonds || []).filter((d) => d.diamond_clarity !== "Total");
    const diamondTotal = (product.diamonds || []).find((d) => d.diamond_clarity === "Total");
    const colourStones = product.colour_stone || [];
    const subCategory = info.sub_category || "Jewellery Piece";

    const specRows = [
      ["Metal", escapeHtml(info.Metal || "—")],
      ["Karatage", escapeHtml(info.Karatage || "—")],
      ["Metal weight", `${formatNum(info.metal_weight)} g`],
      ["Diamond weight", `${formatNum(info.total_diamond_weight, 2)} ct`],
      ["Total diamonds", String(info.total_diamonds ?? "—")],
      ["Clarity", escapeHtml(info.diamond_clarity || "—")],
      ["Style no.", escapeHtml(product.style_no || "—")],
      ["IGI", escapeHtml(product.igi_no || "—")],
      ["HUID", escapeHtml(product.huid_no || "—")],
    ];

    const priceRows = [
      price.metal && [
        `Metal · ${formatNum(price.metal.metal_weight)} g`,
        formatINR(price.metal.metal_price),
      ],
      price.diamond && [
        `Diamond · ${formatNum(price.diamond.diamond_weight, 3)} ct`,
        formatINR(price.diamond.diamond_price),
      ],
      price.manufacturing_price && [
        "Manufacturing",
        formatINR(price.manufacturing_price.manufacturing_price),
      ],
      price.colour_stone &&
        price.colour_stone.colour_stone_count > 0 && [
          `Colour stone · ${price.colour_stone.colour_stone_count} pcs`,
          formatINR(price.colour_stone.colour_stone_price),
        ],
      price.total && ["Grand total", formatINR(price.total), true],
    ].filter(Boolean);

    productResult.innerHTML = `
      <article class="piece-card">
        <div class="piece-col piece-col-media">
        ${
          images[0]
            ? `<div class="piece-visual">
                <button type="button" class="image-open" data-image-index="0" aria-label="Enlarge product image">
                  <img src="${escapeHtml(images[0])}" alt="${escapeHtml(subCategory)}">
                </button>
                <p class="zoom-hint">Click image to enlarge</p>
              </div>`
            : ""
        }
        <div class="list-block details-block">
          <h3>Product details</h3>
          <ul class="detail-list">
            ${specRows.map(([label, value]) => listRow(label, value)).join("")}
          </ul>
        </div>
        </div>
        <div class="piece-col piece-col-info">
        <div class="piece-intro">
        <div class="piece-head">
          <p class="piece-kicker">${escapeHtml(info.Category || "Collection")}</p>
          <h2 class="piece-title">${escapeHtml(subCategory)}</h2>
          <p class="piece-code">
            <span class="piece-code-label">Jewels code</span>
            <b class="piece-code-value">${escapeHtml(product.jewels_code)}</b>
          </p>
        </div>
        ${
          price.total
            ? `<div class="price-strip">
                <span class="price-label">Total value</span>
                <b class="price-amount"><span class="rupee">₹</span>${formatINRDigits(price.total)}</b>
              </div>`
            : ""
        }
        ${
          priceRows.length
            ? `<div class="list-block price-block">
                <h3>Price breakdown</h3>
                <ul class="detail-list">
                  ${priceRows
                    .map(([label, value, total]) =>
                      `<li class="${total ? "total" : ""}"><span>${escapeHtml(label)}</span><strong>${value}</strong></li>`
                    )
                    .join("")}
                </ul>
              </div>`
            : ""
        }
        </div>
        ${
          diamonds.length
            ? `<div class="list-block diamonds-block">
                <h3>Diamond list</h3>
                ${diamonds
                  .map(
                    (d) => `
                    <div class="diamond-item">
                      <div>
                        <strong>${escapeHtml(d.diamond_shape || "Round")} · ${escapeHtml(d.size?.mm_size || "—")} mm</strong>
                        <div class="meta">${d.diamond_count ?? 0} pcs · ${formatNum(d.diamond_weight, 3)} ct · ${escapeHtml(d.size?.diamond_slieve_size || "")}</div>
                      </div>
                      <div class="amt">${formatINR(d.total_price)}</div>
                    </div>`
                  )
                  .join("")}
                ${
                  diamondTotal
                    ? `<div class="diamond-item">
                        <div><strong>Total diamonds</strong><div class="meta">${diamondTotal.diamond_count} pcs · ${formatNum(diamondTotal.diamond_weight, 3)} ct</div></div>
                        <div class="amt">${formatINR(diamondTotal.total_price)}</div>
                      </div>`
                    : ""
                }
              </div>`
            : ""
        }
        ${
          colourStones.length
            ? `<div class="list-block stones-block">
                <h3>Colour stones</h3>
                <ul class="detail-list">
                  ${colourStones
                    .map(
                      (cs) =>
                        listRow(
                          `${cs.colour_stone_count ?? 0} pcs`,
                          formatINR(cs.total_amount)
                        )
                    )
                    .join("")}
                </ul>
              </div>`
            : ""
        }
        </div>
      </article>
    `;

    galleryImages = images;
    galleryTitle = subCategory;
    galleryIndex = 0;

    const openBtn = productResult.querySelector(".image-open");
    if (openBtn) {
      openBtn.addEventListener("click", () => openPreview(0));
    }

    setResultView();
    setMode("search", { keepFocus: false });
  };

  const isProduct = (product) =>
    product && (product.jewels_code || product.product_info || product.style_no);

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
