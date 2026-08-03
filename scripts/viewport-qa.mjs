/* global window, document, getComputedStyle, innerHeight */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const widths = [320, 360, 375, 390, 412, 430, 768, 820, 1024, 1280, 1440];
const screenshotWidths = new Set([320, 390, 430, 768, 1024, 1440]);
const screens = ["landing", "sign-in", "create-household", "invitation", "setup", "dashboard", "manage-family",
  "rooms-spaces", "routines", "schedule", "meals", "together", "my-cradle", "operations", "alpha-health",
  "dialog", "error", "empty", "loading"];
const candidates = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
const executablePath = candidates.find(existsSync);
if (!executablePath) throw new Error("Viewport QA requires Chrome/Chromium. Set CHROME_PATH to its executable.");

const css = `${readFileSync("src/styles/tokens.css", "utf8")}\n${readFileSync("src/styles/app.css", "utf8")}`;
const nav = `<header class="dashboard-nav"><button class="brand-button">Cradle</button><nav>${["Dashboard", "Routines", "Schedule", "Meals", "Together", "My Cradle"].map((label, index) =>
  `<button ${index === 0 ? 'aria-current="page"' : ""}><span aria-hidden="true">●</span><span>${label}</span></button>`).join("")}</nav><button class="nav-signout">Sign out</button></header>`;
const family = `<section class="dashboard-card family-status-section"><div class="card-heading"><div><p class="eyebrow">Everyone belongs</p><h2>Family Status</h2></div><span>4 family members</span></div><div class="family-status-grid">${["Alexandra-long-family-name", "Gillian", "Tajaun", "Taryn-Rose"].map((name, index) =>
  `<button class="family-status-card avatar-tone-${["mint", "yellow", "lavender", "coral"][index]}"><span class="family-status-avatar"><span aria-hidden="true">●</span></span><span class="family-status-info"><strong>${name}</strong><span>Making steady household progress today</span><span class="family-progress"><span class="family-progress-fill positive" style="width:${80-index*14}%"></span></span><small>${80-index*14}%</small></span></button>`).join("")}</div></section>`;
const form = (title) => `<section class="card form-card"><button class="text-button">Back</button><h1>${title}</h1><form><label><span>Email address</span><input type="email" autocomplete="email" value="person@example.com"></label><label><span>Household name</span><input value="A household with a deliberately long name"></label><p class="error" role="alert">A recoverable local error remains inside this panel.</p><div class="row-actions"><button class="primary">Continue</button><button>Cancel</button></div></form></section>`;
const screenBody = (screen) => {
  if (["landing", "sign-in", "create-household", "invitation", "setup"].includes(screen)) return `<main class="app-shell">${form(screen.replaceAll("-", " "))}</main>`;
  if (screen === "dashboard") return `<main class="dashboard-shell">${nav}<section class="dashboard-greeting"><div><p class="eyebrow">Monday at home</p><h1>Good morning.</h1></div></section><div class="dashboard-grid">${family}</div><div class="viewport-final-content"><button>Final content action</button></div></main>`;
  if (screen === "manage-family") return `<main class="dashboard-shell">${nav}<section class="family-panel dashboard-card"><h1>Manage Family</h1>${form("Invite family member")}${family}</section><div class="viewport-final-content"></div></main>`;
  if (screen === "rooms-spaces") return `<main class="dashboard-shell">${nav}<section class="dashboard-card rooms-spaces"><h1>Rooms &amp; spaces</h1><form class="room-space-form"><label><span>Name</span><input value="Shared downstairs utility room"></label><label><span>Type</span><select><option>Utility</option></select></label><button>Save room</button><button>Cancel</button></form><div class="rooms-space-list"><article><div><h2>Kitchen</h2><p>Alexandra, Gillian · Evening kitchen reset</p></div><button>Edit</button></article></div></section><div class="viewport-final-content"></div></main>`;
  if (screen === "routines") return `<main class="dashboard-shell">${nav}<section class="routine-editor dashboard-card"><h1>Evening kitchen reset</h1><dl class="routine-allocation-summary"><div><dt>Assigned to</dt><dd>Alexandra</dd></div><div><dt>Room</dt><dd>Kitchen</dd></div></dl>${form("Edit assignment")}</section><div class="viewport-final-content"></div></main>`;
  if (screen === "dialog") return `<main class="dashboard-shell">${nav}<div class="alpha-feedback-backdrop"><section class="alpha-feedback-dialog" role="dialog" aria-modal="true"><h1>Share feedback</h1>${form("Dialog form")}</section></div></main>`;
  const title = screen.replaceAll("-", " ");
  return `<main class="dashboard-shell">${nav}<section class="dashboard-card ${screen === "alpha-health" ? "health-grid" : ""}"><h1>${title}</h1><p>Responsive ${title} content with a deliberately long status that must wrap safely.</p>${screen === "error" ? '<p class="error">Something went wrong safely.</p>' : ""}${screen === "loading" ? '<p role="status">Loading…</p>' : ""}<button class="primary">Primary action</button><button>Back</button></section><div class="viewport-final-content"><button>Final content action</button></div></main>`;
};

