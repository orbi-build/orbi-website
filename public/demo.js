(function () {
  "use strict";

  const COPY = {
    en: {
      title: "Log active Issue context when Runner is stopped",
      steps: ["Issue", "Claim", "Tests", "Review", "Merge", "Release"],
      scenes: [
        { t: 0, clock: "13:02", labels: ["ai-ready"], rail: 0, log: "Ticket opened. The queue is a label." },
        { t: 1600, clock: "13:04", labels: ["ai-in-progress"], rail: 1, log: "Claimed. Fresh worktree, not main." },
        { t: 3400, clock: "13:18", labels: ["ai-in-progress"], rail: 2, log: "Tests first. Full suite green." },
        { t: 5200, clock: "13:41", labels: ["ai-pr-opened"], rail: 3, log: "A second session reviews — and patches." },
        { t: 7000, clock: "13:44", labels: ["ai-merged"], rail: 4, log: "Merged. Only the reviewed commit.", pr: "PR #193 merged" },
        { t: 9000, clock: "13:51", labels: ["ai-merged", "ai-release"], rail: 5, log: "Tagged v0.2.0. No force-push.", pr: "v0.2.0 released" },
      ],
      hold: 2800,
    },
    zh: {
      title: "Runner 停掉时记下当前 Issue",
      steps: ["开票", "领取", "测试", "审查", "合并", "发版"],
      scenes: [
        { t: 0, clock: "13:02", labels: ["ai-ready"], rail: 0, log: "票开了。排队靠的是标签。" },
        { t: 1600, clock: "13:04", labels: ["ai-in-progress"], rail: 1, log: "领走了。单独的工作树，不动 main。" },
        { t: 3400, clock: "13:18", labels: ["ai-in-progress"], rail: 2, log: "先跑测试。全绿才往下。" },
        { t: 5200, clock: "13:41", labels: ["ai-pr-opened"], rail: 3, log: "另一场审查同一份改动，能改就改。" },
        { t: 7000, clock: "13:44", labels: ["ai-merged"], rail: 4, log: "合进去了。只能是刚审过的那次提交。", pr: "PR #193 已合并" },
        { t: 9000, clock: "13:51", labels: ["ai-merged", "ai-release"], rail: 5, log: "打上 v0.2.0。标签不会被强推。", pr: "v0.2.0 已发布" },
      ],
      hold: 2800,
    },
  };

  function prefersReduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function bootDemo(root) {
    const lang = COPY[root.getAttribute("data-lang")] ? root.getAttribute("data-lang") : "en";
    const copy = COPY[lang];
    const titleEl = root.querySelector("[data-title]");
    const labelsEl = root.querySelector("[data-labels]");
    const logEl = root.querySelector("[data-log]");
    const railEl = root.querySelector("[data-rail]");
    const prEl = root.querySelector("[data-pr]");
    const clockEl = root.querySelector("[data-clock]");
    const timers = [];

    titleEl.textContent = copy.title;
    railEl.innerHTML = copy.steps
      .map(function (name, i) {
        return "<li data-i=\"" + i + "\">" + name + "</li>";
      })
      .join("");

    function clearTimers() {
      while (timers.length) {
        clearTimeout(timers.pop());
      }
    }

    function paint(scene) {
      clockEl.textContent = scene.clock;
      labelsEl.innerHTML = scene.labels
        .map(function (name) {
          return "<span class=\"lab " + name + "\">" + name + "</span>";
        })
        .join("");
      railEl.querySelectorAll("li").forEach(function (node) {
        const i = Number(node.getAttribute("data-i"));
        node.classList.toggle("on", i <= scene.rail);
        node.classList.toggle("now", i === scene.rail);
      });
      const line = document.createElement("li");
      line.innerHTML = "<em>" + scene.clock + "</em> " + scene.log;
      logEl.appendChild(line);
      while (logEl.children.length > 4) {
        logEl.removeChild(logEl.firstChild);
      }
      if (scene.pr) {
        prEl.hidden = false;
        prEl.textContent = scene.pr;
        prEl.classList.add("in");
      }
    }

    function reset() {
      logEl.innerHTML = "";
      prEl.hidden = true;
      prEl.classList.remove("in");
      prEl.textContent = "";
      railEl.querySelectorAll("li").forEach(function (node) {
        node.classList.remove("on", "now");
      });
    }

    function play() {
      clearTimers();
      reset();
      copy.scenes.forEach(function (scene) {
        timers.push(setTimeout(function () {
          paint(scene);
        }, scene.t));
      });
      const last = copy.scenes[copy.scenes.length - 1];
      timers.push(setTimeout(play, last.t + copy.hold));
    }

    if (prefersReduced()) {
      reset();
      copy.scenes.forEach(paint);
      return;
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        clearTimers();
      } else {
        play();
      }
    });
    play();
  }

  function bootFlow(list) {
    const items = Array.prototype.slice.call(list.querySelectorAll("li"));
    if (!items.length) {
      return;
    }
    let i = 0;
    function tick() {
      items.forEach(function (node, j) {
        node.classList.toggle("on", j <= i);
        node.classList.toggle("now", j === i);
      });
      i = (i + 1) % items.length;
    }
    tick();
    if (prefersReduced()) {
      i = items.length - 1;
      tick();
      return;
    }
    setInterval(tick, 1400);
  }

  function formatStarted(iso, lang) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    if (lang === "zh") {
      return date.getUTCFullYear() + "年" + (date.getUTCMonth() + 1) + "月" + date.getUTCDate() + "日";
    }
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return date.getUTCDate() + " " + months[date.getUTCMonth()] + " " + date.getUTCFullYear();
  }

  function countUp(el, target, duration) {
    const end = Number(target);
    if (!el || !Number.isFinite(end)) {
      return;
    }
    if (prefersReduced() || end === 0) {
      el.textContent = String(end);
      return;
    }
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(end * eased));
      if (t < 1) {
        requestAnimationFrame(frame);
      }
    }
    requestAnimationFrame(frame);
  }

  function bootStats(root) {
    const lang = root.getAttribute("data-lang") === "zh" ? "zh" : "en";
    fetch("/stats")
      .then(function (res) {
        if (!res.ok) {
          throw new Error("stats " + res.status);
        }
        return res.json();
      })
      .then(function (stats) {
        const days = Math.max(
          0,
          Math.floor((Date.now() - Date.parse(stats.started)) / 86400000),
        );
        const startedEl = root.querySelector("[data-started]");
        if (startedEl) {
          startedEl.textContent = formatStarted(stats.started, lang);
        }
        countUp(root.querySelector("[data-stat=\"days\"]"), days, 900);
        countUp(root.querySelector("[data-stat=\"issues\"]"), stats.issues_closed, 1100);
        countUp(root.querySelector("[data-stat=\"prs\"]"), stats.prs_merged, 1200);
        countUp(root.querySelector("[data-stat=\"releases\"]"), stats.releases, 800);
      })
      .catch(function () {
        root.querySelectorAll("[data-stat]").forEach(function (el) {
          el.textContent = "—";
        });
      });
  }

  document.querySelectorAll("#orbi-demo").forEach(bootDemo);
  document.querySelectorAll("[data-flow]").forEach(bootFlow);
  document.querySelectorAll("#orbi-stats").forEach(bootStats);
})();
