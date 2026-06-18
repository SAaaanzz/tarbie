// Страница входа: авторизация по телефону + OTP и через Telegram.
import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { GraduationCap, Phone, KeyRound, Loader2, Send, MessageCircle } from 'lucide-react';
import type { User } from '@tarbie/shared';

const TG_BOT = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? 'TarbieSagatyBot';

type Step = 'main' | 'phone' | 'otp';

export function LoginPage() {
  const [step, setStep] = useState<Step>('main');
  const [phone, setPhone] = useState('+7');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginLang, setLoginLang] = useState<'kz' | 'ru'>('ru');
  const { setAuth } = useAuthStore();

  const t = loginLang === 'kz';

  // Handle magic link from Telegram bot (?auth_token=xxx)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authToken = params.get('auth_token');
    if (authToken) {
      window.history.replaceState({}, '', '/');
      setLoading(true);
      api.post<{ token: string; user: User }>('/api/auth/telegram-login', { token: authToken })
        .then((result) => {
          setAuth(result.token, result.user);
          navigate('/');
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : (t ? 'Сілтеме мерзімі өтті' : 'Ссылка истекла'));
          setLoading(false);
        });
    }
  }, [setAuth]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post<{ message: string; expires_in: number }>('/api/auth/login', { phone });
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : (t ? 'Қате' : 'Ошибка'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.post<{ token: string; user: User }>('/api/auth/verify', { phone, otp });
      setAuth(result.token, result.user);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : (t ? 'Код қате' : 'Неверный код'));
    } finally {
      setLoading(false);
    }
  };

  // Loading state for magic link
  if (loading && step === 'main' && !error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-white to-accent-50">
        <div className="text-center">
          <Loader2 size={40} className="mx-auto animate-spin text-primary-600" />
          <p className="mt-4 text-sm text-gray-500">{t ? 'Жүйеге кіруде...' : 'Входим в систему...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-white to-accent-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-lg shadow-primary-200">
            <GraduationCap size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Тәрбие Сағаты</h1>
          <p className="mt-1 text-sm text-gray-500">{t ? 'Басқару жүйесі' : 'Система управления'}</p>
          <div className="mt-3 flex justify-center gap-2">
            <button onClick={() => setLoginLang('kz')} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${loginLang === 'kz' ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300' : 'text-gray-500 hover:bg-gray-100'}`}>🇰🇿 Қазақша</button>
            <button onClick={() => setLoginLang('ru')} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${loginLang === 'ru' ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300' : 'text-gray-500 hover:bg-gray-100'}`}>🇷🇺 Русский</button>
          </div>
        </div>

        <div className="card">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-inset ring-red-600/10">
              {error}
            </div>
          )}

          {step === 'main' && (
            <>
              <h2 className="mb-6 text-center text-lg font-semibold text-gray-900">
                {t ? 'Жүйеге кіру' : 'Вход в систему'}
              </h2>

              {/* Primary: Login via Telegram bot */}
              <a
                href={`https://t.me/${TG_BOT}?start=login`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2AABEE] px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-[#229ED9] transition-colors"
              >
                <MessageCircle size={20} />
                {t ? 'Telegram арқылы кіру' : 'Войти через Telegram'}
              </a>

              <p className="my-3 text-center text-xs text-gray-400">
                {t ? 'Бот ашылады — /login басыңыз, содан кейін «Кіру» батырмасын басыңыз' : 'Откроется бот — нажмите /login, затем кнопку «Войти»'}
              </p>

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-white px-3 text-gray-400">{t ? 'немесе' : 'или'}</span></div>
              </div>

              {/* Secondary: phone + OTP */}
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={() => { setStep('phone'); setError(''); }}
              >
                <Phone size={18} />
                {t ? 'Телефон нөмірімен кіру' : 'Войти по номеру телефона'}
              </button>

              <div className="mt-5 rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-blue-700 leading-relaxed">
                  {t ? (
                    <><b>Бірінші рет кіресіз бе?</b> <a href={`https://t.me/${TG_BOT}`} target="_blank" rel="noopener noreferrer" className="underline font-medium">@{TG_BOT}</a> ботын ашыңыз, /start басыңыз және аккаунтты байланыстыру үшін телефон нөміріңізді жіберіңіз.</>
                  ) : (
                    <><b>Первый вход?</b> Откройте <a href={`https://t.me/${TG_BOT}`} target="_blank" rel="noopener noreferrer" className="underline font-medium">@{TG_BOT}</a>, нажмите /start и отправьте свой номер телефона для привязки аккаунта.</>
                  )}
                </p>
              </div>
            </>
          )}

          {step === 'phone' && (
            <form onSubmit={handleSendOtp}>
              <h2 className="mb-6 text-center text-lg font-semibold text-gray-900">
                {t ? 'Нөмір арқылы кіру' : 'Вход по номеру'}
              </h2>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t ? 'Телефон нөмірі' : 'Номер телефона'}
              </label>
              <div className="relative mb-2">
                <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="tel"
                  className="input-field pl-10"
                  placeholder="+7XXXXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  pattern="\+7\d{10}"
                  autoFocus
                />
              </div>
              <p className="mb-4 text-xs text-gray-400">
                {t ? 'Код Telegram-ға жіберіледі. Бот байланыстырылған болуы керек.' : 'Код будет отправлен в Telegram. Бот должен быть привязан.'}
              </p>
              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : <><Send size={16} className="mr-1.5" /> {t ? 'Telegram-ға код алу' : 'Получить код в Telegram'}</>}
              </button>
              <button
                type="button"
                className="mt-3 w-full text-center text-sm text-gray-500 hover:text-gray-700"
                onClick={() => { setStep('main'); setError(''); }}
              >
                {t ? '← Артқа' : '← Назад'}
              </button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp}>
              <h2 className="mb-4 text-center text-lg font-semibold text-gray-900">
                {t ? 'Кодты енгізіңіз' : 'Введите код'}
              </h2>
              <div className="mb-4 rounded-lg bg-green-50 p-3 text-center">
                <p className="text-sm text-green-700">
                  <Send size={14} className="inline mr-1" />
                  {t ? (
                    <>Код <span className="font-medium">Telegram</span>-ға жіберілді: <span className="font-medium">{phone}</span></>
                  ) : (
                    <>Код отправлен в <span className="font-medium">Telegram</span> на <span className="font-medium">{phone}</span></>
                  )}
                </p>
              </div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t ? 'Растау коды' : 'Код подтверждения'}
              </label>
              <div className="relative mb-4">
                <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  className="input-field pl-10 text-center text-lg tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : (t ? 'Кіру' : 'Войти')}
              </button>
              <button
                type="button"
                className="mt-3 w-full text-center text-sm text-gray-500 hover:text-gray-700"
                onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
              >
                {t ? '← Нөмірді өзгерту' : '← Изменить номер'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          {t ? 'Қазақстан колледждеріне арналған тәрбие сағаттарын басқару жүйесі' : 'Электронная система управления классными часами для колледжей Казахстана'}
        </p>
      </div>
    </div>
  );
}
