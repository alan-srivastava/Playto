## EXPLAINER

This document explains:

- **The Tree:** How nested comments are modeled and serialized efficiently.
- **The Math:** How the "Last 24h Leaderboard" is computed from the karma ledger.

It is aligned with the actual code in `community/models.py`, `community/serializers.py`, and `community/views.py`.

---

## 1. The Tree: nested comments without N+1

### 1.1 Data model

Nested comments are implemented via a **self-referential foreign key**:

- `Comment.post` – FK to the `Post`
- `Comment.author` – FK to `User`
- `Comment.parent` – nullable FK to `Comment` (itself), with `related_name="replies"`

In words:

- A **top-level comment** has `parent = NULL`.
- A **reply** has `parent = <another Comment>`.

This gives us a classic adjacency-list representation of a tree, which is simple to query and works well with DRF.

### 1.2 Fetching comments efficiently

The main concern is **avoiding N+1 queries** when loading a post with a large comment tree.

The **view** fetches all comments for the posts in the page in **one query**, with the relevant joins and annotations:

```python
from django.db.models import Count
from .models import Comment, Post

comments = (
    Comment.objects.filter(post_id__in=post_ids)
    .select_related("author", "post", "parent")
    .annotate(like_count=Count("likes"))
    .order_by("created_at")
)
```

Key points:

- **Single query** for all comments in the page.
- `select_related` pulls in `author`, `post`, and `parent` via JOINs (no extra queries per comment).
- `annotate(like_count=Count("likes"))` precomputes like counts per comment.

### 1.3 Building the tree in memory

Instead of recursively hitting the database, the code builds a tree **in memory** from the flat list:

```python
def build_comment_tree(comments):
    by_post = {}
    by_id = {}

    for c in comments:
        c._prefetched_replies = []
        by_id[c.id] = c
        by_post.setdefault(c.post_id, []).append(c)

    roots_by_post = {}
    for post_id, post_comments in by_post.items():
        roots = []
        for c in post_comments:
            if c.parent_id:
                parent = by_id.get(c.parent_id)
                if parent is not None:
                    parent._prefetched_replies.append(c)
            else:
                roots.append(c)
        roots_by_post[post_id] = roots
    return roots_by_post
```

Notes:

- Every `Comment` instance gets an in-memory list: `._prefetched_replies`.
- Children are attached to their parent **without additional DB hits**.
- The result is a mapping: `post_id → [root_comments_for_that_post]`.

### 1.4 Serializing the tree

The serializers are designed to **walk the in-memory tree**, not the database:

```python
class CommentSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    replies = serializers.SerializerMethodField()
    like_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Comment
        fields = [
            "id",
            "post",
            "author",
            "parent",
            "content",
            "created_at",
            "like_count",
            "replies",
        ]
        read_only_fields = ["post", "author", "created_at", "like_count", "replies"]

    def get_replies(self, obj):
        children = getattr(obj, "_prefetched_replies", [])
        serializer = CommentSerializer(children, many=True, context=self.context)
        return serializer.data
```

The `PostSerializer` uses the view-injected `comment_tree`:

```python
class PostSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    comments = serializers.SerializerMethodField()
    like_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Post
        fields = ["id", "author", "content", "created_at", "like_count", "comments"]
        read_only_fields = ["author", "created_at", "like_count", "comments"]

    def get_comments(self, obj):
        comment_tree = self.context.get("comment_tree", {}).get(obj.id, [])
        serializer = CommentSerializer(comment_tree, many=True, context=self.context)
        return serializer.data
```

Because the **entire tree is already in memory**, serialization involves:

- No extra ORM calls while recursing.
- Just Python object traversal and nesting.

This is how we avoid the N+1 problem while still returning a deeply nested JSON structure to the frontend.

---

## 2. The Math: last 24h leaderboard

### 2.1 Data model for karma

Karma is not stored on the `User` model; instead, it is derived from an **immutable ledger**:

- `KarmaTransaction`:
  - `user` – user who receives karma
  - `amount` – integer delta (e.g. `+5` for a post like, `+1` for a comment like)
  - `reason` – `"post_like"` or `"comment_like"`
  - `created_at` – timestamp (indexed)
  - optional `post` / `comment` references for traceability

When someone likes:

- A **post**, we create:

  ```python
  KarmaTransaction.objects.create(
      user=post.author,
      amount=5,
      reason=KarmaTransaction.POST_LIKE,
      post=post,
  )
  ```

- A **comment**, we create:

  ```python
  KarmaTransaction.objects.create(
      user=comment.author,
      amount=1,
      reason=KarmaTransaction.COMMENT_LIKE,
      comment=comment,
  )
  ```

The `PostLike` and `CommentLike` models both have **unique constraints** on `(user, post)` and `(user, comment)` respectively, enforced inside `transaction.atomic()` blocks to prevent double-likes under concurrency.

### 2.2 QuerySet for the last 24h leaderboard

The leaderboard is computed **on the fly** from `KarmaTransaction`, filtered to the last 24 hours:

```python
from datetime import timedelta
from django.db.models import Q, Sum
from django.utils import timezone

now = timezone.now()
since = now - timedelta(hours=24)

users = (
    User.objects.filter(karma_transactions__created_at__gte=since)
    .annotate(
        karma_24h=Sum(
            "karma_transactions__amount",
            filter=Q(karma_transactions__created_at__gte=since),
        )
    )
    .order_by("-karma_24h")[:5]
)
```

Key points:

- We **do not** persist "daily karma" on the `User`; instead we sum rows from the ledger.
- The `filter=Q(...)` inside `Sum` ensures we only sum transactions where `created_at >= now - 24h`.
- `order_by("-karma_24h")[:5]` returns the top 5 users.

This is implemented in `LeaderboardView.get`:

```python
class LeaderboardView(APIView):
    def get(self, request):
        now = timezone.now()
        since = now - timedelta(hours=24)

        users = (
            User.objects.filter(karma_transactions__created_at__gte=since)
            .annotate(
                karma_24h=Sum(
                    "karma_transactions__amount",
                    filter=Q(karma_transactions__created_at__gte=since),
                )
            )
            .order_by("-karma_24h")[:5]
        )

        entries = [
            {"user": user, "karma_24h": user.karma_24h or 0} for user in users
        ]
        serializer = LeaderboardEntrySerializer(entries, many=True)
        return Response(serializer.data)
```

This approach satisfies the constraint:

- **"Do not store Daily Karma in a simple integer field on the User model. Calculate it dynamically from the transaction/activity history."**

because:

- Every like emits a ledger entry.
- The leaderboard is a pure aggregation over that ledger with a **time window**.


