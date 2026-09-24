(() => {
  for (const form of document.querySelectorAll("[data-subscribe-form]")) {
    const status = form.querySelector("[data-subscribe-status]");
    const success = form.dataset.success;
    const invalid = form.dataset.invalid;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "";
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        const response = await fetch(form.action, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: new FormData(form),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error === "invalid_email" ? "invalid" : "unavailable");
        status.textContent = success;
        form.querySelector("input[type=email]").value = "";
      } catch (error) {
        status.textContent = error.message === "invalid" ? invalid : "Please try again.";
        button.disabled = false;
      }
    });
    if (new URLSearchParams(location.search).get("subscribed") === "1") status.textContent = success;
    if (new URLSearchParams(location.search).get("subscribe_error") === "invalid") status.textContent = invalid;
  }
})();
