import { Link } from 'react-router-dom';
import { IconAdmin, IconLogout, IconZalo } from '../AppIcons';
import { Building2 } from 'lucide-react';

type Props = {
  displayName: string;
  isAdmin?: boolean;
  showAdminLink?: boolean;
  mobile?: boolean;
  onLogout: () => void;
};

export function HomeNavbar({
  displayName,
  isAdmin,
  showAdminLink,
  mobile,
  onLogout,
}: Props) {
  return (
    <header className="home-hrm-nav">
      <div className="home-hrm-nav__brand">
        <div className="home-hrm-nav__logo">
          <Building2 size={20} />
        </div>
        <div className="home-hrm-nav__title-wrap">
          <span className="home-hrm-nav__title">HRM</span>
          <span className="home-hrm-nav__sub">Arito Form</span>
        </div>
      </div>

      <div className="home-hrm-nav__right">
        <div className="home-hrm-nav__user-chip" title={displayName}>
          <span className="home-hrm-nav__user-dot" />
          <span className="home-hrm-nav__user-name">{displayName}</span>
          {isAdmin && <span className="home-hrm-nav__admin-badge">Admin</span>}
        </div>

        {!mobile && (
          <div className="home-hrm-nav__actions">
            <Link
              to="/account/zalo"
              className="home-hrm-nav__btn home-hrm-nav__btn--zalo"
              title="Gắn tài khoản Arito với Zalo Mini App"
            >
              <IconZalo size={16} />
              <span>Liên kết Zalo</span>
            </Link>

            {showAdminLink && (
              <Link
                to="/admin"
                className="home-hrm-nav__btn home-hrm-nav__btn--admin"
                title="Quản trị hệ thống & thiết kế form"
              >
                <IconAdmin size={16} />
                <span>Admin</span>
              </Link>
            )}

            <button
              type="button"
              className="home-hrm-nav__btn home-hrm-nav__btn--logout"
              onClick={onLogout}
              title="Đăng xuất khỏi hệ thống"
            >
              <IconLogout size={16} />
              <span>Đăng xuất</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
