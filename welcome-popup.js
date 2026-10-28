// "10% off your first order" popup. Shows once a welcome code is configured
// (WELCOME_PROMO_CODE on the server), after 12 seconds or when a desktop visitor
// moves to leave. Dismissed visitors aren't asked again for 14 days, and
// subscribers never again. Preview with ?popup=preview.
(function welcomePopup() {
  const STORAGE_KEY = "auraSocietyWelcomePopup";
  const SNOOZE_DAYS = 14;
  const preview = new URLSearchParams(window.location.search).get("popup") === "preview";

  const state = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  })();
  const remember = (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {}
  };

  if (!preview && (state.subscribed || (state.dismissedAt && Date.now() - state.dismissedAt < SNOOZE_DAYS * 86400000))) return;

  const ready = preview
    ? Promise.resolve(true)
    : fetch("/api/subscribe?offer=1").then((response) => response.ok ? response.json() : {}).then((data) => Boolean(data.enabled)).catch(() => false);

  ready.then((enabled) => {
    if (!enabled) return;
    let shown = false;
    const show = () => {
      if (shown) return;
      shown = true;
      open();
    };
    setTimeout(show, preview ? 300 : 12000);
    document.addEventListener("mouseout", (event) => {
      if (!event.relatedTarget && event.clientY <= 0) show();
    });
  });

  function open() {
    const overlay = document.createElement("div");
    overlay.className = "welcome-popup";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "welcomeTitle");
    overlay.innerHTML = `
      <div class="welcome-card">
        <button class="welcome-close" type="button" aria-label="Close">&times;</button>
        <p class="welcome-kicker">Aura Society VIP</p>
        <h2 id="welcomeTitle">Get 10% Off Your First Order</h2>
        <p class="welcome-text">Join the VIP list for your code, plus early access to new drops and our Black Friday sale.</p>
        <form class="welcome-form" novalidate>
          <input type="email" name="email" placeholder="Your email address" autocomplete="email" required>
          <input type="text" name="website" tabindex="-1" autocomplete="off" class="welcome-trap" aria-hidden="true">
          <button class="primary-button" type="submit">Get my 10%</button>
        </form>
        <p class="welcome-message" role="status"></p>
        <p class="welcome-fine">By signing up you agree to receive marketing emails. Unsubscribe anytime.</p>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => {
      overlay.remove();
      if (!state.subscribed) remember({ ...state, dismissedAt: Date.now() });
    };
    overlay.querySelector(".welcome-close").addEventListener("click", close);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener("keydown", function onKey(event) {
      if (event.key === "Escape" && document.body.contains(overlay)) {
        close();
        document.removeEventListener("keydown", onKey);
      }
    });

    const form = overlay.querySelector(".welcome-form");
    const message = overlay.querySelector(".welcome-message");
    form.email.focus();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = form.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        message.textContent = "Enter a valid email address.";
        return;
      }
      const button = form.querySelector("button");
      button.disabled = true;
      message.textContent = "Signing you up...";
      try {
        const response = await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, website: form.website.value, source: "welcome-popup" })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Signup failed. Please try again.");
        state.subscribed = true;
        remember(state);
        if (typeof auraTrack === "function") auraTrack("sign_up", { method: "welcome_popup" });
        showCode(data.offer || (preview ? { code: "WELCOME10", text: "Use this code at checkout on your first order." } : null));
      } catch (error) {
        message.textContent = error.message;
        button.disabled = false;
      }
    });

    function showCode(offer) {
      const card = overlay.querySelector(".welcome-card");
      card.querySelector(".welcome-form").remove();
      card.querySelector(".welcome-fine").remove();
      card.querySelector("#welcomeTitle").textContent = "You're In!";
      card.querySelector(".welcome-text").textContent = offer ? offer.text : "Thanks for joining. Watch your inbox for exclusive offers.";
      message.textContent = "";
      if (offer) {
        const code = document.createElement("button");
        code.type = "button";
        code.className = "welcome-code";
        code.textContent = offer.code;
        code.title = "Copy code";
        code.addEventListener("click", () => {
          navigator.clipboard?.writeText(offer.code).then(() => {
            message.textContent = "Code copied.";
          }).catch(() => {});
        });
        card.querySelector(".welcome-text").after(code);
      }
      const shop = document.createElement("a");
      shop.className = "primary-button welcome-shop";
      shop.href = "collections.html";
      shop.textContent = "Start shopping";
      card.appendChild(shop);
    }
  }
})();
