import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { Bell, MessageSquare, Globe, Check, ExternalLink, ClipboardList, Loader2, Save, Headset, PenTool } from 'lucide-react';
import { SignaturePad } from '../components/SignaturePad';

export function SettingsPage() {
  const { user, lang, setLang } = useAuthStore();

  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? 'TarbieSagatyBot';
  const telegramLink = `https://t.me/${botUsername}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {lang === 'kz' ? 'Баптаулар' : 'Настройки'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {lang === 'kz' ? 'Хабарландырулар және тіл параметрлері' : 'Уведомления и языковые настройки'}
        </p>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <Globe size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {lang === 'kz' ? 'Тіл' : 'Язык'}
            </h2>
            <p className="text-sm text-gray-500">
              {lang === 'kz' ? 'Интерфейс тілін таңдаңыз' : 'Выберите язык интерфейса'}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setLang('kz')}
            className={`flex-1 rounded-lg border px-4 py-3 text-center text-sm font-medium transition-colors ${
              lang === 'kz'
                ? 'border-primary-500 bg-primary-50 text-primary-700 ring-2 ring-primary-500/20'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            🇰🇿 Қазақша
          </button>
          <button
            onClick={() => setLang('ru')}
            className={`flex-1 rounded-lg border px-4 py-3 text-center text-sm font-medium transition-colors ${
              lang === 'ru'
                ? 'border-primary-500 bg-primary-50 text-primary-700 ring-2 ring-primary-500/20'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            🇷🇺 Русский
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
            <Bell size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Telegram</h2>
            <p className="text-sm text-gray-500">
              {lang === 'kz'
                ? 'Telegram арқылы хабарландыру алу үшін ботты байланыстырыңыз'
                : 'Привяжите бота для получения уведомлений через Telegram'}
            </p>
          </div>
        </div>

        {user?.telegram_chat_id ? (
          <div className="rounded-lg bg-green-50 p-4 ring-1 ring-inset ring-green-600/10">
            <div className="flex items-center gap-2">
              <Check size={18} className="text-green-600" />
              <span className="text-sm font-medium text-green-800">
                {lang === 'kz' ? 'Telegram байланыстырылған' : 'Telegram привязан'}
              </span>
            </div>
            <p className="mt-1 text-xs text-green-700">
              Chat ID: {user.telegram_chat_id}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-amber-50 p-4">
              <p className="text-sm text-amber-800 leading-relaxed">
                {lang === 'kz'
                  ? '1. Ботты ашыңыз → /start басыңыз\n2. «📱 Отправить номер телефона» батырмасын басыңыз\n3. Telegram автоматты түрде байланыстырылады'
                  : '1. Откройте бота → нажмите /start\n2. Нажмите кнопку «📱 Отправить номер телефона»\n3. Telegram привяжется автоматически'}
              </p>
            </div>
            <a
              href={telegramLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex w-full justify-center"
            >
              <ExternalLink size={16} className="mr-2" />
              {lang === 'kz' ? `@${botUsername} ашу` : `Открыть @${botUsername}`}
            </a>
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600">
            <MessageSquare size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">WhatsApp</h2>
            <p className="text-sm text-gray-500">
              {lang === 'kz'
                ? 'WhatsApp хабарландырулары автоматты түрде жіберіледі'
                : 'WhatsApp уведомления отправляются автоматически'}
            </p>
          </div>
        </div>
        <div className="rounded-lg bg-gray-50 p-4">
          <p className="text-sm text-gray-600">
            {user?.whatsapp_number ? (
              <>
                <span className="font-medium text-gray-900">{user.whatsapp_number}</span>
                <span className="ml-2 text-green-600">
                  {lang === 'kz' ? '— белсенді' : '— активен'}
                </span>
              </>
            ) : (
              <span className="text-gray-400">
                {lang === 'kz'
                  ? 'WhatsApp нөмірі администратор арқылы қосылады'
                  : 'WhatsApp номер добавляется администратором'}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          {lang === 'kz' ? 'Аккаунт ақпараты' : 'Информация об аккаунте'}
        </h2>
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">{lang === 'kz' ? 'Аты-жөні' : 'ФИО'}</dt>
            <dd className="text-sm font-medium text-gray-900">{user?.full_name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">{lang === 'kz' ? 'Телефон' : 'Телефон'}</dt>
            <dd className="text-sm font-medium text-gray-900">{user?.phone}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">{lang === 'kz' ? 'Рөлі' : 'Роль'}</dt>
            <dd className="text-sm font-medium text-gray-900">
              {user?.role === 'admin' ? (lang === 'kz' ? 'Әкімші' : 'Администратор') :
               user?.role === 'teacher' ? 'Куратор' :
               user?.role === 'student' ? 'Студент' : ''}
            </dd>
          </div>
        </dl>
      </div>
      {(user?.role === 'admin' || user?.role === 'teacher') && <SignatureSettings lang={lang} />}
      {user?.role === 'admin' && <SupportAdminSettings lang={lang} />}
      {user?.role === 'admin' && <AdminChangeLog lang={lang} />}
    </div>
  );
}

/* ─── Signature Settings ─── */

function SignatureSettings({ lang }: { lang: 'kz' | 'ru' }) {
  const [currentSignature, setCurrentSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<{ signature_data: string } | null>('/api/signatures/me')
      .then((res) => { setCurrentSignature(res?.signature_data || null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (signatureData: string) => {
    try {
      await api.post('/api/signatures/me', { signature_data: signatureData });
      setCurrentSignature(signatureData);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* ignore */ }
  };

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
          <PenTool size={20} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {lang === 'kz' ? 'Қолтаңба' : 'Подпись'}
          </h2>
          <p className="text-sm text-gray-500">
            {lang === 'kz'
              ? 'Құжаттарда пайдаланылатын қолтаңбаңыз'
              : 'Ваша подпись для документов'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
      ) : editing ? (
        <SignaturePad
          lang={lang}
          initialSignature={currentSignature}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="space-y-3">
          {currentSignature ? (
            <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
              <img src={currentSignature} alt="signature" className="h-16 object-contain" />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
              {lang === 'kz' ? 'Қолтаңба орнатылмаған' : 'Подпись не установлена'}
            </div>
          )}
          {saved && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Check size={16} />
              {lang === 'kz' ? 'Сақталды' : 'Сохранено'}
            </div>
          )}
          <button onClick={() => setEditing(true)}
            className="btn-secondary text-sm flex items-center gap-1.5">
            <PenTool size={14} />
            {currentSignature
              ? (lang === 'kz' ? 'Қолтаңбаны өзгерту' : 'Изменить подпись')
              : (lang === 'kz' ? 'Қолтаңба қою' : 'Добавить подпись')}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Support Admin Settings ─── */

function SupportAdminSettings({ lang }: { lang: 'kz' | 'ru' }) {
  const [chatId, setChatId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ chat_id: string }>('/api/admin/settings/support-chat');
        setChatId(res.chat_id ?? '');
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/api/admin/settings/support-chat', { chat_id: chatId });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* ignore */ }
    setSaving(false);
  };

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
          <Headset size={20} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {lang === 'kz' ? 'Қолдау қызметі баптаулары' : 'Настройки поддержки'}
          </h2>
          <p className="text-sm text-gray-500">
            {lang === 'kz'
              ? 'Обращения Telegram-ға жіберілетін чат ID-ін баптаңыз'
              : 'Настройте Chat ID для пересылки обращений в Telegram'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {lang === 'kz' ? 'Қолдау администраторының Telegram Chat ID' : 'Telegram Chat ID администратора поддержки'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                className="input-field flex-1"
                placeholder={lang === 'kz' ? 'Мысалы: 123456789' : 'Например: 123456789'}
                value={chatId}
                onChange={e => setChatId(e.target.value)}
              />
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-1.5 text-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
                {saved ? (lang === 'kz' ? 'Сақталды' : 'Сохранено') : (lang === 'kz' ? 'Сақтау' : 'Сохранить')}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              {lang === 'kz'
                ? 'Chat ID-ін білу үшін @userinfobot ботына /start басыңыз немесе бот арқылы хабарлама жіберіңіз'
                : 'Чтобы узнать Chat ID, напишите /start боту @userinfobot или отправьте сообщение через бота'}
            </p>
          </div>
          <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700 leading-relaxed">
            {lang === 'kz'
              ? '💡 Chat ID орнатылғанда, барлық жаңа обращениялар мен хабарламалар осы Telegram чатына жіберіледі. Сіз тікелей Telegram-дан жауап бере аласыз.'
              : '💡 Когда Chat ID установлен, все новые обращения и сообщения будут пересылаться в этот Telegram чат. Вы сможете отвечать прямо из Telegram.'}
          </div>
          <WebhookSetup lang={lang} />
        </div>
      )}
    </div>
  );
}

/* ─── Webhook Setup ─── */

function WebhookSetup({ lang }: { lang: 'kz' | 'ru' }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  const handleSetup = async () => {
    setStatus('loading');
    try {
      const res = await api.post<{ result: { ok: boolean } }>('/api/admin/settings/setup-webhook', {});
      setStatus(res?.result?.ok ? 'ok' : 'error');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="flex items-center gap-3 pt-1">
      <button onClick={handleSetup} disabled={status === 'loading'}
        className="btn-secondary text-xs flex items-center gap-1.5">
        {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
        {lang === 'kz' ? 'Telegram webhook орнату' : 'Настроить Telegram webhook'}
      </button>
      {status === 'ok' && <span className="text-xs text-green-600 flex items-center gap-1"><Check size={14} /> {lang === 'kz' ? 'Орнатылды' : 'Установлен'}</span>}
      {status === 'error' && <span className="text-xs text-red-600">{lang === 'kz' ? 'Қате' : 'Ошибка'}</span>}
    </div>
  );
}

/* ─── Admin Change Log Section ─── */

interface ChangeLogEntry {
  id: string;
  user_name: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changes: string | null;
  created_at: string;
}

function AdminChangeLog({ lang }: { lang: 'kz' | 'ru' }) {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ data: ChangeLogEntry[] }>('/api/admin/changelog', { pageSize: '20' });
        const data = Array.isArray(res) ? res : (res as { data: ChangeLogEntry[] }).data ?? [];
        setEntries(data);
      } catch {
        // table may not exist yet
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const actionLabel = (a: string) => {
    const map: Record<string, string> = {
      create: lang === 'kz' ? 'Құру' : 'Создание',
      update: lang === 'kz' ? 'Өзгерту' : 'Изменение',
      delete: lang === 'kz' ? 'Жою' : 'Удаление',
      import: lang === 'kz' ? 'Импорт' : 'Импорт',
      auto_assign: lang === 'kz' ? 'Авто-тағайындау' : 'Авто-назначение',
    };
    return map[a] || a;
  };

  const actionColor = (a: string) => {
    switch (a) {
      case 'create': case 'import': case 'auto_assign': return 'bg-green-100 text-green-700';
      case 'update': return 'bg-blue-100 text-blue-700';
      case 'delete': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const entityLabel = (t: string) => {
    const map: Record<string, string> = {
      session: lang === 'kz' ? 'Сабақ' : 'Занятие',
      user: lang === 'kz' ? 'Пайдаланушы' : 'Пользователь',
      class: lang === 'kz' ? 'Топ' : 'Группа',
    };
    return map[t] || t;
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch { return iso; }
  };

  const parseChanges = (json: string | null): Record<string, { old?: string; new?: string }> | null => {
    if (!json) return null;
    try { return JSON.parse(json); } catch { return null; }
  };

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
          <ClipboardList size={20} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {lang === 'kz' ? 'Өзгерістер журналы' : 'Журнал изменений'}
          </h2>
          <p className="text-sm text-gray-500">
            {lang === 'kz' ? 'Соңғы әкімші әрекеттері' : 'Последние действия администраторов'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={24} className="animate-spin text-primary-600" />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">
          {lang === 'kz' ? 'Жазбалар жоқ' : 'Записей пока нет'}
        </p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {entries.map((e) => {
            const changes = parseChanges(e.changes);
            return (
              <div key={e.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${actionColor(e.action)}`}>
                      {actionLabel(e.action)}
                    </span>
                    <span className="text-xs text-gray-500">{entityLabel(e.entity_type)}</span>
                    <span className="text-xs font-medium text-gray-700">{e.user_name}</span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{formatDate(e.created_at)}</span>
                </div>
                {changes && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {Object.entries(changes).map(([field, val]) => (
                      <span key={field} className="text-xs text-gray-500">
                        <span className="font-medium">{field}:</span>{' '}
                        {val.old && <span className="line-through text-red-400">{val.old}</span>}
                        {val.old && val.new && ' → '}
                        {val.new && <span className="text-green-600">{val.new}</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
