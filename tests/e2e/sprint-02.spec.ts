import { test, expect } from '@playwright/test';

test('Sprint 2 面经演示：材料进入 Inbox，修改/批量接受/忽略，只为一题确认面试报告', async ({
  page,
  request,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto('/sources');
  const sourceForm = page.locator('.source-form');
  await sourceForm.getByLabel('来源名称').fill('自有面经测试');
  await sourceForm.getByLabel('来源主机').fill('interview.example');
  await sourceForm
    .getByRole('combobox', { name: '规则检查', exact: true })
    .selectOption('USER_CONFIRMED');
  await sourceForm.getByRole('combobox', { name: '本地保存上限' }).selectOption('EXCERPT');
  await sourceForm.getByLabel('权限判断依据').fill('自有测试夹具，允许本地保存片段；不允许外发');
  await sourceForm
    .getByRole('combobox', { name: '模型外发权限', exact: true })
    .selectOption('DENY');
  await sourceForm.getByRole('button', { name: '登记来源', exact: true }).click();
  await expect(page.locator('.source-card').filter({ hasText: '自有面经测试' })).toBeVisible();
  await page.getByRole('link', { name: '＋ 手动收录材料', exact: true }).click();
  await page
    .getByRole('combobox', { name: '选择来源' })
    .selectOption({ label: '自有面经测试 · interview.example' });
  await page.getByRole('combobox', { name: '内容类型' }).selectOption('INTERVIEW');
  await page.getByLabel('材料链接').fill('https://interview.example/report-1');
  await page.getByLabel('材料标题').fill('一段自有面试记录（Sprint 2）');
  await page.getByRole('combobox', { name: '本次保存范围' }).selectOption('EXCERPT');
  await page
    .getByLabel('合法摘录')
    .fill('第一题：如何设计重试？\n第二题：何时停止工具调用？\n第三题：如何记录错误？');
  await page
    .getByRole('textbox', { name: '个人笔记', exact: true })
    .fill('只把有明确依据的问题记为面试报告。');
  const input = [
    ['设计工具重试（Sprint 2）', '如何设计重试？'],
    ['设计停止条件（Sprint 2）', '何时停止工具调用？'],
    ['设计错误日志（Sprint 2）', '如何记录错误？'],
  ];
  for (const [index, [text, original]] of input.entries()) {
    await page.getByRole('button', { name: '＋ 添加候选题' }).click();
    const candidate = page.locator('.candidate-draft').nth(index);
    await candidate.getByLabel('候选题目', { exact: true }).fill(text);
    await candidate.getByLabel('候选原始问法', { exact: true }).fill(original);
    await candidate.getByRole('combobox', { name: '作答任务' }).selectOption('DESIGN');
  }
  await page.getByRole('button', { name: '保存材料并进入审核' }).click();
  await expect(page.getByRole('heading', { name: '收录审核' })).toBeVisible();
  const batchUrl = page.url();
  expect((await (await request.get('/api/questions?q=（Sprint 2）')).json()).data.total).toBe(0);
  const reviewItems = page.locator('.review-item');
  await expect(reviewItems).toHaveCount(3);
  const revised = '设计幂等与退避的工具重试（Sprint 2）';
  await reviewItems.nth(0).getByLabel('采用的标准题目').fill(revised);
  await page.getByRole('checkbox', { name: '选择候选 1', exact: true }).check();
  await page.getByRole('checkbox', { name: '选择候选 2', exact: true }).check();
  await page.getByRole('button', { name: '接受所选', exact: true }).click();
  await expect(reviewItems.nth(0).locator('.pill')).toHaveText('修改后接受');
  await expect(reviewItems.nth(1).locator('.pill')).toHaveText('已接受');
  await reviewItems.nth(2).getByRole('button', { name: '忽略此题' }).click();
  await expect(reviewItems.nth(2).locator('.pill')).toHaveText('已忽略');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/sprint-02-review.png', fullPage: true });
  await page.getByRole('link', { name: '查看材料详情' }).click();
  const documentUrl = page.url(),
    contextForm = page.locator('.context-form');
  await contextForm.getByLabel('经历标识').fill('作者 A 的技术面试');
  await contextForm.getByLabel('公司名称').fill('示例科技');
  await contextForm.getByLabel('岗位名称').fill('AI 工程师');
  await contextForm.getByLabel('面试起始日期').fill('2026-09-01');
  await contextForm.getByLabel('轮次', { exact: true }).fill('技术一面');
  await contextForm.getByRole('button', { name: '建立面试经历' }).click();
  await expect(
    page.locator('.interview-card').getByRole('heading', { name: '作者 A 的技术面试' }),
  ).toBeVisible();
  await page.goto(batchUrl);
  await page.locator('.review-item').nth(0).getByRole('link', { name: '查看已收录题目' }).click();
  await expect(page.locator('.question-text')).toHaveText(revised);
  await expect(page.getByTestId('mention-count')).toHaveText('1');
  await expect(page.getByTestId('occurrence-count')).toHaveText('0');
  await expect(page.locator('.wording').getByText('如何设计重试？', { exact: true })).toBeVisible();
  await page.locator('.occurrence-form summary').click();
  await page.getByLabel('报告依据', { exact: true }).fill('原文第一题明确报告工具重试问题。');
  await page.getByRole('checkbox', { name: /我确认这段真实面试经历/ }).check();
  await page.getByRole('button', { name: '确认报告出现', exact: true }).click();
  await expect(page.getByTestId('occurrence-count')).toHaveText('1');
  await page.locator('.occurrence-form summary').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/sprint-02-evidence.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/sprint-02-evidence-mobile.png', fullPage: true });
  await page.goto(batchUrl);
  await page.locator('.review-item').nth(1).getByRole('link', { name: '查看已收录题目' }).click();
  await expect(page.getByTestId('mention-count')).toHaveText('1');
  await expect(page.getByTestId('occurrence-count')).toHaveText('0');
  await page.goto(documentUrl);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(pageErrors).toEqual([]);
});

test('仅链接的 JD 可关联已有题、保存岗位、重复导入与失效后保留证据', async ({ page, request }) => {
  const source = (
    await (
      await request.post('/api/sources', {
        data: { name: '招聘链接测试', type: 'COMPANY', host: 'jobs.example' },
      })
    ).json()
  ).data;
  const question = (
    await (
      await request.post('/api/questions', { data: { text: '已有题：准备工程岗位（S2 link）' } })
    ).json()
  ).data;
  await page.goto('/imports/new');
  await page.getByRole('combobox', { name: '选择来源' }).selectOption(source.id);
  await page.getByRole('combobox', { name: '内容类型' }).selectOption('JD');
  await page.getByLabel('材料链接').fill('https://jobs.example/role');
  await page.getByLabel('材料标题').fill('工程师岗位链接');
  await page
    .getByRole('textbox', { name: '个人笔记', exact: true })
    .fill('个人准备方向，不保存 JD 原文。');
  await expect(page.getByLabel('合法摘录')).toHaveCount(0);
  await page.getByRole('button', { name: '＋ 添加候选题' }).click();
  await page.getByLabel('候选题目', { exact: true }).fill('整理工程岗位准备要点');
  await page.getByRole('button', { name: '保存材料并进入审核' }).click();
  await expect(page.getByRole('heading', { name: '收录审核' })).toBeVisible();
  const batchId = page.url().split('/').at(-1)!;
  const card = page.locator('.review-item');
  await card.getByRole('combobox', { name: '采用方式' }).selectOption('EXISTING');
  await card.getByLabel('查找已有题目', { exact: true }).fill('S2 link');
  await card.getByRole('button', { name: '查找已有题', exact: true }).click();
  await card.getByRole('combobox', { name: '关联目标' }).selectOption(question.id);
  await card.getByRole('button', { name: '确认关联', exact: true }).click();
  await expect(card.locator('.pill')).toHaveText('已接受');
  await card.getByRole('link', { name: '查看已收录题目' }).click();
  await expect(page.locator('.question-text')).toHaveText(question.text);
  await expect(page.getByTestId('mention-count')).toHaveText('1');
  await expect(page.getByTestId('occurrence-count')).toHaveText('0');
  await expect(page.locator('.occurrence-form')).toHaveCount(0);
  await expect(page.locator('.wording')).toHaveCount(0);
  await page.locator('.evidence-card').getByRole('link', { name: '工程师岗位链接' }).click();
  const form = page.locator('.context-form');
  await form.getByLabel('公司名称').fill('示例招聘公司');
  await form.getByLabel('岗位名称').fill('后端工程师');
  await form.getByRole('button', { name: '保存岗位上下文' }).click();
  await expect(
    page.locator('.interview-card').getByRole('heading', { name: '后端工程师' }),
  ).toBeVisible();
  await page
    .locator('.document-status')
    .getByRole('combobox', { name: '材料状态' })
    .selectOption('UNAVAILABLE');
  await page.getByRole('button', { name: '更新状态', exact: true }).click();
  await expect(
    page.locator('.document-status').getByRole('combobox', { name: '材料状态' }),
  ).toHaveValue('UNAVAILABLE');
  const duplicated = await request.post('/api/imports/manual', {
    data: {
      sourceId: source.id,
      url: 'https://jobs.example/role?utm_source=test',
      title: '工程师岗位链接',
      contentOrigin: 'JD',
      notes: '个人准备方向，不保存 JD 原文。',
      candidates: [{ text: '整理工程岗位准备要点', locator: '第 1 题' }],
    },
  });
  expect(duplicated.status()).toBe(200);
  const data = (await duplicated.json()).data;
  expect(data.id).toBe(batchId);
  expect(data.items[0].status).toBe('ACCEPTED');
  await page.goto(`/questions/${question.id}`);
  await expect(page.locator('.evidence-card')).toContainText('页面失效');
  await expect(page.getByTestId('mention-count')).toHaveText('1');
  expect(
    (await (await request.get(`/api/questions/${question.id}`)).json()).data.contentOrigin,
  ).toBe('SELF_CREATED');
});

test('收录 API 拒绝权限越界，批量返回逐项失败且可继续处理', async ({ request }) => {
  const s = (
    await (
      await request.post('/api/sources', {
        data: { name: 'API 链接来源', type: 'OTHER', host: 'api.example' },
      })
    ).json()
  ).data;
  const denied = await request.post('/api/imports/manual', {
    data: {
      sourceId: s.id,
      url: 'https://api.example/a',
      title: '不应保存原文',
      excerpt: '不允许的原文',
    },
  });
  expect(denied.status()).toBe(400);
  const batch = (
    await (
      await request.post('/api/imports/manual', {
        data: {
          sourceId: s.id,
          url: 'https://api.example/a',
          title: '合法链接',
          candidates: [
            { text: 'API候选A', locator: '1' },
            { text: 'API候选B', locator: '2' },
          ],
        },
      })
    ).json()
  ).data;
  const reviewed = await request.post('/api/inbox/review', {
    data: {
      items: [
        { id: batch.items[0].id, revision: 1, decision: 'ACCEPT' },
        {
          id: batch.items[1].id,
          revision: 1,
          decision: 'ACCEPT',
          targetQuestionId: '00000000-0000-4000-8000-000000000099',
        },
      ],
    },
  });
  expect(reviewed.status()).toBe(200);
  expect((await reviewed.json()).data.map((r: { ok: boolean }) => r.ok)).toEqual([true, false]);
  expect((await (await request.get(`/api/imports/${batch.id}`)).json()).data.items[1].status).toBe(
    'REVIEW_PENDING',
  );
  const retry = await request.post('/api/inbox/review', {
    data: { items: [{ id: batch.items[1].id, revision: 1, decision: 'IGNORE' }] },
  });
  expect((await retry.json()).data[0].ok).toBe(true);
  const notInterview = await request.post('/api/interviews', {
    data: { documentId: batch.document.id, reportKey: '不能推断面试' },
  });
  expect(notInterview.status()).toBe(400);
  const exported = await (await request.get('/api/export')).json();
  expect(exported.formatVersion).toBe(2);
  expect(exported.questionMentions.length).toBeGreaterThan(0);
});
