import React, { useEffect, useState } from "react";
import "./index.css";

// Default to local dev API, but allow overriding in deployments (e.g. Vercel)
// by setting REACT_APP_API_BASE in the frontend environment.
const API_BASE =
  process.env.REACT_APP_API_BASE || "http://localhost:8000/api";

function Comment({ comment, onLike, onReply }) {
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");

  const handleReplySubmit = (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    onReply(comment.id, replyText);
    setReplyText("");
    setReplying(false);
  };

  return (
    <div className="border-l border-slate-800 pl-3 mt-2">
      <div className="flex justify-between items-center">
        <div>
          <span className="text-sm font-semibold">
            {comment.author?.username ?? "anon"}
          </span>
          <span className="text-xs text-gray-400 ml-2">
            {new Date(comment.created_at).toLocaleString()}
          </span>
        </div>
        <button
          onClick={() => onLike(comment.id)}
          className="text-[11px] px-2 py-1 rounded-full bg-slate-800 hover:bg-slate-700 active:bg-slate-800 text-sky-300 flex items-center gap-1 transition"
        >
          <span className="text-sky-400">♥</span>
          <span>{comment.like_count}</span>
        </button>
      </div>
      <p className="text-sm text-slate-100 mt-1 whitespace-pre-wrap">
        {comment.content}
      </p>
      <div className="mt-1 flex gap-3 text-xs text-sky-300">
        <button onClick={() => setReplying((v) => !v)}>Reply</button>
      </div>
      {replying && (
        <form onSubmit={handleReplySubmit} className="mt-2">
          <textarea
            className="w-full rounded-xl bg-slate-950/70 border border-slate-700/80 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 outline-none p-2.5 text-sm placeholder:text-slate-500 transition"
            rows={2}
            placeholder="Write a reply..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
          />
          <div className="flex justify-end mt-1 gap-2">
            <button
              type="button"
              onClick={() => setReplying(false)}
              className="text-xs text-slate-400 hover:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-xs px-3 py-1 rounded-full bg-sky-600 hover:bg-sky-500 active:bg-sky-600 text-white shadow-sm shadow-sky-700/40"
            >
              Reply
            </button>
          </div>
        </form>
      )}
      {comment.replies?.map((child) => (
        <Comment
          key={child.id}
          comment={child}
          onLike={onLike}
          onReply={onReply}
        />
      ))}
    </div>
  );
}

function Leaderboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch(`${API_BASE}/leaderboard/`);
        const data = await res.json();
        setEntries(data);
      } catch (e) {
        console.error("Failed to load leaderboard", e);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  return (
    <div className="bg-slate-900/80 backdrop-blur border border-slate-800/80 rounded-2xl p-4 shadow-sm shadow-slate-900/40">
      <h2 className="text-sm font-semibold text-slate-100 mb-1">
        Last 24h Karma
      </h2>
      <p className="text-[11px] text-slate-500 mb-3">
        Karma is computed from post and comment likes, not stored on the user.
      </p>
      {loading ? (
        <p className="text-xs text-slate-400">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-slate-400">No karma yet.</p>
      ) : (
        <ol className="space-y-1.5">
          {entries.map((entry, idx) => (
            <li
              key={entry.user.id}
              className="flex justify-between items-center text-[11px] text-slate-100 rounded-lg px-2 py-1.5 bg-slate-900/80 border border-slate-800/80"
            >
              <span>
                <span className="text-slate-500 mr-2">#{idx + 1}</span>
                {entry.user.username}
              </span>
              <span className="font-semibold text-sky-300">
                {entry.karma_24h} karma
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function App() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState("");

  const loadPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/posts/`);
      const data = await res.json();
      // Comments are already returned as a fully nested tree by the backend
      // serializers, so we can use them directly.
      setPosts(data);
    } catch (e) {
      console.error("Failed to load posts", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!newPost.trim()) return;
    try {
      await fetch(`${API_BASE}/posts/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newPost }),
      });
      setNewPost("");
      loadPosts();
    } catch (e) {
      console.error("Failed to create post", e);
    }
  };

  const likePost = async (id) => {
    try {
      await fetch(`${API_BASE}/posts/${id}/like/`, { method: "POST" });
      loadPosts();
    } catch (e) {
      console.error("Failed to like post", e);
    }
  };

  const likeComment = async (id) => {
    try {
      await fetch(`${API_BASE}/comments/${id}/like/`, { method: "POST" });
      loadPosts();
    } catch (e) {
      console.error("Failed to like comment", e);
    }
  };

  const addComment = async (postId, parentId, content) => {
    try {
      await fetch(`${API_BASE}/posts/${postId}/comments/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, parent: parentId }),
      });
      loadPosts();
    } catch (e) {
      console.error("Failed to add comment", e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 mb-3">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-slate-300">
                Community Prototype
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Community Feed
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Threaded discussions, realtime-feeling likes, and a 24-hour karma leaderboard.
            </p>
          </div>
          <div className="text-right text-[11px] sm:text-xs text-slate-500 space-y-0.5">
            <p>Backend: Django + DRF</p>
            <p>Frontend: React + Tailwind</p>
            <p className="text-slate-400">Single demo user for now.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <main className="lg:col-span-2 space-y-4">
            <form
              onSubmit={handleCreatePost}
              className="bg-slate-900/80 backdrop-blur border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-sm shadow-slate-900/40"
            >
              <h2 className="text-sm font-semibold mb-1.5 text-slate-100 flex items-center gap-2">
                Start a conversation
                <span className="inline-flex items-center rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300 border border-sky-500/20">
                  New
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 mb-3">
                Share a prompt, idea, or question. Others can reply in threads.
              </p>
              <textarea
                className="w-full rounded-xl bg-slate-950/70 border border-slate-700/80 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 outline-none p-3 text-sm placeholder:text-slate-500 transition"
                rows={3}
                placeholder='E.g. “How would you design a fast leaderboard with daily resets?”'
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
              />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-3">
                <span className="text-[11px] text-slate-500">
                  1 like on a post = <span className="text-sky-300 font-medium">5 karma</span>.
                </span>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-sky-600 hover:bg-sky-500 active:bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm shadow-sky-700/40 transition"
                >
                  <span>Post</span>
                </button>
              </div>
            </form>

            {loading ? (
              <p className="text-xs text-gray-400">Loading feed...</p>
            ) : posts.length === 0 ? (
              <p className="text-xs text-gray-400">
                No posts yet. Be the first to share something!
              </p>
            ) : (
              posts.map((post) => (
                <article
                  key={post.id}
                  className="bg-slate-900/80 backdrop-blur border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-sm shadow-slate-900/40 hover:border-slate-700 transition"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          {post.author?.username ?? "demo"}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(post.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-100 whitespace-pre-wrap">
                        {post.content}
                      </p>
                    </div>
                    <button
                      onClick={() => likePost(post.id)}
                      className="ml-4 px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 active:bg-slate-800 text-[11px] text-sky-300 flex items-center gap-1.5 transition"
                    >
                      <span className="text-sky-400">♥</span>
                      <span>{post.like_count} likes</span>
                    </button>
                  </div>

                  <section className="mt-4">
                    <h3 className="text-xs font-semibold text-gray-400 mb-2">
                      Thread
                    </h3>
                    <div className="space-y-2">
                      {post.comments.length === 0 ? (
                        <p className="text-xs text-gray-500">
                          No comments yet. Start the discussion below.
                        </p>
                      ) : (
                        post.comments.map((c) => (
                          <Comment
                            key={c.id}
                            comment={c}
                            onLike={likeComment}
                            onReply={(parentId, text) =>
                              addComment(post.id, parentId, text)
                            }
                          />
                        ))
                      )}
                    </div>

                    <div className="mt-3">
                      <InlineCommentForm
                        onSubmit={(text) => addComment(post.id, null, text)}
                      />
                    </div>
                  </section>
                </article>
              ))
            )}
          </main>

          <aside className="space-y-4">
            <Leaderboard />
          </aside>
        </div>
      </div>
    </div>
  );
}

function InlineCommentForm({ onSubmit }) {
  const [value, setValue] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    onSubmit(value);
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        className="w-full rounded-xl bg-slate-950/70 border border-slate-700/80 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 outline-none p-2 text-xs placeholder:text-slate-500 transition"
        rows={2}
        placeholder="Add a comment..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="flex justify-end mt-1">
        <button
          type="submit"
          className="px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 active:bg-slate-800 text-[11px] text-sky-300"
        >
          Comment
        </button>
      </div>
    </form>
  );
}

export default App;
