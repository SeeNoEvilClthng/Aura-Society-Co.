// Black Friday / Cyber Monday sale bar with a live countdown. It switches itself on
// and off by date (US Eastern), so nothing needs to be redeployed on the day.
// Preview any time with ?sale=teaser or ?sale=live in the address bar.
const SALE = {
  // Teaser: builds the email list the week before.
  teaserStart: "2026-11-20T00:00:00-05:00",
  teaserText: "Black Friday starts soon. Join the VIP list for first access",
  teaserLink: "index.html#vip",
  // The sale itself: Black Friday through the end of Cyber Monday.
  start: "2026-11-27T00:00:00-05:00",
  end: "2026-12-01T00:00:00-05:00",
  saleText: "Black Friday: 15% off everything with code BLACKFRIDAY",
  saleLink: "gifts.html"
};

(function showSaleBar() {
  const preview = new URLSearchParams(window.location.search).get("sale");
  const now = Date.now();
  const teaserStart = Date.parse(SALE.teaserStart);
  const start = Date.parse(SALE.start);
  const end = Date.parse(SALE.end);

  let mode = "";
  if (preview === "teaser" || (now >= teaserStart && now < start)) mode = "teaser";
  if (preview === "live" || (now >= start && now < end)) mode = "live";
  if (!mode) return;

  const target = mode === "live" ? (preview ? now + 3 * 86400000 + 7654321 : end) : (preview ? now + 6 * 86400000 + 4321000 : start);
  const bar = document.createElement("a");
  bar.className = `sale-bar sale-bar-${mode}`;
  bar.href = mode === "live" ? SALE.saleLink : SALE.teaserLink;
  bar.innerHTML = `<span class="sale-bar-text"></span><span class="sale-bar-clock" aria-label="Time left"></span>`;
  bar.querySelector(".sale-bar-text").textContent = mode === "live" ? SALE.saleText : SALE.teaserText;

  const clock = bar.querySelector(".sale-bar-clock");
  const pad = (value) => String(value).padStart(2, "0");
  const tick = () => {
    const left = Math.max(0, target - Date.now());
    if (!left && !preview) {
      bar.remove();
      return;
    }
    const days = Math.floor(left / 86400000);
    const hours = Math.floor(left / 3600000) % 24;
    const minutes = Math.floor(left / 60000) % 60;
    const seconds = Math.floor(left / 1000) % 60;
    clock.textContent = `${mode === "live" ? "Ends in" : "Starts in"} ${days ? `${days}d ` : ""}${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };
  tick();
  setInterval(tick, 1000);

  const insert = () => document.body.insertBefore(bar, document.body.firstChild);
  if (document.body) insert();
  else document.addEventListener("DOMContentLoaded", insert);
})();
