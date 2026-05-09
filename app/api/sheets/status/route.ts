import { NextRequest, NextResponse } from "next/server";

/**
 * Check if the user is authenticated with Google Sheets
 */
export async function GET(request: NextRequest) {
  try {
    const accessToken = request.cookies.get("google_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    // Verify the token is still valid by making a simple API call
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" + accessToken
    );

    if (!response.ok) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    return NextResponse.json({ authenticated: true }, { status: 200 });
  } catch (error) {
    console.error("Auth status check error:", error);
    return NextResponse.json(
      { authenticated: false },
      { status: 401 }
    );
  }
}
