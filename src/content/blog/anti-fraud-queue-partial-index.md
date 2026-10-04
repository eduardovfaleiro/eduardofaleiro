---
title: "How to reduce an index from 387 MB to 3 MB using a partial index"
description: "How a partial PostgreSQL index serves an anti-fraud queue using 3,104 kB instead of the 387 MB required by a full index."
pubDate: 2026-10-04T20:15:00-03:00
tags: ["postgresql", "indexing"]
lang: en
---

Now for the fourth case study. We are going to retrieve the 100 transactions
that have been flagged the longest to build an anti-fraud review queue.

**Scenario:** PostgreSQL 18.4, a `transactions` table with 10 million rows,
100,194 of them with the `flagged` status, and a warm cache.

| Scenario | Time | Blocks accessed | Index size |
|---|---:|---:|---:|
| No index for the queue | 229.133 ms | 114,670 | — |
| Full index `(status, created_at, id)` | 0.071 ms | 104 | 387 MB |
| Partial index `(created_at, id) where status = 'flagged'` | 0.047 ms | 103 | 3,104 kB |

## The query

For the queue, we want the transactions that have been waiting the longest to
come first. We therefore sort by `created_at` in ascending order and retrieve
only the first 100:

```sql
select
    id,
    account_id,
    counterparty_id,
    amount,
    direction,
    category,
    created_at
from
    transactions
where
    status = 'flagged'
order by
    created_at,
    id
limit 100;
```

Notice that we use `id` as a tiebreaker. If two transactions have the same
`created_at`, it guarantees a deterministic order between them.

## With no index at all

If we run this query without an index for the queue, the database has to scan
the entire table to find every transaction with the `flagged` status.

Only then can it determine which 100 are the oldest:

```text
QUERY PLAN
----------------------------------------------------------------------------------------------------------------------------------------------------
Limit  (cost=169105.41..169117.05 rows=100 width=53) (actual time=223.663..228.834 rows=100.00 loops=1)
  Buffers: shared hit=912 read=113758
  ->  Gather Merge  (cost=169105.41..179665.07 rows=90667 width=53) (actual time=221.458..226.622 rows=100.00 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=912 read=113758
        ->  Sort  (cost=168105.38..168199.83 rows=37778 width=53) (actual time=208.029..208.040 rows=79.67 loops=3)
              Sort Key: created_at, id
              Sort Method: top-N heapsort  Memory: 47kB
              Buffers: shared hit=912 read=113758
              Worker 0:  Sort Method: top-N heapsort  Memory: 49kB
              Worker 1:  Sort Method: top-N heapsort  Memory: 48kB
              ->  Parallel Seq Scan on transactions  (cost=0.00..166661.54 rows=37778 width=53) (actual time=2.460..201.730 rows=33398.00 loops=3)
                    Filter: (status = 'flagged'::text)
                    Rows Removed by Filter: 3299935
                    Buffers: shared hit=820 read=113758
Planning Time: 0.091 ms
Execution Time: 229.133 ms
```

The `Parallel Seq Scan` split the work among three processes. Each one
discarded an average of 3,299,935 rows to find approximately 33 thousand
`flagged` transactions.

Even with `LIMIT 100`, the database cannot simply stop after finding 100 rows.
Without an index that returns the results in `created_at, id` order, it has to
find every candidate and use a `top-N heapsort` to determine which 100 are the
oldest.

In total, it accessed 114,670 blocks—approximately 896 MB—to return 100
transactions.

## A first alternative: full index

As a first approach, we could create an index starting with the status, followed
by the columns used for sorting:

```sql
create index idx_transactions_status_queue
    on transactions (status, created_at, id);
```

Because `status` is used with `=` in the `where` clause, all `flagged`
transactions are grouped together in the index. Within that set, `created_at`
and `id` are already in the order requested by the query.

Running it again:

```text
QUERY PLAN
-----------------------------------------------------------------------------------------------------------------------------------------------------------------
Limit  (cost=0.56..159.84 rows=100 width=53) (actual time=0.019..0.060 rows=100.00 loops=1)
  Buffers: shared hit=104
  ->  Index Scan using idx_transactions_status_queue on transactions  (cost=0.56..144411.93 rows=90667 width=53) (actual time=0.019..0.054 rows=100.00 loops=1)
        Index Cond: (status = 'flagged'::text)
        Index Searches: 1
        Buffers: shared hit=104
Planning Time: 0.037 ms
Execution Time: 0.071 ms
```

The `Parallel Seq Scan` and `Sort` are gone. The database now descends the
B-tree to the first `status = 'flagged'` entry and reads the leaf nodes in
`created_at, id` order. As soon as it finds the first 100 entries, `Limit` stops
the execution.

The query dropped from 229.133 ms to 0.071 ms. However, this index has a
problem: it also stores every `settled` and `pending` transaction, even though
they are never used in the anti-fraud queue.

Out of 10 million transactions, only 100,194—approximately 1%—have the status
we care about. Even so, the full index occupies 387 MB to store all of them.

## Partial index

But what if we could create an index containing only the transactions that
belong in the queue?

In PostgreSQL, we can do that with a partial index:

```sql
create index idx_transactions_flagged_queue
    on transactions (created_at, id)
    where status = 'flagged';
```

Notice that `status` does not have to be one of the index columns. The index
itself contains only rows where `status = 'flagged'`, so every one of its
entries already satisfies that condition.

The only key columns are `created_at` and `id`, exactly the order in which the
queue needs to be read:

```text
QUERY PLAN
------------------------------------------------------------------------------------------------------------------------------------------------------------------
Limit  (cost=0.42..290.05 rows=100 width=53) (actual time=0.007..0.037 rows=100.00 loops=1)
  Buffers: shared hit=103
  ->  Index Scan using idx_transactions_flagged_queue on transactions  (cost=0.42..262604.12 rows=90667 width=53) (actual time=0.007..0.032 rows=100.00 loops=1)
        Index Searches: 1
        Buffers: shared hit=103
Planning Time: 0.046 ms
Execution Time: 0.047 ms
```

The plan still uses an `Index Scan` without having to sort the results, and it
accessed practically the same number of blocks as the full index: 103 versus
104.

The biggest difference appears in their sizes:

```sql
select
    pg_size_pretty(pg_relation_size('idx_transactions_status_queue')) as full_index_size,
    pg_size_pretty(pg_relation_size('idx_transactions_flagged_queue')) as partial_index_size;
```

```text
 full_index_size | partial_index_size
-----------------+-------------------
 387 MB          | 3104 kB
```

The partial index occupies only 0.78% of the space used by the full index
because it does not carry the other 99% of the transactions.

## What changed

Without an index, the database read approximately 896 MB from the table,
discarded almost 10 million rows, and still had to sort them with a `top-N
heapsort`. The query took 229.133 ms.

With either index, the database could return the data in the requested order
and stop reading after the first 100 rows. That is why the execution times for
the full and partial indexes were close: 0.071 ms and 0.047 ms.

So why use the partial index?

Because it provides the same access path while occupying 3,104 kB instead of
387 MB. Besides being easier to keep in cache, it does not have to be updated
when a `settled` or `pending` transaction is inserted. In this case, the main
advantage is not the 0.024 ms saved on the lookup, but avoiding the maintenance
of an index that is 127 times larger than necessary.

There is just one caveat: PostgreSQL can only use a partial index when it can
prove that the query's `where` clause satisfies the index predicate. Therefore,
the query must explicitly keep `status = 'flagged'`. In a prepared statement
with `status = $1`, for example, a generic plan might not use this index because
the parameter value is unknown at planning time.
