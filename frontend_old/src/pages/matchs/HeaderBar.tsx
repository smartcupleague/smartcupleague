import "./styles.css"
import { useNavigate } from 'react-router-dom';

export const HeaderBar: React.FC = () => {

  const navigate = useNavigate();


  return (
    <header className="header-bar">
      <div className="logo">
        <span className="logo-main">Smart</span>
        <span className="logo-highlight">CupLeague</span>
      </div>

      <button className="back-button" onClick={() => navigate('/home') }>BACK</button>
    </header>
  );
};
