import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('Sprint 1 演示：无来源建题、整理、原文、查询、归档恢复和导出', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '从一个好问题开始' })).toBeVisible();
  await page.getByRole('link', { name: '领域与标签', exact: true }).click();
  const newTerm = page.locator('.new-term');
  await newTerm.getByRole('combobox', { name: '类型', exact: true }).selectOption('TAG');
  await newTerm.getByLabel('名称', { exact: true }).fill('Tool Calling');
  await newTerm.getByLabel('别名', { exact: true }).fill('工具调用');
  await newTerm.getByRole('button', { name: '确认添加' }).click();
  await expect(newTerm.getByRole('status')).toHaveText('已加入正式词表');
  await page.getByRole('link', { name: '全部题目', exact: true }).click();
  await page.getByRole('link', { name: '＋ 添加题目' }).click();
  const original = '如何设计 Coding Agent 的工具重试机制？';
  await page.getByLabel('标准题目').fill(original);
  await page.getByRole('combobox', { name: '作答任务', exact: true }).selectOption('DESIGN');
  await page.getByRole('combobox', { name: '参考难度', exact: true }).selectOption('MEDIUM');
  await page.getByRole('combobox', { name: '整理状态', exact: true }).selectOption('ORGANIZED');
  await page.getByRole('checkbox', { name: 'Agent', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Coding Agent', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Tool Calling', exact: true }).check();
  await page.getByLabel('个人备注').fill('关注幂等和退避策略');
  await page.getByRole('button', { name: '保存题目', exact: true }).click();
  await expect(page.locator('.question-text')).toHaveText(original);
  const detailUrl = page.url();
  await page.getByText('＋ 关联原始问法', { exact: true }).click();
  for (const [text, source] of [
    ['工具失败后如何安全重试？', '个人笔记 / 第 1 节'],
    ['怎样控制重试次数和退避？', '个人笔记 / 第 2 节'],
  ]) {
    await page.getByLabel('原始问法', { exact: true }).fill(text);
    await page.getByLabel('原文定位', { exact: true }).fill(source);
    await page.getByRole('button', { name: '确认关联并保存' }).click();
    await expect(page.locator('.wording').getByText(text, { exact: true })).toBeVisible();
  }
  await page.getByRole('link', { name: '编辑题目' }).click();
  const revised = `${original} 请考虑幂等与停止条件。`;
  await page.getByLabel('标准题目').fill(revised);
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.locator('.question-text')).toHaveText(revised);
  await expect(page.locator('.wording')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.question-text')).toHaveText(revised);
  await page.getByRole('link', { name: '全部题目', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索题目' }).fill('安全重试');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.locator('.question-card')).toHaveCount(1);
  await expect(page.getByText('原始问法命中', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: revised, exact: true }).click();
  await page.getByRole('button', { name: '归档题目', exact: true }).click();
  await expect(page.locator('.archive-notice')).toBeVisible();
  await page.getByRole('link', { name: '全部题目', exact: true }).click();
  await expect(page.locator('.question-card')).toHaveCount(0);
  await page.getByRole('link', { name: '已归档', exact: true }).click();
  await expect(page.locator('.question-card')).toHaveCount(1);
  await page.getByRole('link', { name: revised, exact: true }).click();
  await page.getByRole('button', { name: '恢复题目', exact: true }).click();
  await expect(page.locator('.archive-notice')).toHaveCount(0);
  await expect(page.locator('.pill')).toHaveText('已整理');
  await expect(page.locator('.wording')).toHaveCount(2);
  await page.goto('/');
  await page.getByRole('textbox', { name: '搜索题目' }).fill('工具调用');
  await page.getByLabel('整理状态筛选').selectOption('ORGANIZED');
  await page.getByLabel('难度筛选').selectOption('MEDIUM');
  await page.getByRole('button', { name: '应用筛选' }).click();
  await expect(page.locator('.question-card')).toHaveCount(1);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: '↓ 导出题库' }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.questions[0].text).toBe(revised);
  expect(exported.originalWordings).toHaveLength(2);
  expect(exported.questionTerms).toHaveLength(3);
  await page.screenshot({ path: 'test-results/library-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('link', { name: '＋ 添加题目' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/library-mobile.png', fullPage: true });
  await page.getByRole('link', { name: '清除条件', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '搜索题目' })).toHaveValue('');
  await expect(page.getByLabel('难度筛选')).toHaveValue('');
  await expect(page.getByLabel('整理状态筛选')).toHaveValue('');
  await page.getByRole('button', { name: '应用筛选' }).click();
  await expect(page.locator('.question-card')).toHaveCount(1);
  await page.goto(detailUrl);
  await expect(page.locator('.wording')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('失败路径：重复词表、保存失败保留输入、失效题目和非法筛选', async ({ page }) => {
  await page.goto('/taxonomy');
  const form = page.locator('.new-term');
  await form.getByLabel('名称', { exact: true }).fill('Agent');
  await form.getByRole('button', { name: '确认添加' }).click();
  await expect(form.getByRole('alert')).toContainText('重复');
  await expect(form.getByLabel('名称', { exact: true })).toHaveValue('Agent');
  await page.goto('/questions/new');
  await page.getByLabel('标准题目').fill('输入需要保留');
  await page.route('**/api/questions', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: '测试：写入暂时失败' } }),
    }),
  );
  await page.getByRole('button', { name: '保存题目', exact: true }).click();
  await expect(page.locator('.editor').getByRole('alert')).toContainText('写入暂时失败');
  await expect(page.getByLabel('标准题目')).toHaveValue('输入需要保留');
  await page.goto('/questions/nonexistent');
  await expect(page.getByRole('heading', { name: '没有找到这道题' })).toBeVisible();
  await page.goto('/?status=MASTERED');
  await expect(page.getByRole('heading', { name: '筛选条件不正确' })).toBeVisible();
});

