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
