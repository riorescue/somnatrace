package handlers

import (
	"net/http"

	"github.com/somnatrace/somnatrace/internal/models"
	"github.com/somnatrace/somnatrace/internal/service"
)

// UtilitiesHandler serves maintenance and diagnostics endpoints: database
// statistics, data deletion, WAL vacuum, and SD card detection.
type UtilitiesHandler struct {
	svc *service.UtilitiesService
}

// NewUtilitiesHandler returns a UtilitiesHandler backed by svc.
func NewUtilitiesHandler(svc *service.UtilitiesService) *UtilitiesHandler {
	return &UtilitiesHandler{svc: svc}
}

// Stats handles GET /api/v1/stats and returns per-table row counts and the
// total on-disk database size.
func (h *UtilitiesHandler) Stats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.svc.Stats()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get stats")
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

// DeleteAll handles DELETE /api/v1/data and removes all user data rows while
// preserving the schema.
func (h *UtilitiesHandler) DeleteAll(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeleteAll(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete data")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Vacuum handles POST /api/v1/maintenance/vacuum and checkpoints the WAL then
// runs VACUUM to defragment and reclaim free space.
func (h *UtilitiesHandler) Vacuum(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Vacuum(); err != nil {
		writeError(w, http.StatusInternalServerError, "vacuum failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Detect handles GET /api/v1/detect and returns a list of mounted volumes that
// look like ResMed SD cards.
func (h *UtilitiesHandler) Detect(w http.ResponseWriter, r *http.Request) {
	cards, err := h.svc.DetectResMedCards()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "detection failed")
		return
	}
	if cards == nil {
		cards = make([]models.DetectedCard, 0)
	}
	writeJSON(w, http.StatusOK, map[string]any{"cards": cards})
}

// ListBackups handles GET /api/v1/backups and returns all saved backup snapshots.
func (h *UtilitiesHandler) ListBackups(w http.ResponseWriter, r *http.Request) {
	backups, err := h.svc.ListBackups()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list backups")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"backups": backups})
}

// CreateBackup handles POST /api/v1/backups and creates a new database snapshot.
func (h *UtilitiesHandler) CreateBackup(w http.ResponseWriter, r *http.Request) {
	backup, err := h.svc.CreateBackup()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "backup failed")
		return
	}
	writeJSON(w, http.StatusCreated, backup)
}

// RestoreBackup handles POST /api/v1/backups/{id}/restore and replaces all
// current data with the contents of the named backup.
func (h *UtilitiesHandler) RestoreBackup(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.svc.RestoreBackup(id); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// DeleteBackup handles DELETE /api/v1/backups/{id} and removes the named backup.
func (h *UtilitiesHandler) DeleteBackup(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.svc.DeleteBackup(id); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
