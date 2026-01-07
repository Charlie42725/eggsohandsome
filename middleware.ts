import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public paths that don't require authentication
  const publicPaths = ['/login', '/api/auth/login']
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path))

  // Get session from cookie
  const sessionId = request.cookies.get('session')?.value
  const sessionData = request.cookies.get('session_data')?.value

  // If no session and trying to access protected route, redirect to login
  if (!sessionId || !sessionData) {
    if (!isPublicPath) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return NextResponse.next()
  }

  // Parse session data to get user role
  const [userId, expiresAtStr] = sessionData.split(':')
  const expiresAt = parseInt(expiresAtStr)

  // Check if session expired
  if (Date.now() > expiresAt) {
    if (!isPublicPath) {
      const response = NextResponse.redirect(new URL('/login', request.url))
      response.cookies.delete('session')
      response.cookies.delete('session_data')
      return response
    }
  }

  // If authenticated and trying to access login page, redirect to home
  if (isPublicPath && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - *.png, *.jpg, *.jpeg, *.gif, *.svg, *.ico (public images)
     * - manifest.webmanifest (PWA manifest)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.svg$|.*\\.ico$|manifest.webmanifest).*)',
  ],
}
