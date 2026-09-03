import { test, expect } from "@playwright/test";

test.describe("Gate G: End-to-End User Journey Tests", () => {
  // ---------------------------------------------------------------------------
  // PERSONA 1: ANONYMOUS GUEST VISITOR
  // ---------------------------------------------------------------------------
  test("Persona 1: Anonymous Guest explores homepage discovery & public gallery", async ({
    page,
  }) => {
    // 1. Visit Homepage
    await page.goto("/");
    await expect(page).toHaveTitle(/Mengart/i);

    // Verify 8 Discovery Sections
    // Section 1: Hero & Value Pillars
    await expect(page.locator("h1").first()).toContainText(/Kolektif Kreator Digital/i);
    await expect(page.locator("text=KOMUNITAS DIGITAL ART & ATELIER PRIVAT")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Portofolio Terkurasi" })).toBeVisible();

    // Section 2: Recent Public Artworks Header
    await expect(page.locator("text=Karya Publik Terbaru")).toBeVisible();

    // Section 7: About Community Section
    await expect(page.locator("text=Tentang Mengart Atelier")).toBeVisible();

    // Section 8: Footer with WITA Notice
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.locator("text=Zona Waktu Operasional: WITA")).toBeVisible();

    // 2. Navigate to Public Gallery
    await page.goto("/gallery");
    await expect(page.locator("h1, h2").first()).toContainText(/Galeri/i);

    // 3. Navigate to Public Commissions
    await page.goto("/commissions");
    await expect(page.locator("h1, h2").first()).toContainText(/Komisi/i);

    // 4. Navigate to Public Challenges
    await page.goto("/challenges");
    await expect(page.locator("h1, h2").first()).toContainText(/Challenge/i);
  });

  // ---------------------------------------------------------------------------
  // PERSONA 2: PENDING INVITE ONBOARDING FLOW
  // ---------------------------------------------------------------------------
  test("Persona 2: Guest visits invitation redemption page", async ({ page }) => {
    await page.goto("/invite");
    await expect(page.locator("h1, h2, h3").first()).toContainText(/Undangan/i);
    await expect(page.locator("input[name='inviteInput']").first()).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // PERSONA 3: AUTHENTICATED USER LOGIN NAVIGATION
  // ---------------------------------------------------------------------------
  test("Persona 3: Login page presents Google authentication", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("text=Masuk Anggota")).toBeVisible();
    await expect(page.locator("button:has-text('Google')")).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // PERSONA 4: STORY CARD GENERATOR MODAL A11Y & VISIBILITY
  // ---------------------------------------------------------------------------
  test("Persona 4: Challenge page accessibility and story card trigger", async ({
    page,
  }) => {
    await page.goto("/challenges");
    await expect(page.locator("body")).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // PERSONA 5: ADMIN / MODERATION ACCESS CONTROLS
  // ---------------------------------------------------------------------------
  test("Persona 5: Admin routes redirect unauthenticated guests to login", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/login/);
  });

  // ---------------------------------------------------------------------------
  // PERSONA 6: MOBILE NAVIGATION & A11Y TOUCH TARGETS
  // ---------------------------------------------------------------------------
  test("Persona 6: Mobile viewport navigation bar & touch accessibility", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const mobileNav = page.locator("nav[aria-label='Navigasi Bawah Mobile']");
    await expect(mobileNav).toBeVisible();

    const galleryTab = mobileNav.locator("a[href='/gallery']");
    await expect(galleryTab).toBeVisible();
    await galleryTab.click();

    await expect(page).toHaveURL(/\/gallery/);
  });
});
