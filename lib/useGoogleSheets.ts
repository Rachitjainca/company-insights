import { useState, useEffect } from "react";

export function useGoogleSheets() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user is authenticated on component mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      // Check if there's an access token by attempting a simple API call
      const response = await fetch("/api/sheets/status", {
        method: "GET",
        credentials: "include",
      });

      if (response.ok) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    } catch (err) {
      setIsAuthenticated(false);
    }
  };

  const initiateAuth = () => {
    setLoading(true);
    setError(null);
    window.location.href = "/api/sheets/auth";
  };

  const exportToSheets = async (data: any): Promise<any> => {
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

      const result = await response.json();

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
