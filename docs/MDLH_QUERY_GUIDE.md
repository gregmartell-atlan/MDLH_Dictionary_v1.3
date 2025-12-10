# MDLH Query Guide

> **For:** CSMs, Data Stewards, Analysts, and anyone who wants to explore metadata without writing SQL

---

## What is This Tool?

The Metadata Lakehouse (MDLH) Dictionary lets you explore your Atlan metadata by clicking through guided wizards. You don't need to know SQL — pick what you want to find, answer a few questions, and the tool builds the query for you.

Think of it as "ask your data catalog a question and get an answer."

---

## What Questions Can I Answer?

### Assets (Tables, Views, Columns)

| Question | How to Find It |
|----------|----------------|
| What tables exist in a schema? | Assets → Browse Tables |
| Who owns a specific table? | Assets → Browse → look at Owner column |
| What columns does a table have? | Assets → Browse Columns → enter table name |
| Is this table certified/verified? | Assets → Browse → look at Status column |

### Lineage (Data Flow)

| Question | How to Find It |
|----------|----------------|
| What feeds into this table? | Lineage → Upstream |
| What depends on this table? | Lineage → Downstream |
| If I change this column, what breaks? | Lineage → Downstream → set entity type to Column |
| Where does this metric come from? | Lineage → Upstream → enter the metric's table |

**Why this matters:** Before changing a table, you want to know what dashboards, reports, or downstream tables will be affected.

### Glossary (Business Definitions)

| Question | How to Find It |
|----------|----------------|
| What's the official definition of "Active Customer"? | Glossary → Browse Terms → search |
| Which tables use a glossary term? | Glossary → Term Impact → enter term name |
| Who owns a glossary category? | Glossary → Browse → look at Owner column |

**Why this matters:** Business terms like "Revenue" or "Churn" can mean different things to different teams. The glossary tells you the official definition.

### Usage (Who Uses What)

| Question | How to Find It |
|----------|----------------|
| Who's been querying this table? | Usage → Table History |
| What are the most popular tables? | Usage → Top Tables |
| When was this table last accessed? | Usage → Table History → look at last_seen column |

**Important:** Usage data comes from Snowflake's ACCOUNT_USAGE, which has a 2-3 hour delay. Very recent queries won't show up yet.

---

## How the Wizard Works

### Step-by-Step Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  1. Pick    │ ──▶ │  2. Enter   │ ──▶ │  3. Review  │ ──▶ │  4. See     │
│  Category   │     │  Details    │     │  & Run      │     │  Results    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
   Lineage?            Table name?        Check the SQL       Your answer!
   Assets?             How many hops?     Click "Run"
   Glossary?           
```

### What Each Step Does

**Step 1: Discovery**
The tool looks at your metadata database to find what tables are available. You'll see something like "Found 6 process tables" — this is normal.

**Step 2: Your Input**
Enter the thing you're looking for:
- A table name (e.g., `CUSTOMER_DIM`)
- A GUID (the long unique ID, e.g., `a1b2c3d4-e5f6-...`)
- A search term (e.g., `revenue`)

**Step 3: Review**
You'll see the SQL query that was built. You don't need to understand it, but you can copy it if you want to run it elsewhere or modify it later.

**Step 4: Results**
Your answer appears in a table. Each row is one result.

---

## Reading Your Results

### Column Types You'll See

| Column | What It Means | Example |
|--------|---------------|---------|
| **name** | The asset's display name | `CUSTOMER_DIM` |
| **qualified_name** | Full path: Database.Schema.Table | `PROD.ANALYTICS.CUSTOMER_DIM` |
| **owner** | Who's responsible for this asset | `jane.smith@acme.com` |
| **guid** | Unique identifier (you can usually ignore this) | `a1b2c3d4-e5f6-7890-abcd-...` |
| **status** | Certification status | `VERIFIED`, `DRAFT`, `DEPRECATED` |
| **inputs** | What flows INTO this (for lineage) | `[3 items]` — click to expand |
| **outputs** | What flows OUT of this (for lineage) | `[2 items]` — click to expand |
| **depth** | How many hops away (for lineage) | `1` = direct, `2` = one step removed |

### Special Values

| You See | It Means |
|---------|----------|
| `null` or empty | No value exists for this field |
| `[3 items]` | An array — click or hover to see contents |
| `{...}` | A JSON object — click to expand |
| Long GUID | A unique ID — you can copy it for other lookups |

---

## When Things Go Wrong

### Zero Results

**"Query returned no results"** usually means one of three things:

1. **The data doesn't exist**
   - Lineage hasn't been captured for this asset yet
   - The glossary term isn't linked to any tables
   - **What to do:** Check if metadata sync is configured for this source

2. **Wrong table selected**
   - The wizard auto-picked a table with no data
   - **What to do:** Use the dropdown to select a different table (look for one with more rows)

3. **Search too narrow**
   - Your exact search term didn't match anything
   - **What to do:** Try a partial match or remove filters

### Error Messages

| Error | What It Means | What to Do |
|-------|---------------|------------|
| "Permission denied" | Your Snowflake role can't access this data | Ask your admin to grant access, or switch roles |
| "Table not found" | The metadata table doesn't exist | Check that Atlan is syncing to this database |
| "Query timeout" | Query took too long | Reduce depth, add filters, or try off-peak hours |
| "Invalid identifier" | Something's wrong with the table/column name | Report this bug — the tool shouldn't show invalid options |

### Slow Queries

Some queries take a while. This is normal for:
- **Lineage with depth > 2** — each hop multiplies the work
- **Usage history** — scanning query logs is expensive
- **Unfiltered browses** — looking at ALL tables takes time

**Tips:**
- Start with depth = 1, then increase if needed
- Add a schema or name filter
- Run during off-peak hours (early morning, weekends)

---

## Common Workflows

### "What will break if I change this table?"

This is **downstream impact analysis** — the most common reason to use lineage.

1. Go to **Lineage → Downstream**
2. Enter your table name (e.g., `CUSTOMER_DIM`)
3. Set depth:
   - `1` = only direct consumers
   - `2` = consumers of consumers
   - `3+` = full impact (slower)
4. Click **Run**

**Reading results:**
- `depth = 1` rows are directly connected to your table
- `depth = 2` rows are one step removed (they consume something that consumes your table)
- Look at `outputs` column to see what each process feeds

### "Where does this number come from?"

This is **upstream lineage** — tracing data back to its source.

1. Go to **Lineage → Upstream**
2. Enter the table or column that has the number
3. Set depth = 2 or 3 (numbers often flow through multiple steps)
4. Click **Run**

**Reading results:**
- Follow the chain backward: your table ← intermediate table ← source table
- `inputs` column shows what each step pulls from

### "Find all tables related to customers"

1. Go to **Assets → Browse Tables**
2. In the filter, type `customer`
3. Results show all tables with "customer" in the name

**Pro tip:** Search is case-insensitive, so `customer`, `CUSTOMER`, and `Customer` all work.

### "Who's been using the revenue table?"

1. Go to **Usage → Table History**
2. Enter `REVENUE` (or whatever the table is called)
3. Click **Run**

**Reading results:**
- `user_name` = who ran the query
- `query_count` = how many times
- `last_seen` = most recent query
- `avg_duration_sec` = how long their queries typically take

---

## Understanding Lineage Depth

Lineage depth controls how far the tool traces connections.

```
Your Table
    │
    ▼ depth = 1
