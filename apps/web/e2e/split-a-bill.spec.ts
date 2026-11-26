import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The whole journey from the brief, in a real browser: Chee scans the receipt and shares
// the bill, then a friend joins on their own phone and taps what they had.
// The Fake OCR always reads the brief's receipt: Chicken Rice, Laksa, 2 × Tiger Beer.

const compose = fileURLToPath(
  new URL('../../../infra/docker-compose.ci.yml', import.meta.url),
);
// A new account per run and per browser (each project registers its own)
let email = '';
// Filled in by the owner test, used by the guest test
const shared = { joinCode: '', total: '' };

// The Fake email sender writes the link to the API log, so read it from there.
// CI runs this test inside the Playwright image, which has no docker command, so it
// streams the log to a file and sets API_LOG (KAN-100); on a laptop we ask docker.
function verifyLinkFor(address: string) {
  const logs = process.env.API_LOG
    ? readFileSync(process.env.API_LOG, 'utf8')
    : execFileSync(
        'docker',
        ['compose', '-f', compose, 'logs', '--no-color', 'api'],
        { encoding: 'utf8' },
      );
  const after = logs.slice(logs.lastIndexOf(`to ${address}`));
  const token = /verify\?token=([\w-]+)/.exec(after)?.[1];
  if (!token) throw new Error(`No verify email for ${address} in the API log`);
  return `/verify?token=${token}`;
}

const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });

test.describe.configure({ mode: 'serial' });

// Accessibility (KAN-103): axe checks the screen against WCAG 2.1 A and AA (labels,
// contrast, names for buttons and images, headings, focus). Soft, so one run lists
// every screen with a problem; any violation still fails the test.
async function expectAccessible(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const found = violations.map(
    (v) =>
      `${screen}: ${v.id} (${v.impact}) ${v.help}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect.soft(found, `accessibility of ${screen}`).toEqual([]);
}

// The Content Security Policy from the Caddyfile (KAN-96) must not block anything the
// app itself needs: the browser logs every blocked script, style or request
const blocked: string[] = [];
test.beforeEach(({ page }) => {
  blocked.length = 0;
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) blocked.push(m.text());
  });
});
test.afterEach(() => expect(blocked).toEqual([]));

test(
  'the web server sends the security headers',
  { tag: '@app' },
  async ({ request }) => {
    const h = (await request.get('/')).headers();
    expect(h['content-security-policy']).toContain("script-src 'self'");
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['strict-transport-security']).toContain('max-age=');
    expect(h['server']).toBeUndefined();
  },
);

// The screens anyone can open without logging in
test(
  'accessibility: login, register, join and password reset',
  {
    tag: ['@a11y', '@accounts', '@bills'],
  },
  async ({ page }) => {
    for (const [path, heading] of [
      ['/login', 'Log in'],
      ['/register', 'Create account'],
      ['/join', 'Join a bill'],
      ['/forgot-password', 'Forgot password'],
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await expectAccessible(page, `${path} (${heading})`);
    }
  },
);

test(
  'owner: register, verify, scan a receipt, fix an item, share',
  {
    tag: ['@accounts', '@bills', '@receipts', '@a11y'],
  },
  async ({ page }) => {
    email = `e2e-browser-${Date.now()}-${test.info().project.name.replace(/\W+/g, '-').toLowerCase()}@example.com`;
    await page.goto('/register');
    await page.getByLabel('Name').fill('Chee');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('correct horse');
    await button(page, 'Create account').click();

    // A new account can't start a bill until the email link is opened (KAN-77)
    await expect(
      page.getByRole('region', { name: 'Verify your email' }),
    ).toBeVisible();
    await page.goto(verifyLinkFor(email));
    await expect(page.getByText('Your email is verified.')).toBeVisible();
    await page.getByRole('link', { name: 'Go to my bills' }).click();
    await expect(
      page.getByRole('region', { name: 'Verify your email' }),
    ).toBeHidden();

    await expectAccessible(page, 'My bills (empty)');
    await page.getByRole('link', { name: '+ New bill' }).click();
    await page.getByLabel('What is this bill for?').fill('Dinner at Maxwell');
    await button(page, 'Next: add items').click();

    // A receipt photo picked from the gallery (KAN-88); "Scan receipt" opens the camera
    await page
      .getByLabel('Upload from Photos')
      .setInputFiles(
        fileURLToPath(new URL('fixtures/receipt.png', import.meta.url)),
      );
    await button(page, 'Read receipt').click();

    await expect(
      page.getByRole('heading', { name: 'Check items' }),
    ).toBeVisible();
    await expect(page.getByText('Receipt says $35.37 ✓')).toBeVisible();
    await expectAccessible(page, 'Check items');

    // Fix one item, like correcting the AI: Laksa was $8.50, not $7.50
    await page.getByRole('button', { name: 'Edit Laksa' }).click();
    await page.getByLabel('Price each ($)').fill('8.50');
    await button(page, 'Save item').click();
    await expect(
      page.getByRole('button', { name: 'Edit Laksa' }),
    ).toContainText('$8.50');
    // Now our total differs from the printed one, and the page says so
    await expect(page.getByRole('alert')).toContainText('Receipt says $35.37');
    shared.total = (
      await page
        .getByText('Our total', { exact: true })
        .locator('xpath=following-sibling::dd[1]')
        .innerText()
    ).trim();
    expect(shared.total).toMatch(/^\$\d+\.\d{2}$/);
    expect(shared.total).not.toBe('$35.37');

    await page.getByRole('link', { name: 'Next: share' }).click();
    await expect(
      page.getByRole('img', { name: 'QR code to join this bill' }),
    ).toBeVisible();
    shared.joinCode = (
      await page
        .getByText('Join code', { exact: true })
        .locator('xpath=following-sibling::*[1]')
        .innerText()
    ).trim();
    expect(shared.joinCode).toMatch(/^[2-9A-HJ-NP-Z]{5}$/);
    await expectAccessible(page, 'Share');

    // KAN-101: in My bills, a long swipe right pins the bill to the top
    await page.goto('/bills');
    const row = page.getByRole('link', { name: /Dinner at Maxwell/ });
    const box = (await row.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 20, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.9, y, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByRole('heading', { name: /Pinned/ })).toBeVisible();
    await expect(page).toHaveURL(/\/bills$/); // the swipe did not open the bill
    await expectAccessible(page, 'My bills (pinned)');
  },
);

// Each test gets a fresh browser context: like a different phone, with no login
// and nothing shared with the owner
test(
  'guest: join with the code, claim everything, total matches the bill',
  {
    tag: ['@bills', '@split', '@a11y'],
  },
  async ({ page: friend }) => {
    await friend.goto('/join');
    await friend.getByLabel('Code').fill(shared.joinCode);
    await button(friend, 'Join').click();

    await expect(
      friend.getByText('Chee invited you to split this bill'),
    ).toBeVisible();
    await friend.getByLabel('Your name').fill('Ben');
    await button(friend, 'Join').click();

    await expect(
      friend.getByRole('heading', { name: 'Tap what you had' }),
    ).toBeVisible();
    await expectAccessible(friend, 'Tap what you had');
    for (const item of ['Chicken Rice', 'Laksa', 'Tiger Beer']) {
      const row = friend.getByRole('button', { name: new RegExp(item) });
      await row.click();
      await expect(row).toHaveAttribute('aria-pressed', 'true');
    }
    // Ben had everything, so his total (with service and GST) is the whole bill
    await expect(
      friend.getByText('My total so far').locator('xpath=ancestor::dl[1]'),
    ).toContainText(shared.total);
  },
);
