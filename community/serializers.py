from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Post, Comment


User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username"]


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


class PostSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    comments = serializers.SerializerMethodField()
    like_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Post
        fields = ["id", "author", "content", "created_at", "like_count", "comments"]
        read_only_fields = ["author", "created_at", "like_count", "comments"]

    def get_comments(self, obj):
        # Expect the view to inject a prefetched flat list for this post
        comment_tree = self.context.get("comment_tree", {}).get(obj.id, [])
        serializer = CommentSerializer(comment_tree, many=True, context=self.context)
        return serializer.data


class LeaderboardEntrySerializer(serializers.Serializer):
    user = UserSerializer()
    karma_24h = serializers.IntegerField()


