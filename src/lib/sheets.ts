import { CompanyInsights, FinancialResult } from "@/types/financial";

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  apiKey: string;
}

export class GoogleSheetsService {
  private config: GoogleSheetsConfig;
  private baseUrl =
    "https://sheets.googleapis.com/v4/spreadsheets";

  constructor(config: GoogleSheetsConfig) {
    this.config = config;
  }

  async createNewSpreadsheet(title: string): Promise<string> {
    // This would require OAuth2 authentication
    // For now, return a placeholder
    console.log(`Creating spreadsheet: ${title}`);
    return "placeholder_sheet_id";
  }

  async appendFinancialData(
    spreadsheetId: string,
    sheetName: string,
    insights: CompanyInsights
  ): Promise<void> {
    const rows = this.formatFinancialData(insights);
    console.log(
      `Appending ${rows.length} rows to ${sheetName} in spreadsheet ${spreadsheetId}`
    );
  }

  private formatFinancialData(insights: CompanyInsights): unknown[][] {
    const rows: unknown[][] = [];

    // Header row
    rows.push([
      "Company",
      "Quarter",
      "Year",
      "Revenue",
      "Net Income",
      "EPS",
      "ROE",
      "ROA",
      "Debt/Equity",
    ]);

    // Data rows
    insights.financialResults.forEach((result: FinancialResult) => {
      rows.push([
        insights.company.name,
        result.quarter,
        result.year,
        result.revenue,
        result.netIncome,
        result.eps,
        result.roe,
        result.roa,
        result.debtToEquity,
      ]);
    });

    return rows;
  }

  async exportToGoogleSheets(
    spreadsheetId: string,
    insights: CompanyInsights
  ): Promise<void> {
    console.log(`Exporting data for ${insights.company.name}`);
    await this.appendFinancialData(
      spreadsheetId,
      "Financial Results",
      insights
    );
  }
}

export function createGoogleSheetsService(): GoogleSheetsService {
  const config: GoogleSheetsConfig = {
    spreadsheetId: process.env.NEXT_PUBLIC_SPREADSHEET_ID || "",
    apiKey: process.env.GOOGLE_SHEETS_API_KEY || "",
  };

  return new GoogleSheetsService(config);
}
