import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { DomainError } from '@/domain/contracts';
import { library } from '@/domain/server';
import { isLocalHost } from '@/http/local';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };

function checkAccess(request: NextRequest) {
  const host = request.headers.get('host');
  if (!isLocalHost(host)) {
    throw new DomainError('LOCAL_ONLY', '仅允许本机访问', 403);
  }
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    if (
      (origin && origin !== `http://${host}` && origin !== `https://${host}`) ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    ) {
      throw new DomainError('CROSS_SITE', '不允许跨站写入', 403);
    }
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
      throw new DomainError('JSON_REQUIRED', '写入请求必须使用 application/json');
    }
  }
}

async function readJson(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError('INVALID_JSON', '请提供 JSON 请求体');
  const decoder = new TextDecoder();
  let content = '',
    bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 512000) {
      await reader.cancel();
      throw new DomainError('TOO_LARGE', '请求内容过大', 413);
    }
    content += decoder.decode(value, { stream: true });
  }
  content += decoder.decode();
  try {
    return JSON.parse(content);
  } catch {
    throw new DomainError('INVALID_JSON', 'JSON 格式不正确');
  }
}

async function handle(request: NextRequest, context: Context) {
  try {
    checkAccess(request);
    const { path } = await context.params;
    const [resource, id, action] = path;
    const service = library(),
      method = request.method;
    let data: unknown,
      status = 200;
    if (resource === 'questions' && path.length === 1 && method === 'GET') {
      data = service.listQuestions(
        Object.fromEntries([...request.nextUrl.searchParams].filter(([, value]) => value !== '')),
      );
    } else if (resource === 'questions' && path.length === 1 && method === 'POST') {
      data = service.createQuestion(await readJson(request));
      status = 201;
    } else if (resource === 'questions' && path.length === 2 && method === 'GET') {
      data = service.getQuestion(id);
    } else if (resource === 'questions' && path.length === 2 && method === 'PATCH') {
      data = service.updateQuestion(id, await readJson(request));
    } else if (
      resource === 'questions' &&
      path.length === 3 &&
      method === 'POST' &&
      ['archive', 'restore'].includes(action)
    ) {
      await readJson(request);
      data = service.setArchived(id, action === 'archive');
    } else if (
      resource === 'questions' &&
      path.length === 3 &&
      method === 'POST' &&
      action === 'wordings'
    ) {
      data = service.addWording(id, await readJson(request));
      status = 201;
    } else if (resource === 'terms' && path.length === 1 && method === 'GET') {
      data = service.listTerms();
    } else if (resource === 'terms' && path.length === 1 && method === 'POST') {
      data = service.createTerm(await readJson(request));
      status = 201;
    } else if (resource === 'terms' && path.length === 2 && method === 'PATCH') {
      data = service.updateTerm(id, await readJson(request));
    } else if (resource === 'export' && path.length === 1 && method === 'GET') {
      return new NextResponse(JSON.stringify(service.exportData(), null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="yoweb-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      });
    } else throw new DomainError('NOT_FOUND', '接口不存在', 404);
    return NextResponse.json({ data }, { status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；'),
          },
        },
        { status: 400 },
      );
    if (error instanceof DomainError)
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    console.error('Yoweb API failure:', error instanceof Error ? error.name : 'Unknown error');
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: '操作失败，请检查数据库迁移与本地服务日志后重试',
        },
      },
      { status: 500 },
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH };
