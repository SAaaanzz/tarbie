import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { Avatar } from '../components/Avatar';
import {
  MessageCircle, Plus, Send, Loader2, ArrowLeft,
  Clock, CheckCircle, AlertCircle, ChevronRight, Paperclip,
} from 'lucide-react';

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message: string | null;
}

interface Message {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_name: string;
  is_admin: number;
  message: string;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
}

export function SupportPage() {
  const { user, lang } = useAuthStore();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'chat' | 'new'>('list');
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  // New ticket
  const [subject, setSubject] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [creating, setCreating] = useState(false);

  // Chat
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchTickets = async () => {
    try {
      const data = await api.get<Ticket[]>('/api/support/tickets');
      setTickets(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchTickets(); }, []);

  const openTicket = async (ticket: Ticket) => {
    setActiveTicket(ticket);
    setView('chat');
    setMsgLoading(true);
    try {
      const data = await api.get<{ ticket: Ticket; messages: Message[] }>(`/api/support/tickets/${ticket.id}`);
      setMessages(data.messages);
    } catch { /* ignore */ }
    setMsgLoading(false);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCreateTicket = async () => {
    if (!subject.trim() || !firstMessage.trim()) return;
    setCreating(true);
    try {
      const res = await api.post<{ id: string }>('/api/support/tickets', {
        subject: subject.trim(),
        message: firstMessage.trim(),
      });
      setSubject('');
      setFirstMessage('');
      await fetchTickets();
      const newTicket = tickets.find(t => t.id === res.id) || {
        id: res.id, subject: subject.trim(), status: 'open', priority: 'normal',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        message_count: 1, last_message: firstMessage.trim(),
      };
      openTicket(newTicket);
    } catch { /* ignore */ }
    setCreating(false);
  };

  const handleSendMessage = async () => {
    if (!newMsg.trim() || !activeTicket) return;
    setSending(true);
    try {
      await api.post(`/api/support/tickets/${activeTicket.id}/messages`, { message: newMsg.trim() });
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        ticket_id: activeTicket.id,
        sender_id: user?.id ?? '',
        sender_name: user?.full_name ?? '',
        is_admin: 0,
        message: newMsg.trim(),
        file_url: null,
        file_name: null,
        created_at: new Date().toISOString(),
      }]);
      setNewMsg('');
    } catch { /* ignore */ }
    setSending(false);
  };

  const statusIcon = (status: string) => {
    if (status === 'open') return <AlertCircle size={14} className="text-blue-500" />;
    if (status === 'in_progress') return <Clock size={14} className="text-amber-500" />;
    if (status === 'resolved') return <CheckCircle size={14} className="text-green-500" />;
    return <CheckCircle size={14} className="text-gray-400" />;
  };

  const statusText = (status: string) => {
    const map: Record<string, Record<string, string>> = {
      open: { kz: 'Ашық', ru: 'Открыт' },
      in_progress: { kz: 'Өңделуде', ru: 'В работе' },
      resolved: { kz: 'Шешілді', ru: 'Решён' },
      closed: { kz: 'Жабық', ru: 'Закрыт' },
    };
    return map[status]?.[lang] ?? status;
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString(lang === 'kz' ? 'kk-KZ' : 'ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          {view !== 'list' && (
            <button onClick={() => { setView('list'); fetchTickets(); }} className="rounded-lg p-1 hover:bg-gray-100">
              <ArrowLeft size={20} />
            </button>
          )}
          <MessageCircle size={24} className="text-primary-600" />
          {view === 'new'
            ? (lang === 'kz' ? 'Жаңа сұрау' : 'Новое обращение')
            : view === 'chat'
              ? activeTicket?.subject ?? ''
              : (lang === 'kz' ? 'Қолдау қызметі' : 'Поддержка')}
        </h1>
        {view === 'list' && (
          <button onClick={() => setView('new')} className="btn-primary text-sm flex items-center gap-1">
            <Plus size={16} /> {lang === 'kz' ? 'Жаңа' : 'Новое'}
          </button>
        )}
      </div>

      {/* Ticket list */}
      {view === 'list' && (
        <div className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <MessageCircle size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{lang === 'kz' ? 'Сұраулар жоқ' : 'Нет обращений'}</p>
              <p className="text-xs mt-1">{lang === 'kz' ? 'Жаңа сұрау жасаңыз' : 'Создайте новое обращение'}</p>
            </div>
          ) : tickets.map(t => (
            <button key={t.id} onClick={() => openTicket(t)}
              className="w-full text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-primary-300 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {statusIcon(t.status)}
                    <h3 className="font-medium text-sm text-gray-900 truncate">{t.subject}</h3>
                  </div>
                  {t.last_message && (
                    <p className="text-xs text-gray-500 truncate">{t.last_message}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] text-gray-400">{formatDate(t.updated_at)}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      t.status === 'open' ? 'bg-blue-100 text-blue-700' :
                      t.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                      t.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>{statusText(t.status)}</span>
                    <span className="text-[10px] text-gray-400">{t.message_count} {lang === 'kz' ? 'хабар' : 'сообщ.'}</span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-300 mt-1 shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* New ticket form */}
      {view === 'new' && (
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-200 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {lang === 'kz' ? 'Тақырыбы' : 'Тема обращения'}
            </label>
            <input type="text" className="input-field" value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder={lang === 'kz' ? 'Мәселені қысқаша сипаттаңыз' : 'Кратко опишите проблему'}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {lang === 'kz' ? 'Хабарлама' : 'Сообщение'}
            </label>
            <textarea className="input-field min-h-[120px] resize-none" value={firstMessage}
              onChange={e => setFirstMessage(e.target.value)}
              placeholder={lang === 'kz' ? 'Мәселеңізді толық жазыңыз...' : 'Подробно опишите вашу проблему...'}
            />
          </div>
          <button onClick={handleCreateTicket}
            disabled={creating || !subject.trim() || !firstMessage.trim()}
            className="btn-primary flex items-center gap-1.5">
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {lang === 'kz' ? 'Жіберу' : 'Отправить'}
          </button>
        </div>
      )}

      {/* Chat view */}
      {view === 'chat' && activeTicket && (
        <div className="rounded-2xl bg-white shadow-sm border border-gray-200 flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
          {/* Chat header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            {statusIcon(activeTicket.status)}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              activeTicket.status === 'open' ? 'bg-blue-100 text-blue-700' :
              activeTicket.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
              'bg-green-100 text-green-700'
            }`}>{statusText(activeTicket.status)}</span>
            <span className="text-xs text-gray-400 ml-auto">{formatDate(activeTicket.created_at)}</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {msgLoading ? (
              <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
            ) : messages.map(m => (
              <div key={m.id} className={`flex gap-2 ${m.is_admin ? '' : 'flex-row-reverse'}`}>
                <Avatar name={m.sender_name} size="sm" className={m.is_admin ? '' : 'order-2'} />
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
                  m.is_admin
                    ? 'bg-gray-100 text-gray-900 rounded-tl-sm'
                    : 'bg-primary-600 text-white rounded-tr-sm'
                }`}>
                  <p className={`text-[10px] font-medium mb-0.5 ${m.is_admin ? 'text-gray-500' : 'text-primary-100'}`}>
                    {m.is_admin ? (lang === 'kz' ? 'Қолдау' : 'Поддержка') : m.sender_name}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{m.message}</p>
                  {m.file_url && (
                    <a href={`https://dprabota.bahtyarsanzhar.workers.dev${m.file_url}`} target="_blank" rel="noopener"
                      className={`flex items-center gap-1 mt-1 text-xs ${m.is_admin ? 'text-blue-600' : 'text-primary-100 underline'}`}>
                      <Paperclip size={12} /> {m.file_name || 'File'}
                    </a>
                  )}
                  <p className={`text-[9px] mt-1 ${m.is_admin ? 'text-gray-400' : 'text-primary-200'}`}>
                    {formatDate(m.created_at)}
                  </p>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          {activeTicket.status !== 'closed' && (
            <div className="border-t border-gray-100 p-3 flex gap-2">
              <label className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer shrink-0" title={lang === 'kz' ? 'Файл тіркеу (10 MB)' : 'Прикрепить файл (10 MB)'}>
                <Paperclip size={16} className="text-gray-400" />
                <input type="file" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !activeTicket) return;
                  if (file.size > 10 * 1024 * 1024) { alert(lang === 'kz' ? 'Файл 10 MB-дан аспауы керек' : 'Файл не должен превышать 10 MB'); return; }
                  const formData = new FormData();
                  formData.append('file', file);
                  try {
                    const res = await fetch(
                      `https://dprabota.bahtyarsanzhar.workers.dev/api/support/tickets/${activeTicket.id}/upload`,
                      { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('tarbie-auth') ? JSON.parse(localStorage.getItem('tarbie-auth')!).state?.token : ''}` }, body: formData }
                    );
                    const json = await res.json() as { success: boolean; data?: { file_url: string; file_name: string; message_id: string } };
                    if (json.success && json.data) {
                      setMessages(prev => [...prev, {
                        id: json.data!.message_id,
                        ticket_id: activeTicket.id,
                        sender_id: user?.id ?? '',
                        sender_name: user?.full_name ?? '',
                        is_admin: 0,
                        message: `📎 ${json.data!.file_name}`,
                        file_url: json.data!.file_url,
                        file_name: json.data!.file_name,
                        created_at: new Date().toISOString(),
                      }]);
                    }
                  } catch { }
                  e.target.value = '';
                }} />
              </label>
              <input
                type="text"
                className="input-field flex-1 text-sm"
                placeholder={lang === 'kz' ? 'Хабарлама жазыңыз...' : 'Напишите сообщение...'}
                value={newMsg}
                onChange={e => setNewMsg(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
              />
              <button onClick={handleSendMessage} disabled={sending || !newMsg.trim()}
                className="btn-primary px-3">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
