(function () {
  "use strict";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function bootFactoryTrace(root) {
    const nodes = Array.prototype.slice.call(root.querySelectorAll("[data-trace-node]"));
    if (!nodes.length) {
      return;
    }

    let current = 0;
    let timer = null;

    function paint(index) {
      nodes.forEach(function (node, nodeIndex) {
        node.classList.toggle("active", nodeIndex <= index);
        node.setAttribute("aria-current", nodeIndex === index ? "step" : "false");
      });
      root.className = root.className.replace(/\s*trace-step-\d/g, "");
      root.classList.add("trace-step-" + index);
    }

    function advance() {
      paint(current);
      current = (current + 1) % nodes.length;
      timer = window.setTimeout(advance, current === 0 ? 2600 : 1450);
    }

    function stop() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    if (prefersReducedMotion()) {
      paint(nodes.length - 1);
      return;
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stop();
      } else if (timer === null) {
        current = 0;
        advance();
      }
    });

    advance();
  }

  function formatStarted(iso, lang) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    if (lang === "zh") {
      return date.getUTCFullYear() + "年" + (date.getUTCMonth() + 1) + "月" + date.getUTCDate() + "日启动";
    }
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return "since " + date.getUTCDate() + " " + months[date.getUTCMonth()] + " " + date.getUTCFullYear();
  }

  function countUp(element, target, duration) {
    const end = Number(target);
    if (!element || !Number.isFinite(end)) {
      return;
    }
    if (prefersReducedMotion() || end === 0) {
      element.textContent = String(end);
      return;
    }

    const start = performance.now();
    function frame(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = String(Math.round(end * eased));
      if (progress < 1) {
        window.requestAnimationFrame(frame);
      }
    }
    window.requestAnimationFrame(frame);
  }

  function bootStats(root) {
    const lang = root.getAttribute("data-lang") === "zh" ? "zh" : "en";
    fetch("/stats")
      .then(function (response) {
        if (!response.ok) {
          throw new Error("stats " + response.status);
        }
        return response.json();
      })
      .then(function (stats) {
        const days = Math.max(0, Math.floor((Date.now() - Date.parse(stats.started)) / 86400000));
        const started = root.querySelector("[data-started]");
        if (started) {
          started.textContent = formatStarted(stats.started, lang);
        }
        countUp(root.querySelector('[data-stat="days"]'), days, 900);
        countUp(root.querySelector('[data-stat="issues"]'), stats.issues_closed, 1100);
        countUp(root.querySelector('[data-stat="prs"]'), stats.prs_merged, 1200);
        countUp(root.querySelector('[data-stat="releases"]'), stats.releases, 800);
      })
      .catch(function () {
        root.querySelectorAll("[data-stat]").forEach(function (element) {
          element.textContent = "—";
        });
      });
  }

  document.querySelectorAll("#factory-trace").forEach(bootFactoryTrace);
  document.querySelectorAll("#orbi-stats").forEach(bootStats);
})();
