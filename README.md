## Playto Community Feed Prototype

This project is a small end-to-end prototype of a **Community Feed** with:

- **Threaded posts & comments** (Reddit-style nested replies)
- **Like-based gamification** with a **24h rolling karma leaderboard**
- **Backend:** Django + Django REST Framework (DRF)
- **Frontend:** React (Create React App) + Tailwind CSS

---

## 1. Project structure

- **`backend/`** – Django project (`backend.settings`, `backend.urls`)
- **`community/`** – Django app with posts, comments, likes, karma, and leaderboard logic
- **`frontend/`** – React + Tailwind SPA that consumes the JSON API

The default database is **SQLite** for easy local setup.

---

## 2. Backend: local setup & run

From the project root (`Playto_App`):

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install django djangorestframework django-cors-headers

python manage.py migrate
python manage.py runserver
```

The API will be available at:

- `http://127.0.0.1:8000/api/`

### Key API endpoints

- `GET /api/posts/` – list posts with like counts and **nested comment trees**
- `POST /api/posts/` – create a post (`{"content": "text"}`)
- `GET /api/posts/<id>/` – retrieve a single post with comments
- `POST /api/posts/<id>/like/` – like a post (idempotent; uses unique constraint + transaction)
- `POST /api/posts/<post_id>/comments/` – create a comment or reply (`{"content": "...", "parent": <optional_comment_id>}`)
- `POST /api/comments/<id>/like/` – like a comment (idempotent)
- `GET /api/leaderboard/` – top 5 users by karma in the last 24h

All endpoints are open (`AllowAny`) in this prototype and default to a demo user when unauthenticated.

---

## 3. Frontend: local setup & run

In a second terminal:

```bash
cd frontend
npm install
npm start
```

The React app runs at:

- `http://localhost:3000/`

It talks to the backend via `REACT_APP_API_BASE`:

- By default, `frontend/src/App.js` uses:
  - `REACT_APP_API_BASE` (if set in the environment), **or**
  - `http://localhost:8000/api` as a sane development default.

To point the frontend at a different API (e.g. a Railway deployment), start it with:

```bash
REACT_APP_API_BASE="https://your-backend.onrailway.app/api" npm start
```

On Windows PowerShell:

```powershell
$env:REACT_APP_API_BASE="https://your-backend.onrailway.app/api"
npm start
```

---

## 4. Running the full prototype

1. **Start the backend**
   - `python manage.py runserver` (after migrations)
2. **Start the frontend**
   - `cd frontend && npm start`
3. Open `http://localhost:3000/` and:
   - Create posts
   - Add nested comments and replies
   - Like posts and comments
   - Watch the **Last 24h Karma** leaderboard update based on likes

---

## 5. Notes on requirements

- **Threaded comments:** Implemented via a self-referential `parent` FK on `Comment` and an in-memory tree builder that avoids N+1 queries.
- **Karma rules:** Encoded in `community.views.PostLikeView` and `CommentLikeView`:
  - Post like → `+5` karma to post author (`KarmaTransaction`)
  - Comment like → `+1` karma to comment author
- **Leaderboard:** Uses an aggregation over the immutable `KarmaTransaction` ledger, filtered to the **last 24 hours** only (see `EXPLAINER.md` for details).


