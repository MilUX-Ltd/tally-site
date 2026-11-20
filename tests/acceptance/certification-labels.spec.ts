// Acceptance journeys: certification labels on company pages. Fixture build.
// Committed failing before the build. Not edited after that commit.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AXE_TAGS } from '../support/offline-map';

const CYBER = '/companies/example-cyber-defence/';
const SOFTWARE = '/companies/example-software-works/';
const SECURE = '/companies/example-secure-comms/';
const NONE = '/companies/example-ew-systems/';

const NEGATIVE = /not certified|uncertified|unverified|not been certified|no certificat|not found|check failed|could not (?:be )?(?:find|found|confirm|check)|not on the register|expired|revoked/i;

const certifications = (page: Page) => page.getByRole('list', { name: 'Accreditations' });

test('every certification on a company page carries its label', async ({ page }) => {
  await page.goto(CYBER);
  const list = certifications(page);
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByRole('listitem').filter({ hasText: 'CREST' })).toContainText('Stated by the company');
  await expect(list.getByRole('listitem').filter({ hasText: 'Cyber Essentials Plus' })).toContainText(
    'Checked against the Example certificate register on 1 October 2026',
  );

  // A check with an unsafe link, or for an accreditation the company does not carry, is not shown.
  await page.goto(SECURE);
  const secure = certifications(page);
  await expect(secure.getByRole('listitem')).toHaveCount(1);
  await expect(secure.getByRole('listitem').filter({ hasText: 'ISO 27001' })).toContainText('Stated by the company');
  await expect(page.locator('main')).not.toContainText('Checked against');
  await expect(page.locator('main a[href^="javascript:"]')).toHaveCount(0);

  // A company with no certifications: nothing listed, and nothing said against it.
  await page.goto(NONE);
  await expect(certifications(page)).toHaveCount(0);
  await expect(page.locator('main')).toContainText('None recorded');
});

test('a checked certification shows its register and date', async ({ page }) => {
  await page.goto(CYBER);
  const item = certifications(page).getByRole('listitem').filter({ hasText: 'Cyber Essentials Plus' });
  const register = item.getByRole('link', { name: 'the Example certificate register' });
  await expect(register).toHaveAttribute('href', 'https://example.org/register/example-cyber-defence');
  await expect(register).toHaveAttribute('rel', /noopener/);
  await expect(register).toHaveAttribute('rel', /nofollow/);
  await expect(item.locator('time[datetime="2026-10-01"]')).toHaveText('1 October 2026');

  // Without a recorded link the register is text.
  await page.goto(SOFTWARE);
  const plain = certifications(page).getByRole('listitem').filter({ hasText: 'Cyber Essentials Plus' });
  await expect(plain).toContainText('Checked against the Example certificate register on 3 October 2026');
  await expect(plain.getByRole('link')).toHaveCount(0);
  await expect(plain.locator('time[datetime="2026-10-03"]')).toHaveText('3 October 2026');
});

test('pages never say a company is not certified', async ({ request }) => {
  const data = await (await request.get('/data/tally.json')).json();
  for (const c of data.companies as Array<{ id: string }>) {
    const html = await (await request.get(`/companies/${c.id}/`)).text();
    expect(html, c.id).not.toMatch(NEGATIVE);
  }
});

for (const width of [1280, 375]) {
  test(`certification labels are accessible at desktop and phone width (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(CYBER);
    await expect(certifications(page)).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
