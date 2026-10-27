const contactForm = document.querySelector("#contactForm");
const contactStatus = document.querySelector("#contactStatus");

// Opening help.html#returns (or any FAQ id) expands that answer.
function openLinkedAnswer() {
  const id = window.location.hash.slice(1);
  const answer = id && document.getElementById(id);
  if (answer?.tagName === "DETAILS") answer.open = true;
}

openLinkedAnswer();
window.addEventListener("hashchange", openLinkedAnswer);

contactForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = contactForm.querySelector("button[type=submit]");
  const payload = Object.fromEntries(new FormData(contactForm).entries());

  button.disabled = true;
  contactStatus.className = "contact-status";
  contactStatus.textContent = "Sending...";

  try {
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Your message couldn't be sent. Please try again.");

    contactForm.reset();
    contactStatus.classList.add("is-success");
    contactStatus.textContent = "Thanks! Your message was sent. We'll reply to your email soon.";
  } catch (error) {
    contactStatus.classList.add("is-error");
    contactStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
