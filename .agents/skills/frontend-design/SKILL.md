---
name: frontend-design
description: "Guidance for distinctive, intentional visual design, elevated typographic craft, and purposeful UI copywriting. Avoids generic AI templates and enforces high-craft aesthetics."
risk: unknown
source: anthropic+community
date_added: "2026-09-04"
---

# Frontend Design (Distinctive, High-Craft, Production-Grade)

Approach frontend design as the **design lead at a premium design studio** known for giving every product a distinct, memorable visual identity. You are a **frontend designer-engineer**, not a layout generator.

Every interface you build must:
* Avoid generic "AI UI" and template clichés
* Express a clear, deliberate aesthetic point of view
* Practice visual restraint so the core subject/artwork remains the hero
* Be fully functional, accessible, and production-ready in code

---

## 1. Ground Your Designs in the Subject Matter

If the brief does not specify the subject matter or target audience, identify it before designing. The subject's industry, materials, and vernacular are where distinctive visual choices originate.

* A digital art community atelier platform (*Mengart*) demands atmospheric canvas contrast, restrained gallery chrome, and elevated typography.
* A toy application for children demands high tactile playfulness.
* A financial dashboard demands dense, utilitarian data clarity.

Build with the real subject matter and authentic content throughout.

---

## 2. Core Design Principles

### Hero & Opening Moments
Open with the most characteristic element in the subject's world: a headline, a showcase image, an interactive canvas, or a live demo. Avoid default hero formulas (e.g. big centered stat with small label and a purple gradient wash) unless that is truly the best fit.

### Typographic Craft & Hierarchy
Typography carries the personality of the interface.
* **Type Families:** Use one family or two. If two, ensure they are clearly distinct (e.g., an expressive display face paired with a crisp, restrained body sans).
* **Avoid System & Default AI Fonts:** Never default to Inter, Roboto, or Arial for signature interfaces.
* **Line Length & Height:** Default line length to under 80 characters. For serif body text, provide slightly more line-height than sans-serif.
* **Typographic Tells to AVOID:**
  - ❌ Accenting a single word or phrase with bold/italic or a different color in headlines.
  - ❌ Using ALL CAPS for arbitrary labels.
  - ❌ Adding unnecessary tracked-out uppercase labels above every heading.

### Visual Structure as Information
Structural devices (borders, outlines, numbering, dividers, badges) must encode real information rather than decorate.
* Numbered markers (`01 / 02 / 03`) are only appropriate when content is an actual sequence (stepped workflow or timeline).
* Space and negative space are active design elements, not emptiness.

### Purposeful Motion & Restraint
* Use non-user-triggered motion sparingly. A single orchestrated entrance sequence lands better than scattered fade-and-slide effects across every card.
* User-triggered motion (opening drawers, expanding lightboxes, confirming actions) should immediately communicate what changed.
* Always respect `@media (prefers-reduced-motion: reduce)`.

---

## 3. The 5 AI-Generated Design Clichés to Avoid

Calibrate your eye against the common tells of generated interfaces:

1. **The Claude/SaaS Cliché:** Warm cream background (`#F4F1EA`) with high-contrast serif display and terracotta/warm-clay accent (`#D97757`).
2. **The Cyber-Vapor Cliché:** Near-black background paired with a single harsh acid-green or hot vermilion accent without tonal depth.
3. **The Fake Broadsheet:** Dense newspaper-like columns with hairline rules and zero border-radius regardless of subject fit.
4. **The SaaS-Card Kit:** Content chopped into identical rounded rectangles with uniform border-radius, soft grey shadows (`rgba(0,0,0,0.1)`), and decorative gradient washes.
5. **Template Chrome Clutter:** Tracked-out uppercase eyebrow labels, middle dots (`A · B · C`), spaced em dashes (`WORD — fragment`), monospace text for small labels without cause, and trailing arrows (`→`) appended to every button.

