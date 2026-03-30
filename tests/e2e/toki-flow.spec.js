import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function register(page, { email, username, fullName, password }) {
  await page.locator("#showRegisterBtn").click();
  await page.locator("#authEmail").fill(email);
  await page.locator("#registerUsername").fill(username);
  await page.locator("#authFullName").fill(fullName);
  await page.locator("#authPassword").fill(password);
  await page.locator("#authForm button[type='submit']").click();
}

async function login(page, { email, password }) {
  await page.locator("#showLoginBtn").click();
  await page.locator("#authEmail").fill(email);
  await page.locator("#authPassword").fill(password);
  await page.locator("#authForm button[type='submit']").click();
}

async function logout(page) {
  await page.getByRole("button", { name: "Profile" }).click();
  await page.locator("#logoutBtn").click();
  await expect(page.locator("#authView")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript({
    path: path.join(__dirname, "mockSupabase.js"),
  });
});

test("full flow: register, ask, answer, rate, leaderboard", async ({ page }) => {
  const nonce = Date.now();
  const asker = {
    email: `asker_${nonce}@example.com`,
    username: `asker_${nonce}`,
    fullName: "Asker One",
    password: "password123",
  };
  const giver = {
    email: `giver_${nonce}@example.com`,
    username: `giver_${nonce}`,
    fullName: "Giver Two",
    password: "password123",
  };
  const questionTitle = `Need advice ${nonce}`;
  const questionBody = "I need practical advice for managing study time each day.";
  const answerBody = "Use a fixed daily study block, then review progress every evening.";

  await page.goto("/");

  await register(page, asker);
  await expect(page.locator("#sessionChip")).toContainText(`@${asker.username}`);

  await page.getByRole("button", { name: "Ask" }).click();
  await page.locator("#askTitle").fill(questionTitle);
  await page.locator("#askBody").fill(questionBody);
  await page.getByRole("button", { name: "Post Question" }).click();

  await expect(page.getByRole("heading", { name: questionTitle })).toBeVisible();
  await logout(page);

  await register(page, giver);
  await expect(page.locator("#sessionChip")).toContainText(`@${giver.username}`);

  await page.getByRole("button", { name: "Home" }).click();
  const card = page.locator(".question-card").filter({ hasText: questionTitle }).first();
  await card.locator("textarea[name='answerText']").fill(answerBody);
  await card.getByRole("button", { name: "Give Advice" }).click();
  await expect(card).toContainText(answerBody);
  await logout(page);

  await login(page, { email: asker.email, password: asker.password });
  await expect(page.locator("#sessionChip")).toContainText(`@${asker.username}`);
  await page.getByRole("button", { name: "Home" }).click();

  const askerCard = page.locator(".question-card").filter({ hasText: questionTitle }).first();
  const ratingForm = askerCard.locator("form[data-action='rate-answer']").first();
  await ratingForm.locator("select[name='rating']").selectOption("9");
  await ratingForm.getByRole("button", { name: "Save" }).click();

  await expect(askerCard).toContainText("Rated 9/10");
  await page.getByRole("button", { name: "Leaderboard" }).click();
  await expect(page.locator("#leaderboardList")).toContainText(`@${giver.username}`);
  await expect(page.locator("#leaderboardList")).toContainText("Avg 9.0/10");
});
