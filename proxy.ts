import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith('/admin')) return NextResponse.next()
  if (pathname === '/admin/login') return NextResponse.next()

  const session = request.cookies.get('admin_session')?.value
  if (!session || session !== process.env.ADMIN_SECRET) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
