import React, { useState, useEffect } from 'react';

interface LoginProps {
  onLogin: (email: string) => void;
}

declare global {
  interface Window {
    google?: any;
  }
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin'); // Toggle between Sign In and Sign Up
  const [fullName, setFullName] = useState(''); // Full name for signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const GOOGLE_CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const googleEnabled = Boolean(GOOGLE_CLIENT_ID);

  useEffect(() => {
    // Initialize Google Sign-In when component mounts
    // Uses Vite env: VITE_GOOGLE_CLIENT_ID
    // See AUTH_SETUP.md for detailed instructions
    if (!GOOGLE_CLIENT_ID) {
      console.warn('⚠️ Missing VITE_GOOGLE_CLIENT_ID env. Google Sign-In disabled. See AUTH_SETUP.md');
      return;
    }
    let initialized = false;
    const initGsi = () => {
      if (!window.google || initialized) return;
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
        });
        const googleButton = document.getElementById('google-signin-button');
        if (googleButton) {
          window.google.accounts.id.renderButton(
            googleButton,
            {
              theme: 'outline',
              size: 'large',
              width: '100%',
              text: 'signin_with',
              shape: 'rectangular',
            }
          );
        }
        initialized = true;
      } catch (err) {
        console.error('⚠️ Google Sign-In initialization failed:', err);
        console.log('💡 This can happen if the GSI script is still loading.');
      }
    };

    // Try immediately
    initGsi();

    // If not ready, poll briefly for the GSI script to load
    let pollId: any | undefined;
    if (!initialized) {
      pollId = setInterval(() => {
        if (window.google) {
          initGsi();
        }
      }, 300);
      // Stop polling after 10s
      setTimeout(() => pollId && clearInterval(pollId), 10000);
    }

    return () => {
      if (pollId) clearInterval(pollId);
    };
  }, []);

  const handleGoogleResponse = async (response: any) => {
    setError('');
    setLoading(true);

    try {
      if (!response.credential) {
        throw new Error('No credential received from Google');
      }

      console.log('📱 Google token received');

      // Send token to backend for verification with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const backendResponse = await fetch('/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: response.credential }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('📊 Backend response:', backendResponse.status);

      if (!backendResponse.ok) {
        const errorText = await backendResponse.text();
        console.error('❌ Backend error:', errorText);
        throw new Error(`Backend error: ${backendResponse.status}`);
      }

      const data = await backendResponse.json();
      console.log('📊 FULL Backend response:', data);
      console.log('✅ Auth response received:', { 
        user_id: data.user_id, 
        name: data.name, 
        avatar: data.avatar,
        token_length: data.token.length 
      });
      if (data.message) {
        setSuccess(data.message);
      }
      
      // Store user and token in localStorage
      const user = {
        id: data.user_id,
        name: data.name,
        avatar: data.avatar,
      };
      
      console.log('💾 Storing in localStorage:', user);
      localStorage.setItem('lexai_user', JSON.stringify(user));
      localStorage.setItem('lexai_token', data.token);
      
      // Verify what was actually stored
      const stored = localStorage.getItem('lexai_user');
      console.log('✅ Verified stored:', stored);
      
      // Call onLogin immediately
      onLogin(data.user_id);
      
    } catch (err: any) {
      setLoading(false);
      if (err.name === 'AbortError') {
        setError('Login timeout - backend not responding');
      } else {
        setError(err.message || 'Google authentication failed');
      }
      console.error('❌ Google auth error:', err);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    // Validation
    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    if (mode === 'signup' && !fullName.trim()) {
      setError('Please enter your full name');
      return;
    }

    if (!password.trim()) {
      setError('Please enter a password');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      // Send name for signup, will be ignored on signin
      const response = await fetch('/auth/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          password,
          name: mode === 'signup' ? fullName : undefined,  // Only send name for signup
          mode: mode
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `${mode === 'signup' ? 'Sign up' : 'Sign in'} failed`);
      }

      const data = await response.json();
      console.log('📊 FULL Email auth response:', data);
      console.log('✅ Email auth success:', { 
        user_id: data.user_id, 
        name: data.name,
        avatar: data.avatar,
        token_length: data.token.length 
      });
      if (data.message) {
        setSuccess(data.message);
      } else {
        setSuccess(mode === 'signup' ? 'Account created successfully' : 'Signed in successfully');
      }
      console.log(`Mode: ${mode}, Sent fullName: ${fullName}`);
      
      // Store user and token in localStorage
      const user = {
        id: data.user_id,
        name: data.name,
        avatar: data.avatar,
      };
      
      console.log('💾 Storing in localStorage:', user);
      localStorage.setItem('lexai_user', JSON.stringify(user));
      localStorage.setItem('lexai_token', data.token);
      
      // Verify what was actually stored
      const stored = localStorage.getItem('lexai_user');
      console.log('✅ Verified stored:', stored);
      
      // Call onLogin
      onLogin(data.user_id);
    } catch (err: any) {
      setLoading(false);
      setError(err.message || `${mode === 'signup' ? 'Sign up' : 'Sign in'} failed`);
      console.error('❌ Email auth error:', err);
    }
  };

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setFullName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
  };

  return (
    <div className="flex flex-col items-center justify-center w-screen h-screen bg-gradient-to-br from-charcoal-900 to-charcoal-800 text-gray-100 p-4">
      <div className="w-full max-w-md bg-charcoal-900 rounded-2xl p-8 shadow-2xl border border-violet-900/30 text-center">
        {/* Logo Area */}
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 bg-violet-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-violet-600/20">
            L
          </div>
        </div>

        {/* Header */}
        <h2 className="text-2xl font-bold mb-2 text-white">
          {mode === 'signin' ? 'Welcome back' : 'Create account'}
        </h2>
        <p className="text-gray-400 mb-6">
          {mode === 'signin' ? 'Sign in to LEXAI to continue' : 'Sign up to get started with LEXAI'}
        </p>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="mb-4 p-3 bg-green-900/30 border border-green-700/50 rounded-lg text-green-200 text-sm">
            {success}
          </div>
        )}

        {/* Email/Password Form */}
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          {/* Full Name Input (only for signup) */}
          {mode === 'signup' && (
            <div className="relative">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
                className="w-full bg-charcoal-800 border border-violet-900/30 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
                required
                disabled={loading}
              />
            </div>
          )}

          {/* Email Input */}
          <div className="relative">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="w-full bg-charcoal-800 border border-violet-900/30 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
              required
              disabled={loading}
            />
          </div>

          {/* Password Input */}
          <div className="relative">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 6 characters)"
              className="w-full bg-charcoal-800 border border-violet-900/30 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
              required
              disabled={loading}
            />
          </div>

          {/* Confirm Password Input (only for signup) */}
          {mode === 'signup' && (
            <div className="relative">
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full bg-charcoal-800 border border-violet-900/30 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
                required
                disabled={loading}
              />
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim() || (mode === 'signup' && !confirmPassword.trim()) || (mode === 'signup' && !fullName.trim())}
            className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors shadow-lg shadow-violet-600/20"
          >
            {loading ? (mode === 'signin' ? 'Signing in...' : 'Creating account...') : (mode === 'signin' ? 'Sign in' : 'Sign up')}
          </button>
        </form>

        {/* Toggle Mode Link */}
        <p className="mt-4 text-sm text-gray-400">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={toggleMode}
            className="text-violet-400 hover:text-violet-300 font-semibold"
            disabled={loading}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>

        <div className="my-6 flex items-center gap-4">
          <div className="h-px bg-violet-900/20 flex-1"></div>
          <span className="text-gray-500 text-xs uppercase">OR</span>
          <div className="h-px bg-violet-900/20 flex-1"></div>
        </div>

        {/* Google Sign-In Button container (always rendered) */}
        <div 
          id="google-signin-button" 
          className="flex justify-center"
          style={{ minHeight: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        ></div>

        {/* Helper text */}
        <p className="mt-6 text-xs text-gray-600">
          {!googleEnabled
            ? 'Google Sign-In unavailable: set VITE_GOOGLE_CLIENT_ID in frontend/.env.'
            : (mode === 'signin'
                ? 'New user? Sign up with email or Google.'
                : 'Already registered? Sign in with your credentials.')}
        </p>
      </div>
    </div>
  );
};

export default Login;