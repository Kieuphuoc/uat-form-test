import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type TileTheme = 'yellow' | 'red' | 'blue' | 'grey' | 'green' | 'purple' | 'primary';

export type HomeTileProps = {
  to: string;
  title: string;
  desc?: string;
  icon: ReactNode;
  theme?: TileTheme;
  badge?: string | number;
  isExternal?: boolean;
};

export function HomeTileCard({
  to,
  title,
  desc,
  icon,
  theme = 'blue',
  badge,
  isExternal,
}: HomeTileProps) {
  const content = (
    <article className={`home-tile-card home-tile-card--${theme}`}>
      <div className="home-tile-card__icon-wrap">
        <span className="home-tile-card__icon">{icon}</span>
        {badge !== undefined && badge !== null && (
          <span className="home-tile-card__badge">{badge}</span>
        )}
      </div>

      <div className="home-tile-card__content">
        <h3 className="home-tile-card__title">{title}</h3>
        {desc && <p className="home-tile-card__desc">{desc}</p>}
      </div>
    </article>
  );

  if (isExternal) {
    return (
      <a
        href={to}
        target="_blank"
        rel="noopener noreferrer"
        className="home-tile-card-link"
        title={desc || title}
      >
        {content}
      </a>
    );
  }

  return (
    <Link to={to} className="home-tile-card-link" title={desc || title}>
      {content}
    </Link>
  );
}