Follow the brief's designated style guide when specified (e.g., *Studio Atelier / Warm Obsidian & Gallery Amber*), but avoid falling into unexamined template defaults.

---

## 4. Design Feasibility & Impact Index (DFII)

Before building complex or radical concepts, evaluate the direction with the DFII scoring rubric.

### DFII Dimensions (1–5)

| Dimension | Evaluation Question |
| :--- | :--- |
| **Aesthetic Impact** | How visually distinctive and memorable is this direction? |
| **Context Fit** | Does this aesthetic suit the product, audience, and purpose? |
| **Implementation Feasibility** | Can this be built cleanly with the available stack? |
| **Performance Safety** | Will it remain fast, responsive, and accessible? |
| **Consistency Risk** | Can this be maintained across screens and components? |

### Scoring Formula & Thresholds
$$\text{DFII} = (\text{Impact} + \text{Fit} + \text{Feasibility} + \text{Performance}) - \text{Consistency Risk}$$

* **12–15:** Excellent — execute with full craft.
* **8–11:** Strong — proceed with disciplined restraint.
* **4–7:** Risky — reduce decorative complexity or experimental scope.
* **$\le$ 3:** Weak — rethink aesthetic direction.

---

## 5. Differentiation Anchor

Before writing code, answer:
> *"If this interface were screenshotted with the logo and branding removed, how would a user recognize it?"*

Ensure the answer is embodied in a specific structural, typographic, or spatial choice in the final UI.

---

## 6. Two-Pass Process: Plan $\rightarrow$ Review $\rightarrow$ Build

### Pass 1: Design Plan & Token System
1. **Palette:** 4–6 named semantic variables (canvas, elevated surface, text primary, accent glow, subtle border).
2. **Typography:** Explicit typefaces, scale, weights, and roles.
3. **Layout & Alignment:** One-sentence layout concept and concise ASCII wireframes.
4. **Differentiation Anchor:** The signature memorable element.

### Pass 2: Self-Critique & Build
* Review the plan: *Does any part read like an AI default or template kit?* If so, revise before writing code.
* Apply **Chanel's Rule**: Before finalizing, review the interface and remove one unnecessary decorative accessory.
* **CSS Specificity:** Ensure clean CSS class structures without conflicting specificity or margin/padding overrides.

---

## 7. Writing in Design (UI Copywriting & Microcopy)

Words in an interface exist to help people understand and navigate. They are content, not decoration.

* **User Perspective:** Name things by what users understand, not how the system is constructed (e.g., *"Notifikasi"* instead of *"Webhook Event Trigger"*).
* **Active Voice & Clear Outcomes:** Buttons state exact outcomes (*"Simpan Perubahan"* rather than generic *"Kirim"*). Button labels match resulting toasts (*"Publikasikan"* $\rightarrow$ *"Dipublikasikan"*).
* **Errors as Guidance:** Explain what went wrong and how to fix it in plain terms. Do not apologize or use vague phrases.
* **Empty States as Invitations:** An empty screen is an actionable invitation to create, explore, or upload.
* **Tone Consistency:** Natural, conversational, and aligned with community vocabulary (e.g., blending natural Bahasa Indonesia with established art community terms like *Artwork, Submission, Lightbox, Master Quality*).

---

## 8. Output Checklist

Before finalizing any frontend output:
* [ ] Clear aesthetic direction aligned with product tokens
* [ ] DFII score $\ge 8$
* [ ] No generic AI design clichés (no arbitrary uppercase eyebrows, middle-dot spam, or template cards)
* [ ] Typographic scale and line lengths ($< 80$ chars) respected
* [ ] Microcopy is active, user-focused, and unambiguous
* [ ] Accessible by default (contrast, keyboard focus, reduced motion, ARIA semantics)
* [ ] Responsive across mobile viewports ($\ge 44\text{px}$ touch targets, thumb ergonomics)

