from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Comment, CommentLike, KarmaTransaction, Post, PostLike
from .serializers import (
    CommentSerializer,
    LeaderboardEntrySerializer,
    PostSerializer,
    UserSerializer,
)


User = get_user_model()


def build_comment_tree(comments):
    """
    Build an in-memory tree from a flat list of Comment objects.

    This avoids N+1 by:
    - Fetching all comments for all posts in one query
    - Assigning children without additional DB hits
    """
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


class PostListCreateView(generics.ListCreateAPIView):
    queryset = (
        Post.objects.all()
        .select_related("author")
        .annotate(like_count=Count("likes"))
    )
    serializer_class = PostSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        # Prefetch all comments for the posts in this page
        posts = list(self.get_queryset())
        post_ids = [p.id for p in posts]
        comments = (
            Comment.objects.filter(post_id__in=post_ids)
            .select_related("author", "post", "parent")
            .annotate(like_count=Count("likes"))
            .order_by("created_at")
        )
        comment_tree = build_comment_tree(comments)
        context["comment_tree"] = comment_tree
        return context

    def perform_create(self, serializer):
        # In a real app, use request.user; for prototype allow anonymous via username param
        user = self.request.user if self.request.user.is_authenticated else None
        if user is None:
            # Simple anonymous user fallback
            user, _ = User.objects.get_or_create(username="demo")
        serializer.save(author=user)


class PostDetailView(generics.RetrieveAPIView):
    queryset = (
        Post.objects.all()
        .select_related("author")
        .annotate(like_count=Count("likes"))
    )
    serializer_class = PostSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        post = self.get_object()
        comments = (
            Comment.objects.filter(post=post)
            .select_related("author", "post", "parent")
            .annotate(like_count=Count("likes"))
            .order_by("created_at")
        )
        comment_tree = build_comment_tree(comments)
        context["comment_tree"] = comment_tree
        return context


class CommentCreateView(generics.CreateAPIView):
    serializer_class = CommentSerializer

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        if user is None:
            user, _ = User.objects.get_or_create(username="demo")
        post = generics.get_object_or_404(Post, pk=self.kwargs["post_id"])
        serializer.save(author=user, post=post)


class PostLikeView(APIView):
    """
    Idempotent like endpoint with race-safe get_or_create.
    """

    def post(self, request, pk):
        user = request.user if request.user.is_authenticated else None
        if user is None:
            user, _ = User.objects.get_or_create(username="demo")
        post = generics.get_object_or_404(Post, pk=pk)

        with transaction.atomic():
            like, created = PostLike.objects.get_or_create(user=user, post=post)
            if created:
                KarmaTransaction.objects.create(
                    user=post.author,
                    amount=5,
                    reason=KarmaTransaction.POST_LIKE,
                    post=post,
                )

        return Response({"liked": True}, status=status.HTTP_200_OK)


class CommentLikeView(APIView):
    def post(self, request, pk):
        user = request.user if request.user.is_authenticated else None
        if user is None:
            user, _ = User.objects.get_or_create(username="demo")
        comment = generics.get_object_or_404(Comment, pk=pk)

        with transaction.atomic():
            like, created = CommentLike.objects.get_or_create(
                user=user, comment=comment
            )
            if created:
                KarmaTransaction.objects.create(
                    user=comment.author,
                    amount=1,
                    reason=KarmaTransaction.COMMENT_LIKE,
                    comment=comment,
                )

        return Response({"liked": True}, status=status.HTTP_200_OK)


class LeaderboardView(APIView):
    """
    Return top 5 users by karma earned in the last 24 hours.
    """

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
