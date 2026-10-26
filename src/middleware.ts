import { NextResponse } from "next/server";
import { ONLINE_DEMO } from "@/lib/deploy";

/** 线上演示版没有可保存数据的磁盘：账号、同步、资料库、反馈的接口直接返回 503，不去打开数据库 */
export function middleware() {
  if (!ONLINE_DEMO) return NextResponse.next();
  return NextResponse.json(
    { error: "线上演示版不提供此功能，请使用本机版", demo: true },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export const config = {
  matcher: ["/api/auth/:path*", "/api/sync/:path*", "/api/library/:path*", "/api/feedback/:path*", "/api/admin/:path*"],
};
