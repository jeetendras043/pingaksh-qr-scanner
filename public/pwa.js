(function () {
  if (!("serviceWorker" in navigator)) return;

  const isSecure =
    location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!isSecure) return;

  navigator.serviceWorker.register("/sw.js").catch(() => {});

  const banner = document.getElementById("pwaBanner");
  const installBtn = document.getElementById("pwaInstallBtn");
  const closeBtn = document.getElementById("pwaDismissBtn");
  const text = document.getElementById("pwaBannerText");
  if (!banner || !installBtn || !closeBtn || !text) return;

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (standalone) return;

  const dismissed = sessionStorage.getItem("pwa-banner-dismissed") === "1";
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let deferredPrompt = null;

  const showBanner = (mode) => {
    if (dismissed) return;
    banner.hidden = false;
    if (mode === "ios") {
      text.textContent = "On iPhone/iPad: Share → Add to Home Screen to install this app.";
      installBtn.hidden = true;
    } else {
      text.textContent = "Install PINGAKSH on this device for faster lookup and camera scan.";
      installBtn.hidden = false;
    }
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    showBanner("chrome");
  });

  if (isIos) showBanner("ios");

  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    banner.hidden = true;
  });

  closeBtn.addEventListener("click", () => {
    banner.hidden = true;
    sessionStorage.setItem("pwa-banner-dismissed", "1");
  });
})();
