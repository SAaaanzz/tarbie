import React, { useState, useRef } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { Avatar } from '../components/Avatar';
import {
  Loader2, Save, Phone, Globe, Crown, Shield, Lock,
  Sparkles, BarChart3, FileText, Bell, CheckCircle2,
  Camera, Upload, Download, X,
} from 'lucide-react';

export function ProfilePage() {
  const { user, lang } = useAuthStore();
  const [userLang, setUserLang] = useState<'kz' | 'ru'>((user?.lang as 'kz' | 'ru') ?? 'ru');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Phone change state
  const [showPhoneChange, setShowPhoneChange] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneStep, setPhoneStep] = useState<'input' | 'otp'>('input');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [phoneSuccess, setPhoneSuccess] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showPremiumModal, setShowPremiumModal] = useState(false);

  const isPremium = !!(user?.premium);
  const premiumExpires = user?.premium_expires_at ?? null;

  const roleLabel = (role: string) => {
    const map: Record<string, Record<string, string>> = {
      admin: { kz: 'Әкімші', ru: 'Администратор' },
      teacher: { kz: 'Мұғалім', ru: 'Учитель' },
      student: { kz: 'Оқушы', ru: 'Ученик' },
      parent: { kz: 'Ата-ана', ru: 'Родитель' },
    };
    return map[role]?.[lang] ?? role;
  };

  const handleSaveLang = async () => {
    setSaving(true); setError(''); setSuccess(false);
    try {
      await api.put('/api/auth/me', { lang: userLang });
      setSuccess(true);
      if (userLang !== lang) useAuthStore.getState().setLang(userLang);
      await useAuthStore.getState().fetchMe();
    } catch (err) { setError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка')); }
    finally { setSaving(false); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024) { setError(lang === 'kz' ? 'Сурет 200KB-тан аспауы керек' : 'Изображение не должно превышать 200KB'); return; }
    setAvatarUploading(true); setError('');
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        await api.post('/api/auth/me/avatar', { avatar: dataUrl });
        await useAuthStore.getState().fetchMe();
        setAvatarUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) { setError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка')); setAvatarUploading(false); }
  };

  const handlePhoneRequest = async () => {
    setPhoneLoading(true); setPhoneError('');
    try { await api.post('/api/support/phone-change/request', { new_phone: newPhone }); setPhoneStep('otp'); }
    catch (err) { setPhoneError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка')); }
    finally { setPhoneLoading(false); }
  };

  const handlePhoneVerify = async () => {
    setPhoneLoading(true); setPhoneError('');
    try {
      await api.post('/api/support/phone-change/verify', { otp: phoneOtp });
      setPhoneSuccess(lang === 'kz' ? 'Нөмір сәтті өзгертілді!' : 'Номер успешно изменён!');
      setShowPhoneChange(false); setPhoneStep('input'); setNewPhone(''); setPhoneOtp('');
      await useAuthStore.getState().fetchMe();
    } catch (err) { setPhoneError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка')); }
    finally { setPhoneLoading(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <Shield size={24} className="text-primary-600" />
        {lang === 'kz' ? 'Профиль' : 'Профиль'}
      </h1>

      {/* Profile card */}
      <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-200">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative group">
            <Avatar name={user?.full_name ?? '?'} size="xl" avatarUrl={user?.avatar_url} />
            <button onClick={() => fileInputRef.current?.click()} disabled={avatarUploading}
              className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
              {avatarUploading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {user?.full_name}
            </h2>
            <p className="text-sm text-gray-500">{roleLabel(user?.role ?? '')}</p>
            {isPremium && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-2.5 py-0.5 text-xs font-bold text-white mt-1">
                <Crown size={12} /> Premium
              </span>
            )}
          </div>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {success && <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{lang === 'kz' ? 'Сәтті сақталды!' : 'Успешно сохранено!'}</div>}
        {phoneSuccess && <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{phoneSuccess}</div>}

        <div className="space-y-4">
          {/* Name (read-only) */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 flex items-center gap-1">
              <Lock size={14} className="text-gray-400" /> {lang === 'kz' ? 'Аты-жөні' : 'ФИО'}
            </label>
            <div className="input-field bg-gray-50 text-gray-600 cursor-not-allowed">{user?.full_name}</div>
            <p className="mt-1 text-[11px] text-gray-400">{lang === 'kz' ? 'Атын әкімші ғана өзгерте алады' : 'Имя может изменить только администратор'}</p>
          </div>

          {/* Phone */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 flex items-center gap-1">
              <Phone size={14} /> {lang === 'kz' ? 'Телефон' : 'Телефон'}
            </label>
            <div className="flex items-center gap-2">
              <div className="input-field flex-1 bg-gray-50 text-gray-600">{user?.phone}</div>
              <button type="button" onClick={() => { setShowPhoneChange(!showPhoneChange); setPhoneError(''); setPhoneStep('input'); }} className="btn-secondary text-xs whitespace-nowrap">
                {lang === 'kz' ? 'Өзгерту' : 'Изменить'}
              </button>
            </div>
            {showPhoneChange && (
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3">
                {phoneError && <p className="text-xs text-red-600">{phoneError}</p>}
                {phoneStep === 'input' ? (
                  <>
                    <p className="text-xs text-gray-600">{lang === 'kz' ? 'Жаңа нөмірді енгізіңіз.' : 'Введите новый номер.'}</p>
                    <input type="tel" className="input-field text-sm" placeholder="+7XXXXXXXXXX" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
                    <button onClick={handlePhoneRequest} disabled={phoneLoading || !newPhone.match(/^\+7\d{10}$/)} className="btn-primary text-xs">
                      {phoneLoading ? <Loader2 size={14} className="animate-spin" /> : (lang === 'kz' ? 'Код жіберу' : 'Отправить код')}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-gray-600">{lang === 'kz' ? '6 санды кодты енгізіңіз' : 'Введите 6-значный код'}</p>
                    <input type="text" className="input-field text-sm text-center tracking-widest font-mono" placeholder="000000" maxLength={6} value={phoneOtp} onChange={e => setPhoneOtp(e.target.value.replace(/\D/g, ''))} />
                    <div className="flex gap-2">
                      <button onClick={() => setPhoneStep('input')} className="btn-secondary text-xs">{lang === 'kz' ? 'Артқа' : 'Назад'}</button>
                      <button onClick={handlePhoneVerify} disabled={phoneLoading || phoneOtp.length !== 6} className="btn-primary text-xs">
                        {phoneLoading ? <Loader2 size={14} className="animate-spin" /> : (lang === 'kz' ? 'Растау' : 'Подтвердить')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Language */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 flex items-center gap-1">
              <Globe size={14} /> {lang === 'kz' ? 'Тілі' : 'Язык'}
            </label>
            <div className="flex items-center gap-2">
              <select className="input-field flex-1" value={userLang} onChange={e => setUserLang(e.target.value as 'kz' | 'ru')}>
                <option value="ru">Русский</option>
                <option value="kz">Қазақша</option>
              </select>
              <button type="button" onClick={handleSaveLang} disabled={saving || userLang === lang} className="btn-primary text-xs">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-200">
        <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
          <CheckCircle2 size={18} className="text-green-600" />
          {lang === 'kz' ? 'Қолжетімді' : 'Доступно'}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <FreeFeature icon={<BarChart3 size={16} />} lang={lang} titleRu="Аналитика и отчёты" titleKz="Аналитика мен есептер" />
          <FreeFeature icon={<FileText size={16} />} lang={lang} titleRu="PDF экспорт" titleKz="PDF экспорт" />
          <FreeFeature icon={<Bell size={16} />} lang={lang} titleRu="Telegram-уведомления" titleKz="Telegram хабарламалар" />
        </div>
      </div>

      {/* Premium section */}
      <div className={`rounded-2xl p-6 shadow-sm border ${isPremium ? 'bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 border-amber-200' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isPremium ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white' : 'bg-gray-100 text-gray-400'}`}><Crown size={20} /></div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900">Premium</h3>
            {isPremium && premiumExpires ? (
              <p className="text-xs text-green-600">{lang === 'kz' ? `Белсенді — ${new Date(premiumExpires).toLocaleDateString()} дейін` : `Активен до ${new Date(premiumExpires).toLocaleDateString()}`}</p>
            ) : isPremium ? (
              <p className="text-xs text-green-600">{lang === 'kz' ? 'Белсенді' : 'Активен'}</p>
            ) : (
              <p className="text-xs text-gray-500">{lang === 'kz' ? 'Белсенді емес' : 'Не активен'}</p>
            )}
          </div>
          {!isPremium && (
            <button onClick={() => setShowPremiumModal(true)} className="rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2 text-xs font-bold text-white hover:shadow-md transition-shadow">
              {lang === 'kz' ? 'Сатып алу' : 'Купить'}
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {isPremium ? (
            <>
              <PremiumCard lang={lang} icon={<Upload size={20} className="text-amber-600" />} titleRu="Импорт данных" titleKz="Деректерді импорт" descRu="Импорт уроков и пользователей из Excel" descKz="Excel-ден сабақтар мен пайдаланушылар импорты" onClick={() => navigate('/sessions')} btnRu="Импорт" btnKz="Импорт" />
              <PremiumCard lang={lang} icon={<Download size={20} className="text-amber-600" />} titleRu="Экспорт данных" titleKz="Деректерді экспорт" descRu="Экспорт в Excel: занятия, пользователи" descKz="Excel-ге экспорт: сабақтар, пайдаланушылар" onClick={() => navigate('/sessions')} btnRu="Экспорт" btnKz="Экспорт" />
              <PremiumCard lang={lang} icon={<Sparkles size={20} className="text-amber-600" />} titleRu="AI-ассистент" titleKz="AI-көмекші" descRu="AI — планы уроков" descKz="AI — сабақ жоспарлау" onClick={() => navigate('/assistant')} btnRu="Открыть" btnKz="Ашу" />
            </>
          ) : (
            <>
              <LockedCard lang={lang} icon={<Upload size={20} />} titleRu="Импорт данных" titleKz="Деректерді импорт" onClick={() => setShowPremiumModal(true)} />
              <LockedCard lang={lang} icon={<Download size={20} />} titleRu="Экспорт данных" titleKz="Деректерді экспорт" onClick={() => setShowPremiumModal(true)} />
              <LockedCard lang={lang} icon={<Sparkles size={20} />} titleRu="AI-ассистент" titleKz="AI-көмекші" onClick={() => setShowPremiumModal(true)} />
            </>
          )}
        </div>
      </div>

      {/* Premium purchase modal */}
      {showPremiumModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowPremiumModal(false)}>
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowPremiumModal(false)} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"><X size={20} /></button>
            <div className="text-center mb-5">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 text-white"><Crown size={28} /></div>
              <h3 className="text-lg font-bold text-gray-900">Tarbie Premium</h3>
              <p className="text-sm text-gray-500 mt-1">{lang === 'kz' ? '30 күнге арналған жазылым' : 'Подписка на 30 дней'}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-4 mb-4 border border-amber-100">
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-900">1 500 ₸</p>
                <p className="text-xs text-gray-500 mt-1">{lang === 'kz' ? '30 күн' : '30 дней'}</p>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-gray-700">
                <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-green-500" /> {lang === 'kz' ? 'AI-көмекші' : 'AI-ассистент'}</li>
                <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-green-500" /> {lang === 'kz' ? 'Excel импорт/экспорт' : 'Импорт/экспорт Excel'}</li>
                <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-green-500" /> {lang === 'kz' ? 'Premium белгісі' : 'Premium-значок'}</li>
              </ul>
            </div>
            <a
              href="https://t.me/myavkashopbot?start=product_1261719779"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-3 text-center text-sm font-bold text-white hover:shadow-lg transition-shadow"
            >
              {lang === 'kz' ? '💳 Сатып алу' : '💳 Купить'}
            </a>
            <p className="text-[10px] text-gray-400 text-center mt-3">{lang === 'kz' ? 'Төлем Telegram-бот арқылы жүзеге асырылады' : 'Оплата через Telegram-бот'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FreeFeature({ icon, lang, titleRu, titleKz }: { icon: React.ReactNode; lang: string; titleRu: string; titleKz: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-green-50 p-2.5 border border-green-100">
      <span className="text-green-600">{icon}</span>
      <p className="text-sm font-medium text-gray-800">{lang === 'kz' ? titleKz : titleRu}</p>
      <CheckCircle2 size={14} className="text-green-500 ml-auto" />
    </div>
  );
}

function PremiumCard({ lang, icon, titleRu, titleKz, descRu, descKz, onClick, btnRu, btnKz }: {
  lang: string; icon: React.ReactNode; titleRu: string; titleKz: string; descRu: string; descKz: string; onClick: () => void; btnRu: string; btnKz: string;
}) {
  return (
    <div className="rounded-xl bg-white/80 p-4 border border-amber-100 flex flex-col">
      <div className="flex items-center gap-2 mb-2">{icon}<h4 className="font-semibold text-sm text-gray-900">{lang === 'kz' ? titleKz : titleRu}</h4></div>
      <p className="text-xs text-gray-500 mb-3 flex-1">{lang === 'kz' ? descKz : descRu}</p>
      <button onClick={onClick} className="self-start rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-1.5 text-xs font-bold text-white hover:shadow-md transition-shadow">{lang === 'kz' ? btnKz : btnRu}</button>
    </div>
  );
}

function LockedCard({ lang, icon, titleRu, titleKz, onClick }: {
  lang: string; icon: React.ReactNode; titleRu: string; titleKz: string; onClick: () => void;
}) {
  return (
    <div onClick={onClick} className="rounded-xl bg-gray-50 p-4 border border-gray-200 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-gray-100 transition-colors relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-100/50 to-gray-200/50" />
      <div className="relative z-10">
        <span className="text-gray-400 mb-2 block">{icon}</span>
        <h4 className="font-semibold text-sm text-gray-500">{lang === 'kz' ? titleKz : titleRu}</h4>
        <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 font-medium">
          <Lock size={12} /> Premium
        </div>
      </div>
    </div>
  );
}
