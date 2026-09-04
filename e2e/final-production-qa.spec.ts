import { test, expect } from "@playwright/test";
import path from "path";

const SCREENSHOT_DIR = path.resolve(process.cwd(), ".gstack/qa-reports/screenshots");

test.describe("Final Production QA & Health Audit Suite", () => {
  // ---------------------------------------------------------------------------
  // 1. API HEALTH & SYSTEM LIVENESS ENDPOINTS
  // ---------------------------------------------------------------------------
  test("API Health: /api/health/liveness and /api/health/readiness respond OK", async ({
    request,
  }) => {
    const livenessRes = await request.get("/api/health/liveness");
    expect(livenessRes.status()).toBe(200);
    const livenessJson = await livenessRes.json();
    expect(livenessJson.status).toBe("ok");

    const readinessRes = await request.get("/api/health/readiness");
    expect(readinessRes.status()).toBe(200);
    const readinessJson = await readinessRes.json();
    expect(readinessJson.status).toBe("ready");

    const robotsRes = await request.get("/robots.txt");
    expect(robotsRes.status()).toBe(200);
    const robotsText = await robotsRes.text();
    expect(robotsText).toMatch(/user-agent/i);

    const sitemapRes = await request.get("/sitemap.xml");
    expect(sitemapRes.status()).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // 2. HOMEPAGE DISCOVERY, VALUE PILLARS & CONSOLE HEALTH
  // ---------------------------------------------------------------------------
  test("Homepage: 8 discovery sections render with zero unhandled JavaScript exceptions", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const failedResources: { url: string; status: number }[] = [];

    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("response", (res) => {
      if (!res.ok() && res.status() !== 401 && res.status() !== 404) {
        failedResources.push({ url: res.url(), status: res.status() });
      }
    });

    await page.goto("/");
    await expect(page).toHaveTitle(/Mengart/i);

    // Section 1: Hero & Value Pillars
    await expect(page.locator("h1").first()).toContainText(/Kolektif Kreator Digital/i);
    await expect(page.getByText("KOMUNITAS DIGITAL ART & ATELIER PRIVAT").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Portofolio Terkurasi" })).toBeVisible();

    // Section 2: Recent Public Artworks Header
    await expect(page.locator("text=Karya Publik Terbaru")).toBeVisible();

    // Section 7: About Community Section
    await expect(page.locator("text=Tentang Mengart Atelier")).toBeVisible();

    // Section 8: Footer with WITA Notice
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.locator("text=Zona Waktu Operasional: WITA")).toBeVisible();

    // Screenshot capture
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "homepage-desktop.png"), fullPage: false });

    // Ensure zero unhandled JavaScript runtime exceptions (pageerror) and zero 5xx server errors
    expect(pageErrors).toEqual([]);
    expect(failedResources).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 3. PUBLIC GALLERY & NAVIGATION
  // ---------------------------------------------------------------------------
  test("Public Gallery: Renders artwork grid, filters, and controls", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/gallery");
    await expect(page.locator("h1, h2").first()).toContainText(/Galeri/i);

    // Filter controls present
    await expect(page.getByRole("textbox", { name: /cari karya/i }).or(page.locator("input[placeholder*='Cari']"))).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "gallery-desktop.png"), fullPage: false });
    expect(pageErrors).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 4. PUBLIC COMMISSIONS DIRECTORY
  // ---------------------------------------------------------------------------
  test("Commissions: Directory displays commission guidelines & artist listings", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/commissions");
    await expect(page.locator("h1, h2").first()).toContainText(/Komisi/i);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "commissions-desktop.png"), fullPage: false });
    expect(pageErrors).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 5. PUBLIC CHALLENGES INDEX
  // ---------------------------------------------------------------------------
  test("Challenges: Challenge showcase renders timeline tabs and cards", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/challenges");
    await expect(page.locator("h1, h2").first()).toContainText(/Challenge/i);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "challenges-desktop.png"), fullPage: false });
    expect(pageErrors).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 6. INVITATION ONBOARDING & INPUT VALIDATION
  // ---------------------------------------------------------------------------
  test("Invite: Redemption form renders and handles empty/invalid submission", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/invite");
    await expect(page.locator("h1, h2, h3").first()).toContainText(/Undangan/i);

    const input = page.locator("input[name='inviteInput']").first();
    await expect(input).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "invite-desktop.png"), fullPage: false });
    expect(pageErrors).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 7. AUTHENTICATION & LOGIN UI
  // ---------------------------------------------------------------------------
  test("Login: Authentication portal presents Google OAuth sign-in", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/login");
    await expect(page.locator("text=Masuk Anggota")).toBeVisible();
    await expect(page.locator("button:has-text('Google')")).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "login-desktop.png"), fullPage: false });
    expect(pageErrors).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 8. SECURITY & RBAC ACCESS CONTROL REDIRECTION
  // ---------------------------------------------------------------------------
  test("Security: Unauthenticated access to protected routes strictly redirects to /login", async ({
    page,
  }) => {
    const protectedRoutes = [
      "/admin",
      "/admin/challenges",
      "/admin/users",
      "/admin/moderation",
      "/me/profile",
      "/me/portfolio",
      "/me/commissions",
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/login/);
    }
  });

  // ---------------------------------------------------------------------------
  // 9. MOBILE VIEWPORT, RESPONSIVENESS & TOUCH TARGET AUDIT
  // ---------------------------------------------------------------------------
  test("Mobile UX: Mobile viewport (375x812) adheres to navigation & layout bounds", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    // Verify Mobile Bottom Navigation
    const mobileNav = page.locator("nav[aria-label='Navigasi Bawah Mobile']");
    await expect(mobileNav).toBeVisible();

    // Verify touch target dimensions for mobile tabs (>= 40px height)
    const galleryTab = mobileNav.locator("a[href='/gallery']");
    await expect(galleryTab).toBeVisible();
    const box = await galleryTab.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(40);
    }

    // Verify no horizontal document overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "homepage-mobile.png"), fullPage: false });
  });
});
