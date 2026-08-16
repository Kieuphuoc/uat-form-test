import { Link } from 'react-router-dom';
import {
  IconAdmin,
  IconApps,
  IconChat,
  IconDesign,
  IconForm,
} from '../components/AppIcons';
import { useAuth } from '../auth/AuthContext';

type Tile = {
  to: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  /** Cần quyền admin (Admin / Designer). */
  adminOnly?: boolean;
  primary?: boolean;
};

const TILES: Tile[] = [
  {
    to: '/chat',
    label: 'Chat',
    description: 'Nhắn tin nội bộ, nhóm làm việc',
    icon: <IconChat size={26} />,
    primary: true,
  },
  {
    to: '/admin',
    label: 'Admin',
    description: 'Quản lý app form',
    icon: <IconAdmin size={26} />,
    adminOnly: true,
  },
  {
    to: '/admin/design',
    label: 'Designer',
    description: 'Thiết kế form kéo thả',
    icon: <IconDesign size={26} />,
    adminOnly: true,
  },
  {
    to: '/runtime/hrm',
    label: 'Demo HRM',
    description: 'Runtime form HRM',
    icon: <IconForm size={26} />,
  },
  {
    to: '/runtime/apps',
    label: 'Demo Apps',
    description: 'Runtime danh sách ứng dụng',
    icon: <IconApps size={26} />,
  },
];

export function HomePage() {
  const { jwt, user, isAdmin, login, logout, mobile } = useAuth();

  return (
    <div className="shell wide stack home">
      <header className="home-head">
        <div>
          <h1>Arito Form</h1>
          <p className="muted">
            Chat nội bộ và runtime form. Admin / Designer cần tài khoản admin AritoID.
          </p>
        </div>
        {!mobile && (
          <div className="row">
            {!jwt ? (
              <button type="button" onClick={() => void login('/chat', { requireAdmin: false })}>
                Đăng nhập AritoID
              </button>
            ) : (
              <button type="button" className="secondary" onClick={() => logout()}>
                Đăng xuất
              </button>
            )}
          </div>
        )}
      </header>

      <div className="home-tiles">
        {TILES.map((tile) => {
          const locked = tile.adminOnly && !isAdmin;
          const className = `home-tile${tile.primary ? ' home-tile--primary' : ''}${
            locked ? ' is-locked' : ''
          }`;
          const hint = locked
            ? jwt
              ? 'Cần tài khoản admin'
              : 'Cần đăng nhập admin'
            : tile.description;

          return (
            <Link key={tile.to} to={tile.to} className={className} title={hint}>
              <span className="home-tile-icon">{tile.icon}</span>
              <span className="home-tile-label">{tile.label}</span>
              <span className="home-tile-desc">{hint}</span>
            </Link>
          );
        })}
      </div>

      <p className="muted home-status">
        {jwt
          ? `Đã đăng nhập: ${user?.nickname || user?.email || `user #${user?.userId ?? 0}`}${
              isAdmin ? ' · admin' : ''
            }`
          : 'Chưa đăng nhập — Chat sẽ yêu cầu đăng nhập AritoID.'}
      </p>
    </div>
  );
}
