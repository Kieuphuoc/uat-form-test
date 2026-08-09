import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function HomePage() {
  const { jwt } = useAuth();
  return (
    <div className="shell stack">
      <h1>Arito Form</h1>
      <p className="muted">
        Runtime form cho mobile embed (`embed_token`). Không liên quan Landing Page.
      </p>
      <div className="card stack">
        <div className="row">
          <Link to="/runtime/leave">Demo /runtime/leave</Link>
          <Link to="/admin">Admin</Link>
        </div>
        <p className="muted">
          JWT: {jwt ? 'có (embed hoặc local)' : 'chưa — mở từ mobile tab hoặc dán token dev'}
        </p>
      </div>
    </div>
  );
}
