
import '../styles/Login.css';

export default function Login() {
  return (
    <div className="login-container">
      <div className="login-card">
        <h1>📊 PT Biz SMS Dashboard</h1>
        <p>Use your dashboard password to sign in.</p>
        <a href="/" className="login-button">
          Continue to Password Login
        </a>
      </div>
    </div>
  );
}
