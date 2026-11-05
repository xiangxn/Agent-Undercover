/**
 * M2/M3 browser smoke test: drives the real React app in headless Chrome.
 * Start the server (which also serves web/dist) before running this.
 */
import puppeteer from "puppeteer-core";

const URL = process.env.APP_URL ?? "http://localhost:8787";
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickButtonContaining(page, text) {
  return page.evaluate((needle) => {
    const button = [...document.querySelectorAll("button")].find(
      (item) => item.textContent.includes(needle) && !item.disabled,
    );
    if (!button) return false;
    button.click();
    return true;
  }, text);
}

async function phaseOf(page) {
  return page
    .$eval(".phase-chip", (element) => element.textContent.trim())
    .catch(() => null);
}

async function resultOf(page) {
  return page
    .$eval(".result-hero h1", (element) => element.textContent.trim())
    .catch(() => null);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--window-size=1440,1100", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1440, height: 1100 },
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error") consoleErrors.push(text);
    if (text.startsWith("[vote]") || text.startsWith("[tx]") || text.startsWith("[room]") || message.type() === "error") {
      console.log(`[page ${message.type()}] ${text}`);
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

  try {
    await page.goto(URL, { waitUntil: "networkidle2", timeout: 30_000 });
    await page.waitForSelector("button.btn-primary", { timeout: 15_000 });
    const cta = await page.$eval("button.btn-primary", (element) => element.textContent);
    console.log(`[browser] landing loaded: ${cta.trim()}`);
    await page.screenshot({ path: "/tmp/au-landing.png", fullPage: true });

    await clickButtonContaining(page, "Stake 0.1 NEAR");
    console.log("[browser] started session; waiting for the table…");

    const deadline = Date.now() + 10 * 60 * 1000;
    let lastPhase = "";
    let lastAction = 0;
    let lastError = "";
    let result = null;
    const reloadPhase = process.env.RELOAD_PHASE ?? "";
    let reloaded = false;

    while (Date.now() < deadline) {
      result = await resultOf(page);
      if (result) break;

      const phase = await phaseOf(page);
      if (phase && phase !== lastPhase) {
        lastPhase = phase;
        console.log(`[browser] phase: ${phase}`);
      }

      if (!reloaded && reloadPhase && phase === reloadPhase) {
        reloaded = true;
        console.log(`[browser] reloading during ${phase} to test reconnect`);
        await page.reload({ waitUntil: "networkidle2", timeout: 30_000 });
        lastPhase = "";
        lastError = "";
        await sleep(2000);
        continue;
      }

      const banner = await page
        .$eval(".error-banner", (element) => element.textContent.trim())
        .catch(() => "");
      if (banner && banner !== lastError) {
        lastError = banner;
        console.log(`[browser] error banner: ${banner}`);
      }

      if (Date.now() - lastAction > 2500) {
        // Describe when the composer is available.
        const textarea = await page.$("textarea:not([disabled])");
        if (textarea && phase === "Describing") {
          await textarea.click({ clickCount: 3 });
          await page.keyboard.type(
            "It shows up in ordinary life in a way everyone has seen.",
          );
          await sleep(250);
          if (await clickButtonContaining(page, "Submit sentence")) {
            console.log("[browser] submitted a description");
            lastAction = Date.now();
            await sleep(2000);
            continue;
          }
        }

        if (phase === "Vote commit") {
          const selected = await page.evaluate(() => {
            const card = document.querySelector(".player-card:not(:disabled)");
            if (!card) return false;
            card.click();
            return true;
          });
          if (selected) {
            await sleep(250);
            if (await clickButtonContaining(page, "Commit vote")) {
              console.log("[browser] committed a vote");
              lastAction = Date.now();
              await sleep(2000);
              continue;
            }
          }
        }
      }

      if (phase === "Describing" && Date.now() - lastAction === 0) {
        await page.screenshot({ path: "/tmp/au-game.png" });
      }
      await sleep(600);
    }

    if (!result) {
      const savedState = await page.evaluate(() => ({
        session: sessionStorage.getItem("agent-undercover:session"),
        vote: sessionStorage.getItem("agent-undercover:pending-vote"),
      }));
      console.log("[browser] saved state:", JSON.stringify(savedState));
      await page.screenshot({ path: "/tmp/au-timeout.png", fullPage: true });
      throw new Error("Game did not settle within 10 minutes");
    }

    console.log(`[browser] RESULT: ${result}`);
    await page.waitForSelector(".payout-row", { timeout: 10_000 });
    const payoutRows = await page.$$eval(".payout-row", (rows) =>
      rows.map((row) => row.textContent.replace(/\s+/g, " ").trim()),
    );
    console.log("[browser] payouts:");
    for (const row of payoutRows) console.log(`  ${row}`);
    const thoughts = await page.$$eval(".thought", (items) => items.length);
    console.log(`[browser] reasoning cards: ${thoughts}`);
    await page.screenshot({ path: "/tmp/au-result.png", fullPage: true });

    if (consoleErrors.length > 0) {
      console.log("[browser] console errors:");
      for (const error of consoleErrors) console.log(`  ${error}`);
      process.exitCode = 1;
    } else {
      console.log("[browser] no console errors");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[browser] FAILED", error);
  process.exit(1);
});
