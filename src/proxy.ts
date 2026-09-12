import { NextRequest, NextResponse } from 'next/server';
import { isLocalHost } from './http/local';

// Cover server-rendered pages as well as APIs against nonlocal Host headers.
export function proxy(request: NextRequest) {
  if (!isLocalHost(request.headers.get('host'))) {
    return NextResponse.json(
      { error: { code: 'LOCAL_ONLY', message: '仅允许本机访问' } },
      { status: 403 },
    );
  }
  return NextResponse.next();
}
