import type { Page } from '@playwright/test';

/** Answers every `/universe/types/{id}` lookup with a stub type in `groupId` (default: a gun). */
export async function answerAnyType(page: Page, groupId = 46): Promise<void> {
  await page.route(/\/universe\/types\/\d+$/, async (route) => {
    const typeId = Number(/\/universe\/types\/(\d+)$/.exec(route.request().url())![1]);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type_id: typeId,
        name: `Type ${typeId}`,
        description: '',
        group_id: groupId,
        published: true,
        dogma_attributes: [],
      }),
    });
  });
}
