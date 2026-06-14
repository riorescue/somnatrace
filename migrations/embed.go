// Package migrations embeds all SQL migration files into the binary so that
// the server can apply schema changes without any external file dependencies.
// Files are named NNN_description.sql and applied in lexicographic order by
// the db.Migrate function.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
