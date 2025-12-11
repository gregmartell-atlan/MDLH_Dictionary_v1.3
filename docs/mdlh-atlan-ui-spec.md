# MDLH Atlan UI – Product & UI Spec

## 0. Purpose

MDLH Atlan UI is a SQL exploration interface inspired by DuckDB's UI:
- Three-panel layout:
  - **Left**: database explorer
  - **Center**: SQL editor + results grid
  - **Right**: column diagnostics
- Designed for **high information density** and **fast data exploration**.
- All query-related UI must align with this document.

---

## 1. Tech & Layout

### Stack

- React + TypeScript
- Tailwind CSS
- `monaco-editor` (or equivalent) for SQL editing
- Optional: table/virtualized list library for large result sets

### Global layout

- Full height: `h-screen flex flex-col`
- Header: ~40px tall, `border-b`, `bg-white`
- Main: `flex flex-1 overflow-hidden`

### Columns

- Left sidebar (database tree): `w-64` (~256px), `border-r`, `bg-slate-50`, `overflow-auto`
- Center (editor + results): `flex-1 flex flex-col overflow-hidden`
- Right sidebar (column diagnostics): `w-80` (~320px), `border-l`, `bg-white`, `overflow-auto`

### Base typography

- Default text: 13px, regular, system font
- Secondary text / metadata: 11–12px, muted color
- Section titles: 13–14px, `font-medium`
- Code: monospace, 13px

---

## 2. Left Sidebar – Database Explorer

### Behavior

- Shows an "Attached databases" tree.
- Node types: database → schema → table.
- Expand/collapse with a chevron.
- Table nodes optionally show row count (right-aligned, soft gray).
- Remote DBs can show a globe icon and a tooltip with the URL.

### Structure

- Header row at top:
  - Text: "Attached databases"
  - Small chevron or dropdown icon on the right
  - Height around 28–32px
- Tree rows:
  - Height ~22–24px
  - Indentation by depth (database, schema, table)
  - Hover: light gray background
  - Selected: subtle light purple/blue background (no thick border)

### Styling hints

- Use small icons:
  - Database: cylinder
  - Schema: folder
  - Table: grid
- Layout per row: `[chevron] [icon] [name] … [rowCount/meta on the far right]`

### Component: `DatabaseTree`

---

## 3. Center – SQL Editor + Results

### 3.1 SQL Editor

- Use `monaco-editor` configured for SQL.
- Editor sits in a panel with a small top toolbar.

#### Toolbar

- Left-to-right:
  - `Run` button (▶ icon + "Run" label)
  - Connection selector (`[ memory ▾ ]` style)
  - Optional: Format, Fullscreen
- Height ~32px, `border-b`, tight padding

#### Editor behavior

- Multi-statement SQL (separated by `;`).
- Line numbers enabled.
- Can support both single-line (`--`) and block (`/*...*/` / `/**...*/`) comments.

### Component: `SqlEditor`

### 3.2 Results Grid

- Appears under the editor when last query produced a result set.
- Must support large results with virtual scrolling.
- Columns:
  - Header shows type icon + column name
  - Click header to sort
  - Clicking header or any cell in the column notifies the right panel about the "selected column"

#### Header

- Height ~28px
- Background slightly tinted (`bg-slate-50`)
- Border between columns

#### Cells

- Row height ~24px (no giant tables)
- Striped rows (very subtle difference)
- Text truncated with ellipsis
- Selected row/selected cell uses soft highlight background

#### Footer

- Shows: `{rowCount} rows · {columnCount} columns · {execTimeMs} ms`

#### Type icons (can be plain text)

- Numeric: `123`
- String: `T`
- Date: `📅` (or simple calendar icon)
- Timestamp/time: `⏰` / clock icon
- Boolean: `◐`

### Component: `ResultsGrid`

---

## 4. Right Sidebar – Column Diagnostics

This is the key differentiator. It has **two modes**:

1. **Overview mode** – no specific column selected
2. **Detail mode** – a specific column selected

State is driven by the current result set and the user's column selection.

### 4.1 Shared Header

At the top of the right sidebar:

- Title row:
  - "Current Cell" label on the left
  - Small icon or checkbox/pin button on the right
- Subtext under title:
  - `{rowCount} Rows`
  - `{columnCount} Columns`
- Below that:
  - Search input "Search columns…"
  - Small view mode dropdown "Default ▾"

### Component: `ColumnDiagnosticsHeader`

### 4.2 Overview Mode (All Columns List)

Shows all columns in the current result set with compact stats.

#### Per row

- Left segment:
  - Type icon + column name
- Middle:
  - Sparkline or distinct-count indicator
- Right:
  - Null percentage (if > 0%)

#### Behavior

- Click row → switch to detail mode for that column.
- Hover: light highlight.
- Active: subtle colored background.

#### Visual details

- **Sparklines**:
  - Tiny histogram or line, width ~80–120px, height ~16–18px.
  - For numeric / date / timestamp columns.
- **Distinct counts**:
  - For low-cardinality text columns, show `"573 distinct"` instead of sparkline.
- **Null percentage**:
  - Right aligned, small font, colored (e.g., teal) when non-zero.

### Component: `ColumnOverviewList`

### 4.3 Detail Mode (Per Column)

When a column is selected, show:

1. **Header**:
   - Type icon + column name (+ data type as small muted text)
   - Optional "back to all columns" link
2. **Summary line**:
   - `{rowCount} rows`
   - `{nullPct}% null`
   - `{distinctCount} distinct` (if applicable)
3. **Type-specific chart**
4. **Numeric/stat table**

