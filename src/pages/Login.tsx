import React, { useState } from 'react';
import { Droplets, Shield, MapPin, LogIn, AlertTriangle, Info } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { OFFICER_ACCOUNTS } from '../data/officers';

const Login: React.FC = () => {
  const login = useAuthStore(s => s.login);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (officer: (typeof OFFICER_ACCOUNTS)[number]) => {
    setError(null);
    setLoadingId(officer.id);
    try {
      await login(officer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed — could not reach the backend server.');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-primary-600 flex items-center justify-center mx-auto mb-3 shadow">
            <Droplets className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-text-dark">JalDrishti</h1>
          <p className="text-xs text-gray-500 mt-1">Watershed Monitoring &amp; Decision Support — SIH26015</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary-600" />
            <h2 className="text-sm font-bold text-text-dark">Dungarpur District Access</h2>
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            Sign in as the Dungarpur District Watershed Officer.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 text-xs text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{error}</p>
                <p className="text-red-600 mt-1">Start the backend server (`npm run dev` in SIH/server) and try again.</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {OFFICER_ACCOUNTS.map(officer => (
              <button
                key={officer.id}
                onClick={() => handleLogin(officer)}
                disabled={loadingId !== null}
                className="w-full flex items-center justify-between gap-3 border border-gray-200 rounded-lg p-3 text-left hover:border-primary-300 hover:bg-primary-50 transition-colors group disabled:opacity-50 disabled:cursor-wait"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${officer.isAdmin ? 'bg-secondary-100' : 'bg-primary-100'}`}>
                    {officer.isAdmin
                      ? <Shield className="w-4 h-4 text-secondary-600" />
                      : <MapPin className="w-4 h-4 text-primary-600" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-dark truncate">{officer.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {officer.role}{officer.district && ` — ${officer.district} District`}
                    </p>
                  </div>
                </div>
                <LogIn className="w-4 h-4 text-gray-300 group-hover:text-primary-500 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 text-xs text-gray-400 px-1">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <p>This prototype is restricted to a single seeded account. Signing in authenticates against the backend (bcrypt-verified password, signed JWT) — the backend server must be running. Demo credentials: username <code className="font-mono">patel</code>, password <code className="font-mono">Patel@123</code>.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
