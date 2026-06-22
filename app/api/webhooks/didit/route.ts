import crypto from "node:crypto";
import { createAdminClient } from '@/lib/admin';
import prisma from '@/lib/db';

// Whole-number floats (1.0) -> integers (1), recursively. Matches Didit's server canonicalisation.
function shortenFloats(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shortenFloats);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shortenFloats(x)]),
    );
  }
  if (typeof v === "number" && !Number.isInteger(v) && v % 1 === 0) return Math.trunc(v);
  return v;
}

// Recursive lexicographic key sort (array order preserved).
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-signature-v2") ?? "";
  const ts = Number(req.headers.get("x-timestamp"));

  // 1. Freshness — reject anything older/newer than 300s (replay protection).
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) {
    return new Response("stale", { status: 401 });
  }

  // 2. Canonicalise (shortenFloats -> sortKeys -> JSON.stringify with unescaped Unicode, the JS default).
  const parsed = JSON.parse(raw);
  const canonical = JSON.stringify(sortKeys(shortenFloats(parsed)));

  // 3. Constant-time HMAC-SHA256 compare against X-Signature-V2.
  const secret = process.env.DIDIT_WEBHOOK_SECRET;
  if (secret) {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(canonical, "utf8")
      .digest("hex");
    if (
      sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    ) {
      return new Response("bad sig", { status: 401 });
    }
  } else {
    // Note: in production DIDIT_WEBHOOK_SECRET MUST be set.
    console.warn("DIDIT_WEBHOOK_SECRET is not set. Skipping signature validation.");
  }

  // 4. Idempotency — deduping could be added here.
  
  const vendorDataUserId = parsed.vendor_data; // our stable internal user id from create-session
  const adminClient = createAdminClient();

  // 5. Apply the decision. Status strings are case-sensitive literals.
  try {
    switch (parsed.status) {
      case "Approved":
        // Update Prisma
        await prisma.user.update({
          where: { id: vendorDataUserId },
          data: { 
            kyc_verified: true,
          }
        });

        // Update Supabase Auth user metadata
        await adminClient.auth.admin.updateUserById(vendorDataUserId, {
          user_metadata: {
            kyc_verified: true
          }
        });
        break;
      case "Declined":
      case "In Review":
      case "Resubmitted":
      case "Kyc Expired":
        // Handle other states if necessary (e.g. updating a generic verificationStatus field)
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("Error processing Didit webhook:", err);
    return new Response("error processing", { status: 500 });
  }

  // 6. Return 2xx within 5 seconds.
  return new Response("ok");
}
