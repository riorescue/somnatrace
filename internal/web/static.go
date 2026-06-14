package web

import (
	"io/fs"
	"log"
	"net/http"
	"strings"

	"github.com/somnatrace/somnatrace/internal/config"
)

// RegisterStaticHandler wires the embedded frontend into mux.
// In production: serves embedded dist/ with SPA fallback to index.html.
// In development: no-op — Vite dev server handles the UI on port 5173.
func RegisterStaticHandler(mux *http.ServeMux, cfg *config.Config) {
	if cfg.IsDev() {
		return
	}

	sub, err := DistFS()
	if err != nil {
		log.Printf("warn: could not load embedded frontend: %v", err)
		return
	}

	fileServer := http.FileServer(http.FS(sub))
	mux.Handle("/", spaHandler(sub, fileServer))
}

// spaHandler serves static files and falls back to index.html for unknown routes
// so that client-side React Router paths work after a hard refresh.
func spaHandler(sub fs.FS, fileServer http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// "/" and "" always resolve to index.html via the file server as-is.
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			fileServer.ServeHTTP(w, r)
			return
		}

		if _, err := fs.Stat(sub, p); err != nil {
			// Unknown path → serve index.html for SPA client-side routing.
			r2 := r.Clone(r.Context())
			r2.URL.Path = "/"
			fileServer.ServeHTTP(w, r2)
			return
		}
		fileServer.ServeHTTP(w, r)
	}
}
