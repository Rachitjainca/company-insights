import { useState, useEffect } from "react";

type SheetsExportPayload = Record<string, unknown>;

interface SheetsExportResult {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  sheetUrl?: string;
  [key: string]: unknown;
}

export function useGoogleSheets() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user is authenticated on component mount
  useEffect(() => {
    let cancelled = false;

    const runAuthStatusCheck = async () => {
      try {
        const response = await fetch("/api/sheets/status", {
          method: "GET",
          credentials: "include",
        });

        if (!cancelled) {
          setIsAuthenticated(response.ok);
        }
      } catch {
        if (!cancelled) {
          setIsAuthenticated(false);
        }
      }
    };

    void runAuthStatusCheck();

    return () => {
      cancelled = true;
    };
  }, []);

  const initiateAuth = () => {
    setLoading(true);
    setError(null);
    window.location.href = "/api/sheets/auth";
  };

  const exportToSheets = async (data: SheetsExportPayload): Promise<SheetsExportResult> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/sheets/export", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = (await response.json()) as SheetsExportResult;

      if (!response.ok) {
        if (result.code === "NOT_AUTHENTICATED") {
          // Need to authenticate
          initiateAuth();
          throw new Error(
            "Please authorize Google Sheets access first."
          );
        }
        throw new Error(result.error || "Export failed");
      }

      setLoading(false);
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Export failed";
      setError(errorMessage);
      setLoading(false);
      throw err;
    }
  };

  return {
    isAuthenticated,
    loading,
    error,
    initiateAuth,
    exportToSheets,
    setError,
  };
}
