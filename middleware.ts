import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // only protect /admin routes
  if (!pathname.startsWith('/admin')) return NextResponse.next()

  // allow the login page through
  if (pathname === '/admin/login') return NextResponse.next()

  // check for admin session cookie
  const session = request.cookies.get('admin_session')?.value
  if (!session || session !== process.env.ADMIN_SECRET) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
