---
title: "How to eliminate the N+1 query problem with a JOIN"
description: "Why replacing 51 SQL commands with a single JOIN made a bank statement query approximately 16 times faster."
pubDate: 2026-10-10T20:25:00-03:00
tags: ["postgresql", "performance"]
lang: en
---

Now for the sixth case study. We are going to retrieve the 50 most recent
transactions for an account together with the name of each establishment.

**Scenario:** PostgreSQL 18.4, a `transactions` table with 10 million rows,
account `30362`, pages of 50 items, and a warm cache. Each approach was run
1,000 times by the same local client.

| Approach | SQL commands per page | Median |
|---|---:|---:|
| N+1 | 51 | 5.001 ms |
| `JOIN` | 1 | 0.307 ms |

## The N+1 problem

Imagine that the ORM first loads the 50 transactions on the page:

```sql
select
    id,
    created_at,
    amount,
    direction,
    category,
    counterparty_id
from
    transactions
where
    account_id = 30362
order by
    created_at desc,
    id desc
limit 50;
```

Then, when the application accesses the establishment name for each
transaction, it runs another query:

```sql
select
    name
from
    counterparties
where
    id = 170;
```

This second query is repeated 50 times, once for each transaction. As a result,
a page that appears to require one query ends up executing 51: one initial
query plus another 50 queries to retrieve the names.

That is where the name N+1 comes from.

## But each query is fast

You might look at the establishment lookup and think there is no problem
because it uses the primary key:

```text
QUERY PLAN
----------------------------------------------------------------------------------------------------------------------------------------
Index Scan using counterparties_pkey on counterparties  (cost=0.28..8.30 rows=1 width=20) (actual time=0.005..0.005 rows=1.00 loops=1)
  Index Cond: (id = 170)
  Index Searches: 1
  Buffers: shared hit=3
Planning Time: 0.021 ms
Execution Time: 0.010 ms
```

In fact, it is extremely fast in isolation: only 0.010 ms.

However, database execution time is not the only cost. Each query has to be
sent by the client, parsed, planned, executed, and returned. Repeating this
process 50 times costs more than performing the same lookups within a single
execution plan.

In the benchmark, the N+1 approach took a median of 5.001 ms per page.

## A single query with `JOIN`

We can retrieve the transactions and establishment names with a single
command:

```sql
select
    t.id,
    t.created_at,
    t.amount,
    t.direction,
    t.category,
    c.name as counterparty_name
from
    transactions t
join
    counterparties c on c.id = t.counterparty_id
where
    t.account_id = 30362
order by
    t.created_at desc,
    t.id desc
limit 50;
```

The query is also available in
[`get_statement_with_counterparty.sql`](https://github.com/eduardovfaleiro/fintech-ledger/blob/368848a/db/queries/get_statement_with_counterparty.sql).

Running it:

```text
QUERY PLAN
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
Limit  (cost=0.84..250.09 rows=50 width=57) (actual time=0.022..0.132 rows=50.00 loops=1)
  Buffers: shared hit=204
  ->  Nested Loop  (cost=0.84..2448.45 rows=491 width=57) (actual time=0.021..0.127 rows=50.00 loops=1)
        Buffers: shared hit=204
        ->  Index Scan Backward using idx_transactions_account_pagination on transactions t  (cost=0.56..1981.15 rows=491 width=45) (actual time=0.017..0.043 rows=50.00 loops=1)
              Index Cond: (account_id = 30362)
              Index Searches: 1
              Buffers: shared hit=54
        ->  Index Scan using counterparties_pkey on counterparties c  (cost=0.28..0.95 rows=1 width=28) (actual time=0.001..0.001 rows=1.00 loops=50)
              Index Cond: (id = t.counterparty_id)
              Index Searches: 50
              Buffers: shared hit=150
Planning Time: 0.130 ms
Execution Time: 0.144 ms
```

Notice that PostgreSQL chose a `Nested Loop`. First, it used the pagination
index to find the account's 50 transactions. Then, for each transaction, it
performed an `Index Scan` on the `counterparties` primary key.

In other words, the database also performed 50 establishment lookups. The
difference is that all of them happened within the same plan, without returning
to the application 50 times.

## `Nested Loop` is not N+1

The two patterns look similar if we consider only the number of lookups, but
they happen in different places:

- With N+1, the application sends 51 independent commands to the database.
- With `Nested Loop`, the application sends one command, and the database runs
  the loop internally.

A `Nested Loop` is a good choice when the outer side has few rows and the inner
side has an efficient index. In this case, there are only 50 rows, and each
establishment is found through the primary key.

If we removed the `LIMIT` and joined millions of transactions, the optimizer
might choose another algorithm, such as a `Hash Join`. No join algorithm is
always better; the choice depends on how many rows are processed on each side.

## What changed

With N+1, a single page required 51 commands and took a median of 5.001 ms. With
the `JOIN`, the same page required one command and took 0.307 ms, making it
approximately 16 times faster.

The improvement did not come from eliminating the 50 primary-key lookups. The
plan shows that they still exist. It came from giving the database all the work
at once, eliminating 50 round trips between the application and PostgreSQL.

The benchmark can be reproduced with
[`benchmark_n_plus_one.py`](https://github.com/eduardovfaleiro/fintech-ledger/blob/368848a/benchmarks/benchmark_n_plus_one.py).
