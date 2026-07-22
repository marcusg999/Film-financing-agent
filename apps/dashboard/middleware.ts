import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Interim access gate until Supabase Auth lands (Phase 5). Contact data
 * must never sit on an open URL (docs/09 access control), so production
 * fails CLOSED: no DASHBOARD_PASSWORD set → nothing is served.
 * Local dev without the var stays open.
 */
export function middleware(req: NextRequest): NextResponse {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("dashboard locked: DASHBOARD_PASSWORD is not configured", {
      status: 503,
    }) as NextResponse;
  }

  const expected = `Basic ${btoa(`team:${password}`)}`;
  if (req.headers.get("authorization") === expected) {
    return NextResponse.next();
  }
  return new NextResponse("authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="film-funding-agent"' },
  }) as NextResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
