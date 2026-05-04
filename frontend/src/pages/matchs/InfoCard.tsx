import { ReactNode } from 'react';
import "./styles.css"

interface InfoCardProps {
  title: string;
  highlight?: string;
  children?: ReactNode;
}

export const InfoCard: React.FC<InfoCardProps> = ({
  title,
  highlight,
  children,
}) => {
  return (
    <section className="info-card">
      <h2 className="info-card__title">{title}</h2>
      {highlight && <div className="info-card__highlight">{highlight}</div>}
      {children && <div className="info-card__body">{children}</div>}
    </section>
  );
};
