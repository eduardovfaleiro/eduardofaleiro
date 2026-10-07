---
title: "How to speed up case-insensitive searches with an expression index"
description: "How to use a PostgreSQL expression index to make a case-insensitive prefix search approximately 33 times faster."
pubDate: 2026-10-07T20:10:00-03:00
tags: ["postgresql", "indexing"]
lang: en
---

Now for the fifth case study. We are going to perform a case-insensitive search
by establishment name.

**Scenario:** PostgreSQL 18.4, a `counterparties` table with 5 thousand rows, a
search for the `Mercado Central` prefix, and a warm cache.

| Scenario | Time | Blocks accessed | Index size |
|---|---:|---:|---:|
| No index | 1.175 ms | 64 | — |
| Regular index on `name` | 1.206 ms | 64 | 88 kB |
| Index on `upper(name)` | 0.036 ms | 20 | 88 kB |

## The query

Imagine a search where the user can type `Mercado Central`, `mercado central`,
or `MERCADO CENTRAL`. We want all three forms to find the same establishments.

To ignore the difference between uppercase and lowercase letters, we can apply
`upper()` to both the column and the search term. Because we are searching for
a prefix, we add `%` only at the end:

```sql
select
    id,
    name
from
    counterparties
where
    upper(name) like upper('Mercado Central') || '%';
```

This query found 21 establishments.

## With no index at all

Without an index, the database has to apply `upper()` to the name of every
establishment and then check whether the result starts with `MERCADO CENTRAL`:

```text
QUERY PLAN
----------------------------------------------------------------------------------------------------------------
Seq Scan on counterparties  (cost=0.00..139.00 rows=25 width=28) (actual time=0.044..1.151 rows=21.00 loops=1)
  Filter: (upper(name) ~~ 'MERCADO CENTRAL%'::text)
  Rows Removed by Filter: 4979
  Buffers: shared hit=64
Planning Time: 0.021 ms
Execution Time: 1.175 ms
```

The `Seq Scan` went through all 5 thousand rows, discarded 4,979, and returned
21. At this volume, 1.175 ms is still fast. However, the cost will grow with the
table because the search has to execute `upper()` row by row.

## The wrong index: `name`

Your first thought might be to create an index directly on the `name` column:

```sql
create index idx_counterparties_name
    on counterparties (name text_pattern_ops);
```

Notice that we have already included `text_pattern_ops` in this index. This
allows us to isolate the function applied to the column as the problem, rather
than the use of `like`.

However, this index stores the original value of `name`, while the query looks
for the result of `upper(name)`. To the database, those are two different
things.

Running the query again:

```text
QUERY PLAN
----------------------------------------------------------------------------------------------------------------
Seq Scan on counterparties  (cost=0.00..139.00 rows=25 width=28) (actual time=0.062..1.200 rows=21.00 loops=1)
  Filter: (upper(name) ~~ 'MERCADO CENTRAL%'::text)
  Rows Removed by Filter: 4979
  Buffers: shared hit=64
Planning Time: 0.019 ms
Execution Time: 1.206 ms
```

Notice that the index does not even appear in the plan. The database continues
to use a `Seq Scan`, accessing the same 64 blocks and discarding the same 4,979
rows.

The time of 1.206 ms versus 1.175 ms does not mean that the index made the query
slower. Because it was not used, this small difference is just normal variation
between executions. Even so, the index occupies 88 kB and adds overhead to
inserts and name updates without helping this search.

## The right index: `upper(name)`

If a query searches for the result of an expression, we can index the result of
that same expression:

```sql
create index idx_counterparties_upper_name
    on counterparties (upper(name) text_pattern_ops);
```

The B-tree now does not store `Mercado Central`, `mercado central`, and
`MERCADO CENTRAL` as different values. It stores the result of `upper(name)`,
exactly as it appears in the query's `where` clause.

We use `text_pattern_ops` so that the index can serve the prefix search with
`like` even with the database's `en_US.utf8` collation.

Running the query again:

```text
QUERY PLAN
-------------------------------------------------------------------------------------------------------------------------------------------
Bitmap Heap Scan on counterparties  (cost=4.54..52.83 rows=25 width=28) (actual time=0.012..0.028 rows=21.00 loops=1)
  Filter: (upper(name) ~~ 'MERCADO CENTRAL%'::text)
  Heap Blocks: exact=18
  Buffers: shared hit=20
  ->  Bitmap Index Scan on idx_counterparties_upper_name  (cost=0.00..4.53 rows=25 width=0) (actual time=0.005..0.005 rows=21.00 loops=1)
        Index Cond: ((upper(name) ~>=~ 'MERCADO CENTRAL'::text) AND (upper(name) ~<~ 'MERCADO CENTRAM'::text))
        Index Searches: 1
        Buffers: shared hit=2
Planning Time: 0.033 ms
Execution Time: 0.036 ms
```

A `Bitmap Index Scan` now appears. PostgreSQL transforms the prefix into a
range within the B-tree: it starts at `MERCADO CENTRAL` and stops before
`MERCADO CENTRAM`.

After finding the 21 entries in the index, the `Bitmap Heap Scan` accesses the
18 table blocks containing those establishments. That is why the plan still
shows the `like` filter: the range finds the candidates, and the filter confirms
the complete pattern.

## Prefix search

There is an important detail here: the index can only delimit the search
because the text starts with a fixed portion.

```sql
-- can use the prefix as a range in the index
where upper(name) like 'MERCADO CENTRAL%';

-- has no known point at which to start traversing the B-tree
where upper(name) like '%MERCADO CENTRAL%';
```

With `%` at the beginning, the value could be anywhere in the text. A B-tree
cannot solve that search. You would need to change the requirement to a prefix
search or use another strategy, such as a trigram index.

## What changed

The problem was not simply the absence of an index on the `name` column. The
problem was that the query did not search for `name`, but for `upper(name)`.

With the regular index, PostgreSQL continued to read all 64 table blocks and
execute the function on all 5 thousand rows. With the expression index, it
accessed 20 blocks, and the execution time dropped from 1.175 ms to 0.036 ms—
approximately 33 times faster.

Therefore, if a function is part of the query's access path, the index has to
store the result of that same function. Creating an index on the original
column and expecting the database to make the association on its own does not
work.
