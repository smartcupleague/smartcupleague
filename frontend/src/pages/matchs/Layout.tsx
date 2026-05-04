import { ReactNode } from 'react';
import field from '../../../public/images/dashboard-prediction.jpeg';
import './styles.css';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <>
      <div
        style={{
          width: '100%',
          minHeight: '100vh',
          backgroundImage: `url(${field})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
          display: 'flex',
          flexDirection: 'column',
        }}>
        <main className="app-content">{children}</main>
      </div>
    </>
  );
};
