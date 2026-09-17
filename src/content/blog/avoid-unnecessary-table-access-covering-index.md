---
title: "How to avoid unnecessary table access using a covering index"
description: "How to use a covering index to calculate an account balance without accessing the heap, reducing execution time from 12.249 ms to 2.780 ms."
pubDate: 2026-09-17
tags: ["postgresql", "indexing"]
lang: en
---

This is the second case study from the
[fintech ledger](https://github.com/eduardovfaleiro/fintech-ledger). In the
[first one](/blog/concatenated-index-column-order/), we saw how the column order
of a composite index affects a bank-statement query. Now, we are going to get
the balance of one of the bank's whale users, with 6,277 transactions.

**Scenario:** PostgreSQL 18.4, a `transactions` table with 10 million rows, and a warm cache.

| Scenario | Time | Heap | Index size |
|---|---:|---:|---:|
| Original index | 12.249 ms | 6,113 blocks accessed | 301 MB |
| Covering index | 2.780 ms | 0 heap fetches | 473 MB |

## The query

For this, we are going to use the get_balance.sql query:

```sql
select
      sum(amount) filter (where direction = 'credit')
    - sum(amount) filter (where direction = 'debit') as balance
  from
      transactions
  where
      account_id = 30362;
```

## The existing index: accessing the heap

If we run it with the existing (account_id, created_at) index, it is already extremely fast:

```text
QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------------------------------------------
Aggregate  (cost=1875.95..1875.96 rows=1 width=32) (actual time=12.203..12.204 rows=1.00 loops=1)
  Buffers: shared hit=6140
  ->  Bitmap Heap Scan on transactions  (cost=12.22..1871.07 rows=488 width=12) (actual time=1.932..9.555 rows=6277.00 loops=1)
        Recheck Cond: (account_id = 30362)
        Heap Blocks: exact=6113
        Buffers: shared hit=6140
        ->  Bitmap Index Scan on idx_transactions_account_id_created_at  (cost=0.00..12.10 rows=488 width=0) (actual time=0.759..0.759 rows=6277.00 loops=1)
              Index Cond: (account_id = 30362)
              Index Searches: 1
              Buffers: shared hit=27
Planning Time: 0.092 ms
Execution Time: 12.249 ms
```

However, notice that even though the index is extremely efficient, it still has to access the heap, and the account's transactions are physically scattered across it.

Because of that, the database has to access 6,113 blocks just to get the value of the 6,277 transactions. The more blocks it accesses, the less the database executor can optimize this lookup and the more accesses it has to make.

## Covering index: avoiding the heap

But what if there were a way to run this query without even accessing the heap? Is there?
The answer is yes. For that to happen, every column used by the query must be included in the index structure.
Then all the database has to do is traverse the tree in O(log n + k) time, potentially avoiding heap access and random I/O operations when the pages are marked `all-visible`.
This is called a covering index, and PostgreSQL's explain calls it an Index Only Scan.

Let's see what it looks like when we include amount and direction in the index:

```sql
drop index idx_transactions_account_id_created_at;

create index idx_transactions_account_id_created_at
      on transactions (account_id, created_at)
      include (amount, direction);
```

Notice the use of "include": instead of making amount and direction key columns in the index, PostgreSQL lets you create it this way so that the included fields are not present in internal nodes and remain only in the leaf nodes. This saves space compared with adding them as key columns in the index.

Running it...

```text
QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------
Aggregate  (cost=25.98..26.00 rows=1 width=32) (actual time=2.749..2.749 rows=1.00 loops=1)
  Buffers: shared hit=4643
  ->  Index Only Scan using idx_transactions_account_id_created_at on transactions  (cost=0.56..21.10 rows=488 width=12) (actual time=0.020..1.623 rows=6277.00 loops=1)
        Index Cond: (account_id = 30362)
        Heap Fetches: 0
        Index Searches: 1
        Buffers: shared hit=4643
Planning Time: 0.112 ms
Execution Time: 2.780 ms
```

## What changed

The Bitmap Heap Scan is now gone and has been replaced by the Index Only Scan.
Including these fields in the index has a few pros and cons:

### Cons

- Inserts will cost more to execute because they also have to include these fields (updates are not included here because transactions is append-only)
- The index is heavier to load into cache (301 MB vs. 473 MB)

### Pros

- There is no need to access the heap when the pages are marked `all-visible` in the visibility map. In this case, `Heap Fetches: 0` confirms that no access was necessary, drastically reducing execution time.

In this case, if the balance query runs frequently, it is worth trading a 57% increase in index size for the reduction in execution time from 12.249 ms to 2.780 ms.
