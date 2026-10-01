---
title: "Statement pagination: OFFSET vs. keyset pagination"
description: "A benchmark comparing OFFSET and keyset pagination over a whale account's statement, from the first page to an offset of 4,950 rows."
pubDate: 2026-10-13
tags: ["postgresql", "pagination"]
lang: en
---

Now for the third case study. We are going to compare two ways of paginating a
whale user's statement: `OFFSET` and keyset pagination.

**Scenario:** PostgreSQL 18.4, a `transactions` table with 10 million rows,
account `30362` with 6,277 transactions, pages of 50 items, and a warm cache.

## Pagination with `OFFSET`

When paginating statements in our banking system, your first thought might be
to use `OFFSET`, a very common clause in SQL queries.

The syntax is simple:

```sql
select
    id,
    created_at,
    amount,
    direction,
    category
from transactions
where account_id = 30362
order by created_at desc, id desc
limit 50
offset 5000;
```

This is not wrong, and it is a valid alternative. However, it has two
drawbacks:

- The larger the offset, the slower the query becomes.
- If transactions are added or removed during pagination, row positions change.
  As a result, a transaction might appear again on another page or be skipped
  during navigation.

But why does the query become slower as the offset grows?

That happens because `OFFSET` does not jump directly to the requested position.
The database has to read all the preceding rows, discard them, and only then
return the results for the current page.

## Keyset pagination

So what alternative do we have?
We can use keyset pagination, which would look like this for the same query:

```sql
select
    id,
    created_at,
    amount,
    direction,
    category
from transactions
where account_id = 30362
  and (created_at, id) < (:last_created_at, :last_id)
order by created_at desc, id desc
limit 50;
```

For example, if the last transaction on the previous page was created on
August 12, 2025, at 14:35:22 and had ID 7843921, the query would be:

```sql
select
    id,
    created_at,
    amount,
    direction,
    category
from transactions
where account_id = 30362
  and (created_at, id) <
      ('2025-08-12 14:35:22+00', 7843921)
order by created_at desc, id desc
limit 50;
```

## Deterministic ordering

Notice that we now include the transaction ID in addition to `created_at`. This
is intentional because several transactions may have the same `created_at`.
Ordering by that column alone does not guarantee a fixed order among tied
values, so we use `id` as a tiebreaker. Without it, a transaction could move
between pages across two executions of the same query, causing it to be
repeated or skipped during pagination.

## The index

However, if we used keyset pagination without creating an index, the database
would have to scan the entire table to evaluate the query's `WHERE` clause. We
therefore need to create an index for pagination:

```sql
create index idx_transactions_account_pagination on transactions (account_id, created_at, id);
```

This lets the database use a B-tree search to perform the pagination.

But keyset pagination is not all upside: it does not allow jumping to a specific
page. For that use case, `OFFSET` remains useful.

With the concepts covered, let us benchmark the execution times to see whether
the difference is worthwhile. We will start with queries on the first few pages
and then move on to the last ones.

## Benchmark

The benchmark used a warm cache, pages of 50 items, and account 30362, which has
6,277 transactions. A total of 6,500 executions were run with `pgbench`,
randomly alternating between `OFFSET` and keyset pagination. The numbers below
are the median execution times.

Both methods used the same index. The cursors were retrieved before the
measurement because, in a real application, they would come from the previous
page.

| Page | `OFFSET` | Time with `OFFSET` | Time with keyset pagination |
|---:|---:|---:|---:|
| 1 | 0 | 0.111 ms | 0.111 ms |
| 2 | 50 | 0.136 ms | 0.117 ms |
| 5 | 200 | 0.202 ms | 0.125 ms |
| 10 | 450 | 5.567 ms | 0.121 ms |
| 20 | 950 | 5.739 ms | 0.136 ms |
| 50 | 2450 | 6.002 ms | 0.120 ms |
| 100 | 4950 | 6.184 ms | 0.115 ms |

On the first page, the times are equal because there is no cursor yet, and both
methods execute the same query.

## What changed

On the first few pages, the difference is small. On page 10, PostgreSQL changes
the execution plan because it estimates only 472 transactions for this account,
even though there are 6,277. With the new plan, it starts reading and sorting all
the account's transactions to execute the `OFFSET`. That is why the query jumps
from 0.202 ms on page 5 to 5.567 ms on page 10.

The keyset pagination query continued to read only the 50 requested
transactions, regardless of the page. On page 100, it took 0.115 ms compared
with 6.184 ms for `OFFSET`, making it approximately 54 times faster.
