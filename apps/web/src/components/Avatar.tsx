// Аватар пользователя: показывает загруженную картинку или инициалы
// на фоне цвета, выбранного по имени. Поддерживает премиум-рамки.

// Палитра фонов для аватаров-инициалов.
const COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500',
  'bg-amber-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500',
  'bg-teal-500', 'bg-orange-500', 'bg-fuchsia-500', 'bg-lime-600',
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

interface AvatarProps {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  avatarUrl?: string | null;
}

const sizePx: Record<string, number> = { xs: 24, sm: 32, md: 40, lg: 56, xl: 80 };

const fontSizeMap: Record<string, string> = {
  xs: 'text-[10px]', sm: 'text-xs', md: 'text-sm', lg: 'text-lg', xl: 'text-2xl',
};

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://dprabota.bahtyarsanzhar.workers.dev';

export function Avatar({ name, size = 'md', className = '', avatarUrl }: AvatarProps) {
  const initials = getInitials(name);
  const color = COLORS[hashName(name) % COLORS.length];
  const px = sizePx[size] ?? 40;

  const fullAvatarUrl = avatarUrl?.startsWith('/') ? `${API_BASE}${avatarUrl}` : avatarUrl;

  const avatarContent = fullAvatarUrl ? (
    <img src={fullAvatarUrl} alt={name}
      className="rounded-full object-cover block"
      style={{ width: px, height: px }} />
  ) : (
    <div className={`${color} flex items-center justify-center rounded-full text-white font-bold ${fontSizeMap[size]}`}
      style={{ width: px, height: px }}>
      {initials}
    </div>
  );

  return (
    <div className={`inline-flex shrink-0 select-none ${className}`}>
      {avatarContent}
    </div>
  );
}