┌─────────┐
│ Direct  │  ← These consume your table directly
│ Consumer│
└─────────┘
    │
    ▼ depth = 2
┌─────────┐
│ Consumer│  ← These consume something that consumes your table
│ of      │
│ Consumer│
└─────────┘
    │
    ▼ depth = 3
   ...        ← And so on
```

**Recommendations:**
- **Impact analysis:** Start with depth = 1, increase if you need more
- **Root cause:** Use depth = 2-3 to find original sources
- **Full lineage graph:** Use depth = 3+, but expect slower results

---

## Glossary of Terms

| Term | Plain English |
|------|---------------|
| **Asset** | Any data object — table, view, column, dashboard, etc. |
| **Lineage** | The path data takes from source to destination |
| **Upstream** | Where data comes FROM (sources, parents, inputs) |
| **Downstream** | Where data goes TO (consumers, children, outputs) |
| **GUID** | Globally Unique Identifier — like a serial number for each asset |
| **Qualified Name** | Full path including database and schema (e.g., `DB.SCHEMA.TABLE`) |
| **Process** | Something that moves or transforms data — could be a dbt model, ETL job, or SQL query |
| **Entity** | A single asset record in the metadata catalog |
| **Depth** | How many hops away from your starting point |

---

## Data Freshness

Not everything is real-time. Here's what to expect:

| Data Type | How Fresh? | Why? |
|-----------|------------|------|
| **Asset metadata** (names, owners, columns) | ~24 hours | Synced daily from sources |
| **Lineage** | ~24 hours | Extracted during metadata sync |
| **Glossary terms** | Real-time | Managed directly in Atlan |
| **Usage/query history** | 2-3 hours delayed | Snowflake ACCOUNT_USAGE limitation |

If you just created something and don't see it, wait for the next sync cycle.

---

## Getting Help

**Something not working?**
- Check the troubleshooting section above
- Look at the error message — it usually tells you what's wrong

**Need access?**
- Contact your Snowflake admin for role/permission issues
- Contact your Atlan admin if metadata isn't syncing

**Found a bug?**
- Note what you clicked and what you expected vs. what happened
- Screenshot the error if there is one
- Report to your internal data platform team

**Want a feature?**
- This tool is actively being developed
- Feature requests welcome — talk to your CSM or data platform team

---

## Quick Reference Card

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Enter` | Run query (when in input field) |
| `Esc` | Cancel / close modal |
| `Tab` | Move to next field |

### URL Parameters
You can bookmark specific queries by copying the URL after running. Share with teammates to give them the same view.

### Export Options
- **Copy SQL** — Get the raw query to run elsewhere
- **Copy Results** — Get results as CSV (if available)
- **Open in Editor** — Modify the query manually

---

*Last updated: December 2025*


