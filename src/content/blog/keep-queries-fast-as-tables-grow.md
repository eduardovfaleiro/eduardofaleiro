---
title: "How an index keeps a query fast as a table grows 50 times"
description: "A PostgreSQL benchmark comparing the same query over 1, 10, and 50 million rows, with and without the right index."
pubDate: 2026-10-13T20:30:00-03:00
tags: ["postgresql", "indexing", "performance"]
lang: en
---

Now, let us see how the statement query from the first case study behaves as
the table grows from 1 million to 50 million transactions.

**Scenario:** PostgreSQL 18.4, a warm cache, account `47`, a period from January
1, 2025, to April 1, 2025, and tables with the same structure as
`transactions`.

| Rows | Table size | No index | Blocks accessed | With index | Blocks accessed | Index size |
|---:|---:|---:|---:|---:|---:|---:|
| 1 million | 90 MB | 32.864 ms | 11,458 | 0.014 ms | 4 | 30 MB |
| 10 million | 895 MB | 271.706 ms | 114,578 | 0.012 ms | 8 | 301 MB |
| 50 million | 4,478 MB | 936.632 ms | 573,017 | 0.015 ms | 10 | 1,504 MB |

![Query time over 1M, 10M, and 50M transactions](assets/benchmark-scale.svg)

## The query

We use the same query from the first case study:

```sql
select
    *
from
    benchmark_transactions
where
    account_id = 47
    and created_at between '2025-01-01' and '2025-04-01'
order by
    created_at desc;
```

For each volume, the query was first executed without an index and then with
the correct one:

```sql
create index idx_benchmark_transactions_account_created_at
    on benchmark_transactions (account_id, created_at);
```

The cache was warmed before collecting each plan with
`EXPLAIN (ANALYZE, BUFFERS)`.

## How the samples were created

The 1-million-row sample uses the first million transactions from the database.
It is then filled with the remaining rows to reach 10 million.

To reach 50 million without modifying the original database, the 10 million
transactions are repeated four times in an `UNLOGGED` table, shifting the `id`
and `created_at` of each copy:

```sql
insert into benchmark_transactions
select
    t.id + (copies.copy_number * 10000000),
    t.account_id,
    t.counterparty_id,
    t.amount,
    t.direction,
    t.status,
    t.category,
    t.created_at + (copies.copy_number * interval '1 microsecond')
from
    transactions t
cross join
    generate_series(1, 4) as copies(copy_number);
```

The microsecond shift is important. Without it, all five copies would have the
same `account_id, created_at` combination, and PostgreSQL could deduplicate
these keys in the B-tree leaf nodes. That would produce an artificially smaller
index than one with 50 million distinct keys.

## Without an index

With 1 million rows, the database used a `Parallel Seq Scan`, accessed 11,458
blocks, and took 32.864 ms:

```text
Parallel Seq Scan on benchmark_transactions  (actual time=24.417..25.725 rows=0.33 loops=3)
  Filter: ((created_at >= '2025-01-01 00:00:00+00'::timestamptz)
       AND (created_at <= '2025-04-01 00:00:00+00'::timestamptz)
       AND (account_id = 47))
  Rows Removed by Filter: 333333
  Buffers: shared hit=11458
Execution Time: 32.864 ms
```

At 10 million rows, the same plan accessed 114,578 blocks and took 271.706 ms.
At 50 million, it reached 573,017 blocks and 936.632 ms:

```text
Parallel Seq Scan on benchmark_transactions  (actual time=435.044..912.558 rows=8.33 loops=3)
  Filter: ((created_at >= '2025-01-01 00:00:00+00'::timestamptz)
       AND (created_at <= '2025-04-01 00:00:00+00'::timestamptz)
       AND (account_id = 47))
  Rows Removed by Filter: 16666658
  Buffers: shared hit=15957 read=557060
Execution Time: 936.632 ms
```

Notice that the number of blocks grows almost linearly. The 50-million-row
table has 50 times more rows than the 1-million-row table and required exactly
50 times more blocks: 573,017 versus 11,458.

This is the problem with a query that depends on a `Seq Scan`: every new
transaction adds to the work required, even if it belongs to another account
or falls outside the requested period.

## With an index

With the `(account_id, created_at)` index, the plan changes to an
`Index Scan Backward`:

```text
Index Scan Backward using idx_benchmark_transactions_account_created_at on benchmark_transactions
  (actual time=0.006..0.010 rows=25.00 loops=1)
  Index Cond: ((account_id = 47)
           AND (created_at >= '2025-01-01 00:00:00+00'::timestamptz)
           AND (created_at <= '2025-04-01 00:00:00+00'::timestamptz))
  Index Searches: 1
  Buffers: shared hit=10
Execution Time: 0.015 ms
```

The execution time stayed between 0.012 ms and 0.015 ms at all three scales.
The small difference is within the normal variation of such a short execution.

This does not mean that searching a B-tree has constant cost. Traversal grows
in O(log n), but the tree's height changes very slowly. Between 1 million and
50 million rows, the executor needed to access only 4, 8, and 10 blocks to find
and return the matching transactions.

## What changed

Without an index, multiplying the table size by 50 also multiplied the number
of accessed blocks by 50 and increased the query time from 32.864 ms to 936.632
ms.

With the index, the database does not scan transactions from other accounts. It
descends directly to `account_id = 47`, finds the start of the period, and reads
only the required entries. Even with 50 million rows and a table of
approximately 4.4 GB, the query took 0.015 ms.

The complete benchmark can be reproduced with
[`benchmark_scale.sql`](https://github.com/eduardovfaleiro/fintech-ledger/blob/589ea0b/benchmarks/benchmark_scale.sql).
The table it creates is disposable and is removed at the end of the execution.
