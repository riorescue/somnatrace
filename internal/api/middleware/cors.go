// Package middleware provides composable HTTP middleware for the SomnaTrace API.
package middleware

import "net/http"

// CORS wraps next with permissive cross-origin headers so that the Vite dev
// server on port 5173 can call the Go API on port 8080 without browser errors.
// In production both are served from the same origin, so the headers are
// harmless but not required.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
