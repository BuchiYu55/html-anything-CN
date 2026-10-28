import { NextRequest, NextResponse } from "next/server";
import { detectAgents } from "@/lib/agents/detect";
import { saveUserCustomKey, loadUserCustomKeys } from "@/lib/agents/cn-direct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const agents = detectAgents();
    const customKeys = loadUserCustomKeys();
    return NextResponse.json({
      agents,
      installedCount: agents.filter((a) => a.available).length,
      platform: process.platform,
      configuredKeys: Object.keys(customKeys).filter((k) => !!customKeys[k]),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "detection failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { providerId?: string; apiKey?: string };
    if (!body.providerId) {
      return NextResponse.json({ error: "missing providerId" }, { status: 400 });
    }
    saveUserCustomKey(body.providerId, body.apiKey || "");
    const agents = detectAgents();
    return NextResponse.json({
      ok: true,
      agents,
      installedCount: agents.filter((a) => a.available).length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed to save key" },
      { status: 500 },
    );
  }
}
