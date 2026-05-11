import { NextResponse } from "next/server";

/**
 * OAuth2 Authorization Initiation Endpoint
 * Redirects the user to Google's authorization page
 */
export async function GET() {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return NextResponse.json(
        {
          error: "Missing configuration. Please set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI environment variables.",
        },
        { status: 500 }
      );
    }

    // Generate authorization URL
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.append("client_id", clientId);
    authUrl.searchParams.append("redirect_uri", redirectUri);
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("scope", [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/documents",
    ].join(" "));
    authUrl.searchParams.append("access_type", "offline");
    authUrl.searchParams.append("prompt", "consent");

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    console.error("Auth initialization error:", error);
    return NextResponse.json(
      { error: "Failed to initialize authentication" },
      { status: 500 }
    );
  }
}
