(function () {
  "use strict";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function bootNavigation(header) {
    const toggle = header.querySelector("[data-menu-toggle]");
    const nav = header.querySelector("[data-primary-nav]");
    if (!toggle || !nav) {
      return;
    }

    function setOpen(open, restoreFocus) {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute(
        "aria-label",
        open ? toggle.getAttribute("data-label-close") : toggle.getAttribute("data-label-open"),
      );
      if (!open && restoreFocus) {
        toggle.focus();
      }
    }

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true", false);
    });

    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        setOpen(false, false);
      }
    });

    document.addEventListener("click", function (event) {
      if (!header.contains(event.target)) {
        setOpen(false, false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false, true);
      }
    });

    window.matchMedia("(min-width: 901px)").addEventListener("change", function (event) {
      if (event.matches) {
        setOpen(false, false);
      }
    });
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

  /* Draw the star history as a filled sparkline.
   *
   * The viewBox is 120x46 with a 3px inset so the endpoint dot and the
   * 1.5px stroke stay inside the box; preserveAspectRatio="none" lets the
   * curve stretch to whatever width the stats cell gets. Fewer than two
   * points is not a trend, so the block stays hidden.
   */
  function drawStarChart(root, stats) {
    const box = root.querySelector("[data-star-chart]");
    const history = stats && stats.star_history;
    if (!box || !Array.isArray(history) || history.length < 2) {
      return;
    }

    const svg = box.querySelector("svg");
    const W = 120;
    const H = 46;
    const pad = 3;
    const values = history.map(function (point) { return point.stars; });
    const max = Math.max.apply(null, values);
    const min = Math.min.apply(null, values);
    const span = max - min || 1;

    const points = values.map(function (value, index) {
      const x = pad + (index / (values.length - 1)) * (W - pad * 2);
      const y = H - pad - ((value - min) / span) * (H - pad * 2);
      return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
    });

    const line = points
      .map(function (p, i) { return (i === 0 ? "M" : "L") + p[0] + " " + p[1]; })
      .join(" ");
    const area = line + " L" + points[points.length - 1][0] + " " + (H - pad) +
      " L" + points[0][0] + " " + (H - pad) + " Z";
    const last = points[points.length - 1];

    const ns = "http://www.w3.org/2000/svg";
    function shape(tag, attrs) {
      const node = document.createElementNS(ns, tag);
      Object.keys(attrs).forEach(function (key) {
        node.setAttribute(key, attrs[key]);
      });
      return node;
    }

    svg.appendChild(shape("path", { class: "star-area", d: area }));
    svg.appendChild(shape("path", {
      class: "star-line",
      d: line,
      "vector-effect": "non-scaling-stroke",
    }));

    // The SVG stretches horizontally (preserveAspectRatio="none"), which
    // would squash a <circle> into an ellipse. Place the endpoint as an
    // element positioned in percentages instead, so it stays round at any
    // width.
    const dot = document.createElement("span");
    dot.className = "star-dot";
    dot.style.left = ((last[0] / W) * 100) + "%";
    dot.style.top = ((last[1] / H) * 100) + "%";
    box.querySelector(".star-plot").appendChild(dot);

    const total = box.querySelector("[data-star-total]");
    if (total) {
      countUp(total, stats.stars || values[values.length - 1], 2200);
    }
    box.hidden = false;
  }

  function bootStats(root) {
    const lang = root.getAttribute("data-lang") === "zh" ? "zh" : "en";
    let startedCounting = false;

    function startStats() {
      if (startedCounting) {
        return;
      }
      startedCounting = true;
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
          countUp(root.querySelector('[data-stat="days"]'), days, 2000);
          countUp(root.querySelector('[data-stat="issues"]'), stats.issues_closed, 2600);
          countUp(root.querySelector('[data-stat="prs"]'), stats.prs_merged, 2400);
          countUp(root.querySelector('[data-stat="releases"]'), stats.releases, 1800);
          drawStarChart(root, stats);
        })
        .catch(function () {
          root.querySelectorAll("[data-stat]").forEach(function (element) {
            element.textContent = "—";
          });
        });
    }

    if (!("IntersectionObserver" in window)) {
      startStats();
      return;
    }

    const observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) {
        observer.disconnect();
        startStats();
      }
    }, { threshold: 0.25 });
    observer.observe(root);
  }

  document.querySelectorAll(".site-header").forEach(bootNavigation);
  document.querySelectorAll("#factory-trace").forEach(bootFactoryTrace);
  document.querySelectorAll("#orbi-stats").forEach(bootStats);
})();
