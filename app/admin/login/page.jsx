'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

export default function AdminLogin() {
  const router = useRouter();
  const [form,    setForm]    = useState({ username: '', password: '' });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await axios.post('/api/admin/auth', form);
      if (data.success) {
        router.push('/admin');
        router.refresh();
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-950 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}
      />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-gold-400 to-gold-600 rounded-2xl mb-4 shadow-lg shadow-gold-500/30">
            <svg className="w-8 h-8 text-brand-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white">Admin Access</h1>
          <p className="text-slate-400 text-sm mt-1">Brighten Exchange Ltd</p>
        </div>

        {/* Card */}
        <div className="bg-white/10 dark:bg-white/5 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide mb-2">
                Username
              </label>
              <input
                type="text"
                autoComplete="username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
                className="
                  w-full px-4 py-3 rounded-xl
                  bg-white/10 border border-white/20
                  text-white placeholder-slate-400
                  focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent
                  transition-all
                "
                placeholder="admin"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide mb-2">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                className="
                  w-full px-4 py-3 rounded-xl
                  bg-white/10 border border-white/20
                  text-white placeholder-slate-400
                  focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent
                  transition-all
                "
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-sm text-red-300 text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="
                w-full py-3.5 rounded-xl font-bold text-brand-950
                bg-gradient-to-r from-gold-400 to-gold-600 hover:from-gold-500 hover:to-gold-700 active:from-gold-600 active:to-gold-800
                shadow-lg shadow-gold-500/30
                transition-all duration-200
                disabled:opacity-60 disabled:cursor-not-allowed
              "
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          Authorized personnel only
        </p>
      </div>
    </div>
  );
}
