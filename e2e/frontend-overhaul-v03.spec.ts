import { test, expect } from "@playwright/test";

test.describe("Frontend Overhaul Blueprint v0.3: E2E Verification Suite", () => {
  // ---------------------------------------------------------------------------
  // 1. PERSISTENT 4-DESTINATION NAVIGATION & TOUCH TARGETS
  // ---------------------------------------------------------------------------
  test("Navigasi Utama: Menampilkan 4 destinasi konsisten (Beranda, Challenge, Galeri, Studio) dengan target sentuh mobile >= 44px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const mobileNav = page.locator("nav[aria-label='Navigasi Bawah Mobile']");
    await expect(mobileNav).toBeVisible();

    // Verify 4 persistent destinations
    const berandaLink = mobileNav.locator("a:has-text('Beranda')");
    const challengeLink = mobileNav.locator("a:has-text('Challenge')");
    const galeriLink = mobileNav.locator("a:has-text('Galeri')");
    const studioLink = mobileNav.locator("a:has-text('Studio')");

    await expect(berandaLink).toBeVisible();
    await expect(challengeLink).toBeVisible();
    await expect(galeriLink).toBeVisible();
    await expect(studioLink).toBeVisible();

    // Verify touch target height >= 44px
    for (const link of [berandaLink, challengeLink, galeriLink, studioLink]) {
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 2. GALLERY PROVENANCE TABS & VERNACULAR CHECK
  // ---------------------------------------------------------------------------
  test("Galeri Terhubung: Tab provenance [Karya Bebas | Karya Challenge] tersinkronisasi URL dan terminologi Komentar", async ({
    page,
  }) => {
    await page.goto("/gallery");

    // Check title and description
    await expect(page.locator("h1").first()).toContainText(/Galeri/i);

    // Verify SegmentedPill items for provenance
    const bebasTab = page.locator("button:has-text('Karya Bebas')").first();
    const challengeTab = page.locator("button:has-text('Karya Challenge')").first();

    await expect(bebasTab).toBeVisible();
    await expect(challengeTab).toBeVisible();

    // Switch to Karya Challenge
    await challengeTab.click();
    await expect(page).toHaveURL(/tab=challenge/);

    // Switch back to Karya Bebas (default canonical URL)
    await bebasTab.click();
    await expect(page).toHaveURL(/\/gallery(?!\?tab=challenge)/);

    // Verify "Komentar Terbuka" chip
    const komentarChip = page.locator("button:has-text('Komentar Terbuka')").first();
    await expect(komentarChip).toBeVisible();

    // Strict Vernacular Check: "Kritik" must NOT appear in public interactive buttons
    const kritikButtons = page.locator("button:has-text('Kritik'), a:has-text('Kritik')");
    expect(await kritikButtons.count()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 3. PUBLIC COMMISSIONS DIRECTORY & ATELIER TOKENS
  // ---------------------------------------------------------------------------
  test("Direktori Komisi: Menampilkan Kolektif Komisi Kreator dalam CommunityShell", async ({
    page,
  }) => {
    await page.goto("/commissions");

    // Verify heading
    await expect(page.locator("h1").first()).toContainText(/Kolektif Komisi Kreator/i);

    // Verify search input has placeholder
    const searchInput = page.locator("input[placeholder*='Cari layanan']");
    await expect(searchInput).toBeVisible();

    // Verify Category pills
    await expect(page.locator("text=Character Illustration").first()).toBeVisible();
    await expect(page.locator("text=Environment & Background").first()).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // 4. MOBILE INPUT ZOOM PREVENTION AUDIT
  // ---------------------------------------------------------------------------
  test("Mobile UX: Input form pada viewport mobile memiliki font-size >= 16px untuk mencegah auto-zoom iOS", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // Test commissions search input
    await page.goto("/commissions");
    const commInput = page.locator("input[placeholder*='Cari layanan']");
    await expect(commInput).toBeVisible();

    const commFontSize = await commInput.evaluate((el) => {
      return parseFloat(window.getComputedStyle(el).fontSize);
    });
    // On mobile (< 640px), font-size must be at least 16px to prevent iOS Safari auto-zoom
    expect(commFontSize).toBeGreaterThanOrEqual(16);

    // Test gallery search input
    await page.goto("/gallery");
    const galleryInput = page.locator("input[placeholder*='Cari']").first();
    await expect(galleryInput).toBeVisible();

    const galleryFontSize = await galleryInput.evaluate((el) => {
      return parseFloat(window.getComputedStyle(el).fontSize);
    });
    expect(galleryFontSize).toBeGreaterThanOrEqual(16);
  });

  // ---------------------------------------------------------------------------
  // 5. CREATOR STUDIO ACCESS & REDIRECTION
  // ---------------------------------------------------------------------------
  test("Studio Kreator: Akses unauthenticated ke /dashboard mengarahkan ke /login", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/);
  });
});
