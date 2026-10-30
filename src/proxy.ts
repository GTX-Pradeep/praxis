import { NextResponse, type NextRequest } from "next/server";
import { DASHBOARD, type Role } from "./lib/config";
import { SESSION_COOKIE, verifySession } from "./lib/token";

// Fast, optimistic check before a page loads. The real authorization check
// (against the database) happens again in each page and API route.
const PROTECTED: Record<string, Role> = {
  "/admin": "admin",
  "/faculty": "faculty",
  "/student": "student",
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  const area = Object.keys(PROTECTED).find((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (area) {
    if (!session) {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (session.role !== PROTECTED[area]) {
      return NextResponse.redirect(new URL(DASHBOARD[session.role], request.url));
    }
  }

  // Logged-in users don't need the login/register pages
  if (session && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL(DASHBOARD[session.role], request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/faculty/:path*", "/student/:path*", "/login", "/register"],
};
