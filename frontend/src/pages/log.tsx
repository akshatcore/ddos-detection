import { useState } from "react";
import "../styles/login.css";
import { FiShield, FiSun, FiMoon } from "react-icons/fi";
import { login } from "../services/auth";
import { useTheme } from "../theme/ThemeContext";

type LoginProps = {
  onLogin: () => void;
};

function Login({ onLogin }: LoginProps) {
  const { mode, toggle } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Calls the real backend POST /auth/login endpoint - no
      // hardcoded bypass, onLogin() only fires on a genuine 200 response.
      await login(email, password);
      onLogin();
    } catch (err) {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <button className="icon-btn login-theme-toggle" onClick={toggle} type="button" title="Toggle theme">
        {mode === "dark" ? <FiSun /> : <FiMoon />}
      </button>

      <div className="login-box">
        <div className="login-badge">
          <FiShield />
        </div>
        <h1>ML-Based DDoS Detection</h1>
        <p>Security Operations Center</p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="login-error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
