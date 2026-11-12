package repository

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/go-sql-driver/mysql"

	"pic/internal/catalog"
	"pic/internal/model"
)

// The recording driver checks transaction behavior only. Real SQL execution is
// covered by the opt-in MySQL integration test, not by this fake driver.
type importState struct {
	begin, commit, rollback, writes int
	failPages                       bool
	legacy                          bool
	layout                          []byte
	pageLayouts                     []driver.Value
}
type testConnector struct{ s *importState }

func (c testConnector) Connect(context.Context) (driver.Conn, error) { return &testConn{c.s}, nil }
func (c testConnector) Driver() driver.Driver                        { return testDriver{c.s} }

type testDriver struct{ s *importState }

func (d testDriver) Open(string) (driver.Conn, error) { return &testConn{d.s}, nil }

type testConn struct{ s *importState }

func (c *testConn) Prepare(string) (driver.Stmt, error)                          { return nil, errors.New("not supported") }
func (c *testConn) Close() error                                                 { return nil }
func (c *testConn) Begin() (driver.Tx, error)                                    { c.s.begin++; return testTx{c.s}, nil }
func (c *testConn) BeginTx(context.Context, driver.TxOptions) (driver.Tx, error) { return c.Begin() }
func (c *testConn) ExecContext(_ context.Context, q string, args []driver.NamedValue) (driver.Result, error) {
	c.s.writes++
	if c.s.failPages && strings.HasPrefix(strings.TrimSpace(q), "INSERT INTO book_pages") {
		return nil, errors.New("injected child failure")
	}
	if strings.HasPrefix(strings.TrimSpace(q), "INSERT INTO book_pages") && len(args) == 10 {
		c.s.pageLayouts = append(c.s.pageLayouts, args[9].Value)
	}
	return driver.RowsAffected(1), nil
}

func (c *testConn) QueryContext(_ context.Context, q string, _ []driver.NamedValue) (driver.Rows, error) {
	if c.s.legacy && !strings.Contains(q, "NULL AS dialogue_layout") {
		return nil, &mysql.MySQLError{Number: 1054, Message: "Unknown column 'dialogue_layout'"}
	}
	if strings.Contains(q, "LIMIT 0") {
		return &testRows{columns: []string{"dialogue_layout"}}, nil
	}
	if strings.HasPrefix(q, "SELECT p.page_number") {
		var layout driver.Value
		if !c.s.legacy && c.s.layout != nil {
			layout = c.s.layout
		}
		return &testRows{columns: []string{"page_number", "image_path", "image_alt", "text_zh", "text_original", "audio_zh_path", "audio_original_path", "dialogue_layout"}, rows: [][]driver.Value{{int64(1), "/assets/page.svg", "插画", "你好", "Hello", "", "", layout}}}, nil
	}
	return nil, errors.New("unexpected query")
}

type testRows struct {
	columns []string
	rows    [][]driver.Value
	index   int
}

func (r *testRows) Columns() []string { return r.columns }
func (r *testRows) Close() error      { return nil }
func (r *testRows) Next(dest []driver.Value) error {
	if r.index >= len(r.rows) {
		return io.EOF
	}
	copy(dest, r.rows[r.index])
	r.index++
	return nil
}

type testTx struct{ s *importState }

func (t testTx) Commit() error   { t.s.commit++; return nil }
func (t testTx) Rollback() error { t.s.rollback++; return nil }
func TestImportTransactionAndPrevalidation(t *testing.T) {
	c, err := catalog.Load("../../tests/fixtures/books", "../../tests/fixtures/web", false)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name                                string
		fail, bad                           bool
		wantBegin, wantCommit, wantRollback int
	}{{"successful batch", false, false, 1, 1, 0}, {"child error rolls back batch", true, false, 1, 0, 1}, {"bad second book never begins writes", false, true, 0, 0, 0}} {
		t.Run(tc.name, func(t *testing.T) {
			state := &importState{failPages: tc.fail}
			db := sql.OpenDB(testConnector{state})
			defer db.Close()
			books := append([]model.Book(nil), c.Books...)
			if tc.bad {
				books[1].PageCount = 999
			}
			err := New(db, false).Import(context.Background(), books)
			if (tc.fail || tc.bad) != (err != nil) {
				t.Fatalf("unexpected import error %v", err)
			}
			if state.begin != tc.wantBegin || state.commit != tc.wantCommit || state.rollback != tc.wantRollback {
				t.Fatalf("transaction outcome %+v", state)
			}
			if tc.bad && state.writes != 0 {
				t.Fatal("invalid batch wrote data")
			}
		})
	}
}
