import type { Page } from "@playwright/test"
import { expect, story } from "../../stories/playwright/story"

story("renders a card for every loaded theme", async ({ mount, page }) => {
  await mount("app-theme-gallery--gallery")
  const cards = page.locator('[data-slot="theme-card"]')
  await expect(cards.first()).toBeVisible()
  await expect.poll(() => cards.count()).toBeGreaterThan(30)
  await expect(page.locator('[data-theme-id="gruvbox"]')).toBeVisible()
  await expect.poll(() => page.locator('[data-slot="theme-card"][aria-checked="true"]').count()).toBe(1)
})

story("draws each card in both color modes", async ({ mount, page }) => {
  await mount("app-theme-gallery--gallery")
  const card = page.locator('[data-theme-id="gruvbox"]')
  await expect(card).toBeVisible()
  const light = card.locator('[data-slot="theme-card-half"][data-mode="light"]')
  const dark = card.locator('[data-slot="theme-card-half"][data-mode="dark"]')
  const backgrounds = await Promise.all([light, dark].map((half) =>
    half.evaluate((element) => getComputedStyle(element).getPropertyValue("--tg-background"))))
  expect(backgrounds[0]).not.toBe("")
  expect(backgrounds[0]).not.toBe(backgrounds[1])
})

const committed = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.theme)

story("previews on hover and restores the committed theme on leave", async ({ mount, page }) => {
  await mount("app-theme-gallery--gallery")
  const initial = await committed(page)
  await page.locator('[data-theme-id="gruvbox"]').hover()
  await expect.poll(() => committed(page)).toBe("gruvbox")
  await page.mouse.move(0, 0)
  await expect.poll(() => committed(page)).toBe(initial)
})

story("settles on the last card of a sweep", async ({ mount, page }) => {
  await mount("app-theme-gallery--gallery")
  for (const id of ["gruvbox", "nord", "kanagawa"]) await page.locator(`[data-theme-id="${id}"]`).hover()
  await expect.poll(() => committed(page)).toBe("kanagawa")
})

story("cancels a preview with Escape", async ({ mount, page }) => {
  await mount("app-theme-gallery--gallery")
  const initial = await committed(page)
  await page.locator('[data-theme-id="gruvbox"]').focus()
  await expect.poll(() => committed(page)).toBe("gruvbox")
  await page.keyboard.press("Escape")
  await expect.poll(() => committed(page)).toBe(initial)
})

story("restores the committed theme when the gallery unmounts", async ({ mount, page }) => {
  await mount("app-theme-gallery--unmount")
  const initial = await committed(page)
  await page.locator('[data-theme-id="gruvbox"]').hover()
  await expect.poll(() => committed(page)).toBe("gruvbox")
  // A dispatched click does not move the pointer or focus, so only the unmount cleanup can restore the theme.
  await page.locator('[data-action="unmount-gallery"]').dispatchEvent("click")
  await expect.poll(() => committed(page)).toBe(initial)
})
