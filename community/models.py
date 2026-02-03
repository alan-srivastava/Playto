from django.conf import settings
from django.db import models
from django.utils import timezone


class Post(models.Model):
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="posts"
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Post(id={self.id}, author={self.author})"


class Comment(models.Model):
    post = models.ForeignKey(
        Post, on_delete=models.CASCADE, related_name="comments"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="comments"
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="replies",
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"Comment(id={self.id}, post_id={self.post_id}, author={self.author})"


class KarmaTransaction(models.Model):
    """
    Immutable ledger of karma changes.

    We aggregate this table to compute leaderboard stats for the last 24h.
    """

    POST_LIKE = "post_like"
    COMMENT_LIKE = "comment_like"
    REASONS = [
        (POST_LIKE, "Post like"),
        (COMMENT_LIKE, "Comment like"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="karma_transactions",
    )
    amount = models.IntegerField()
    reason = models.CharField(max_length=32, choices=REASONS)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    # Optional denormalized references for debugging / introspection
    post = models.ForeignKey(
        "Post", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    comment = models.ForeignKey(
        "Comment", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"KarmaTransaction(user={self.user_id}, amount={self.amount}, reason={self.reason})"


class PostLike(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="post_likes",
    )
    post = models.ForeignKey(
        Post, on_delete=models.CASCADE, related_name="likes"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "post"],
                name="unique_post_like_per_user",
            )
        ]

    def __str__(self) -> str:
        return f"PostLike(user={self.user_id}, post={self.post_id})"


class CommentLike(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="comment_likes",
    )
    comment = models.ForeignKey(
        Comment, on_delete=models.CASCADE, related_name="likes"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "comment"],
                name="unique_comment_like_per_user",
            )
        ]

    def __str__(self) -> str:
        return f"CommentLike(user={self.user_id}, comment={self.comment_id})"