test('API 拒绝跨站、非法结构和过期更新；导出包含归档', async ({ request }) => {
  const invalid = await request.post('/api/questions', { data: { text: '  ' } });
  expect(invalid.status()).toBe(400);
  const forged = await request.post('/api/questions', {
    data: { text: '伪造', creationMethod: 'MODEL_GENERATED' },
  });
  expect(forged.status()).toBe(400);
  const crossSite = await request.post('/api/questions', {
    data: { text: '不应创建' },
    headers: { Origin: 'https://other.example' },
  });
  expect(crossSite.status()).toBe(403);
  const invalidHost = await request.get('/api/export', { headers: { Host: 'evil.example' } });
  expect(invalidHost.status()).toBe(403);
  expect((await request.get('/', { headers: { Host: 'evil.example' } })).status()).toBe(403);
  const malformed = await request.post('/api/questions', {
    data: '{broken',
    headers: { 'Content-Type': 'application/json' },
  });
  expect(malformed.status()).toBe(400);
  const created = await request.post('/api/questions', { data: { text: 'API 无来源建题' } });
  expect(created.status()).toBe(201);
  const q = (await created.json()).data;
  expect(q.creationMethod).toBe('USER_CREATED');
  const updated = await request.patch(`/api/questions/${q.id}`, {
    data: { revision: q.revision, text: '更新题目' },
  });
  expect(updated.status()).toBe(200);
  const stale = await request.patch(`/api/questions/${q.id}`, {
    data: { revision: q.revision, text: '旧编辑' },
  });
  expect(stale.status()).toBe(409);
  expect((await request.post(`/api/questions/${q.id}/archive`, { data: {} })).status()).toBe(200);
  const exported = await (await request.get('/api/export')).json();
  expect(
    exported.questions.find((item: { id: string }) => item.id === q.id).archivedAt,
  ).toBeTruthy();
});
