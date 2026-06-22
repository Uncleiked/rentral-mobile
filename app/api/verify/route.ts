import { NextResponse } from "next/server";
import { createClient } from '@/lib/server';

const WORKFLOW_ID = "75f4f3af-4620-4a93-88c7-78f5f1382ac4";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Identify the user from your auth/session
  const vendorData = user.id;

  const origin = req.headers.get("origin") || "http://localhost:3000";

  const res = await fetch("https://verification.didit.me/v3/session/", {
    method: "POST",
    headers: {
      "x-api-key": process.env.DIDIT_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workflow_id: WORKFLOW_ID,
      vendor_data: vendorData, // our stable internal user id
      callback: `${origin}/feed`, // where Didit returns the user after the flow
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json({ error: "session_create_failed", detail }, { status: 502 });
  }

  const session = await res.json(); 
  // Return ONLY what the client needs
  return NextResponse.json({ url: session.url, session_id: session.session_id });
}
