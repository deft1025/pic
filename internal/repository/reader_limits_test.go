package repository

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	"pic/internal/model"
)

// Recording SQL driver: exercise repository transaction decisions and argument
// handling without creating tables. It does not simulate MySQL row locking.
type readerState struct {
	importState
	locked bool
	active map[string]bool
	record model.RecommendationRecord
}
type readerConnector struct{ state *readerState }

func (c readerConnector) Connect(context.Context) (driver.Conn, error) {
	return &readerConn{testConn{&c.state.importState}, c.state}, nil
}
func (c readerConnector) Driver() driver.Driver { return testDriver{&c.state.importState} }

type readerConn struct {
	testConn
	state *readerState
}

func (c *readerConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	if strings.Contains(query, "FOR UPDATE") {
		c.state.locked = true
		return materialRows([][]driver.Value{{"10000"}}, 1), nil
	}
	if !c.state.locked {
		return nil, errors.New("reader state read before parent lock")
	}
	switch {
	case strings.HasPrefix(query, "SELECT book_id FROM reader_favorites"):
		rows := [][]driver.Value{}
		for id, active := range c.state.active {
			if active {
				rows = append(rows, []driver.Value{id})
			}
		}
		return materialRows(rows, 1), nil
	case strings.HasPrefix(query, "SELECT active FROM reader_favorites"):
		active, exists := c.state.active[args[1].Value.(string)]
		if !exists {
			return materialRows(nil, 1), nil
		}
		value := int64(0)
		if active {
			value = 1
		}
		return materialRows([][]driver.Value{{value}}, 1), nil
	case strings.HasPrefix(query, "SELECT book_ids,recommended_date"):
		if c.state.record.Date == "" {
			return materialRows(nil, 2), nil
		}
		raw, _ := json.Marshal(c.state.record.BookIDs)
		date, _ := time.Parse("2006-01-02", c.state.record.Date)
		return materialRows([][]driver.Value{{raw, date}}, 2), nil
	}
	return nil, fmt.Errorf("unexpected query: %s", query)
}

func (c *readerConn) ExecContext(_ context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	c.state.writes++
	switch {
	case strings.HasPrefix(query, "INSERT INTO reader_favorites"):
		c.state.active[args[1].Value.(string)] = args[2].Value.(int64) == 1
	case strings.HasPrefix(query, "INSERT INTO reader_recommendations"):
		if err := json.Unmarshal([]byte(args[1].Value.(string)), &c.state.record.BookIDs); err != nil {
			return nil, err
		}
		c.state.record.Date = args[2].Value.(string)
	default:
		return nil, fmt.Errorf("unexpected write: %s", query)
	}
	return driver.RowsAffected(1), nil
}

func TestFavoritesLimitIsAtomicAndKeepsRemovalAndRetriesAvailable(t *testing.T) {
	for _, tc := range []struct {
		name            string
		count           int
		ids             []string
		active, limited bool
		writes          int
	}{
		{"twentieth", 19, []string{"new"}, true, false, 1},
		{"twenty-first", 20, []string{"new"}, true, true, 0},
		{"whole batch rejected", 19, []string{"new", "another"}, true, true, 0},
		{"duplicate batch entries", 19, []string{"new", "new"}, true, false, 1},
		{"retry at limit", 20, []string{"book-0"}, true, false, 0},
		{"remove at limit", 20, []string{"book-0"}, false, false, 1},
		{"reactivate consumes slot", 20, []string{"inactive"}, true, true, 0},
		{"legacy over limit rejects additions", 25, []string{"new"}, true, true, 0},
		{"legacy over limit permits retry", 25, []string{"book-0"}, true, false, 0},
		{"legacy over limit permits removal", 25, []string{"book-0"}, false, false, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			state := &readerState{active: map[string]bool{"inactive": false}}
			for i := 0; i < tc.count; i++ {
				state.active[fmt.Sprintf("book-%d", i)] = true
			}
			db := sql.OpenDB(readerConnector{state})
			defer db.Close()
			err := New(db, false).SetFavorites(context.Background(), "10000", tc.ids, tc.active)
			if errors.Is(err, ErrFavoriteLimit) != tc.limited || (!tc.limited && err != nil) {
				t.Fatal("unexpected limit result", err)
			}
			if state.writes != tc.writes || state.begin != 1 || (state.commit == 1) == tc.limited || (state.rollback == 1) != tc.limited {
				t.Fatalf("unexpected transaction outcome: %+v", state)
			}
		})
	}
}

func TestRecommendationRepairComparesStoredBatchBeforeWriting(t *testing.T) {
	old := model.RecommendationRecord{Date: "2026-11-20", BookIDs: []string{"a", "b"}}
	repaired := model.RecommendationRecord{Date: old.Date, BookIDs: []string{"c", "b"}}
	for _, tc := range []struct {
		name                          string
		current, next, expected, want model.RecommendationRecord
		writes                        int
	}{
		{"repair same day", old, repaired, old, repaired, 1},
		{"concurrent repair wins", repaired, old, old, repaired, 0},
		{"first same day request wins", repaired, old, model.RecommendationRecord{}, repaired, 0},
		{"unchanged repair writes nothing", old, old, old, old, 0},
		{"clear exhausted pool", old, model.RecommendationRecord{Date: old.Date, BookIDs: []string{}}, old, model.RecommendationRecord{Date: old.Date, BookIDs: []string{}}, 1},
		{"old date cannot overwrite", old, model.RecommendationRecord{Date: "2026-11-19", BookIDs: []string{"z"}}, old, old, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			state := &readerState{record: model.RecommendationRecord{Date: tc.current.Date, BookIDs: append([]string{}, tc.current.BookIDs...)}}
			db := sql.OpenDB(readerConnector{state})
			defer db.Close()
			got, err := New(db, false).SaveRecommendation(context.Background(), "10000", tc.next, tc.expected)
			if err != nil || !reflect.DeepEqual(got, tc.want) || state.writes != tc.writes {
				t.Fatal("stale repair overwrote a newer batch", got, err, state.writes)
			}
		})
	}
}
