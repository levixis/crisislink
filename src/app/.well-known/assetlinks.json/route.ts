import { NextResponse } from "next/server";

/**
 * Digital Asset Links — the handshake that lets the Android TWA open this site
 * without a browser URL bar.
 *
 * Chrome fetches this from https://<domain>/.well-known/assetlinks.json and
 * checks that the signing certificate of the installed app is listed here. If
 * it does not match, the app still works but shows a Chrome address bar at the
 * top, which is the usual symptom of a fingerprint mismatch.
 *
 * The fingerprint comes from the keystore Bubblewrap generates:
 *   keytool -list -v -keystore android.keystore -alias android
 * Take the SHA-256 line and set TWA_SHA256_FINGERPRINT (colon-separated hex).
 *
 * Served as a route rather than a static file so the fingerprint lives in an
 * environment variable — the keystore is a signing credential and its details
 * should not be committed.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const fingerprint = process.env.TWA_SHA256_FINGERPRINT;
  const packageName = process.env.TWA_PACKAGE_NAME ?? "app.crisislink.twa";

  if (!fingerprint) {
    // Explicit and diagnosable, rather than an empty array that silently
    // produces a URL bar with no explanation.
    return NextResponse.json(
      { error: "TWA_SHA256_FINGERPRINT is not configured on this deployment" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: packageName,
          sha256_cert_fingerprints: fingerprint.split(",").map((f) => f.trim()),
        },
      },
    ],
    { headers: { "content-type": "application/json" } },
  );
}
