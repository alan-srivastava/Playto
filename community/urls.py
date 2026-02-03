from django.urls import path

from . import views


urlpatterns = [
    path("posts/", views.PostListCreateView.as_view(), name="post-list-create"),
    path("posts/<int:pk>/", views.PostDetailView.as_view(), name="post-detail"),
    path("posts/<int:pk>/like/", views.PostLikeView.as_view(), name="post-like"),
    path(
        "comments/<int:pk>/like/",
        views.CommentLikeView.as_view(),
        name="comment-like",
    ),
    path(
        "posts/<int:post_id>/comments/",
        views.CommentCreateView.as_view(),
        name="comment-create",
    ),
    path("leaderboard/", views.LeaderboardView.as_view(), name="leaderboard"),
]


