(function () {
  "use strict";

  const COPY = {
    en: {
      title: "Log active Issue context when Runner is stopped",
      steps: ["Issue", "Claim", "Implement", "Review", "Merge", "Release"],
      scenes: [
        { t: 0, clock: "13:02", labels: ["ai-ready"], rail: 0, log: "Issue opened. Queue is a GitHub label." },
        { t: 1600, clock: "13:04", labels: ["ai-in-progress"], rail: 1, log: "Runner claimed it. Isolated worktree." },
        { t: 3400, clock: "13:18", labels: ["ai-in-progress"], rail: 2, log: "Tests first. 100% line / branch." },
        { t: 5200, clock: "13:41", labels: ["ai-pr-opened"], rail: 3, log: "Independent review. Patched in session." },
        { t: 7000, clock: "13:44", labels: ["ai-merged"], rail: 4, log: "Merge · exact reviewed head.", pr: "PR #193 · MERGED" },
        { t: 9000, clock: "13:51", labels: ["ai-merged", "ai-release"], rail: 5, log: "Release Issue · tag v0.2.0 pushed.", pr: "v0.2.0 · annotated tag" },
      ],
      hold: 2800,
    },
    zh: {
      title: "Runner 停掉时记下当前 Issue",
      steps: ["Issue", "领取", "实现", "Review", "合并", "发布"],
      scenes: [
        { t: 0, clock: "13:02", labels: ["ai-ready"], rail: 0, log: "Issue 打开。队列就是 GitHub label。" },
        { t: 1600, clock: "13:04", labels: ["ai-in-progress"], rail: 1, log: "Runner 领取。隔离 worktree。" },
        { t: 3400, clock: "13:18", labels: ["ai-in-progress"], rail: 2, log: "先测试。100% line / branch。" },
        { t: 5200, clock: "13:41", labels: ["ai-pr-opened"], rail: 3, log: "独立 review。会话内修复。" },
        { t: 7000, clock: "13:44", labels: ["ai-merged"], rail: 4, log: "合并 · 刚审过的那个 head。", pr: "PR #193 · MERGED" },
        { t: 9000, clock: "13:51", labels: ["ai-merged", "ai-release"], rail: 5, log: "Release Issue · 打上 v0.2.0。", pr: "v0.2.0 · annotated tag" },
      ],
      hold: 2800,
    },
  };

  function boot(root) {
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

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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

  document.querySelectorAll("#orbi-demo").forEach(boot);
})();
