import { NextRequest, NextResponse } from 'next/server';
import { createToken } from '@/lib/auth';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const { username, password } = await request.json().catch(() => ({}) as Record<string, unknown>);
  const expectedUser = process.env.AUTH_USER;
  const expectedPass = process.env.AUTH_PASS;
  const secret = process.env.AUTH_SECRET;

  if (!expectedUser || !expectedPass || !secret) {
    return NextResponse.json({ error: '서버 인증 설정이 없습니다.' }, { status: 500 });
  }
  if (username !== expectedUser || password !== expectedPass) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const token = await createToken(secret, WEEK_MS);
  const response = NextResponse.json({ ok: true });
  response.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: WEEK_MS / 1000,
    path: '/',
  });
  return response;
}
