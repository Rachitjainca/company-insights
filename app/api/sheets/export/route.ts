import { NextRequest, NextResponse } from "next/server";

interface ExportRequest {
  company: {
    symbol: string;
    name: string;
    isin?: string;
  };
  documents: Array<{
    category: string;
    fiscalYear: string;
    quarter?: string;
    title: string;
    url: string;
    type: string;
  }>;
}

/**
 * Refresh the access token using refresh token
 */
async function refreshAccessToken(
  refreshToken: string
): Promise<string | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        grant_type: "refresh_token",
      }).toString(),
    });

    if (!response.ok) {
      console.error("Token refresh failed:", await response.text());
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("Error refreshing token:", error);
    return null;
  }
}

/**
 * Create a new Google Sheet
 */
async function createSpreadsheet(
  accessToken: string,
  title: string
): Promise<string | null> {
  try {
    const response = await fetch(
      "https://sheets.googleapis.com/v4/spreadsheets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            title: title,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("Create spreadsheet failed:", await response.text());
      return null;
    }

    const data = await response.json();
    return data.spreadsheetId;
  } catch (error) {
    console.error("Error creating spreadsheet:", error);
    return null;
  }
}

/**
 * Append IR document rows to Google Sheet
 */
async function appendDocumentRows(
  accessToken: string,
  spreadsheetId: string,
  data: ExportRequest
): Promise<boolean> {
  try {
    const CATEGORY_LABELS: Record<string, string> = {
      "quarterly-results": "Quarterly Results",
      "investor-presentation": "Investor Presentation",
      "concall": "Concall",
      "annual-report": "Annual Report",
      "kpi-handbook": "KPI Handbook",
    };

    const headers = [
      "Company",
      "Ticker",
      "Category",
      "Period",
      "Title",
      "URL",
      "Type",
    ];

    const rows = data.documents.map((doc) => {
      const period = [doc.fiscalYear, doc.quarter].filter(Boolean).join(" · ");
      return [
        data.company.name,
        data.company.symbol,
        CATEGORY_LABELS[doc.category] ?? doc.category,
        period,
        doc.title,
        doc.url,
        doc.type.toUpperCase(),
      ];
    });

    const values = [headers, ...rows];

    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
      }
    );

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Export financial data to Google Sheets
 */
export async function POST(request: NextRequest) {
  try {
    // Get access token from cookie
    const accessToken = request.cookies.get("google_access_token")?.value;
    const refreshToken = request.cookies.get("google_refresh_token")?.value;

    if (!accessToken && !refreshToken) {
      return NextResponse.json(
        {
          error: "Not authenticated. Please authorize Google Sheets access first.",
          code: "NOT_AUTHENTICATED",
        },
        { status: 401 }
      );
    }

    let token: string | undefined = accessToken;

    // If access token is expired, try to refresh it
    if (!token && refreshToken) {
      token = (await refreshAccessToken(refreshToken)) ?? undefined;
      if (!token) {
        return NextResponse.json(
          {
            error: "Failed to refresh authentication. Please authorize again.",
            code: "TOKEN_REFRESH_FAILED",
          },
          { status: 401 }
        );
      }
    }

    if (!token) {
      return NextResponse.json(
        {
          error: "Not authenticated. Please authorize Google Sheets access first.",
          code: "NOT_AUTHENTICATED",
        },
        { status: 401 }
      );
    }

    // Parse request body
    const companyData: ExportRequest = await request.json();

    if (!companyData.company || !Array.isArray(companyData.documents)) {
      return NextResponse.json(
        { error: "Missing required company or documents data" },
        { status: 400 }
      );
    }

    // Create spreadsheet
    const title = `${companyData.company.symbol} - IR Documents - ${new Date().toISOString().split("T")[0]}`;
    const spreadsheetId = await createSpreadsheet(token, title);

    if (!spreadsheetId) {
      return NextResponse.json(
        {
          error: "Failed to create Google Sheet. Make sure Google Sheets API is enabled.",
          code: "SHEET_CREATE_FAILED",
        },
        { status: 500 }
      );
    }

    // Append document rows
    await appendDocumentRows(token, spreadsheetId, companyData);

    // Make the sheet shareable
    const permissionResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "reader",
          type: "anyone",
        }),
      }
    );

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    return NextResponse.json(
      {
        success: true,
        spreadsheetId,
        sheetUrl,
        message: `Successfully exported ${companyData.documents.length} document${companyData.documents.length !== 1 ? "s" : ""} to Google Sheets`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      {
        error: "Failed to export to Google Sheets",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
