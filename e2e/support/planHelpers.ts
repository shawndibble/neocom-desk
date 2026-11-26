import type { Page } from '@playwright/test';
import { expect } from './testBase';

export async function addCaldariCruiserToNewPlan(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New plan' }).click();
  await expect(page.getByPlaceholder('Search skills…')).toBeVisible();

  await page.getByPlaceholder('Search skills…').fill('Caldari Cruiser');
  await page.getByRole('button', { name: /Caldari Cruiser/ }).click();
  await page.getByRole('button', { name: 'Level I', exact: true }).click();

  await expect(
    page.getByRole('button', { name: 'More actions for Caldari Cruiser' })
  ).toBeVisible();
}
