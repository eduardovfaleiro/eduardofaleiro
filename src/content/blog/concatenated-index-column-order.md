---
title: "Column order in a concatenated index"
description: "The same two columns, in the two possible orders, over 10 million rows: 17 ms against 0.060 ms. Three execution plans, and why the gap is not a rounding error."
pubDate: 2026-09-08
tags: ["postgresql", "indexing"]
lang: en
---

I have been reading [Use The Index, Luke!](https://use-the-index-luke.com/) and
wanted to actually apply it rather than just nod along, so I built a
[fintech ledger](https://github.com/eduardovfaleiro/fintech-ledger): a
bank-statement schema with enough rows in it that indexing decisions stop being
theoretical. Each topic from the book I want to prove out becomes one case study
in that repo, and more are coming. This is the first of them: the query every
banking app runs, one account over a date range.

The setup is PostgreSQL 18.4, a `transactions` table with 10 million rows spread
across 100,000 accounts. Each plan below was collected with only the index in
question existing on the table, and with the cache already warm, which is why
`Buffers` shows up mostly as `hit` in the indexed plans.

| Scenario | Time | Blocks read | Volume |
|---|---|---|---|
| No index (Seq Scan) | 220 ms | 114,654 | ~896 MB |
| Index on `(created_at, account_id)` | 17 ms | 3,655 | ~28.5 MB |
| Index on `(account_id, created_at)` | 0.060 ms | 11 | 88 KB |

## The query

The query under test is
[`get_statement.sql`](https://github.com/eduardovfaleiro/fintech-ledger/blob/1fa1ff9/db/queries/get_statement.sql):

```sql
select
	*
from
	transactions
where
	account_id = 47
	and created_at between '2025-01-01' and '2025-04-01'
order by
	created_at desc;
```

Note that the `where` has two conditions, `account_id` and `created_at`, on top
of the `order by`.

## With no index at all

Run this without any index and the database has to do a Seq Scan over the entire
table for both conditions.

On top of that, it has to run a sort algorithm to satisfy the `order by
created_at`, as shown below:

```sql
explain (analyze, buffers)
select
	*
from
	transactions
where
	account_id = 47
	and created_at between '2025-01-01' and '2025-04-01'
order by
	created_at desc;
```

```text
                                                                                       QUERY PLAN
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Gather Merge  (cost=188493.05..188498.29 rows=45 width=61) (actual time=200.328..204.925 rows=5.00 loops=1)
   Workers Planned: 2
   Workers Launched: 2
   Buffers: shared hit=2579 read=112075
   ->  Sort  (cost=187493.02..187493.07 rows=19 width=61) (actual time=187.914..187.915 rows=1.67 loops=3)
         Sort Key: created_at DESC
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=2579 read=112075
         Worker 0:  Sort Method: quicksort  Memory: 25kB
         Worker 1:  Sort Method: quicksort  Memory: 25kB
         ->  Parallel Seq Scan on transactions  (cost=0.00..187492.62 rows=19 width=61) (actual time=84.043..187.852 rows=1.67 loops=3)
               Filter: ((created_at >= '2025-01-01 00:00:00+00'::timestamp with time zone) AND (created_at <= '2025-04-01 00:00:00+00'::timestamp with time zone) AND (account_id = 47))
               Rows Removed by Filter: 3333332
               Buffers: shared hit=2503 read=112075
 Planning:
   Buffers: shared hit=117
 Planning Time: 0.304 ms
 JIT:
   Functions: 6
   Options: Inlining false, Optimization false, Expressions true, Deforming true
   Timing: Generation 0.697 ms (Deform 0.250 ms), Inlining 0.000 ms, Optimization 0.567 ms, Emission 7.885 ms, Total 9.149 ms
 Execution Time: 220.180 ms
(22 rows)
```

Look at `Rows Removed by Filter: 3333332`. That is 3.3 million rows discarded per
worker, 10 million in total, to return 5. And the `Buffers` add up to 114,654
blocks (hit=2579 + read=112075), or around 896 MB read to deliver those 5 rows.

## The wrong index: `(created_at, account_id)`

Now let's look at what happens when we add an index. We could index `account_id`
alone, which would already speed the query up a lot. But since the account and
the date go hand in hand in a bank statement, it makes sense to create an index
covering both columns, doesn't it? Otherwise the database would have to visit
every matching transaction in the heap just to find out whether its date, a
column the index doesn't cover, falls between 2025-01-01 and 2025-04-01.

At first you might reach for `(created_at, account_id)`, on the assumption that
column order in an index doesn't matter. It does, and it matters a lot.

```sql
create index idx_transactions_created_at_account_id on transactions (created_at, account_id)
```

That would be a mistake. Looking at the structure of a B-tree is enough to see
why. To traverse it, from the root down to the leaves, the database goes by the
first column of the index: `created_at`. In our query, that search spans
2025-01-01 to 2025-04-01. Three months of transactions, from every account. Once
you reach the leaves inside the range you defined for `created_at`, you find that
`account_id` is only ordered among entries where `created_at` is equal. Which is
to say almost never, since `created_at` carries hours, minutes and seconds. So to
find the rows with the right `account_id` within those three months of
transactions, you have to walk tuple by tuple, leaf by leaf, looking for
`account_id = 47`.

The column order turned `account_id` from something that narrows the search into
a plain filter, applied row by row. And that index, like it or not, still takes
up space on the server's disk and still adds time to every insert and update on
the transactions table.

```text
                                                                                   QUERY PLAN
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Index Scan Backward using idx_transactions_created_at_account_id on transactions  (cost=0.43..25883.90 rows=45 width=61) (actual time=1.974..16.989 rows=5.00 loops=1)
   Index Cond: ((created_at >= '2025-01-01 00:00:00+00'::timestamp with time zone) AND (created_at <= '2025-04-01 00:00:00+00'::timestamp with time zone) AND (account_id = 47))
   Index Searches: 1
   Buffers: shared hit=3655
 Planning:
   Buffers: shared hit=137
 Planning Time: 0.314 ms
 Execution Time: 17.021 ms
(8 rows)
```

Notice that there is no `Rows Removed by Filter` here, but the discarding happens
all the same. It is just implicit, because the filter runs inside the Index Scan
and PostgreSQL doesn't report it.

The reason is that `Index Cond` shows two kinds of predicate under the same
label. An *access predicate* defines where the scan starts and where it stops. A
*filter predicate* only discards rows during the scan, without shortening it.
Here, `created_at` is access and `account_id = 47` is filter, because a column
that comes after a range in the index no longer narrows anything. In the next
plan, those same three conditions will all be access predicates.

Since the plan doesn't tell the two apart, the only way to know which is which is
to compare the `Index Cond` against the definition of the index.

## The right index: `(account_id, created_at)`

Now picture the `(account_id, created_at)` index instead:

```sql
create index idx_transactions_account_id_created_at on transactions (account_id, created_at)
```

To run the same query, you'd traverse the B-tree only for the transactions of
`account_id = 47`. You'd reach the leaves and have all the dates in order, since
you are only looking at the transactions of one specific account, number 47. From
there the database descends straight to account 47's first transaction on
2025-01-01 and reads the leaves in sequence, stopping as soon as the date goes
past 2025-04-01. Not a single row it reads is thrown away.

If you are going to create a concatenated index, put the columns you use with `=`
in the `where` first, and only then the columns you use with a range or `between`.

```text
                                                                                   QUERY PLAN
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Index Scan Backward using idx_transactions_account_id_created_at on transactions  (cost=0.43..189.47 rows=46 width=61) (actual time=0.027..0.030 rows=5.00 loops=1)
   Index Cond: ((account_id = 47) AND (created_at >= '2025-01-01 00:00:00+00'::timestamp with time zone) AND (created_at <= '2025-04-01 00:00:00+00'::timestamp with time zone))
   Index Searches: 1
   Buffers: shared hit=11
 Planning:
   Buffers: shared hit=140
 Planning Time: 0.324 ms
 Execution Time: 0.060 ms
(8 rows)
```

## What changed

Notice what disappeared from the plan, too. Back at the start, with no index, the
database needed a Sort node to satisfy `order by created_at desc`. In both
indexed plans that node is gone, replaced by an Index Scan Backward. Because the
index already keeps `created_at` ordered within each account, the database
doesn't have to sort anything. It just reads the leaves in reverse. The `order
by` came for free, along with everything else.

Now look at the gap between the two indexed runs, produced by nothing but the
column order. In the first one, with `(created_at, account_id)`, the executor had
to read 3,655 blocks (`Buffers: shared hit=3655`). The number that matters is the
sum of `hit` and `read`, not `read` alone. Both are blocks the executor had to
read, and `hit` only means the block was already in cache. Given that a block is
the smallest unit a database deals in, at 8 KB each, that comes to 28.5 MB.
Meanwhile the second run, with `(account_id, created_at)`, read 11 blocks: a mere
88 KB.

That went straight into the execution time: 17 ms against 0.060 ms.