#### Numeric columns

- Chart: histogram with vertical bars (bucketed data).
- Optionally support brushing / selection on the histogram.
- Selected bucket info (if applicable):
  - `{lower} to {upper} · {count} ({percent}%)`
- Stats table rows (left label, right value):
  - min
  - max
  - 5th %
  - 25th %
  - 50th % (median)
  - 75th %
  - 95th %
  - mean
  - standard deviation

#### Date / timestamp columns

- Chart: time series or bucketed count by day/week.
- Show earliest / latest dates.
- Show overall time range description (e.g., "about 7 days").

#### Text / categorical columns

- Show top N categories as a bar chart or ranked list:
  - label, count, percentage.
- Show distinct count and null count.

#### Boolean columns

- Two or three bars: `true`, `false`, `null` with counts and percentages.

### Component: `ColumnDetail`

### Data shape for diagnostics

Backend should provide for each column:

```ts
interface ColumnProfile {
  columnName: string;
  type: string;
  histogram?: { bins: number[]; edges: number[] };
  timeBuckets?: { label: string; count: number }[];
  topCategories?: { value: string; count: number }[];
  distinctCount?: number;
  nullCount?: number;
  rowCount: number;
  summaryStats?: {
    min?: number;
    max?: number;
    p5?: number;
    p25?: number;
    p50?: number;
    p75?: number;
    p95?: number;
    mean?: number;
    stddev?: number;
  };
}
```

---

## 5. Interaction Rules

- **Running a query**:
  - Updates the center ResultsGrid with rows/columns.
  - Updates the right ColumnDiagnostics with new profiles.
  - Clears selected column unless the name still exists in the new result set.
- **Clicking a column header or cell in the grid**:
  - Sets that column as the "selected column" in diagnostics.
- **Changing selection in the diagnostics list**:
  - Only affects the right panel; it does not re-run the query.

---

## 6. What NOT To Do

- Don't redesign MDLH Atlan UI to look like a generic admin dashboard.
- Don't use huge cards, giant headings, or excessive whitespace.
- Don't hide or remove column diagnostics when adding features; they are core to the product.

All future MDLH Atlan UI work must stay consistent with this spec unless explicitly updated.

---

## 7. Color Palette

### Primary Colors

```css
--mdlh-primary: #3366FF;        /* Atlan blue */
--mdlh-primary-light: #EBF0FF;  /* Light blue for hover states */
--mdlh-primary-dark: #254EDB;   /* Dark blue for active states */
```

### Neutral Colors

```css
--mdlh-bg: #FFFFFF;             /* Main background */
--mdlh-sidebar-bg: #F8FAFC;     /* Sidebar backgrounds (slate-50) */
--mdlh-border: #E2E8F0;         /* Borders (slate-200) */
--mdlh-text: #1E293B;           /* Primary text (slate-800) */
--mdlh-text-muted: #64748B;     /* Secondary text (slate-500) */
```

### Semantic Colors

```css
--mdlh-success: #10B981;        /* Green for available/success */
--mdlh-warning: #F59E0B;        /* Amber for warnings */
--mdlh-error: #EF4444;          /* Red for errors */
--mdlh-info: #3B82F6;           /* Blue for info states */
```

---

## 8. Component Inventory

| Component | Location | Purpose |
|-----------|----------|---------|
| `DatabaseTree` | Left sidebar | Database/schema/table explorer |
| `SqlEditor` | Center top | Monaco-based SQL editor |
| `ResultsGrid` | Center bottom | Query results table |
| `ColumnDiagnosticsHeader` | Right sidebar top | Stats summary + search |
| `ColumnOverviewList` | Right sidebar | All columns with sparklines |
| `ColumnDetail` | Right sidebar | Single column deep dive |
| `QueryEditor` | Existing | Full-featured editor (uses SqlEditor) |
| `RecommendedQueries` | Modal | Context-aware query suggestions |

---

## 9. API Contract (Future)

### POST /api/query

Request:
```json
{
  "sql": "SELECT * FROM TABLE_ENTITY LIMIT 100",
  "database": "FIELD_METADATA",
  "schema": "PUBLIC"
}
```

Response:
```json
{
  "columns": ["GUID", "NAME", "TYPENAME", ...],
  "columnTypes": ["VARCHAR", "VARCHAR", "VARCHAR", ...],
  "rows": [["abc-123", "my_table", "Table"], ...],
  "rowCount": 100,
  "executionTimeMs": 42
}
```

### POST /api/column-profiles

Request:
```json
{
  "queryId": "abc-123",
  "columns": ["GUID", "NAME", "ROWCOUNT"]
}
```

Response:
```json
{
  "profiles": [
    {
      "columnName": "GUID",
      "type": "VARCHAR",
      "distinctCount": 2849,
      "nullCount": 0,
      "rowCount": 2849
    },
    {
      "columnName": "ROWCOUNT",
      "type": "NUMBER",
      "histogram": { "bins": [10, 25, 50, 100, 200], "edges": [0, 1000, 5000, 10000, 50000, 100000] },
      "summaryStats": { "min": 0, "max": 98234, "mean": 5432.1, "p50": 2341 }
    }
  ]
}
```

---

## 10. Migration Notes

### From DuckDB-inspired to MDLH Atlan UI

1. Remove yellow/cream color variables (`--duck-yellow`, `--cream-base`, etc.)
2. Use blue/white palette as defined in Section 7
3. Update component names if needed to match inventory
4. Ensure three-panel layout is default for Query Editor tab
5. Keep existing functionality; this is a visual/naming rebrand, not a functional rewrite


