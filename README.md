# arito-form-web

FE runtime + admin mỏng cho **Form.Api** (không phải Landing Page).

| | |
|--|--|
| Port | **3060** |
| Runtime | `/runtime/:slug` — nhận `?embed_token=&mobile=true` |
| Admin | `/admin`, `/admin/apps/:id` |
| API | Form.Api `:5600` (`VITE_API_URL=http://localhost:5600/api`) |
| Env | `.env.development` (local) / `.env.production` (Prod, commit) — mẫu: `Deploy/example/arito-form-web/` |

```bash
npm install
npm run dev
```

Demo mẫu: app `leave` (Content trên Form.Api). MobileTabs `kind: embed` → `http://localhost:3060/runtime/leave`.