const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] });
const failures = []; const actualWidths = new Set(); const artifactDirectory = resolve("artifacts/viewport"); mkdirSync(artifactDirectory, { recursive: true });
try {
  const page = await browser.newPage();
  for (const width of widths) {
    await page.setViewport({ width, height: width <= 430 ? 900 : 1000, deviceScaleFactor: 1, isMobile: width <= 430, hasTouch: width <= 430 });
    for (const screen of screens) {
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}\nhtml,body{overflow-x:clip}.viewport-final-content{min-height:80px;padding:1rem;margin-bottom:5rem}</style></head><body class="dashboard-app">${screenBody(screen)}</body></html>`, { waitUntil: "domcontentloaded" });
      const result = await page.evaluate(() => {
        const viewport = window.innerWidth; const root = document.documentElement;
        const visible = [...document.querySelectorAll("body *")].filter((element) => {
          const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        });
        const outside = visible.filter((element) => { const rect = element.getBoundingClientRect(); return rect.left < -1 || rect.right > viewport + 1; })
          .slice(0, 5).map((element) => `${element.tagName}.${element.className}`);
        const tiny = visible.filter((element) => element.matches("button, input, select, textarea") && element.getBoundingClientRect().height < 44)
          .slice(0, 5).map((element) => element.textContent?.trim() || element.tagName);
        const nested = document.querySelectorAll("button button, button a, a button").length;
        const navButtons = [...document.querySelectorAll(".dashboard-nav nav button")].map((element) => element.getBoundingClientRect());
        const navOverlap = navButtons.some((box, index) => navButtons.slice(index + 1).some((other) =>
          box.left < other.right - 1 && box.right > other.left + 1 && box.top < other.bottom - 1 && box.bottom > other.top + 1));
        const nav = document.querySelector(".dashboard-nav")?.getBoundingClientRect();
        const final = document.querySelector(".viewport-final-content")?.getBoundingClientRect();
        const keyboardUnreachable = visible.filter((element) => element.matches("button, input, select, textarea, a[href]") && element.tabIndex < 0).length;
        const navPosition = nav ? getComputedStyle(document.querySelector(".dashboard-nav")).position : "";
        return { viewport, scrollWidth: root.scrollWidth, outside, tiny, nested,
          navContained: !nav || (nav.left >= -1 && nav.right <= viewport + 1 && nav.bottom <= innerHeight + 1),
          finalReachable: navPosition !== "fixed" || !final || final.bottom <= nav.top || root.scrollHeight > innerHeight,
          keyboardUnreachable, navOverlap };
      });
      actualWidths.add(result.viewport);
      const prefix = `${screen}@${width}`;
      if (result.viewport !== width) failures.push(`${prefix}: actual viewport ${result.viewport}px`);
      if (result.scrollWidth > width + 1) failures.push(`${prefix}: page width ${result.scrollWidth}px`);
      if (result.outside.length) failures.push(`${prefix}: outside viewport ${result.outside.join(", ")}`);
      if (result.tiny.length) failures.push(`${prefix}: controls below 44px ${result.tiny.join(", ")}`);
      if (result.nested) failures.push(`${prefix}: nested interactive controls`);
      if (result.navOverlap) failures.push(`${prefix}: navigation controls overlap`);
      if (!result.navContained) failures.push(`${prefix}: navigation is not contained`);
      if (!result.finalReachable) failures.push(`${prefix}: fixed navigation covers final content`);
      if (result.keyboardUnreachable) failures.push(`${prefix}: keyboard-unreachable controls`);
      if (screen === "dashboard" && screenshotWidths.has(width)) await page.screenshot({ path: `${artifactDirectory}/dashboard-${width}.png`, fullPage: true });
    }
  }
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setContent(`<style>${css}</style><button class="family-status-card">Reduced motion</button>`);
  const animation = await page.$eval("button", (element) => getComputedStyle(element).animationName);
  if (animation !== "none") failures.push(`reduced-motion: animation remains ${animation}`);
} finally { await browser.close(); }

if (failures.length) {
  console.error(`Viewport QA failed (${failures.length}):\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Viewport QA passed: ${screens.length} screens × ${widths.length} widths. Actual widths: ${[...actualWidths].join(", ")}.`);
  console.log(`Screenshots: ${artifactDirectory}`);
}
